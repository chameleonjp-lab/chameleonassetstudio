import { composeTransform } from './coordinates';
import type { Quaternion, Transform3D, Vec3 } from './project';

// Relative tolerance for floating-point matrix arithmetic, not permission to bake shear.
const TRS_EPSILON = 1e-10;

export function matricesMatch(a: number[], b: number[]): boolean {
  return a.every((value, index) => {
    const start = Math.floor(index / 4) * 4;
    // Translation axes have independent units: a large X must not hide lost Y detail.
    const scale =
      index >= 12
        ? Math.max(1, Math.abs(value))
        : Math.max(...a.slice(start, start + 4).map(Math.abs));
    return (
      Number.isFinite(value) &&
      Number.isFinite(b[index]) &&
      Math.abs(value - b[index]) <= TRS_EPSILON * scale
    );
  });
}

/** A nonorthogonal basis requires shear, which canonical node TRS cannot store. */
export function exactTRS(matrix: number[]): Transform3D {
  const fail = () => {
    throw new Error(
      'world位置の保持にはshearが必要です。local値保持を選ぶか、親の回転・倍率を調整してください。',
    );
  };
  if (!matrix.every(Number.isFinite)) fail();
  const scale: Vec3 = [
    Math.hypot(matrix[0], matrix[1], matrix[2]),
    Math.hypot(matrix[4], matrix[5], matrix[6]),
    Math.hypot(matrix[8], matrix[9], matrix[10]),
  ];
  if (scale.some((value) => value === 0 || !Number.isFinite(value))) fail();
  const columns = [0, 1, 2].map((column) =>
    matrix.slice(column * 4, column * 4 + 3).map((value) => value / scale[column]),
  );
  const dot = (a: number[], b: number[]) =>
    a.reduce((sum, value, index) => sum + value * b[index], 0);
  if (
    Math.max(
      Math.abs(dot(columns[0], columns[1])),
      Math.abs(dot(columns[0], columns[2])),
      Math.abs(dot(columns[1], columns[2])),
    ) > TRS_EPSILON
  )
    fail();
  const [a, b, c] = columns;
  const determinant =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    b[0] * (a[1] * c[2] - a[2] * c[1]) +
    c[0] * (a[1] * b[2] - a[2] * b[1]);
  if (determinant < 0) {
    scale[0] = -scale[0];
    columns[0] = columns[0].map((value) => -value);
  }
  const [[m11, m21, m31], [m12, m22, m32], [m13, m23, m33]] = columns;
  const trace = m11 + m22 + m33;
  let rotation: Quaternion;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    rotation = [(m32 - m23) / s, (m13 - m31) / s, (m21 - m12) / s, s / 4];
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    rotation = [s / 4, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    rotation = [(m12 + m21) / s, s / 4, (m23 + m32) / s, (m13 - m31) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    rotation = [(m13 + m31) / s, (m23 + m32) / s, s / 4, (m21 - m12) / s];
  }
  const length = Math.hypot(...rotation);
  rotation = rotation.map((value) => value / length) as Quaternion;
  const transform: Transform3D = {
    translation: matrix.slice(12, 15) as Vec3,
    rotation,
    scale,
  };
  if (!matricesMatch(matrix, composeTransform(transform))) fail();
  return transform;
}
