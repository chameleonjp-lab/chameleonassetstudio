/** Native transform mathematics adopted from the independently evaluated r186 candidate. */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { worldMatrix } from '../../core3d/model/coordinates';
import type { Project3D, Transform3D, Vec3 } from '../../core3d/model/project';
import type {
  NativeEditContext,
  NativeEditOptions,
  NativeEditFrame,
  NativeTransformEvaluator,
} from '../../core3d/ports/editPort';

const matrix = (values: number[]) => new Matrix4().fromArray(values);

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

export function selectionFrame(project: Project3D, context: NativeEditContext): NativeEditFrame {
  const { selection, activeId, options } = context;
  if (context.readOnly) throw new Error('Read-only project');
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

export function snapDelta(input: Vec3, options: NativeEditOptions): Vec3 {
  if (input.length !== 3 || !input.every(Number.isFinite))
    throw new Error('A finite three-component delta is required');
  const origin = options.mode === 'scale' ? 1 : 0;
  return input.map((v) =>
    options.snap === null ? v : origin + Math.round((v - origin) / options.snap) * options.snap,
  ) as Vec3;
}

/** Renderer objects stay in this adapter; session receives only plain native TRS. */
export function evaluateDelta(
  project: Project3D,
  context: NativeEditContext,
  frame: NativeEditFrame,
  input: Vec3,
) {
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
    return context.selection.map((id) => ({
      id,
      transform: structuredClone(project.nodes.find((node) => node.id === id)!.transform),
    }));
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
    return { id, transform };
  });
  return updates;
}

export const nativeTransformEvaluator: NativeTransformEvaluator = { selectionFrame, evaluateDelta };
