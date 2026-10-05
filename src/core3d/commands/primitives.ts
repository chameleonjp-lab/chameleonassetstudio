import { materialDefaults } from '../model/project';
import { identityTransform, type Mesh3D, type Project3D, type Vec3 } from '../model/project';

export type PrimitiveKind = 'box' | 'plane' | 'sphere' | 'cylinder' | 'cone';
export interface PrimitiveOptions {
  kind: PrimitiveKind;
  width: number;
  height: number;
  depth: number;
  /** Box/plane: divisions per edge. Curved shapes: divisions per quarter-turn. */
  segments: number;
}

/**
 * Per-command engineering limits checked before allocating geometry. These are not
 * whole-project budgets or guarantees for any device; ProjectHistory has its own budget.
 * Curved shapes have 4 * segments sides; a sphere has 2 * segments latitude bands.
 */
export const PRIMITIVE_LIMITS = {
  minDimension: 0.0001,
  maxDimension: 10_000,
  minSegments: 1,
  maxSegments: { box: 16, plane: 64, sphere: 16, cylinder: 64, cone: 64 },
} as const;

const names: Record<PrimitiveKind, string> = {
  box: '箱',
  plane: '平面',
  sphere: '球',
  cylinder: '円柱',
  cone: '円錐',
};
type UV = [number, number];
interface Corner {
  vertex: number;
  uv: UV;
  normal: Vec3;
}
function unit(x: number, y: number, z: number): Vec3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}
function circle(index: number, count: number): [number, number] {
  const angle = (2 * Math.PI * index) / count;
  // Exact cardinal coordinates also avoid near-coincident seam/pole vertices.
  const clean = (value: number) => (Math.abs(value) < 1e-15 ? 0 : value);
  return [clean(Math.cos(angle)), clean(Math.sin(angle))];
}
class Builder {
  readonly mesh: Mesh3D;
  constructor(
    private readonly id: string,
    private readonly materialId: string,
  ) {
    this.mesh = { id: `${id}-mesh`, vertices: [], faces: [] };
  }
  vertex(position: Vec3): number {
    const index = this.mesh.vertices.length;
    this.mesh.vertices.push({ id: `${this.id}-v${index}`, position });
    return index;
  }
  triangle(a: Corner, b: Corner, c: Corner) {
    const corners = [a, b, c];
    this.mesh.faces.push({
      id: `${this.id}-f${this.mesh.faces.length}`,
      vertexIds: corners.map((corner) => this.mesh.vertices[corner.vertex].id),
      uv: corners.map((corner) => [...corner.uv]),
      normals: corners.map((corner) => [...corner.normal]),
      materialId: this.materialId,
    });
  }
  quad(a: Corner, b: Corner, c: Corner, d: Corner) {
    this.triangle(a, b, c);
    this.triangle(a, c, d);
  }
}

function rectangular(builder: Builder, options: PrimitiveOptions) {
  const { width, height, depth, segments: n, kind } = options;
  const vertices = new Map<string, number>();
  function patch(origin: Vec3, uAxis: Vec3, vAxis: Vec3, normal: Vec3) {
    function corner(u: number, v: number): Corner {
      const grid = origin.map((value, axis) => value + u * uAxis[axis] + v * vAxis[axis]);
      const key = grid.join(',');
      let vertex = vertices.get(key);
      if (vertex === undefined) {
        vertex = builder.vertex([
          (grid[0] / n - 0.5) * width,
          kind === 'plane' ? 0 : (grid[1] / n - 0.5) * height,
          (grid[2] / n - 0.5) * depth,
        ]);
        vertices.set(key, vertex);
      }
      return { vertex, uv: [u / n, v / n], normal };
    }
    for (let v = 0; v < n; v++)
      for (let u = 0; u < n; u++)
        builder.quad(corner(u, v), corner(u + 1, v), corner(u + 1, v + 1), corner(u, v + 1));
  }
  // The open plane lies in XZ, centered at Y=0 and facing +Y; height is unused.
  patch([0, n, n], [1, 0, 0], [0, 0, -1], [0, 1, 0]);
  if (kind === 'plane') return;
  patch([0, 0, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0]);
  patch([n, 0, n], [0, 0, -1], [0, 1, 0], [1, 0, 0]);
  patch([0, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0]);
  patch([0, 0, n], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  patch([n, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, -1]);
}

function sphere(builder: Builder, options: PrimitiveOptions) {
  const { width, height, depth, segments } = options;
  const radiusX = width / 2,
    radiusY = height / 2,
    radiusZ = depth / 2;
  const sides = 4 * segments,
    bands = 2 * segments;
  const top = builder.vertex([0, radiusY, 0]);
  const rings: Corner[][] = [];
  for (let row = 1; row < bands; row++) {
    const [cosPhi, sinPhi] = circle(row, 2 * bands);
    const ring: Corner[] = [];
    for (let side = 0; side < sides; side++) {
      const [cosTheta, sinTheta] = circle(side, sides);
      ring.push({
        vertex: builder.vertex([
          radiusX * sinPhi * cosTheta,
          radiusY * cosPhi,
          radiusZ * sinPhi * sinTheta,
        ]),
        uv: [side / sides, 1 - row / bands],
        normal: unit(
          (sinPhi * cosTheta) / radiusX,
          cosPhi / radiusY,
          (sinPhi * sinTheta) / radiusZ,
        ),
      });
    }
    rings.push(ring);
  }
  const bottom = builder.vertex([0, -radiusY, 0]);
  function corner(row: number, side: number): Corner {
    const source = rings[row][side % sides];
    return { ...source, uv: [side / sides, source.uv[1]] };
  }
  for (let side = 0; side < sides; side++) {
    builder.triangle(
      { vertex: top, uv: [(side + 0.5) / sides, 1], normal: [0, 1, 0] },
      corner(0, side + 1),
      corner(0, side),
    );
    for (let row = 0; row < rings.length - 1; row++)
      builder.quad(
        corner(row, side),
        corner(row, side + 1),
        corner(row + 1, side + 1),
        corner(row + 1, side),
      );
    builder.triangle(corner(rings.length - 1, side), corner(rings.length - 1, side + 1), {
      vertex: bottom,
      uv: [(side + 0.5) / sides, 0],
      normal: [0, -1, 0],
    });
  }
}

function roundColumn(builder: Builder, options: PrimitiveOptions) {
  const { width, height, depth, segments, kind } = options;
  const radiusX = width / 2,
    radiusZ = depth / 2,
    sides = 4 * segments;
  const bottom: number[] = [],
    top: number[] = [];
  for (let side = 0; side < sides; side++) {
    const [x, z] = circle(side, sides);
    bottom.push(builder.vertex([radiusX * x, -height / 2, radiusZ * z]));
    if (kind === 'cylinder') top.push(builder.vertex([radiusX * x, height / 2, radiusZ * z]));
  }
  const bottomCenter = builder.vertex([0, -height / 2, 0]);
  // This vertex is the cone apex, or the cylinder's top cap center.
  const topCenter = builder.vertex([0, height / 2, 0]);
  function sideNormal(side: number): Vec3 {
    const [x, z] = circle(side, sides);
    return unit(x / radiusX, kind === 'cone' ? 1 / height : 0, z / radiusZ);
  }
  function sideCorner(ring: number[], side: number, v: number): Corner {
    return { vertex: ring[side % sides], uv: [side / sides, v], normal: sideNormal(side) };
  }
  function capCorner(ring: number[], side: number, normalY: number): Corner {
    const [x, z] = circle(side, sides);
    return {
      vertex: ring[side % sides],
      uv: [0.5 + x / 2, 0.5 + (normalY * z) / 2],
      normal: [0, normalY, 0],
    };
  }
  for (let side = 0; side < sides; side++) {
    builder.triangle(
      { vertex: bottomCenter, uv: [0.5, 0.5], normal: [0, -1, 0] },
      capCorner(bottom, side, -1),
      capCorner(bottom, side + 1, -1),
    );
    if (kind === 'cone') {
      builder.triangle(
        sideCorner(bottom, side, 0),
        {
          vertex: topCenter,
          uv: [(side + 0.5) / sides, 1],
          // The apex has no single smooth normal: each wedge gets its midpoint normal.
          normal: sideNormal(side + 0.5),
        },
        sideCorner(bottom, side + 1, 0),
      );
    } else {
      builder.quad(
        sideCorner(bottom, side, 0),
        sideCorner(top, side, 1),
        sideCorner(top, side + 1, 1),
        sideCorner(bottom, side + 1, 0),
      );
      builder.triangle(
        { vertex: topCenter, uv: [0.5, 0.5], normal: [0, 1, 0] },
        capCorner(top, side + 1, 1),
        capCorner(top, side, 1),
      );
    }
  }
}

/**
 * Creates an editable native mesh immediately; generation parameters are not retained.
 * The UI explains this before creation and offers Undo/duplicate. Call only on a
 * ProjectHistory candidate so the entire addition is validated and committed once.
 */
export function addPrimitive(project: Project3D, id: string, options: PrimitiveOptions): string {
  // Leave nine characters for the longest generated suffix, "-material".
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,118}$/.test(id))
    throw new Error('Invalid primitive ID');
  if (!Object.hasOwn(names, options.kind)) throw new Error('Unsupported primitive kind');
  for (const dimension of [options.width, options.height, options.depth])
    if (
      !Number.isFinite(dimension) ||
      dimension < PRIMITIVE_LIMITS.minDimension ||
      dimension > PRIMITIVE_LIMITS.maxDimension
    )
      throw new Error(
        `寸法は ${PRIMITIVE_LIMITS.minDimension}〜${PRIMITIVE_LIMITS.maxDimension} m にしてください。`,
      );
  const maxSegments = PRIMITIVE_LIMITS.maxSegments[options.kind];
  if (
    !Number.isInteger(options.segments) ||
    options.segments < PRIMITIVE_LIMITS.minSegments ||
    options.segments > maxSegments
  )
    throw new Error(`分割数は 1〜${maxSegments} の整数にしてください。`);
  const nodeId = `${id}-node`,
    meshId = `${id}-mesh`,
    materialId = `${id}-material`;
  if (
    project.nodes.some((node) => node.id === nodeId) ||
    project.meshes.some((mesh) => mesh.id === meshId) ||
    project.materials.some((material) => material.id === materialId)
  )
    throw new Error('Primitive IDs already exist');

  const builder = new Builder(id, materialId);
  if (options.kind === 'box' || options.kind === 'plane') rectangular(builder, options);
  else if (options.kind === 'sphere') sphere(builder, options);
  else roundColumn(builder, options);

  project.materials.push({
    ...materialDefaults(),
    id: materialId,
    baseColor: [0.15, 0.7, 0.35, 1],
    metallic: 0,
    roughness: 0.65,
  });
  project.meshes.push(builder.mesh);
  project.nodes.push({
    visible: true,
    locked: false,
    id: nodeId,
    name: names[options.kind],
    parentId: null,
    transform: identityTransform(),
    meshId,
  });
  return nodeId;
}
