/** Renderer-free canonical contract. All binary dependencies are named by SHA-256. */
export type Vec3 = [number, number, number];
export type Quaternion = [number, number, number, number];
export interface Transform3D {
  translation: Vec3;
  rotation: Quaternion;
  scale: Vec3;
}
export interface Node3D {
  id: string;
  name: string;
  parentId: string | null;
  transform: Transform3D;
  meshId?: string;
}
export interface Mesh3D {
  id: string;
  vertices: { id: string; position: Vec3 }[];
  faces: {
    id: string;
    vertexIds: string[];
    /** Corner attributes preserve UV seams without turning render indices into IDs. */
    uv?: [number, number][];
    normals?: Vec3[];
    materialId?: string;
  }[];
}
export interface Material3D {
  id: string;
  baseColor: [number, number, number, number];
  metallic: number;
  roughness: number;
  textureBlobId?: string;
}
export interface Source3D {
  id: string;
  blobId: string;
  mimeType: string;
  rights: { declared: string; embedded: string };
  derivedFrom?: {
    sourceId: string;
    hash: string;
    operation: string;
    version: string;
    settings: string;
  };
}
export interface Skin3D {
  id: string;
  meshId: string;
  joints: { nodeId: string; inverseBind: number[] }[];
  weights: { vertexId: string; jointIds: string[]; values: number[] }[];
}
export interface Clip3D {
  id: string;
  name: string;
  duration: number;
  loop: boolean;
  tracks: {
    nodeId: string;
    property: 'translation' | 'rotation' | 'scale';
    interpolation: 'STEP' | 'LINEAR';
    keys: { time: number; value: number[] }[];
  }[];
}
export interface Project3D {
  format: 'chameleon-project-3d';
  schemaVersion: '0.1.0';
  id: string;
  name: string;
  /** Monotonic editor revision, including Undo/Redo. Never a wall-clock value. */
  revision: number;
  coordinates: 'right-handed-meter-y-up-positive-z-forward';
  nodes: Node3D[];
  meshes: Mesh3D[];
  materials: Material3D[];
  sources: Source3D[];
  skins: Skin3D[];
  clips: Clip3D[];
  blobIds: string[];
}
export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectValidationError';
  }
}
export const identityTransform = (): Transform3D => ({
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
});
export function createProject(id: string, name = '新しい3Dプロジェクト'): Project3D {
  const project: Project3D = {
    format: 'chameleon-project-3d',
    schemaVersion: '0.1.0',
    id,
    name,
    revision: 0,
    coordinates: 'right-handed-meter-y-up-positive-z-forward',
    nodes: [],
    meshes: [],
    materials: [],
    sources: [],
    skins: [],
    clips: [],
    blobIds: [],
  };
  validateProject(project);
  return project;
}
export function cloneProject(project: Project3D): Project3D {
  return structuredClone(project);
}
function fail(message: string): never {
  throw new ProjectValidationError(message);
}
function record(v: unknown, where: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) fail(`${where}: object required`);
  return v as Record<string, unknown>;
}
function keys(v: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (
    required.some((k) => !Object.hasOwn(v, k)) ||
    Object.keys(v).some((k) => ![...required, ...optional].includes(k))
  )
    fail('Unsupported or missing project field');
}
function string(v: unknown): asserts v is string {
  if (typeof v !== 'string' || v.length > 4096) fail('Invalid text');
}
function id(v: unknown): asserts v is string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v))
    fail('Invalid stable ID');
}
function number(v: unknown): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail('Finite number required');
}
function vector(v: unknown, size: number): asserts v is number[] {
  if (!Array.isArray(v) || v.length !== size) fail('Invalid vector size');
  v.forEach(number);
}
function array(v: unknown): asserts v is unknown[] {
  if (!Array.isArray(v)) fail('Array required');
}
function uniqueIds(values: unknown[]): Set<string> {
  const found = new Set<string>();
  for (const value of values) {
    const item = record(value, 'entity');
    id(item.id);
    if (found.has(item.id)) fail(`Duplicate ID: ${item.id}`);
    found.add(item.id);
  }
  return found;
}
function has(set: Set<string>, key: unknown) {
  if (typeof key !== 'string' || !set.has(key)) fail('Missing reference');
}
function hash(v: unknown): asserts v is string {
  if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) fail('Invalid SHA-256');
}
/** Validates the native contract only. This is not a GLB loader or decoder. */
export function validateProject(value: unknown): asserts value is Project3D {
  const p = record(value, 'project');
  keys(p, [
    'format',
    'schemaVersion',
    'id',
    'name',
    'revision',
    'coordinates',
    'nodes',
    'meshes',
    'materials',
    'sources',
    'skins',
    'clips',
    'blobIds',
  ]);
  if (p.format !== 'chameleon-project-3d' || p.schemaVersion !== '0.1.0')
    fail('Unsupported project format/version');
  if (p.coordinates !== 'right-handed-meter-y-up-positive-z-forward')
    fail('Unsupported coordinate contract');
  id(p.id);
  string(p.name);
  if (!Number.isSafeInteger(p.revision) || (p.revision as number) < 0) fail('Invalid revision');
  for (const field of ['nodes', 'meshes', 'materials', 'sources', 'skins', 'clips', 'blobIds'])
    array(p[field]);
  const project = value as Project3D;
  const nodes = uniqueIds(project.nodes),
    meshes = uniqueIds(project.meshes),
    materials = uniqueIds(project.materials);
  const sources = uniqueIds(project.sources);
  uniqueIds(project.skins);
  uniqueIds(project.clips);
  const blobs = new Set(project.blobIds);
  project.blobIds.forEach(hash);
  if (blobs.size !== project.blobIds.length) fail('Duplicate blob reference');
  for (const node of project.nodes) {
    const n = record(node, 'node');
    keys(n, ['id', 'name', 'parentId', 'transform'], ['meshId']);
    string(node.name);
    if (node.parentId !== null) has(nodes, node.parentId);
    if (node.meshId !== undefined) has(meshes, node.meshId);
    const t = record(node.transform, 'transform');
    keys(t, ['translation', 'rotation', 'scale']);
    vector(t.translation, 3);
    vector(t.rotation, 4);
    vector(t.scale, 3);
    if (Math.abs(Math.hypot(...t.rotation) - 1) > 1e-5) fail('Quaternion must be normalized');
    const seen = new Set<string>([node.id]);
    let parent = node.parentId;
    while (parent !== null) {
      if (seen.has(parent)) fail('Cyclic hierarchy');
      seen.add(parent);
      parent = project.nodes.find((n) => n.id === parent)!.parentId;
    }
  }
  for (const mesh of project.meshes) {
    keys(record(mesh, 'mesh'), ['id', 'vertices', 'faces']);
    array(mesh.vertices);
    array(mesh.faces);
    const verts = uniqueIds(mesh.vertices);
    uniqueIds(mesh.faces);
    for (const v of mesh.vertices) {
      keys(record(v, 'vertex'), ['id', 'position']);
      vector(v.position, 3);
    }
    for (const f of mesh.faces) {
      keys(record(f, 'face'), ['id', 'vertexIds'], ['uv', 'normals', 'materialId']);
      array(f.vertexIds);
      if (f.vertexIds.length < 3 || new Set(f.vertexIds).size !== f.vertexIds.length)
        fail('Invalid face');
      f.vertexIds.forEach((v) => has(verts, v));
      if (f.materialId !== undefined) has(materials, f.materialId);
      for (const [attr, size] of [
        [f.uv, 2],
        [f.normals, 3],
      ] as const)
        if (attr !== undefined) {
          array(attr);
          if (attr.length !== f.vertexIds.length) fail('Corner count mismatch');
          attr.forEach((v) => vector(v, size));
        }
    }
  }
  for (const material of project.materials) {
    keys(
      record(material, 'material'),
      ['id', 'baseColor', 'metallic', 'roughness'],
      ['textureBlobId'],
    );
    vector(material.baseColor, 4);
    number(material.metallic);
    number(material.roughness);
    if ([...material.baseColor, material.metallic, material.roughness].some((v) => v < 0 || v > 1))
      fail('Material factor out of range');
    if (material.textureBlobId !== undefined) has(blobs, material.textureBlobId);
  }
  for (const source of project.sources) {
    keys(record(source, 'source'), ['id', 'blobId', 'mimeType', 'rights'], ['derivedFrom']);
    has(blobs, source.blobId);
    string(source.mimeType);
    keys(record(source.rights, 'rights'), ['declared', 'embedded']);
    string(source.rights.declared);
    string(source.rights.embedded);
    if (source.derivedFrom) {
      const d = source.derivedFrom;
      keys(record(d, 'lineage'), ['sourceId', 'hash', 'operation', 'version', 'settings']);
      has(sources, d.sourceId);
      hash(d.hash);
      string(d.operation);
      string(d.version);
      string(d.settings);
      if (project.sources.find((s) => s.id === d.sourceId)!.blobId !== d.hash)
        fail('Stale source lineage');
      const seen = new Set([source.id]);
      let parent: Source3D | undefined = project.sources.find((s) => s.id === d.sourceId);
      while (parent) {
        if (seen.has(parent.id)) fail('Cyclic source lineage');
        seen.add(parent.id);
        parent = parent.derivedFrom
          ? project.sources.find((s) => s.id === parent!.derivedFrom!.sourceId)
          : undefined;
      }
    }
  }
  for (const skin of project.skins) {
    keys(record(skin, 'skin'), ['id', 'meshId', 'joints', 'weights']);
    has(meshes, skin.meshId);
    array(skin.joints);
    array(skin.weights);
    const jointIds = new Set<string>();
    for (const j of skin.joints) {
      keys(record(j, 'joint'), ['nodeId', 'inverseBind']);
      has(nodes, j.nodeId);
      if (jointIds.has(j.nodeId)) fail('Duplicate joint');
      jointIds.add(j.nodeId);
      vector(j.inverseBind, 16);
    }
    const verts = new Set(
      project.meshes.find((m) => m.id === skin.meshId)!.vertices.map((v) => v.id),
    );
    const weighted = new Set<string>();
    for (const w of skin.weights) {
      keys(record(w, 'weight'), ['vertexId', 'jointIds', 'values']);
      has(verts, w.vertexId);
      if (weighted.has(w.vertexId)) fail('Duplicate vertex weight');
      weighted.add(w.vertexId);
      array(w.jointIds);
      array(w.values);
      if (
        w.jointIds.length === 0 ||
        w.jointIds.length > 4 ||
        w.jointIds.length !== w.values.length ||
        new Set(w.jointIds).size !== w.jointIds.length
      )
        fail('Invalid influences');
      w.jointIds.forEach((j) => has(jointIds, j));
      w.values.forEach(number);
      if (w.values.some((v) => v < 0) || Math.abs(w.values.reduce((a, b) => a + b, 0) - 1) > 1e-5)
        fail('Invalid normalized weights');
    }
    if (weighted.size !== verts.size) fail('Unassigned skin vertex');
  }
  for (const clip of project.clips) {
    keys(record(clip, 'clip'), ['id', 'name', 'duration', 'loop', 'tracks']);
    string(clip.name);
    number(clip.duration);
    if (clip.duration < 0 || typeof clip.loop !== 'boolean') fail('Invalid clip');
    array(clip.tracks);
    const tracks = new Set<string>();
    for (const track of clip.tracks) {
      keys(record(track, 'track'), ['nodeId', 'property', 'interpolation', 'keys']);
      has(nodes, track.nodeId);
      if (
        !['translation', 'rotation', 'scale'].includes(track.property) ||
        !['STEP', 'LINEAR'].includes(track.interpolation)
      )
        fail('Unsupported animation');
      const key = track.nodeId + ':' + track.property;
      if (tracks.has(key)) fail('Duplicate animation track');
      tracks.add(key);
      array(track.keys);
      let previous = -1;
      for (const k of track.keys) {
        keys(record(k, 'key'), ['time', 'value']);
        number(k.time);
        if (k.time < 0 || k.time <= previous || k.time > clip.duration) fail('Invalid key time');
        previous = k.time;
        vector(k.value, track.property === 'rotation' ? 4 : 3);
        if (track.property === 'rotation' && Math.abs(Math.hypot(...k.value) - 1) > 1e-5)
          fail('Unnormalized key quaternion');
      }
    }
  }
  const boundNodes = new Set<string>();
  function includeAncestors(nodeId: string) {
    let node = project.nodes.find((item) => item.id === nodeId);
    while (node) {
      boundNodes.add(node.id);
      node =
        node.parentId === null
          ? undefined
          : project.nodes.find((item) => item.id === node!.parentId);
    }
  }
  for (const skin of project.skins) {
    skin.joints.forEach((joint) => includeAncestors(joint.nodeId));
    project.nodes
      .filter((node) => node.meshId === skin.meshId)
      .forEach((node) => includeAncestors(node.id));
  }
  for (const node of project.nodes) {
    if (boundNodes.has(node.id) && node.transform.scale.some((value) => value <= 0))
      fail('Bound skin requires positive scale');
  }
  for (const clip of project.clips)
    for (const track of clip.tracks) {
      if (
        track.property === 'scale' &&
        boundNodes.has(track.nodeId) &&
        track.keys.some((key) => key.value.some((value) => value <= 0))
      )
        fail('Bound skin requires positive animated scale');
    }
}
