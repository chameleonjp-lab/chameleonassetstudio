import type { Vec3 } from '../model/project';

/** Read-only view of the existing column-major 4x4 matrix representation. */
export type Matrix4 = readonly number[];

export interface JointWorldPose {
  nodeId: string;
  restWorld: Matrix4;
  posedWorld: Matrix4;
}

export interface SkinInfluence {
  jointId: string;
  weight: number;
}

export interface SkinVertexInput {
  position: Vec3;
  restMeshWorld: Matrix4;
  currentMeshWorld: Matrix4;
  joints: readonly JointWorldPose[];
  influences: readonly SkinInfluence[];
}

export const MAX_SKIN_INFLUENCES = 4;
export const SKIN_WEIGHT_SUM_TOLERANCE = 1e-5;
const MAX_FLOAT32 = 3.4028234663852886e38;
const MAX_INVERSE_RESIDUAL = 1e-10;
const MAX_AFFINE_INVERSE_RESIDUAL = 1e-9;
// Allow ordinary product rounding while requiring the Float32-rounded inverse
// to remain within 1e-5 (about 84 Float32 epsilons) of the identity.
const MAX_FLOAT32_INVERSE_RESIDUAL = 1e-5;

interface CheckedNumber {
  precise: number;
  float32: number;
}

interface DualMatrix4 {
  precise: number[];
  float32: number[];
}

interface DualVec3 {
  precise: Vec3;
  float32: Vec3;
}

function fail(message: string): never {
  throw new Error(message);
}

function assertFloat32Finite(value: number, name: string): void {
  if (
    !Number.isFinite(value) ||
    Math.abs(value) > MAX_FLOAT32 ||
    !Number.isFinite(Math.fround(value))
  ) {
    fail(`${name} is not Float32-finite`);
  }
}

function checkedFloat32Value(precise: number, name: string): CheckedNumber {
  assertFloat32Finite(precise, name);
  const float32 = Math.fround(precise);
  assertFloat32Finite(float32, name);
  return { precise, float32 };
}

function checkedFloat32Product(
  left: CheckedNumber,
  right: CheckedNumber,
  name: string,
): CheckedNumber {
  const precise = left.precise * right.precise;
  assertFloat32Finite(precise, name);
  const float32 = Math.fround(left.float32 * right.float32);
  assertFloat32Finite(float32, name);
  return { precise, float32 };
}

function checkedFloat32Sum(left: CheckedNumber, right: CheckedNumber, name: string): CheckedNumber {
  const precise = left.precise + right.precise;
  assertFloat32Finite(precise, name);
  const float32 = Math.fround(left.float32 + right.float32);
  assertFloat32Finite(float32, name);
  return { precise, float32 };
}

function negateCheckedFloat32(value: CheckedNumber, name: string): CheckedNumber {
  const precise = -value.precise;
  const float32 = Math.fround(-value.float32);
  assertFloat32Finite(precise, name);
  assertFloat32Finite(float32, name);
  return { precise, float32 };
}

const FLOAT64_BUFFER = new ArrayBuffer(8);
const FLOAT64_VIEW = new DataView(FLOAT64_BUFFER);

function exactBinaryParts(value: number): { significand: bigint; exponent: number } {
  if (value === 0) return { significand: 0n, exponent: 0 };
  FLOAT64_VIEW.setFloat64(0, value, false);
  const high = FLOAT64_VIEW.getUint32(0, false);
  const low = FLOAT64_VIEW.getUint32(4, false);
  const exponentBits = (high >>> 20) & 0x7ff;
  const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
  const significand =
    (exponentBits === 0 ? fraction : (1n << 52n) | fraction) * (high >>> 31 === 0 ? 1n : -1n);
  return {
    significand,
    exponent: exponentBits === 0 ? -1074 : exponentBits - 1023 - 52,
  };
}

/** Uses exact dyadic arithmetic to distinguish singularity from a small scale. */
function hasNonZeroDeterminant3x3(rows: readonly (readonly number[])[]): boolean {
  const parts = rows.flat().map(exactBinaryParts);
  const nonzeroExponents = parts
    .filter((part) => part.significand !== 0n)
    .map((part) => part.exponent);
  if (nonzeroExponents.length === 0) return false;
  const commonExponent = Math.min(...nonzeroExponents);
  const entries = parts.map((part) => part.significand << BigInt(part.exponent - commonExponent));
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = entries;
  return (
    a00 * (a11 * a22 - a12 * a21) -
      a01 * (a10 * a22 - a12 * a20) +
      a02 * (a10 * a21 - a11 * a20) !==
    0n
  );
}

export function assertAffineMatrix(value: unknown, name = 'matrix'): asserts value is Matrix4 {
  if (!Array.isArray(value) || value.length !== 16) {
    fail(`${name} must contain 16 values`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== 'number' || !Number.isFinite(value[index])) {
      fail(`${name} must contain only finite numbers`);
    }
    if (Math.abs(value[index]) > MAX_FLOAT32) {
      fail(`${name} values must fit in Float32`);
    }
  }
  // Column-major affine matrices have the final row [0, 0, 0, 1].
  if (value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1) {
    fail(`${name} must be affine`);
  }
}

/** Inverts an affine matrix without changing its column-major storage or input. */
function invertAffineMatrix(matrix: Matrix4, name = 'matrix'): DualMatrix4 {
  assertAffineMatrix(matrix, name);

  // Scale each row before elimination to limit magnitude differences. The
  // exact determinant check above separates true singularity from small scales.
  const rows = [
    [matrix[0], matrix[4], matrix[8]],
    [matrix[1], matrix[5], matrix[9]],
    [matrix[2], matrix[6], matrix[10]],
  ];
  const rowScales = rows.map((row) => Math.max(...row.map(Math.abs)));
  if (rowScales.some((scale) => scale === 0)) {
    fail(`${name} must be nonsingular`);
  }
  if (!hasNonZeroDeterminant3x3(rows)) {
    fail(`${name} must be nonsingular`);
  }
  const normalizedRows = rows.map((row, index) => row.map((entry) => entry / rowScales[index]));
  const augmented = normalizedRows.map((row, index) => [
    ...row,
    ...(index === 0 ? [1, 0, 0] : index === 1 ? [0, 1, 0] : [0, 0, 1]),
  ]);

  for (let column = 0; column < 3; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }
    if (augmented[pivotRow][column] === 0 || !Number.isFinite(augmented[pivotRow][column])) {
      fail(`${name} must be nonsingular`);
    }
    if (pivotRow !== column) {
      [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
    }

    const pivot = augmented[column][column];
    for (let entry = 0; entry < 6; entry += 1) augmented[column][entry] /= pivot;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = 0; entry < 6; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }

  const normalizedInverse = augmented.map((row) => row.slice(3));
  if (
    matrixResidual(normalizedRows, normalizedInverse) > MAX_INVERSE_RESIDUAL ||
    matrixResidual(normalizedInverse, normalizedRows) > MAX_INVERSE_RESIDUAL
  ) {
    fail(`${name} inverse is numerically unstable`);
  }

  // A = D * B, so A^-1 = B^-1 * D^-1. Divide inverse columns by the
  // original row scales after the normalized elimination above.
  const linearInverse = augmented.map((row) =>
    row
      .slice(3)
      .map((entry, inverseColumn) =>
        checkedFloat32Value(entry / rowScales[inverseColumn], `${name} inverse linear value`),
      ),
  );
  const rawLinearInverse = linearInverse.map((row) => row.map((entry) => entry.precise));
  if (
    matrixResidual(rows, rawLinearInverse) > MAX_INVERSE_RESIDUAL ||
    matrixResidual(rawLinearInverse, rows) > MAX_INVERSE_RESIDUAL
  ) {
    fail(`${name} inverse is numerically unstable`);
  }
  const [i00, i01, i02] = linearInverse[0];
  const [i10, i11, i12] = linearInverse[1];
  const [i20, i21, i22] = linearInverse[2];
  const tx = checkedFloat32Value(matrix[12], `${name} translation`);
  const ty = checkedFloat32Value(matrix[13], `${name} translation`);
  const tz = checkedFloat32Value(matrix[14], `${name} translation`);
  const inverseTx = negateCheckedFloat32(
    checkedFloat32Sum(
      checkedFloat32Sum(
        checkedFloat32Product(i00, tx, `${name} inverse translation product`),
        checkedFloat32Product(i01, ty, `${name} inverse translation product`),
        `${name} inverse translation partial`,
      ),
      checkedFloat32Product(i02, tz, `${name} inverse translation product`),
      `${name} inverse translation partial`,
    ),
    `${name} inverse translation`,
  );
  const inverseTy = negateCheckedFloat32(
    checkedFloat32Sum(
      checkedFloat32Sum(
        checkedFloat32Product(i10, tx, `${name} inverse translation product`),
        checkedFloat32Product(i11, ty, `${name} inverse translation product`),
        `${name} inverse translation partial`,
      ),
      checkedFloat32Product(i12, tz, `${name} inverse translation product`),
      `${name} inverse translation partial`,
    ),
    `${name} inverse translation`,
  );
  const inverseTz = negateCheckedFloat32(
    checkedFloat32Sum(
      checkedFloat32Sum(
        checkedFloat32Product(i20, tx, `${name} inverse translation product`),
        checkedFloat32Product(i21, ty, `${name} inverse translation product`),
        `${name} inverse translation partial`,
      ),
      checkedFloat32Product(i22, tz, `${name} inverse translation product`),
      `${name} inverse translation partial`,
    ),
    `${name} inverse translation`,
  );
  const inverse = [
    i00.precise,
    i10.precise,
    i20.precise,
    0,
    i01.precise,
    i11.precise,
    i21.precise,
    0,
    i02.precise,
    i12.precise,
    i22.precise,
    0,
    inverseTx.precise,
    inverseTy.precise,
    inverseTz.precise,
    1,
  ];
  const inverseFloat32 = [
    i00.float32,
    i10.float32,
    i20.float32,
    0,
    i01.float32,
    i11.float32,
    i21.float32,
    0,
    i02.float32,
    i12.float32,
    i22.float32,
    0,
    inverseTx.float32,
    inverseTy.float32,
    inverseTz.float32,
    1,
  ];
  if (
    inverse.some((entry) => !Number.isFinite(entry) || Math.abs(entry) > MAX_FLOAT32) ||
    inverseFloat32.some((entry) => !Number.isFinite(entry) || Math.abs(entry) > MAX_FLOAT32)
  ) {
    fail(`${name} inverse is not Float32-finite`);
  }
  if (
    affineMatrixResidual(matrix, inverse) > MAX_AFFINE_INVERSE_RESIDUAL ||
    affineMatrixResidual(inverse, matrix) > MAX_AFFINE_INVERSE_RESIDUAL
  ) {
    fail(`${name} inverse is numerically unstable`);
  }
  const float32Rows = [
    [Math.fround(matrix[0]), Math.fround(matrix[4]), Math.fround(matrix[8])],
    [Math.fround(matrix[1]), Math.fround(matrix[5]), Math.fround(matrix[9])],
    [Math.fround(matrix[2]), Math.fround(matrix[6]), Math.fround(matrix[10])],
  ];
  const float32InverseRows = [
    [inverseFloat32[0], inverseFloat32[4], inverseFloat32[8]],
    [inverseFloat32[1], inverseFloat32[5], inverseFloat32[9]],
    [inverseFloat32[2], inverseFloat32[6], inverseFloat32[10]],
  ];
  if (
    matrixResidual(float32Rows, float32InverseRows) > MAX_FLOAT32_INVERSE_RESIDUAL ||
    matrixResidual(float32InverseRows, float32Rows) > MAX_FLOAT32_INVERSE_RESIDUAL
  ) {
    fail(`${name} inverse is numerically unstable in Float32`);
  }
  return { precise: inverse, float32: inverseFloat32 };
}

export function inverseAffineMatrix(matrix: Matrix4, name = 'matrix'): number[] {
  return invertAffineMatrix(matrix, name).precise;
}

function matrixResidual(
  left: readonly (readonly number[])[],
  right: readonly (readonly number[])[],
): number {
  let maximum = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const value =
        left[row][0] * right[0][column] +
        left[row][1] * right[1][column] +
        left[row][2] * right[2][column];
      if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
      maximum = Math.max(maximum, Math.abs(value - (row === column ? 1 : 0)));
    }
  }
  return maximum;
}

function affineMatrixResidual(left: Matrix4, right: Matrix4): number {
  let maximum = 0;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const value =
        left[row] * right[column * 4] +
        left[row + 4] * right[column * 4 + 1] +
        left[row + 8] * right[column * 4 + 2] +
        left[row + 12] * right[column * 4 + 3];
      if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
      maximum = Math.max(maximum, Math.abs(value - (row === column ? 1 : 0)));
    }
  }
  return maximum;
}

export function assertSkinInfluences(
  influences: readonly SkinInfluence[],
  knownJointIds: ReadonlySet<string>,
): void {
  if (
    !Array.isArray(influences) ||
    influences.length < 1 ||
    influences.length > MAX_SKIN_INFLUENCES
  ) {
    fail(`Influence count must be between 1 and ${MAX_SKIN_INFLUENCES}`);
  }

  const used = new Set<string>();
  let sum = 0;
  for (const influence of influences) {
    if (
      influence === null ||
      typeof influence !== 'object' ||
      typeof influence.jointId !== 'string' ||
      !knownJointIds.has(influence.jointId)
    ) {
      fail('Unknown skin joint');
    }
    if (used.has(influence.jointId)) {
      fail('Duplicate skin joint influence');
    }
    used.add(influence.jointId);
    if (typeof influence.weight !== 'number' || !Number.isFinite(influence.weight)) {
      fail('Skin weight must be finite');
    }
    if (influence.weight < 0) {
      fail('Skin weight cannot be negative');
    }
    sum += influence.weight;
  }

  if (sum === 0) {
    fail('Skin weights cannot all be zero');
  }
  if (!Number.isFinite(sum) || Math.abs(sum - 1) > SKIN_WEIGHT_SUM_TOLERANCE) {
    fail('Skin weights must sum to 1');
  }
}

function assertVec3(value: unknown, name: string): asserts value is Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    fail(`${name} must contain three finite numbers`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== 'number' || !Number.isFinite(value[index])) {
      fail(`${name} must contain three finite numbers`);
    }
    if (Math.abs(value[index]) > MAX_FLOAT32) {
      fail(`${name} values must fit in Float32`);
    }
  }
}

function matrixValues(matrix: Matrix4, name: string): DualMatrix4 {
  assertAffineMatrix(matrix, name);
  const precise = [...matrix];
  const float32 = precise.map((entry) => checkedFloat32Value(entry, name).float32);
  return { precise, float32 };
}

function matrixEntry(matrix: DualMatrix4, index: number): CheckedNumber {
  return { precise: matrix.precise[index], float32: matrix.float32[index] };
}

function multiplyAffine(left: DualMatrix4, right: DualMatrix4, name: string): DualMatrix4 {
  assertAffineMatrix(left.precise, `${name} left matrix`);
  assertAffineMatrix(left.float32, `${name} left Float32 matrix`);
  assertAffineMatrix(right.precise, `${name} right matrix`);
  assertAffineMatrix(right.float32, `${name} right Float32 matrix`);
  const precise = new Array<number>(16);
  const float32 = new Array<number>(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = checkedFloat32Product(
        matrixEntry(left, row),
        matrixEntry(right, column * 4),
        `${name} matrix product`,
      );
      for (let inner = 1; inner < 4; inner += 1) {
        const product = checkedFloat32Product(
          matrixEntry(left, row + inner * 4),
          matrixEntry(right, column * 4 + inner),
          `${name} matrix product`,
        );
        value = checkedFloat32Sum(value, product, `${name} matrix partial`);
      }
      precise[column * 4 + row] = value.precise;
      float32[column * 4 + row] = value.float32;
    }
  }
  assertAffineMatrix(precise, `${name} result`);
  assertAffineMatrix(float32, `${name} Float32 result`);
  return { precise, float32 };
}

function transformAffinePoint(matrix: DualMatrix4, point: Vec3, name: string): DualVec3 {
  assertAffineMatrix(matrix.precise, name);
  assertAffineMatrix(matrix.float32, `${name} Float32 matrix`);
  assertVec3(point, `${name} input point`);
  const pointValues = point.map((entry) => checkedFloat32Value(entry, `${name} input point`));
  const precise: Vec3 = [0, 0, 0];
  const float32: Vec3 = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    let value = checkedFloat32Product(
      matrixEntry(matrix, axis),
      pointValues[0],
      `${name} point product`,
    );
    value = checkedFloat32Sum(
      value,
      checkedFloat32Product(matrixEntry(matrix, axis + 4), pointValues[1], `${name} point product`),
      `${name} point partial`,
    );
    value = checkedFloat32Sum(
      value,
      checkedFloat32Product(matrixEntry(matrix, axis + 8), pointValues[2], `${name} point product`),
      `${name} point partial`,
    );
    value = checkedFloat32Sum(value, matrixEntry(matrix, axis + 12), `${name} point result`);
    precise[axis] = value.precise;
    float32[axis] = value.float32;
  }
  assertVec3(precise, `${name} result`);
  assertVec3(float32, `${name} Float32 result`);
  return { precise, float32 };
}

/**
 * Converts each joint palette into current-mesh local coordinates before
 * weighting. Matrices follow the existing column-major, column-vector
 * contract: world = parent * T * R * S.
 */
export function skinVertexToMeshLocal(input: SkinVertexInput): Vec3 {
  if (input === null || typeof input !== 'object') {
    fail('Skin vertex input is required');
  }
  assertVec3(input.position, 'Vertex position');
  assertAffineMatrix(input.restMeshWorld, 'Rest mesh world matrix');
  // The rest mesh transform is not inverted by the formula, but singular bind
  // transforms are invalid inputs for a bound skin and must be rejected.
  invertAffineMatrix(input.restMeshWorld, 'Rest mesh world matrix');
  const restMeshWorld = matrixValues(input.restMeshWorld, 'Rest mesh world matrix');
  const inverseCurrentMesh = invertAffineMatrix(
    input.currentMeshWorld,
    'Current mesh world matrix',
  );
  if (!Array.isArray(input.joints) || input.joints.length === 0) {
    fail('At least one skin joint is required');
  }

  const joints = new Map<string, { posedWorld: DualMatrix4; inverseBind: DualMatrix4 }>();
  for (const joint of input.joints) {
    if (
      joint === null ||
      typeof joint !== 'object' ||
      typeof joint.nodeId !== 'string' ||
      joint.nodeId.length === 0
    ) {
      fail('Skin joint ID is required');
    }
    if (joints.has(joint.nodeId)) {
      fail(`Duplicate skin joint: ${joint.nodeId}`);
    }
    const inverseBind = invertAffineMatrix(
      joint.restWorld,
      `Rest world matrix for ${joint.nodeId}`,
    );
    const posedWorld = matrixValues(joint.posedWorld, `Posed world matrix for ${joint.nodeId}`);
    invertAffineMatrix(joint.posedWorld, `Posed world matrix for ${joint.nodeId}`);
    joints.set(joint.nodeId, { posedWorld, inverseBind });
  }

  assertSkinInfluences(input.influences, new Set(joints.keys()));

  const meshLocalPosition: CheckedNumber[] = [
    checkedFloat32Value(0, 'Skinned vertex result'),
    checkedFloat32Value(0, 'Skinned vertex result'),
    checkedFloat32Value(0, 'Skinned vertex result'),
  ];
  for (const influence of input.influences) {
    const joint = joints.get(influence.jointId)!;
    const weight = checkedFloat32Value(influence.weight, 'Skin weight');
    const posedFromRest = multiplyAffine(
      joint.posedWorld,
      joint.inverseBind,
      `Skin matrix for ${influence.jointId}`,
    );
    const currentFromJoint = multiplyAffine(
      inverseCurrentMesh,
      posedFromRest,
      `Current mesh skin matrix for ${influence.jointId}`,
    );
    const palette = multiplyAffine(
      currentFromJoint,
      restMeshWorld,
      `Current mesh palette for ${influence.jointId}`,
    );
    const posedMeshLocalPosition = transformAffinePoint(
      palette,
      input.position,
      `Skinned vertex palette for ${influence.jointId}`,
    );
    for (let axis = 0; axis < 3; axis += 1) {
      const weightedContribution = checkedFloat32Product(
        weight,
        {
          precise: posedMeshLocalPosition.precise[axis],
          float32: posedMeshLocalPosition.float32[axis],
        },
        'Skinned vertex weighted contribution',
      );
      meshLocalPosition[axis] = checkedFloat32Sum(
        meshLocalPosition[axis],
        weightedContribution,
        'Skinned vertex result partial',
      );
    }
    assertVec3(
      meshLocalPosition.map((entry) => entry.precise),
      'Skinned vertex result',
    );
  }

  return meshLocalPosition.map((entry) => entry.precise) as Vec3;
}
