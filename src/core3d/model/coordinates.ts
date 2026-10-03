import type { Project3D, Transform3D, Vec3 } from './project';
/** Column-major matrices, column vectors, world = parent * T * R * S. */
export function composeTransform({
  translation: [tx, ty, tz],
  rotation: [x, y, z, w],
  scale: [sx, sy, sz],
}: Transform3D): number[] {
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}
export function multiplyMatrices(a: number[], b: number[]): number[] {
  return Array.from({ length: 16 }, (_, i) => {
    const row = i % 4,
      column = Math.floor(i / 4);
    return (
      a[row] * b[column * 4] +
      a[row + 4] * b[column * 4 + 1] +
      a[row + 8] * b[column * 4 + 2] +
      a[row + 12] * b[column * 4 + 3]
    );
  });
}
export function worldMatrix(project: Project3D, nodeId: string): number[] {
  const seen = new Set<string>();
  function visit(id: string): number[] {
    if (seen.has(id)) throw new Error('Cyclic hierarchy');
    seen.add(id);
    const node = project.nodes.find((n) => n.id === id);
    if (!node) throw new Error('Missing node');
    const local = composeTransform(node.transform);
    return node.parentId === null ? local : multiplyMatrices(visit(node.parentId), local);
  }
  return visit(nodeId);
}
export function transformPoint(matrix: number[], [x, y, z]: Vec3): Vec3 {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}
