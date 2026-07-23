import type { Asset } from './asset';
import { generateId } from './factories';
import type {
  AssetFamilyVariant,
  FamilyVariantFingerprint,
  FamilyVariantIdMap,
  FamilyVariantRecipe,
  FamilyVariantWriteSet,
  MirrorFamilyVariantRecipe,
  PaletteFamilyVariantRecipe,
  PaletteReplacement,
} from './family';
import { isFamilyVariantBlobPath } from './family';
import { flipCopyAsset } from './flipCopy';

export type LinkedAssetFamilyVariant = Exclude<AssetFamilyVariant, { kind: 'manual' }>;
export type FamilyVariantBlobMap = ReadonlyMap<string, Blob>;

type CollectionKey = keyof FamilyVariantIdMap;
type HasId = { id: string };

const COLLECTION_KEYS = [
  'textures',
  'layers',
  'parts',
  'anchors',
  'colliders',
  'frames',
  'animations',
] as const satisfies readonly CollectionKey[];

const FINGERPRINT_ENVELOPE = 'family-variant-fingerprint-v1';
const RGB_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** locale / ICUに依存しないUTF-16 code-unit順。fingerprintの決定性に使う。 */
function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class FamilyVariantRecipeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FamilyVariantRecipeError';
  }
}

function collection(asset: Asset, key: CollectionKey): HasId[] {
  if (key === 'frames') {
    return asset.frames ?? [];
  }
  return asset[key];
}

function ownMappedId(
  mapping: Readonly<Record<string, string>>,
  baseId: string,
): string | undefined {
  return Object.prototype.hasOwnProperty.call(mapping, baseId) ? mapping[baseId] : undefined;
}

function defineMappedId(mapping: Record<string, string>, baseId: string, targetId: string): void {
  Object.defineProperty(mapping, baseId, {
    value: targetId,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function emptyWriteSet(): FamilyVariantWriteSet {
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

/** 同じ順序で派生した2 Assetから、base内部ID→variant内部IDを固定する。 */
export function createFamilyVariantIdMap(base: Asset, variant: Asset): FamilyVariantIdMap {
  const result = {} as FamilyVariantIdMap;
  for (const key of COLLECTION_KEYS) {
    const baseItems = collection(base, key);
    const variantItems = collection(variant, key);
    if (baseItems.length !== variantItems.length) {
      throw new FamilyVariantRecipeError(
        `idMapを作成できません。${key}の要素数が一致しません（base ${baseItems.length} / variant ${variantItems.length}）。`,
      );
    }
    result[key] = Object.fromEntries(
      baseItems.map((item, index) => [item.id, variantItems[index].id]),
    );
  }
  return result;
}

function rigReasons(asset: Asset, label: string): string[] {
  const reasons: string[] = [];
  if ((asset.rigAnimations?.length ?? 0) > 0) {
    reasons.push(`${label}にrig animationがあるためlinked refreshできません。`);
  }
  if (asset.parts.some((part) => part.bindPose || part.rotationLimit)) {
    reasons.push(`${label}にbind poseまたはrotation limitがあるためlinked refreshできません。`);
  }
  return reasons;
}

const SUPPORTED_FRAME_KEYS = new Set(['id', 'name', 'layerStates', 'durationMs']);
const SUPPORTED_FRAME_LAYER_STATE_KEYS = new Set(['layerId', 'visible', 'transform', 'opacity']);
const SUPPORTED_ANIMATION_KEYS = new Set([
  'id',
  'name',
  'fps',
  'loop',
  'frameIds',
  'durationMs',
  'events',
]);

/**
 * Schemaが将来互換のため許容するframe拡張fieldには、layer IDなどの参照が入り得る。
 * その意味を推測してmirrorすると参照を書き残すため、Slice Cでは明示的に対象外にする。
 */
function unsupportedFrameDataReasons(asset: Asset, label: string): string[] {
  const reasons: string[] = [];
  for (const frame of asset.frames ?? []) {
    const unsupportedFrameKeys = Object.keys(frame).filter((key) => !SUPPORTED_FRAME_KEYS.has(key));
    if (unsupportedFrameKeys.length > 0) {
      reasons.push(
        `${label}のframe（${frame.id}）に未対応fieldがあります: ${unsupportedFrameKeys.join(', ')}`,
      );
    }
    frame.layerStates.forEach((state, index) => {
      const unsupportedStateKeys = Object.keys(state).filter(
        (key) => !SUPPORTED_FRAME_LAYER_STATE_KEYS.has(key),
      );
      if (unsupportedStateKeys.length > 0) {
        reasons.push(
          `${label}のframe（${frame.id}）layerStates[${index}]に未対応fieldがあります: ${unsupportedStateKeys.join(', ')}`,
        );
      }
    });
  }
  return reasons;
}

function unsupportedAnimationDataReasons(asset: Asset, label: string): string[] {
  return asset.animations.flatMap((animation) => {
    const unsupportedKeys = Object.keys(animation).filter(
      (key) => !SUPPORTED_ANIMATION_KEYS.has(key),
    );
    return unsupportedKeys.length > 0
      ? [
          `${label}のanimation（${animation.id}）に未対応fieldがあります: ${unsupportedKeys.join(', ')}`,
        ]
      : [];
  });
}

function unsupportedMotionDataReasons(asset: Asset, label: string): string[] {
  return [
    ...unsupportedFrameDataReasons(asset, label),
    ...unsupportedAnimationDataReasons(asset, label),
  ];
}

function cloneLinkedAsset(
  base: Asset,
  options: { now?: Date; name: string; displayName: string },
): Asset {
  const iso = (options.now ?? new Date()).toISOString();
  return {
    ...structuredClone(base),
    id: generateId('asset'),
    name: options.name,
    displayName: options.displayName,
    createdAt: iso,
    updatedAt: iso,
  };
}

export interface LinkedMirrorVariantDraft {
  asset: Asset;
  recipe: MirrorFamilyVariantRecipe;
}

/** linked mirrorの新規Assetと永続recipeを作る。Blobとfingerprintは呼び出し側で確定する。 */
export function createLinkedMirrorVariantDraft(
  base: Asset,
  options: { now?: Date; name?: string; displayName?: string } = {},
): LinkedMirrorVariantDraft {
  const reasons = [
    ...rigReasons(base, 'base Asset'),
    ...unsupportedMotionDataReasons(base, 'base Asset'),
  ];
  const editTextures = base.textures.filter((texture) => texture.kind === 'edit');
  if (editTextures.length > 1) {
    reasons.push(
      '現行の復旧点は1 Assetにつき1 edit Blobのため、edit textureが複数あるAssetはlinked mirrorにできません。',
    );
  }
  if (reasons.length > 0) {
    throw new FamilyVariantRecipeError(reasons.join(' '));
  }

  const asset = flipCopyAsset(base, {
    now: options.now,
    name: options.name ?? `${base.name}_mirror`,
    displayName: options.displayName ?? `${base.displayName} (linked左右反転)`,
    preserveInternalIds: true,
  });
  const idMap = createFamilyVariantIdMap(base, asset);
  const writeSet: FamilyVariantWriteSet = {
    textures: asset.textures.filter((texture) => texture.kind === 'edit').map(({ id }) => id),
    layers: asset.layers.map(({ id }) => id),
    parts: asset.parts.map(({ id }) => id),
    anchors: asset.anchors.map(({ id }) => id),
    colliders: asset.colliders.map(({ id }) => id),
    frames: (asset.frames ?? []).map(({ id }) => id),
    animations: asset.animations.map(({ id }) => id),
    blobPaths: asset.textures.filter((texture) => texture.kind === 'edit').map(({ path }) => path),
  };
  return { asset, recipe: { type: 'mirror', idMap, writeSet } };
}

export interface LinkedPaletteVariantDraft {
  asset: Asset;
  recipe: PaletteFamilyVariantRecipe;
}

/** Slice Cの初回UIは1 layer / 1 edit Blobへ限定する。 */
export function createLinkedPaletteVariantDraft(
  base: Asset,
  options: {
    baseLayerId: string;
    replacements: PaletteReplacement[];
    tolerance: number;
    now?: Date;
    name?: string;
    displayName?: string;
  },
): LinkedPaletteVariantDraft {
  const reasons: string[] = [];
  const layer = base.layers.find((candidate) => candidate.id === options.baseLayerId);
  const texture = layer?.textureId
    ? base.textures.find((candidate) => candidate.id === layer.textureId)
    : undefined;
  if (!layer || layer.layerType !== 'image' || !texture || texture.kind !== 'edit') {
    reasons.push('palette対象は既存edit TextureRefを参照するimage layerにしてください。');
  }
  if (
    texture &&
    base.layers.some(
      (candidate) => candidate.id !== options.baseLayerId && candidate.textureId === texture.id,
    )
  ) {
    reasons.push('未選択layerが同じedit TextureRefを共有するためpalette variantにできません。');
  }
  if (
    options.replacements.length === 0 ||
    options.replacements.some(
      (replacement) =>
        !RGB_HEX_PATTERN.test(replacement.from) || !RGB_HEX_PATTERN.test(replacement.to),
    )
  ) {
    reasons.push('Slice Cのpalette置換色は#rrggbb形式で1件以上指定してください。');
  }
  if (!Number.isFinite(options.tolerance) || options.tolerance < 0 || options.tolerance > 255) {
    reasons.push('palette toleranceは0〜255で指定してください。');
  }
  if (reasons.length > 0 || !layer || !texture) {
    throw new FamilyVariantRecipeError(reasons.join(' '));
  }

  const asset = cloneLinkedAsset(base, {
    now: options.now,
    name: options.name ?? `${base.name}_palette`,
    displayName: options.displayName ?? `${base.displayName} (linked palette)`,
  });
  const idMap = createFamilyVariantIdMap(base, asset);
  const targetLayerId = ownMappedId(idMap.layers, layer.id)!;
  const targetTextureId = ownMappedId(idMap.textures, texture.id)!;
  const targetTexture = asset.textures.find((candidate) => candidate.id === targetTextureId)!;
  const writeSet = emptyWriteSet();
  writeSet.layers = [targetLayerId];
  writeSet.textures = [targetTextureId];
  writeSet.blobPaths = [targetTexture.path];
  return {
    asset,
    recipe: {
      type: 'palette',
      idMap,
      baseLayerIds: [layer.id],
      writeSet,
      replacements: structuredClone(options.replacements),
      tolerance: options.tolerance,
    },
  };
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

function fingerprintRecipe(recipe: FamilyVariantRecipe): FamilyVariantRecipe {
  const writeSet = structuredClone(recipe.writeSet);
  for (const key of [...COLLECTION_KEYS, 'blobPaths'] as const) {
    writeSet[key] = [...writeSet[key]].sort(compareCodeUnits);
  }
  return recipe.type === 'mirror'
    ? { ...recipe, writeSet }
    : {
        ...recipe,
        writeSet,
        baseLayerIds: [...recipe.baseLayerIds].sort(compareCodeUnits),
        // replacementsは適用順が結果へ影響するため並べ替えない。
        replacements: structuredClone(recipe.replacements),
      };
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new FamilyVariantRecipeError('この環境ではWeb Crypto SHA-256を利用できません。');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

async function hashValue(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalValue(value)));
  return sha256(bytes.buffer as ArrayBuffer);
}

async function blobDescriptor(path: string, blob: Blob): Promise<Record<string, unknown>> {
  return {
    path,
    mimeType: blob.type,
    byteLength: blob.size,
    hash: await sha256(await blob.arrayBuffer()),
  };
}

function mappedBaseTextureForTargetPath(
  base: Asset,
  variant: Asset,
  recipe: FamilyVariantRecipe,
  targetPath: string,
) {
  const targetTexture = variant.textures.find((texture) => texture.path === targetPath);
  if (!targetTexture) {
    return null;
  }
  const baseTextureId = Object.entries(recipe.idMap.textures).find(
    ([, targetId]) => targetId === targetTexture.id,
  )?.[0];
  if (!baseTextureId) {
    return null;
  }
  const baseTexture = base.textures.find((texture) => texture.id === baseTextureId);
  return baseTexture ? { baseTexture, targetTexture } : null;
}

function selectedByIds<T extends HasId>(values: T[], ids: readonly string[]): T[] {
  const selected = new Set(ids);
  return values.filter((value) => selected.has(value.id));
}

function sameStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return (
    actualSet.size === actual.length &&
    expectedSet.size === expected.length &&
    actualSet.size === expectedSet.size &&
    [...actualSet].every((value) => expectedSet.has(value))
  );
}

function writeSetMismatchReason(
  key: keyof FamilyVariantWriteSet,
  actual: readonly string[],
  expected: readonly string[],
): string | null {
  return sameStringSet(actual, expected)
    ? null
    : `recipe.writeSet.${key}がrecipeの対象と一致しません。variantを再作成してください。`;
}

async function fingerprintBlobDescriptors(
  base: Asset,
  variant: Asset,
  recipe: FamilyVariantRecipe,
  side: 'base' | 'variant',
  blobs: FamilyVariantBlobMap,
): Promise<Record<string, unknown>[]> {
  const descriptors: Record<string, unknown>[] = [];
  for (const targetPath of [...recipe.writeSet.blobPaths].sort(compareCodeUnits)) {
    const mapping = mappedBaseTextureForTargetPath(base, variant, recipe, targetPath);
    const path = side === 'base' ? mapping?.baseTexture.path : targetPath;
    const blob = path ? blobs.get(path) : undefined;
    if (!path || !blob) {
      throw new FamilyVariantRecipeError(
        `${side === 'base' ? 'base' : 'variant'}のfingerprint対象Blobが見つかりません: ${path ?? targetPath}`,
      );
    }
    descriptors.push(await blobDescriptor(path, blob));
  }
  return descriptors.sort((left, right) => compareCodeUnits(String(left.path), String(right.path)));
}

function mirrorBaseStructure(asset: Asset): Record<string, unknown> {
  const layerTextureIds = new Set(
    asset.layers.flatMap((layer) => (layer.textureId ? [layer.textureId] : [])),
  );
  return {
    assetType: asset.assetType,
    canvasSize: asset.canvasSize,
    origin: asset.origin,
    // edit TextureRefはrefresh対象。source / thumbnailはlayerのmirror座標計算で
    // widthを読む場合だけhashへ含め、無関係な保存用画像の変更をstaleにしない。
    textures: asset.textures.filter(
      (texture) => texture.kind === 'edit' || layerTextureIds.has(texture.id),
    ),
    layers: asset.layers,
    parts: asset.parts,
    anchors: asset.anchors,
    colliders: asset.colliders,
    frames: asset.frames ?? [],
    animations: asset.animations,
  };
}

function variantWriteStructure(asset: Asset, writeSet: FamilyVariantWriteSet) {
  return {
    textures: selectedByIds(asset.textures, writeSet.textures),
    layers: selectedByIds(asset.layers, writeSet.layers),
    parts: selectedByIds(asset.parts, writeSet.parts),
    anchors: selectedByIds(asset.anchors, writeSet.anchors),
    colliders: selectedByIds(asset.colliders, writeSet.colliders),
    frames: selectedByIds(asset.frames ?? [], writeSet.frames),
    animations: selectedByIds(asset.animations, writeSet.animations),
  };
}

function paletteBaseStructure(asset: Asset, recipe: PaletteFamilyVariantRecipe) {
  const layers = selectedByIds(asset.layers, recipe.baseLayerIds);
  const textureIds = new Set(layers.flatMap((layer) => (layer.textureId ? [layer.textureId] : [])));
  return {
    layers,
    textures: asset.textures.filter((texture) => textureIds.has(texture.id)),
  };
}

async function currentFingerprintHash(
  base: Asset,
  variant: Asset,
  recipe: FamilyVariantRecipe,
  side: 'base' | 'variant',
  blobs: FamilyVariantBlobMap,
): Promise<string> {
  const structure =
    side === 'variant'
      ? variantWriteStructure(variant, recipe.writeSet)
      : recipe.type === 'mirror'
        ? mirrorBaseStructure(base)
        : paletteBaseStructure(base, recipe);
  return hashValue({
    envelope: FINGERPRINT_ENVELOPE,
    side,
    recipe: fingerprintRecipe(recipe),
    structure,
    blobs: await fingerprintBlobDescriptors(base, variant, recipe, side, blobs),
  });
}

export async function createLinkedVariantFingerprint(options: {
  base: Asset;
  variant: Asset;
  recipe: FamilyVariantRecipe;
  baseBlobs: FamilyVariantBlobMap;
  variantBlobs: FamilyVariantBlobMap;
  now?: Date;
}): Promise<FamilyVariantFingerprint> {
  return {
    base: await currentFingerprintHash(
      options.base,
      options.variant,
      options.recipe,
      'base',
      options.baseBlobs,
    ),
    variant: await currentFingerprintHash(
      options.base,
      options.variant,
      options.recipe,
      'variant',
      options.variantBlobs,
    ),
    syncedAt: (options.now ?? new Date()).toISOString(),
  };
}

async function blobsEqual(left: Blob, right: Blob): Promise<boolean> {
  if (left.type !== right.type || left.size !== right.size) {
    return false;
  }
  const [a, b] = await Promise.all([left.arrayBuffer(), right.arrayBuffer()]);
  const leftBytes = new Uint8Array(a);
  const rightBytes = new Uint8Array(b);
  return leftBytes.every((value, index) => value === rightBytes[index]);
}

function textureComparable(texture: Asset['textures'][number]) {
  return {
    kind: texture.kind,
    name: texture.name,
    mimeType: texture.mimeType,
    size: texture.size,
    path: texture.path,
  };
}

async function linkedVariantIneligibleReasons(options: {
  base: Asset;
  variantAsset: Asset;
  variant: LinkedAssetFamilyVariant;
  baseBlobs: FamilyVariantBlobMap;
  variantBlobs: FamilyVariantBlobMap;
}): Promise<string[]> {
  const { base, variantAsset, variant, baseBlobs, variantBlobs } = options;
  const { recipe } = variant;
  const reasons: string[] = [];

  for (const asset of [base, variantAsset]) {
    const blobs = asset === base ? baseBlobs : variantBlobs;
    for (const texture of asset.textures) {
      const blob = blobs.get(texture.path);
      if (!blob) {
        reasons.push(`${asset === base ? 'base' : 'variant'}のBlobがありません: ${texture.path}`);
      } else if (blob.type !== texture.mimeType) {
        reasons.push(
          `${asset === base ? 'base' : 'variant'}のBlob MIMEがTextureRefと一致しません: ${texture.path}`,
        );
      }
    }
  }

  const baseTextureIds = new Set(base.textures.map(({ id }) => id));
  const mappedBaseTextureIds = new Set(Object.keys(recipe.idMap.textures));
  const variantTextureIds = new Set(variantAsset.textures.map(({ id }) => id));
  const mappedVariantTextureIds = new Set(Object.values(recipe.idMap.textures));
  if (
    baseTextureIds.size !== mappedBaseTextureIds.size ||
    [...baseTextureIds].some((id) => !mappedBaseTextureIds.has(id)) ||
    variantTextureIds.size !== mappedVariantTextureIds.size ||
    [...variantTextureIds].some((id) => !mappedVariantTextureIds.has(id))
  ) {
    reasons.push('TextureRefの追加・削除はlinked refresh対象外です。variantを再作成してください。');
  }

  for (const [baseId, targetId] of Object.entries(recipe.idMap.textures)) {
    const baseTexture = base.textures.find((texture) => texture.id === baseId);
    const targetTexture = variantAsset.textures.find((texture) => texture.id === targetId);
    if (!baseTexture || !targetTexture) {
      reasons.push(`idMap.texturesの対応先がありません: ${baseId} → ${targetId}`);
      continue;
    }
    if (baseTexture.path !== targetTexture.path || baseTexture.kind !== targetTexture.kind) {
      reasons.push(`map対象TextureRefのkindまたはpathが一致しません: ${baseId} → ${targetId}`);
    }
    const mirrorReadsThumbnail =
      recipe.type === 'mirror' &&
      baseTexture.kind === 'thumbnail' &&
      base.layers.some((layer) => layer.textureId === baseTexture.id);
    if (baseTexture.kind === 'source' || mirrorReadsThumbnail) {
      if (
        JSON.stringify(canonicalValue(textureComparable(baseTexture))) !==
        JSON.stringify(canonicalValue(textureComparable(targetTexture)))
      ) {
        reasons.push(`${baseTexture.kind} TextureRefが変更されています: ${baseTexture.path}`);
      }
      const baseBlob = baseBlobs.get(baseTexture.path);
      const targetBlob = variantBlobs.get(targetTexture.path);
      if (baseBlob && targetBlob && !(await blobsEqual(baseBlob, targetBlob))) {
        reasons.push(`${baseTexture.kind} Blobが変更されています: ${baseTexture.path}`);
      }
    }
  }

  // non-texture write-set要素の欠落は手動削除としてhash差分で検出し、明示override時に
  // 同じtarget IDで復元できる。TextureRef / Blob欠落だけは安全に再構成できない。
  for (const key of ['textures'] as const) {
    const targetIds = new Set(collection(variantAsset, key).map(({ id }) => id));
    for (const id of recipe.writeSet[key]) {
      if (!targetIds.has(id)) {
        reasons.push(`writeSet.${key}のtarget IDがありません: ${id}`);
      }
    }
  }

  for (const path of recipe.writeSet.blobPaths) {
    if (!isFamilyVariantBlobPath(path)) {
      reasons.push(`writeSet.blobPathsが安全な相対pathではありません: ${path}`);
      continue;
    }
    const mapped = mappedBaseTextureForTargetPath(base, variantAsset, recipe, path);
    if (!mapped || mapped.targetTexture.kind !== 'edit' || mapped.baseTexture.kind !== 'edit') {
      reasons.push(`blobPathsは対応する既存edit TextureRefを指す必要があります: ${path}`);
    }
  }
  if (recipe.writeSet.blobPaths.length > 1) {
    reasons.push('現行の復旧点は1 Assetにつき1 edit Blobのため、複数Blob refreshはできません。');
  }

  const writeTextureIds = new Set(recipe.writeSet.textures);
  const writeLayerIds = new Set(recipe.writeSet.layers);
  const sharingTargetLayers = variantAsset.layers.filter(
    (layer) =>
      !writeLayerIds.has(layer.id) &&
      layer.textureId !== undefined &&
      writeTextureIds.has(layer.textureId),
  );
  if (sharingTargetLayers.length > 0) {
    reasons.push(
      `write-set外のvariant layerがrefresh対象TextureRefを共有しています: ${sharingTargetLayers.map(({ id }) => id).join(', ')}`,
    );
  }

  if (recipe.type === 'mirror') {
    reasons.push(
      ...rigReasons(base, 'base Asset'),
      ...rigReasons(variantAsset, 'variant Asset'),
      ...unsupportedMotionDataReasons(base, 'base Asset'),
      ...unsupportedMotionDataReasons(variantAsset, 'variant Asset'),
    );
    for (const key of COLLECTION_KEYS.filter((value) => value !== 'textures')) {
      const mismatch = writeSetMismatchReason(
        key,
        recipe.writeSet[key],
        Object.values(recipe.idMap[key]),
      );
      if (mismatch) {
        reasons.push(mismatch);
      }
    }
    const expectedTextureIds = base.textures
      .filter((texture) => texture.kind === 'edit')
      .flatMap((texture) => {
        const targetId = ownMappedId(recipe.idMap.textures, texture.id);
        return targetId ? [targetId] : [];
      });
    const expectedBlobPaths = expectedTextureIds.flatMap((id) => {
      const texture = variantAsset.textures.find((candidate) => candidate.id === id);
      return texture?.kind === 'edit' ? [texture.path] : [];
    });
    const textureMismatch = writeSetMismatchReason(
      'textures',
      recipe.writeSet.textures,
      expectedTextureIds,
    );
    const blobMismatch = writeSetMismatchReason(
      'blobPaths',
      recipe.writeSet.blobPaths,
      expectedBlobPaths,
    );
    if (textureMismatch) {
      reasons.push(textureMismatch);
    }
    if (blobMismatch) {
      reasons.push(blobMismatch);
    }
    if (
      base.assetType !== variantAsset.assetType ||
      JSON.stringify(base.canvasSize) !== JSON.stringify(variantAsset.canvasSize) ||
      JSON.stringify(base.origin) !== JSON.stringify(variantAsset.origin)
    ) {
      reasons.push(
        'mirrorのasset type・canvas size・originが一致しません。variantを再作成してください。',
      );
    }
  } else {
    if (recipe.baseLayerIds.length !== 1) {
      reasons.push('Slice Cのpalette refreshはbaseLayerIds 1件だけに対応します。');
    }
    if (
      recipe.replacements.some(
        (replacement) =>
          !RGB_HEX_PATTERN.test(replacement.from) || !RGB_HEX_PATTERN.test(replacement.to),
      )
    ) {
      reasons.push('8桁alpha色を含むpalette recipeはSlice Cではrefreshできません。');
    }
    const selectedLayerIds = new Set(recipe.baseLayerIds);
    const expectedLayerIds = recipe.baseLayerIds.flatMap((id) => {
      const targetId = ownMappedId(recipe.idMap.layers, id);
      return targetId ? [targetId] : [];
    });
    const expectedTextureIds: string[] = [];
    const expectedBlobPaths: string[] = [];
    for (const baseLayerId of recipe.baseLayerIds) {
      const baseLayer = base.layers.find((layer) => layer.id === baseLayerId);
      const baseTexture = baseLayer?.textureId
        ? base.textures.find((texture) => texture.id === baseLayer.textureId)
        : undefined;
      const targetTextureId = baseTexture
        ? ownMappedId(recipe.idMap.textures, baseTexture.id)
        : undefined;
      const targetTexture = variantAsset.textures.find((texture) => texture.id === targetTextureId);
      if (
        !baseLayer ||
        baseLayer.layerType !== 'image' ||
        !baseTexture ||
        !targetTexture ||
        baseTexture.kind !== 'edit' ||
        targetTexture.kind !== 'edit'
      ) {
        reasons.push(`palette対象layerまたはedit TextureRefの対応がありません: ${baseLayerId}`);
        continue;
      }
      expectedTextureIds.push(targetTexture.id);
      expectedBlobPaths.push(targetTexture.path);
      if (
        base.layers.some(
          (layer) => !selectedLayerIds.has(layer.id) && layer.textureId === baseTexture.id,
        )
      ) {
        reasons.push(`未選択layerがpalette対象TextureRefを共有しています: ${baseTexture.path}`);
      }
    }
    for (const [key, expected] of [
      ['layers', expectedLayerIds],
      ['textures', [...new Set(expectedTextureIds)]],
      ['blobPaths', [...new Set(expectedBlobPaths)]],
      ['parts', []],
      ['anchors', []],
      ['colliders', []],
      ['frames', []],
      ['animations', []],
    ] as const) {
      const mismatch = writeSetMismatchReason(key, recipe.writeSet[key], expected);
      if (mismatch) {
        reasons.push(mismatch);
      }
    }
  }

  return [...new Set(reasons)];
}

export type LinkedVariantInspectionStatus =
  'up-to-date' | 'ready' | 'manual-adjusted' | 'ineligible';

export interface LinkedVariantInspection {
  status: LinkedVariantInspectionStatus;
  stale: boolean;
  manualAdjusted: boolean;
  reasons: string[];
  currentBaseHash?: string;
  currentVariantHash?: string;
}

export async function inspectLinkedVariant(options: {
  base: Asset;
  variantAsset: Asset;
  variant: LinkedAssetFamilyVariant;
  baseBlobs: FamilyVariantBlobMap;
  variantBlobs: FamilyVariantBlobMap;
}): Promise<LinkedVariantInspection> {
  const reasons = await linkedVariantIneligibleReasons(options);
  if (reasons.length > 0) {
    return { status: 'ineligible', stale: false, manualAdjusted: false, reasons };
  }
  try {
    const [currentBaseHash, currentVariantHash] = await Promise.all([
      currentFingerprintHash(
        options.base,
        options.variantAsset,
        options.variant.recipe,
        'base',
        options.baseBlobs,
      ),
      currentFingerprintHash(
        options.base,
        options.variantAsset,
        options.variant.recipe,
        'variant',
        options.variantBlobs,
      ),
    ]);
    const stale = currentBaseHash !== options.variant.fingerprint.base;
    const manualAdjusted = currentVariantHash !== options.variant.fingerprint.variant;
    return {
      status: manualAdjusted ? 'manual-adjusted' : stale ? 'ready' : 'up-to-date',
      stale,
      manualAdjusted,
      reasons: manualAdjusted
        ? [
            stale
              ? 'baseに更新候補があり、variantのwrite-setにも手動調整があります。'
              : 'variantのwrite-setに同期後の手動調整があります。明示確認なしでは上書きしません。',
          ]
        : stale
          ? ['baseのrecipe対象が最終同期後に変更されています。']
          : [],
      currentBaseHash,
      currentVariantHash,
    };
  } catch (error) {
    return {
      status: 'ineligible',
      stale: false,
      manualAdjusted: false,
      reasons: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function mergeMappedCollection<T extends HasId>(
  current: T[],
  previousWriteIds: readonly string[],
  expected: T[],
): T[] {
  const previous = new Set(previousWriteIds);
  const queue = [...expected];
  const result: T[] = [];
  for (const item of current) {
    if (!previous.has(item.id)) {
      result.push(item);
      continue;
    }
    const replacement = queue.shift();
    if (replacement) {
      result.push(replacement);
    }
  }
  result.push(...queue);
  return result;
}

function mirrorRefreshAsset(
  base: Asset,
  current: Asset,
  recipe: MirrorFamilyVariantRecipe,
  now: Date,
): { asset: Asset; recipe: MirrorFamilyVariantRecipe; changes: string[] } {
  const generated = flipCopyAsset(base, {
    now,
    name: current.name,
    displayName: current.displayName,
    preserveInternalIds: true,
  });
  const nextIdMap = structuredClone(recipe.idMap);
  const changes: string[] = [];

  for (const key of COLLECTION_KEYS.filter((value) => value !== 'textures')) {
    const baseItems = collection(base, key);
    const generatedItems = collection(generated, key);
    const baseIds = new Set(baseItems.map(({ id }) => id));
    const removed = Object.keys(nextIdMap[key]).filter((id) => !baseIds.has(id));
    for (const id of removed) {
      delete nextIdMap[key][id];
    }
    const usedTargetIds = new Set([
      ...collection(current, key).map(({ id }) => id),
      ...Object.values(nextIdMap[key]),
    ]);
    let added = 0;
    baseItems.forEach((item, index) => {
      if (ownMappedId(nextIdMap[key], item.id) === undefined) {
        const identityCandidate = generatedItems[index].id;
        let targetId = identityCandidate;
        while (usedTargetIds.has(targetId)) {
          targetId = generateId(key.slice(0, -1));
        }
        defineMappedId(nextIdMap[key], item.id, targetId);
        usedTargetIds.add(targetId);
        added += 1;
      }
    });
    if (added > 0 || removed.length > 0) {
      changes.push(`${key}: 追加${added}件 / 削除${removed.length}件`);
    }
  }

  const generatedToTarget = {} as FamilyVariantIdMap;
  for (const key of COLLECTION_KEYS) {
    const baseItems = collection(base, key);
    const generatedItems = collection(generated, key);
    generatedToTarget[key] = Object.fromEntries(
      baseItems.map((item, index) => {
        const targetId = ownMappedId(nextIdMap[key], item.id);
        if (targetId === undefined) {
          throw new FamilyVariantRecipeError(`refresh用idMap.${key}に対応がありません: ${item.id}`);
        }
        return [generatedItems[index].id, targetId];
      }),
    );
  }

  const expectedTextures = generated.textures
    .filter((texture) => texture.kind === 'edit')
    .map((texture) => ({ ...texture, id: ownMappedId(generatedToTarget.textures, texture.id)! }));
  const expectedLayers = generated.layers.map((layer) => ({
    ...structuredClone(layer),
    id: ownMappedId(generatedToTarget.layers, layer.id)!,
    ...(layer.textureId
      ? { textureId: ownMappedId(generatedToTarget.textures, layer.textureId) ?? layer.textureId }
      : {}),
  }));
  const expectedParts = generated.parts.map((part) => ({
    ...structuredClone(part),
    id: ownMappedId(generatedToTarget.parts, part.id)!,
    layerIds: part.layerIds.map((id) => ownMappedId(generatedToTarget.layers, id) ?? id),
    ...(part.parentId
      ? { parentId: ownMappedId(generatedToTarget.parts, part.parentId) ?? part.parentId }
      : {}),
  }));
  const expectedAnchors = generated.anchors.map((anchor) => ({
    ...structuredClone(anchor),
    id: ownMappedId(generatedToTarget.anchors, anchor.id)!,
  }));
  const expectedColliders = generated.colliders.map((collider) => ({
    ...structuredClone(collider),
    id: ownMappedId(generatedToTarget.colliders, collider.id)!,
  }));
  const expectedFrames = (generated.frames ?? []).map((frame) => ({
    ...structuredClone(frame),
    id: ownMappedId(generatedToTarget.frames, frame.id)!,
    layerStates: frame.layerStates.map((state) => ({
      ...structuredClone(state),
      layerId: ownMappedId(generatedToTarget.layers, state.layerId) ?? state.layerId,
    })),
  }));
  const expectedAnimations = generated.animations.map((animation) => ({
    ...structuredClone(animation),
    id: ownMappedId(generatedToTarget.animations, animation.id)!,
    frameIds: animation.frameIds.map((id) => ownMappedId(generatedToTarget.frames, id) ?? id),
    ...(animation.events
      ? {
          events: animation.events.map((event) => ({
            ...structuredClone(event),
            frameId: ownMappedId(generatedToTarget.frames, event.frameId) ?? event.frameId,
          })),
        }
      : {}),
  }));

  const nextWriteSet: FamilyVariantWriteSet = {
    ...structuredClone(recipe.writeSet),
    textures: expectedTextures.map(({ id }) => id),
    layers: expectedLayers.map(({ id }) => id),
    parts: expectedParts.map(({ id }) => id),
    anchors: expectedAnchors.map(({ id }) => id),
    colliders: expectedColliders.map(({ id }) => id),
    frames: expectedFrames.map(({ id }) => id),
    animations: expectedAnimations.map(({ id }) => id),
    blobPaths: expectedTextures.map(({ path }) => path),
  };

  const nextFrames = mergeMappedCollection(
    current.frames ?? [],
    recipe.writeSet.frames,
    expectedFrames,
  );
  return {
    asset: {
      ...current,
      textures: mergeMappedCollection(current.textures, recipe.writeSet.textures, expectedTextures),
      layers: mergeMappedCollection(current.layers, recipe.writeSet.layers, expectedLayers),
      parts: mergeMappedCollection(current.parts, recipe.writeSet.parts, expectedParts),
      anchors: mergeMappedCollection(current.anchors, recipe.writeSet.anchors, expectedAnchors),
      colliders: mergeMappedCollection(
        current.colliders,
        recipe.writeSet.colliders,
        expectedColliders,
      ),
      ...(current.frames !== undefined || nextFrames.length > 0 ? { frames: nextFrames } : {}),
      animations: mergeMappedCollection(
        current.animations,
        recipe.writeSet.animations,
        expectedAnimations,
      ),
      updatedAt: now.toISOString(),
    },
    recipe: {
      ...structuredClone(recipe),
      type: 'mirror',
      idMap: nextIdMap,
      writeSet: nextWriteSet,
    },
    changes: changes.length > 0 ? changes : ['mirror対象構造を再生成します。'],
  };
}

function paletteRefreshAsset(
  base: Asset,
  current: Asset,
  recipe: PaletteFamilyVariantRecipe,
  now: Date,
): Asset {
  const expectedLayers = recipe.baseLayerIds.map((baseLayerId) => {
    const baseLayer = base.layers.find((layer) => layer.id === baseLayerId)!;
    return {
      ...structuredClone(baseLayer),
      id: ownMappedId(recipe.idMap.layers, baseLayerId)!,
      ...(baseLayer.textureId
        ? {
            textureId:
              ownMappedId(recipe.idMap.textures, baseLayer.textureId) ?? baseLayer.textureId,
          }
        : {}),
    };
  });
  const targetTextureIds = new Set(recipe.writeSet.textures);
  const expectedTextures = base.textures
    .filter((texture) => {
      const targetId = ownMappedId(recipe.idMap.textures, texture.id);
      return targetId !== undefined && targetTextureIds.has(targetId);
    })
    .map((texture) => {
      const targetId = ownMappedId(recipe.idMap.textures, texture.id)!;
      const existing = current.textures.find((candidate) => candidate.id === targetId)!;
      return { ...structuredClone(texture), id: targetId, path: existing.path };
    });
  return {
    ...current,
    textures: mergeMappedCollection(current.textures, recipe.writeSet.textures, expectedTextures),
    layers: mergeMappedCollection(current.layers, recipe.writeSet.layers, expectedLayers),
    updatedAt: now.toISOString(),
  };
}

export interface LinkedVariantBlobChange {
  targetPath: string;
  basePath: string;
  before: Blob;
  after: Blob;
}

export interface LinkedVariantRefreshArtifact {
  inspection: LinkedVariantInspection;
  afterAsset: Asset;
  nextVariant: LinkedAssetFamilyVariant;
  blobChanges: LinkedVariantBlobChange[];
  baseReadBlobPaths: string[];
  variantReadBlobPaths: string[];
  changes: string[];
  preserved: string[];
}

export type PaletteBlobTransformer = (
  blob: Blob,
  replacements: readonly PaletteReplacement[],
  tolerance: number,
) => Promise<Blob>;

/** previewで一度生成したartifactを、そのままCAS commitへ渡す。 */
export async function prepareLinkedVariantRefresh(options: {
  base: Asset;
  variantAsset: Asset;
  variant: LinkedAssetFamilyVariant;
  baseBlobs: FamilyVariantBlobMap;
  variantBlobs: FamilyVariantBlobMap;
  transformPaletteBlob?: PaletteBlobTransformer;
  /**
   * 同じ入力から直前に算出済みの検査結果。複数target previewではfingerprintを
   * 二重計算しないために渡す。省略時は従来どおり内部で検査する。
   */
  inspection?: LinkedVariantInspection;
  now?: Date;
}): Promise<LinkedVariantRefreshArtifact> {
  const inspection = options.inspection ?? (await inspectLinkedVariant(options));
  if (inspection.status === 'ineligible') {
    throw new FamilyVariantRecipeError(inspection.reasons.join(' '));
  }
  const now = options.now ?? new Date();
  let afterAsset: Asset;
  let nextRecipe: FamilyVariantRecipe;
  let changes: string[];
  if (options.variant.recipe.type === 'mirror') {
    const result = mirrorRefreshAsset(
      options.base,
      options.variantAsset,
      options.variant.recipe,
      now,
    );
    afterAsset = result.asset;
    nextRecipe = result.recipe;
    changes = result.changes;
  } else {
    afterAsset = paletteRefreshAsset(
      options.base,
      options.variantAsset,
      options.variant.recipe,
      now,
    );
    nextRecipe = structuredClone(options.variant.recipe);
    changes = [
      `palette: layer ${options.variant.recipe.baseLayerIds.length}件 / edit Blob ${options.variant.recipe.writeSet.blobPaths.length}件`,
    ];
  }

  const nextVariantBlobs = new Map(options.variantBlobs);
  const blobChanges: LinkedVariantBlobChange[] = [];
  // inspect / fingerprintがpreviewで読んだ全Blobをcommit時にもCAS照合する。
  // recipe対象だけでは、preview後にsourceや対象外Blobが変わっても古い判断で保存できてしまう。
  const baseReadBlobPaths = options.base.textures.map(({ path }) => path);
  const variantReadBlobPaths = options.variantAsset.textures.map(({ path }) => path);
  for (const targetPath of nextRecipe.writeSet.blobPaths) {
    const mapped = mappedBaseTextureForTargetPath(
      options.base,
      options.variantAsset,
      nextRecipe,
      targetPath,
    );
    if (!mapped) {
      throw new FamilyVariantRecipeError(`Blob pathのidMap対応がありません: ${targetPath}`);
    }
    const baseBlob = options.baseBlobs.get(mapped.baseTexture.path);
    const before = options.variantBlobs.get(targetPath);
    if (!baseBlob || !before) {
      throw new FamilyVariantRecipeError(`refresh対象Blobが見つかりません: ${targetPath}`);
    }
    const after =
      nextRecipe.type === 'palette'
        ? await (options.transformPaletteBlob
            ? options.transformPaletteBlob(baseBlob, nextRecipe.replacements, nextRecipe.tolerance)
            : Promise.reject(
                new FamilyVariantRecipeError('palette Blob transformerが指定されていません。'),
              ))
        : baseBlob;
    const targetTexture = afterAsset.textures.find((texture) => texture.path === targetPath);
    if (!targetTexture || after.type !== targetTexture.mimeType) {
      throw new FamilyVariantRecipeError(`refresh後BlobのMIME typeが一致しません: ${targetPath}`);
    }
    nextVariantBlobs.set(targetPath, after);
    if (!(await blobsEqual(before, after))) {
      blobChanges.push({
        targetPath,
        basePath: mapped.baseTexture.path,
        before,
        after,
      });
    }
  }

  const fingerprint = await createLinkedVariantFingerprint({
    base: options.base,
    variant: afterAsset,
    recipe: nextRecipe,
    baseBlobs: options.baseBlobs,
    variantBlobs: nextVariantBlobs,
    now,
  });
  const nextVariant = {
    ...structuredClone(options.variant),
    recipe: nextRecipe,
    fingerprint,
  } as LinkedAssetFamilyVariant;
  return {
    inspection,
    afterAsset,
    nextVariant,
    blobChanges,
    baseReadBlobPaths: [...new Set(baseReadBlobPaths)],
    variantReadBlobPaths: [...new Set(variantReadBlobPaths)],
    changes,
    preserved: [
      'variant Asset ID・名前・表示名・作成日時',
      'Family membership',
      'recipe write-set外のfield / element',
      'base / variantのsource Blob',
    ],
  };
}
