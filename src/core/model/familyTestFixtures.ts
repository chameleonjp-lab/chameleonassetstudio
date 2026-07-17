import type {
  FamilyVariantIdMap,
  FamilyVariantWriteSet,
  LinkedMirrorAssetFamilyVariant,
} from './family';

export function createFamilyVariantIdMap(): FamilyVariantIdMap {
  return {
    textures: {},
    layers: {},
    parts: {},
    anchors: {},
    colliders: {},
    frames: {},
    animations: {},
  };
}

export function createFamilyVariantWriteSet(): FamilyVariantWriteSet {
  return {
    textures: [],
    layers: [],
    parts: [],
    anchors: [],
    colliders: [],
    frames: [],
    animations: [],
    blobPaths: [],
  };
}

export function createLinkedMirrorVariant(assetId: string): LinkedMirrorAssetFamilyVariant {
  return {
    assetId,
    kind: 'linked-mirror',
    recipe: {
      type: 'mirror',
      idMap: createFamilyVariantIdMap(),
      writeSet: createFamilyVariantWriteSet(),
    },
    fingerprint: {
      base: 'sha256:base-fixture',
      variant: 'sha256:variant-fixture',
      syncedAt: '2026-07-17T00:00:00.000Z',
    },
  };
}
