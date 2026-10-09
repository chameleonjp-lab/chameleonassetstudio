import type { Node3D, Skin3D, Transform3D } from '../model/project';
import { assertAffineMatrix, assertSkinInfluences, inverseAffineMatrix } from './math';

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_FLOAT32 = 3.4028234663852886e38;

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function stableId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID.test(value);
}

function cloneTransform(transform: Transform3D): Transform3D {
  return {
    translation: [...transform.translation],
    rotation: [...transform.rotation],
    scale: [...transform.scale],
  };
}

function isFiniteTuple(value: unknown, length: number): value is number[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  for (let index = 0; index < length; index += 1) {
    if (typeof value[index] !== 'number' || !Number.isFinite(value[index])) return false;
  }
  return true;
}

function isFiniteFloat32Tuple(value: unknown, length: number): value is number[] {
  if (!isFiniteTuple(value, length)) return false;
  return value.every((entry) => Math.abs(entry) <= MAX_FLOAT32);
}

function isTransform(value: unknown): value is Transform3D {
  if (!isRecord(value) || !hasExactKeys(value, ['translation', 'rotation', 'scale'])) return false;
  const translation = value.translation;
  const rotation = value.rotation;
  const scale = value.scale;
  return (
    isFiniteFloat32Tuple(translation, 3) &&
    isFiniteTuple(rotation, 4) &&
    isFiniteFloat32Tuple(scale, 3) &&
    Math.abs(Math.hypot(...rotation) - 1) <= 1e-5
  );
}

/**
 * Validates the existing 0.2.0 Skin3D profile shape without changing or
 * normalizing any values. It checks references against the mesh and stable IDs.
 */
export function validateSkinProfile(
  value: unknown,
  meshValue: unknown,
  nodesValue: unknown,
): asserts value is Skin3D {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'meshId', 'joints', 'weights'])) {
    fail('Skin profile fields are invalid');
  }
  if (!stableId(value.id) || !stableId(value.meshId)) {
    fail('Skin profile IDs are invalid');
  }
  if (!isRecord(meshValue) || !stableId(meshValue.id) || meshValue.id !== value.meshId) {
    fail('Skin profile mesh reference is invalid');
  }
  if (!Array.isArray(meshValue.vertices) || !Array.isArray(nodesValue)) {
    fail('Skin profile mesh vertices and nodes are required');
  }

  const vertexIds = new Set<string>();
  for (const vertex of meshValue.vertices) {
    if (!isRecord(vertex) || !stableId(vertex.id) || vertexIds.has(vertex.id)) {
      fail('Mesh vertex IDs must be valid and unique');
    }
    if (!isFiniteFloat32Tuple(vertex.position, 3)) {
      fail(`Invalid mesh vertex position: ${vertex.id}`);
    }
    vertexIds.add(vertex.id);
  }

  const nodeIds = new Set<string>();
  for (const node of nodesValue) {
    if (!isRecord(node) || !stableId(node.id) || nodeIds.has(node.id)) {
      fail('Node IDs must be valid and unique');
    }
    nodeIds.add(node.id);
  }

  if (!Array.isArray(value.joints) || value.joints.length === 0) {
    fail('At least one skin joint is required');
  }
  const jointIds = new Set<string>();
  for (const joint of value.joints) {
    if (
      !isRecord(joint) ||
      !hasExactKeys(joint, ['nodeId', 'inverseBind']) ||
      !stableId(joint.nodeId) ||
      !nodeIds.has(joint.nodeId)
    ) {
      fail('Skin joint reference is invalid');
    }
    if (jointIds.has(joint.nodeId)) {
      fail(`Duplicate skin joint: ${joint.nodeId}`);
    }
    assertAffineMatrix(joint.inverseBind, `Inverse bind for ${joint.nodeId}`);
    inverseAffineMatrix(joint.inverseBind, `Inverse bind for ${joint.nodeId}`);
    jointIds.add(joint.nodeId);
  }

  if (!Array.isArray(value.weights)) {
    fail('Skin weights must be an array');
  }
  const assignedVertexIds = new Set<string>();
  for (const weight of value.weights) {
    if (
      !isRecord(weight) ||
      !hasExactKeys(weight, ['vertexId', 'jointIds', 'values']) ||
      !stableId(weight.vertexId) ||
      !vertexIds.has(weight.vertexId)
    ) {
      fail('Skin weight vertex reference is invalid');
    }
    if (assignedVertexIds.has(weight.vertexId)) {
      fail(`Duplicate skin weight for vertex: ${weight.vertexId}`);
    }
    const weightJointIds = weight.jointIds;
    const weightValues = weight.values;
    if (!Array.isArray(weightJointIds) || !Array.isArray(weightValues)) {
      fail(`Skin influences are invalid for vertex: ${weight.vertexId}`);
    }
    if (weightJointIds.length !== weightValues.length) {
      fail(`Skin joint and weight counts differ for vertex: ${weight.vertexId}`);
    }
    const influences = weightJointIds.map((jointId, index) => ({
      jointId: jointId as string,
      weight: weightValues[index] as number,
    }));
    assertSkinInfluences(influences, jointIds);
    assignedVertexIds.add(weight.vertexId);
  }

  if (assignedVertexIds.size !== vertexIds.size) {
    fail('Every mesh vertex must have one skin weight entry');
  }
}

/**
 * Restores local TRS from a saved node snapshot by stable ID, preserving the
 * current node order and other fields. It does not read or mutate Skeleton.pose.
 */
export function restoreRestTransformsById<T extends Node3D>(
  currentNodes: readonly T[],
  savedRestNodes: readonly Pick<Node3D, 'id' | 'transform'>[],
): Array<Omit<T, 'transform'> & { transform: Transform3D }> {
  if (!Array.isArray(currentNodes) || !Array.isArray(savedRestNodes)) {
    fail('Current and saved rest nodes are required');
  }

  const savedById = new Map<string, Pick<Node3D, 'id' | 'transform'>>();
  for (const saved of savedRestNodes) {
    if (
      !isRecord(saved) ||
      !stableId(saved.id) ||
      !isTransform(saved.transform) ||
      savedById.has(saved.id)
    ) {
      fail('Saved rest node IDs must be valid and unique');
    }
    savedById.set(saved.id, saved as unknown as Pick<Node3D, 'id' | 'transform'>);
  }

  const currentIds = new Set<string>();
  for (const node of currentNodes) {
    if (!isRecord(node) || !stableId(node.id) || currentIds.has(node.id)) {
      fail('Current node IDs must be valid and unique');
    }
    if (!savedById.has(node.id)) {
      fail(`Saved rest transform is missing for node: ${node.id}`);
    }
    currentIds.add(node.id);
  }

  return currentNodes.map((node) => ({
    ...node,
    transform: cloneTransform(savedById.get(node.id)!.transform),
  }));
}
