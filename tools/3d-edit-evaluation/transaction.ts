import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { ProjectHistory } from '../../src/core3d/commands/history';
import { setNodeTransform } from '../../src/core3d/commands/objectEditing';
import { composeTransform, worldMatrix } from '../../src/core3d/model/coordinates';
import {
  cloneProject,
  type Project3D,
  type Transform3D,
  type Vec3,
} from '../../src/core3d/model/project';

export type Mode = 'translate' | 'rotate' | 'scale';
export interface EditOptions {
  mode: Mode;
  space: 'world' | 'local';
  /** Metres, radians or scale-factor increments, measured from the session start. */
  snap: number | null;
}
export interface EditContext {
  selection: string[];
  activeId: string | null;
  options: EditOptions;
  readOnly: boolean;
  /** Session-only until a canonical lock contract is adopted. */
  lockedIds: string[];
}
export interface Token {
  readonly generation: number;
  readonly projectId: string;
  readonly revision: number;
}
export interface Frame {
  position: Vec3;
  rotation: Transform3D['rotation'];
}
export type EditResult = { ok: true; changed?: boolean } | { ok: false; reason: string };
interface Session {
  token: Token;
  context: EditContext;
  project: Project3D;
  frame: Frame;
  updates: { id: string; transform: Transform3D }[] | null;
  valid: boolean;
}
const matrix = (values: number[]) => new Matrix4().fromArray(values);
const failure = (error: unknown): EditResult => ({
  ok: false,
  reason: error instanceof Error ? error.message : String(error),
});

/** Strict affine round-trip: Matrix4.decompose alone silently discards shear. */
export function exactTRS(value: Matrix4): Transform3D {
  if (!value.elements.every(Number.isFinite)) throw new Error('Non-finite transform');
  const e = value.elements;
  const columns = [0, 4, 8].map((offset) => new Vector3(e[offset], e[offset + 1], e[offset + 2]));
  const lengths = columns.map((column) => column.length());
  if (lengths.some((length) => !Number.isFinite(length) || length < 1e-10))
    throw new Error('Singular or non-finite transform');
  const unit = columns.map((column, index) => column.divideScalar(lengths[index]));
  if (
    Math.max(
      Math.abs(unit[0].dot(unit[1])),
      Math.abs(unit[0].dot(unit[2])),
      Math.abs(unit[1].dot(unit[2])),
    ) > 1e-8
  )
    throw new Error('Transform requires shear, which native TRS cannot represent');
  const p = new Vector3(),
    q = new Quaternion(),
    s = new Vector3();
  value.decompose(p, q, s);
  if (![...p, ...q, ...s].every(Number.isFinite) || s.toArray().some((v) => Math.abs(v) < 1e-10))
    throw new Error('Singular or non-finite transform');
  q.normalize();
  const rebuilt = new Matrix4().compose(p, q, s);
  // Each linear column is checked at its own scale, including tiny geometry.
  // Translation or a large neighboring scale must never hide relative shear.
  if (
    value.elements.some(
      (v, i) =>
        Math.abs(v - rebuilt.elements[i]) >
        (i < 12 && i % 4 !== 3 ? 1e-8 * lengths[Math.floor(i / 4)] : 1e-12),
    )
  )
    throw new Error('Transform requires shear, which native TRS cannot represent');
  return { translation: p.toArray(), rotation: q.toArray(), scale: s.toArray() };
}

function ancestry(project: Project3D, id: string): string[] {
  const path: string[] = [];
  let next: string | null = id;
  while (next !== null) {
    if (path.includes(next)) throw new Error('Cyclic selection hierarchy');
    const node = project.nodes.find((n) => n.id === next);
    if (!node) throw new Error('Missing selected node');
    path.push(next);
    next = node.parentId;
  }
  return path;
}

export function selectionFrame(project: Project3D, context: EditContext): Frame {
  const { selection, activeId, options } = context;
  if (context.readOnly) throw new Error('Read-only evaluation');
  if (
    !selection.length ||
    !activeId ||
    !selection.includes(activeId) ||
    new Set(selection).size !== selection.length
  )
    throw new Error('A unique selection and selected active pivot are required');
  if (
    !['translate', 'rotate', 'scale'].includes(options.mode) ||
    !['world', 'local'].includes(options.space) ||
    (options.snap !== null && (!Number.isFinite(options.snap) || options.snap <= 0))
  )
    throw new Error('Invalid transform options');
  for (const id of selection) {
    const ancestors = ancestry(project, id);
    if (ancestors.slice(1).some((parent) => selection.includes(parent)))
      throw new Error('Parent and descendant selection is ambiguous');
    if (
      context.lockedIds.some(
        (locked) => ancestors.includes(locked) || ancestry(project, locked).includes(id),
      )
    )
      throw new Error('A selected node, ancestor or affected descendant is locked');
  }
  const world = matrix(worldMatrix(project, activeId));
  const position = new Vector3().setFromMatrixPosition(world).toArray();
  const rotation: Transform3D['rotation'] =
    options.space === 'world' ? [0, 0, 0, 1] : exactTRS(world).rotation;
  return { position, rotation };
}

export function snapDelta(input: Vec3, options: EditOptions): Vec3 {
  if (input.length !== 3 || !input.every(Number.isFinite))
    throw new Error('A finite three-component delta is required');
  const origin = options.mode === 'scale' ? 1 : 0;
  return input.map((v) =>
    options.snap === null ? v : origin + Math.round((v - origin) / options.snap) * options.snap,
  ) as Vec3;
}

/** Renderer objects never leave this evaluation adapter. The result is plain native TRS. */
export function evaluateDelta(project: Project3D, context: EditContext, frame: Frame, input: Vec3) {
  const delta = snapDelta(input, context.options);
  const deltaRotation = new Quaternion().setFromEuler(new Euler(...delta, 'XYZ'));
  const neutral =
    context.options.mode === 'scale'
      ? delta.every((v) => v === 1)
      : context.options.mode === 'rotate'
        ? delta.every((v) => v === 0 || Math.abs(v) >= Math.PI) &&
          Math.hypot(deltaRotation.x, deltaRotation.y, deltaRotation.z) <= Number.EPSILON * 8
        : delta.every((v) => v === 0);
  if (neutral)
    return {
      candidate: cloneProject(project),
      updates: context.selection.map((id) => ({
        id,
        transform: structuredClone(project.nodes.find((node) => node.id === id)!.transform),
      })),
    };
  const basis = new Matrix4().compose(
    new Vector3(...frame.position),
    new Quaternion(...frame.rotation),
    new Vector3(1, 1, 1),
  );
  const operation = new Matrix4();
  if (context.options.mode === 'translate') operation.makeTranslation(...delta);
  if (context.options.mode === 'rotate')
    operation.makeRotationFromEuler(new Euler(...delta, 'XYZ'));
  if (context.options.mode === 'scale') operation.makeScale(...delta);
  const worldDelta = basis.clone().multiply(operation).multiply(basis.clone().invert());
  const candidate = cloneProject(project);
  const updates = context.selection.map((id) => {
    const node = project.nodes.find((n) => n.id === id)!;
    const parent =
      node.parentId === null ? new Matrix4() : matrix(worldMatrix(project, node.parentId));
    const determinant = parent.determinant(),
      parentInverse = parent.clone().invert();
    if (
      determinant === 0 ||
      !Number.isFinite(determinant) ||
      !parentInverse.elements.every(Number.isFinite)
    )
      throw new Error('Singular parent transform');
    let transform: Transform3D;
    if (context.options.mode === 'translate') {
      // Direction vectors do not contain pivot/parent translation. Avoid subtracting
      // and re-adding a huge origin, which would erase representable local deltas.
      const inverseLinear = parentInverse.clone().setPosition(0, 0, 0);
      const localDelta = new Vector3(...delta)
        .applyQuaternion(new Quaternion(...frame.rotation))
        .applyMatrix4(inverseLinear)
        .toArray();
      const significance = Math.max(...localDelta.map(Math.abs)) * Number.EPSILON * 16;
      transform = structuredClone(node.transform);
      transform.translation = transform.translation.map((before, i) => {
        const after = before + localDelta[i];
        if (after === before && Math.abs(localDelta[i]) > significance)
          throw new Error('Translation delta is below coordinate precision');
        return after;
      }) as Vec3;
    } else
      transform = exactTRS(
        parentInverse.multiply(worldDelta).multiply(matrix(worldMatrix(project, id))),
      );
    setNodeTransform(candidate, id, transform);
    return { id, transform };
  });
  return { candidate, updates };
}

export class TransformTransaction {
  private generation = 0;
  private session: Session | null = null;
  private context: EditContext;
  private previewProject: Project3D | null = null;
  lastReason = 'idle';
  commits = 0;
  constructor(
    readonly history: ProjectHistory,
    context: EditContext,
  ) {
    this.context = structuredClone(context);
  }
  get active() {
    return this.session !== null;
  }
  get token() {
    return this.session?.token ?? null;
  }
  get preview() {
    return cloneProject(this.previewProject ?? this.history.project);
  }
  get settings() {
    return structuredClone(this.context);
  }
  get frame() {
    return this.session
      ? structuredClone(this.session.frame)
      : selectionFrame(this.history.project, this.context);
  }
  setContext(context: EditContext) {
    this.cancel('context changed');
    this.context = structuredClone(context);
  }
  begin(): Token {
    this.cancel('superseded session');
    const project = this.history.project;
    const context = structuredClone(this.context);
    const frame = selectionFrame(project, context);
    // Verify static-authoring guards even before the first pointer move.
    for (const id of context.selection)
      setNodeTransform(
        cloneProject(project),
        id,
        project.nodes.find((n) => n.id === id)!.transform,
      );
    const token = Object.freeze({
      generation: ++this.generation,
      projectId: project.id,
      revision: project.revision,
    });
    this.session = { token, context, project, frame, updates: null, valid: true };
    this.lastReason = 'preview';
    return token;
  }
  private requireCurrent(token: Token): Session {
    const s = this.session;
    if (!s || s.token !== token) throw new Error('Stale session token');
    const current = this.history.project;
    if (current.id !== token.projectId || current.revision !== token.revision) {
      this.cancel('project revision changed');
      throw new Error('Project revision changed');
    }
    selectionFrame(current, this.context);
    return s;
  }
  update(token: Token, input: Vec3): EditResult {
    try {
      const s = this.requireCurrent(token);
      // Invalidate before evaluating. A failed final update cannot commit the last good preview.
      s.valid = false;
      s.updates = null;
      this.previewProject = null;
      const { candidate, updates } = evaluateDelta(s.project, s.context, s.frame, input);
      s.updates = updates;
      s.valid = true;
      this.previewProject = candidate;
      this.lastReason = 'preview';
      return { ok: true };
    } catch (error) {
      this.lastReason = error instanceof Error ? error.message : String(error);
      return failure(error);
    }
  }
  commit(token: Token): EditResult {
    try {
      const s = this.requireCurrent(token);
      if (!s.valid) throw new Error('Latest transform update is invalid');
      const changed =
        s.updates?.some(({ id, transform }) => {
          const before = composeTransform(s.project.nodes.find((n) => n.id === id)!.transform);
          return composeTransform(transform).some((v, i) => v !== before[i]);
        }) ?? false;
      if (changed) {
        const updates = structuredClone(s.updates!);
        this.history.execute((candidate) => {
          for (const { id, transform } of updates) setNodeTransform(candidate, id, transform);
        });
        this.commits++;
      }
      this.cancel(changed ? 'committed' : 'no-op');
      return { ok: true, changed };
    } catch (error) {
      // A foreign/late token must not cancel a newer valid session.
      if (this.session?.token === token) this.cancel('commit rejected');
      this.lastReason = error instanceof Error ? error.message : String(error);
      return failure(error);
    }
  }
  cancel(reason = 'cancelled') {
    this.session = null;
    this.previewProject = null;
    this.generation++;
    this.lastReason = reason;
  }
}
