/** Independent, column-vector glTF arithmetic. Never import the editor's evaluator here. */
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export interface Trs {
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
}
export const identity = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a: readonly number[], b: readonly number[]): number[] {
  const result = Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) result[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return result;
}

export function compose(value: Trs): number[] {
  if (value.matrix) return [...value.matrix];
  const [x, y, z, w] = value.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = value.scale ?? [1, 1, 1];
  const [tx, ty, tz] = value.translation ?? [0, 0, 0];
  return [
    (1 - 2 * y * y - 2 * z * z) * sx,
    (2 * x * y + 2 * z * w) * sx,
    (2 * x * z - 2 * y * w) * sx,
    0,
    (2 * x * y - 2 * z * w) * sy,
    (1 - 2 * x * x - 2 * z * z) * sy,
    (2 * y * z + 2 * x * w) * sy,
    0,
    (2 * x * z + 2 * y * w) * sz,
    (2 * y * z - 2 * x * w) * sz,
    (1 - 2 * x * x - 2 * y * y) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

export function point(matrix: readonly number[], value: readonly number[]): Vec3 {
  return [0, 1, 2].map(
    (r) =>
      matrix[r] * value[0] + matrix[r + 4] * value[1] + matrix[r + 8] * value[2] + matrix[r + 12],
  ) as Vec3;
}

export function secondsForSample(
  duration: number,
  requested: number,
  loop: boolean,
  mode: 'scrub' | 'playback',
): number {
  if (!Number.isFinite(requested) || !Number.isFinite(duration) || duration < 0)
    throw new Error('Invalid sample time');
  if (duration === 0) return 0;
  if (mode === 'scrub' || !loop) return Math.min(duration, Math.max(0, requested));
  const remainder = requested % duration;
  return remainder < 0 ? remainder + duration : remainder;
}

function slerp(left: readonly number[], right: readonly number[], t: number): number[] {
  const normalize = (v: readonly number[]) => {
    const length = Math.hypot(...v);
    if (!length) throw new Error('Zero quaternion');
    return v.map((x) => x / length);
  };
  const a = normalize(left);
  let b = normalize(right);
  let cosine = a.reduce((sum, x, i) => sum + x * b[i], 0);
  if (cosine < 0) {
    b = b.map((x) => -x);
    cosine = -cosine;
  }
  if (cosine > 0.9995) return normalize(a.map((x, i) => (1 - t) * x + t * b[i]));
  const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
  const divisor = Math.sin(angle);
  return a.map((x, i) => (Math.sin((1 - t) * angle) * x + Math.sin(t * angle) * b[i]) / divisor);
}

export function sampleValues(
  times: readonly number[],
  values: readonly number[],
  width: number,
  time: number,
  interpolation: 'STEP' | 'LINEAR',
  rotation = false,
): number[] {
  const value = (i: number) => values.slice(i * width, (i + 1) * width);
  if (!times.length) throw new Error('Empty animation sampler');
  if (time <= times[0]) return value(0);
  if (time >= times[times.length - 1]) return value(times.length - 1);
  const high = times.findIndex((x) => x > time),
    low = high - 1;
  if (interpolation === 'STEP') return value(low);
  const t = (time - times[low]) / (times[high] - times[low]);
  return rotation
    ? slerp(value(low), value(high), t)
    : value(low).map((x, i) => x * (1 - t) + value(high)[i] * t);
}

export function hierarchyWorlds(nodes: readonly (Trs & { children?: number[] })[]): number[][] {
  const parents = new Map<number, number>();
  nodes.forEach((node, i) => node.children?.forEach((child) => parents.set(child, i)));
  const results = new Map<number, number[]>(),
    visiting = new Set<number>();
  const visit = (i: number): number[] => {
    const ready = results.get(i);
    if (ready) return ready;
    if (visiting.has(i)) throw new Error('Cyclic oracle hierarchy');
    visiting.add(i);
    const local = compose(nodes[i]);
    const parent = parents.get(i);
    const world = parent === undefined ? local : multiply(visit(parent), local);
    visiting.delete(i);
    results.set(i, world);
    return world;
  };
  return nodes.map((_, i) => visit(i));
}

/** glTF skin output is already world-space: sum(w * jointWorld * inverseBind * position). */
export function skinnedPoint(
  position: readonly number[],
  joints: readonly number[],
  weights: readonly number[],
  palette: readonly number[][],
  inverseBinds: readonly number[][],
): Vec3 {
  const result: Vec3 = [0, 0, 0];
  for (let i = 0; i < weights.length; i++) {
    const transformed = point(multiply(palette[joints[i]], inverseBinds[joints[i]]), position);
    for (let axis = 0; axis < 3; axis++) result[axis] += transformed[axis] * weights[i];
  }
  return result;
}

export function maximumPositionError(
  actual: readonly number[],
  expected: readonly number[],
): number {
  if (actual.length !== expected.length) throw new Error('Oracle component count mismatch');
  let maximum = 0;
  actual.forEach((value, i) => {
    if (!Number.isFinite(value) || !Number.isFinite(expected[i]))
      throw new Error('Non-finite oracle result');
    maximum = Math.max(maximum, Math.abs(value - expected[i]));
  });
  return maximum;
}
