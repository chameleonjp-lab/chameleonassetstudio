import {
  ANCHOR_ROLES,
  ASSET_TYPES,
  COLLIDER_PURPOSES,
  EFFECT_BLEND_MODES,
  EFFECT_TYPES,
  TILE_COLLISION_TYPES,
  type AnchorRole,
  type AssetType,
  type Collider,
  type EffectSettings,
  type SourceFileProvenanceRecord,
  type TileSettings,
} from '../model';
import {
  ATLAS_FORMAT,
  CURRENT_ATLAS_VERSION,
  computeSheetLayout,
  type AtlasJson,
} from '../export/atlas';
import { INPUT_SAFETY_LIMITS, parseBoundedJson } from '../input/inputSafety';
import { validateAsset } from '../schema/validate';
import {
  MAX_FRAME_SET_ITEMS,
  prepareImageRegionsImport,
  type PreparedFrameSetImport,
} from './importFrameSet';
import { sha256Blob } from './importImage';

const REQUIRED_ATLAS_JSON_NAME = 'atlas.json';
const REQUIRED_ATLAS_TEXTURE_NAME = 'spritesheet.png';

type JsonObject = Record<string, unknown>;

export type AtlasFallbackAssetType = Exclude<AssetType, 'tile' | 'effect'>;

export interface ChameleonAtlasBundleInput {
  assetName: string;
  fallbackAssetType: AtlasFallbackAssetType;
}

export class AtlasBundleImportError extends Error {
  readonly file?: File;

  constructor(message: string, options?: ErrorOptions & { file?: File }) {
    super(message, options);
    this.name = 'AtlasBundleImportError';
    this.file = options?.file;
  }
}

function fail(path: string, message: string): never {
  throw new AtlasBundleImportError(`${path}: ${message}`);
}

/** 巨大JSONをarrayBufferへ展開する前に、exactなfile名とbyte上限を検査する。 */
export function assertKnownAtlasJsonFile(file: Pick<File, 'name' | 'size'>): void {
  if (file.name !== REQUIRED_ATLAS_JSON_NAME) {
    throw new AtlasBundleImportError(
      `JSONファイル名は「${REQUIRED_ATLAS_JSON_NAME}」にしてください（選択: ${file.name}）。`,
    );
  }
  if (file.size > INPUT_SAFETY_LIMITS.maxJsonDocumentBytes) {
    throw new AtlasBundleImportError(
      `atlas.jsonが大きすぎます（上限${INPUT_SAFETY_LIMITS.maxJsonDocumentBytes} bytes）。`,
    );
  }
}

function objectAt(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'objectである必要があります。');
  }
  return value as JsonObject;
}

function exactKeys(
  value: JsonObject,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail(path, `必須field「${key}」がありません。`);
    }
  }
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    fail(path, `未対応fieldがあります: ${unknown.join(', ')}`);
  }
}

function stringAt(value: unknown, path: string, { nonEmpty = false } = {}): string {
  if (typeof value !== 'string' || (nonEmpty && value.trim() === '')) {
    fail(path, nonEmpty ? '空でない文字列が必要です。' : '文字列が必要です。');
  }
  return value;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail(path, 'booleanが必要です。');
  }
  return value;
}

function numberAt(
  value: unknown,
  path: string,
  options: {
    integer?: boolean;
    minimum?: number;
    exclusiveMinimum?: number;
    maximum?: number;
  } = {},
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, '有限の数値が必要です。');
  }
  if (options.integer && !Number.isInteger(value)) {
    fail(path, '整数が必要です。');
  }
  if (options.minimum !== undefined && value < options.minimum) {
    fail(path, `${options.minimum}以上である必要があります。`);
  }
  if (options.exclusiveMinimum !== undefined && value <= options.exclusiveMinimum) {
    fail(path, `${options.exclusiveMinimum}より大きい必要があります。`);
  }
  if (options.maximum !== undefined && value > options.maximum) {
    fail(path, `${options.maximum}以下である必要があります。`);
  }
  return value;
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(path, '配列が必要です。');
  }
  return value;
}

function enumAt<const T extends readonly string[]>(
  value: unknown,
  path: string,
  choices: T,
): T[number] {
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) {
    fail(path, `対応値は${choices.join(' / ')}です。`);
  }
  return value as T[number];
}

function parseSize(value: unknown, path: string): { width: number; height: number } {
  const object = objectAt(value, path);
  exactKeys(object, path, ['width', 'height']);
  return {
    width: numberAt(object.width, `${path}.width`, { integer: true, exclusiveMinimum: 0 }),
    height: numberAt(object.height, `${path}.height`, {
      integer: true,
      exclusiveMinimum: 0,
    }),
  };
}

function parseVec2(value: unknown, path: string): { x: number; y: number } {
  const object = objectAt(value, path);
  exactKeys(object, path, ['x', 'y']);
  return {
    x: numberAt(object.x, `${path}.x`),
    y: numberAt(object.y, `${path}.y`),
  };
}

function parseCollider(value: unknown, path: string): Collider {
  const object = objectAt(value, path);
  const shape = enumAt(object.shape, `${path}.shape`, ['rect', 'circle'] as const);
  exactKeys(object, path, [
    'id',
    'name',
    'purpose',
    'shape',
    'visible',
    shape === 'rect' ? 'rect' : 'circle',
  ]);
  const common = {
    id: stringAt(object.id, `${path}.id`, { nonEmpty: true }),
    name: stringAt(object.name, `${path}.name`),
    purpose: enumAt(object.purpose, `${path}.purpose`, COLLIDER_PURPOSES),
    visible: booleanAt(object.visible, `${path}.visible`),
  };
  if (shape === 'rect') {
    const rect = objectAt(object.rect, `${path}.rect`);
    exactKeys(rect, `${path}.rect`, ['x', 'y', 'width', 'height']);
    return {
      ...common,
      shape,
      rect: {
        x: numberAt(rect.x, `${path}.rect.x`),
        y: numberAt(rect.y, `${path}.rect.y`),
        width: numberAt(rect.width, `${path}.rect.width`, { exclusiveMinimum: 0 }),
        height: numberAt(rect.height, `${path}.rect.height`, { exclusiveMinimum: 0 }),
      },
    };
  }
  const circle = objectAt(object.circle, `${path}.circle`);
  exactKeys(circle, `${path}.circle`, ['x', 'y', 'radius']);
  return {
    ...common,
    shape,
    circle: {
      x: numberAt(circle.x, `${path}.circle.x`),
      y: numberAt(circle.y, `${path}.circle.y`),
      radius: numberAt(circle.radius, `${path}.circle.radius`, { exclusiveMinimum: 0 }),
    },
  };
}

function parseTile(value: unknown, path: string, cellSize: AtlasJson['cellSize']): TileSettings {
  const object = objectAt(value, path);
  exactKeys(object, path, ['tileSize', 'collisionType', 'visualType']);
  const tileSize = parseSize(object.tileSize, `${path}.tileSize`);
  if (tileSize.width > cellSize.width || tileSize.height > cellSize.height) {
    fail(`${path}.tileSize`, 'cellSize以下である必要があります。');
  }
  return {
    tileSize,
    collisionType: enumAt(object.collisionType, `${path}.collisionType`, TILE_COLLISION_TYPES),
    visualType: stringAt(object.visualType, `${path}.visualType`),
  };
}

function parseEffect(value: unknown, path: string): EffectSettings {
  const object = objectAt(value, path);
  exactKeys(object, path, ['effectType', 'durationMs', 'loop', 'blendMode']);
  return {
    effectType: enumAt(object.effectType, `${path}.effectType`, EFFECT_TYPES),
    durationMs: numberAt(object.durationMs, `${path}.durationMs`, { minimum: 0 }),
    loop: booleanAt(object.loop, `${path}.loop`),
    blendMode: enumAt(object.blendMode, `${path}.blendMode`, EFFECT_BLEND_MODES),
  };
}

/** bounded JSONをChameleon Atlas 0.1.0のcanonical subsetとして厳格に検証する。 */
export function parseKnownAtlasJson(
  bytes: Uint8Array,
  fileName = REQUIRED_ATLAS_JSON_NAME,
): AtlasJson {
  if (fileName !== REQUIRED_ATLAS_JSON_NAME) {
    throw new AtlasBundleImportError(
      `JSONファイル名は「${REQUIRED_ATLAS_JSON_NAME}」にしてください（選択: ${fileName}）。`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseBoundedJson(fileName, bytes);
  } catch (error) {
    throw new AtlasBundleImportError(
      `${fileName}を安全なJSONとして読めませんでした: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  const root = objectAt(parsed, '$');
  exactKeys(
    root,
    '$',
    [
      'format',
      'version',
      'texture',
      'cellSize',
      'frames',
      'animations',
      'origin',
      'anchors',
      'colliders',
    ],
    ['tile', 'effect'],
  );
  if (root.format !== ATLAS_FORMAT) {
    fail('$.format', `Chameleon自形式「${ATLAS_FORMAT}」だけを取り込めます。`);
  }
  if (root.version !== CURRENT_ATLAS_VERSION) {
    fail('$.version', `現行version「${CURRENT_ATLAS_VERSION}」だけを取り込めます。`);
  }
  if (root.texture !== REQUIRED_ATLAS_TEXTURE_NAME) {
    fail('$.texture', `「${REQUIRED_ATLAS_TEXTURE_NAME}」である必要があります。`);
  }
  if (root.tile !== undefined && root.effect !== undefined) {
    fail('$', 'tileとeffectを同時に含めることはできません。');
  }

  const cellSize = parseSize(root.cellSize, '$.cellSize');
  const frameValues = arrayAt(root.frames, '$.frames');
  if (frameValues.length < 1 || frameValues.length > MAX_FRAME_SET_ITEMS) {
    fail('$.frames', `1〜${MAX_FRAME_SET_ITEMS}件である必要があります。`);
  }
  const frameNames = new Set<string>();
  const frames = frameValues.map((value, index) => {
    const path = `$.frames[${index}]`;
    const object = objectAt(value, path);
    exactKeys(object, path, ['name', 'x', 'y', 'width', 'height']);
    const name = stringAt(object.name, `${path}.name`, { nonEmpty: true });
    if (frameNames.has(name)) {
      fail(`${path}.name`, `frame nameが重複しています: ${name}`);
    }
    frameNames.add(name);
    const frame = {
      name,
      x: numberAt(object.x, `${path}.x`, { integer: true, minimum: 0 }),
      y: numberAt(object.y, `${path}.y`, { integer: true, minimum: 0 }),
      width: numberAt(object.width, `${path}.width`, {
        integer: true,
        exclusiveMinimum: 0,
      }),
      height: numberAt(object.height, `${path}.height`, {
        integer: true,
        exclusiveMinimum: 0,
      }),
    };
    if (frame.width !== cellSize.width || frame.height !== cellSize.height) {
      fail(path, 'frameのwidth/heightはcellSizeと一致する必要があります。');
    }
    return frame;
  });
  const canonicalLayout = computeSheetLayout(
    frames.map((frame) => frame.name),
    cellSize.width,
    cellSize.height,
  );
  for (const [index, frame] of frames.entries()) {
    const expected = canonicalLayout.positions[index];
    if (frame.x !== expected.x || frame.y !== expected.y) {
      fail(
        `$.frames[${index}]`,
        `Chameleon自形式の行優先配置（x=${expected.x}, y=${expected.y}）と一致しません。`,
      );
    }
  }

  const animations = arrayAt(root.animations, '$.animations').map((value, index) => {
    const path = `$.animations[${index}]`;
    const object = objectAt(value, path);
    exactKeys(object, path, ['name', 'fps', 'loop', 'frames']);
    const framesForAnimation = arrayAt(object.frames, `${path}.frames`).map(
      (frameName, frameIndex) => {
        const name = stringAt(frameName, `${path}.frames[${frameIndex}]`, { nonEmpty: true });
        if (!frameNames.has(name)) {
          fail(`${path}.frames[${frameIndex}]`, `存在しないframe「${name}」への参照です。`);
        }
        return name;
      },
    );
    return {
      name: stringAt(object.name, `${path}.name`, { nonEmpty: true }),
      fps: numberAt(object.fps, `${path}.fps`, { exclusiveMinimum: 0, maximum: 240 }),
      loop: booleanAt(object.loop, `${path}.loop`),
      frames: framesForAnimation,
    };
  });

  const origin = parseVec2(root.origin, '$.origin');
  const anchors = arrayAt(root.anchors, '$.anchors').map((value, index) => {
    const path = `$.anchors[${index}]`;
    const object = objectAt(value, path);
    exactKeys(object, path, ['name', 'role', 'x', 'y']);
    return {
      name: stringAt(object.name, `${path}.name`),
      role: enumAt(object.role, `${path}.role`, ANCHOR_ROLES),
      x: numberAt(object.x, `${path}.x`),
      y: numberAt(object.y, `${path}.y`),
    };
  });
  const colliders = arrayAt(root.colliders, '$.colliders').map((value, index) =>
    parseCollider(value, `$.colliders[${index}]`),
  );
  const tile = root.tile === undefined ? undefined : parseTile(root.tile, '$.tile', cellSize);
  const effect = root.effect === undefined ? undefined : parseEffect(root.effect, '$.effect');

  return {
    format: ATLAS_FORMAT,
    version: CURRENT_ATLAS_VERSION,
    texture: REQUIRED_ATLAS_TEXTURE_NAME,
    cellSize,
    frames,
    animations,
    origin,
    anchors,
    colliders,
    ...(tile ? { tile } : {}),
    ...(effect ? { effect } : {}),
  };
}

export function assertKnownAtlasTextureSize(
  atlas: AtlasJson,
  textureSize: { width: number; height: number },
): void {
  const layout = computeSheetLayout(
    atlas.frames.map((frame) => frame.name),
    atlas.cellSize.width,
    atlas.cellSize.height,
  );
  if (textureSize.width !== layout.width || textureSize.height !== layout.height) {
    throw new AtlasBundleImportError(
      `spritesheet.pngの寸法はcanonical配置の${layout.width} x ${layout.height}pxである必要があります（選択: ${textureSize.width} x ${textureSize.height}px）。`,
    );
  }
}

function atlasAssetType(atlas: AtlasJson, fallback: AtlasFallbackAssetType): AssetType {
  if (atlas.tile) return 'tile';
  if (atlas.effect) return 'effect';
  return fallback;
}

/** atlas.json + spritesheet.pngを、意味を保持した新規flattened Assetへ準備する。 */
export async function prepareChameleonAtlasBundleImport(
  jsonFile: File,
  textureFile: File,
  input: ChameleonAtlasBundleInput,
): Promise<PreparedFrameSetImport> {
  assertKnownAtlasJsonFile(jsonFile);
  if (textureFile.name !== REQUIRED_ATLAS_TEXTURE_NAME) {
    throw new AtlasBundleImportError(
      `画像ファイル名は「${REQUIRED_ATLAS_TEXTURE_NAME}」にしてください（選択: ${textureFile.name}）。`,
      { file: textureFile },
    );
  }
  if (textureFile.type !== 'image/png') {
    throw new AtlasBundleImportError('spritesheet.pngはPNGである必要があります。', {
      file: textureFile,
    });
  }
  const assetName = input.assetName.trim();
  if (assetName === '') {
    throw new AtlasBundleImportError('Atlasから作るAsset名を入力してください。');
  }
  if (
    !(ASSET_TYPES as readonly string[]).includes(input.fallbackAssetType) ||
    input.fallbackAssetType === ('tile' as AssetType) ||
    input.fallbackAssetType === ('effect' as AssetType)
  ) {
    throw new AtlasBundleImportError('Atlas metadataがない場合のAsset typeが不正です。');
  }

  const atlas = parseKnownAtlasJson(new Uint8Array(await jsonFile.arrayBuffer()), jsonFile.name);
  const jsonHash = await sha256Blob(jsonFile);
  const jsonProvenance: SourceFileProvenanceRecord = {
    sourceFileName: jsonFile.name,
    mimeType: jsonFile.type || 'application/json',
    byteLength: jsonFile.size,
    hash: jsonHash,
    importedAt: new Date().toISOString(),
    origin: 'chameleon-atlas-metadata',
  };
  const selectedAssetType = atlasAssetType(atlas, input.fallbackAssetType);
  const warnings: string[] = [];
  if (atlas.tile) {
    if (
      atlas.cellSize.width % atlas.tile.tileSize.width !== 0 ||
      atlas.cellSize.height % atlas.tile.tileSize.height !== 0
    ) {
      warnings.push('cellSizeをtileSizeで割り切れないため、ゲーム側の分割に端数が残ります。');
    }
    if (atlas.tile.collisionType === 'none' || atlas.tile.collisionType === 'custom') {
      warnings.push(
        `collision「${atlas.tile.collisionType}」がゲーム側の意図と一致するか確認してください。`,
      );
    }
    if (atlas.tile.visualType.trim() === '') {
      warnings.push('見た目タイプが空です。用途を一覧やゲーム側で区別しにくくなります。');
    }
  }
  if (!atlas.tile && !atlas.effect) {
    warnings.push(`AtlasにAsset typeがないため、選択した「${selectedAssetType}」で作成します。`);
  }

  const result = await prepareImageRegionsImport(textureFile, {
    mode: 'atlas',
    sourceLabel: 'Chameleon Atlas texture',
    assetName,
    displayName: assetName,
    assetType: selectedAssetType,
    regions: atlas.frames.map((frame) => ({ ...frame })),
    animations: atlas.animations.map((animation) => ({
      name: animation.name,
      fps: animation.fps,
      loop: animation.loop,
      frameNames: [...animation.frames],
    })),
    origin: { ...atlas.origin },
    anchors: atlas.anchors.map((anchor) => ({
      name: anchor.name,
      role: anchor.role as AnchorRole,
      position: { x: anchor.x, y: anchor.y },
    })),
    colliders: atlas.colliders,
    tile: atlas.tile,
    effect: atlas.effect,
    additionalProvenance: [jsonProvenance],
    preview: {
      title: `Chameleon Atlas「${assetName}」`,
      fileNames: [jsonFile.name, textureFile.name],
      details: [
        `${atlas.frames.length} frame・${atlas.animations.length} animationをJSON記載順で復元します。末尾の空sheet cellは取り込みません。`,
        `origin・anchor ${atlas.anchors.length}件・collider ${atlas.colliders.length}件${
          atlas.tile ? '・tile設定' : atlas.effect ? '・effect設定' : ''
        }を新しいIDで復元します。`,
        `Asset typeは「${selectedAssetType}」です。spritesheet.png原本はsource Blobとしてそのまま保持します。`,
        'atlas.jsonはraw bytesを保存せず、file名・MIME・byte数・SHA-256を2件目のprovenance recordへ記録します。',
      ],
      losses: [
        'atlas.jsonのraw bytesは保存しません。復元したmetadataとSHA-256だけを保持します。',
        '配布用の合成pixelからflattened Assetを作るため、元のlayer構造・transform・parts・tags・gameAttributes・rig・provenanceは復元できません。',
        'Asset / frame / animation / anchor / colliderの内部IDとanimation durationMsは復元せず、新しいIDまたは既定導出値を使います。',
      ],
      warnings,
    },
  });
  assertKnownAtlasTextureSize(atlas, {
    width: result.asset.textures.find((texture) => texture.kind === 'source')!.size.width,
    height: result.asset.textures.find((texture) => texture.kind === 'source')!.size.height,
  });
  const validation = validateAsset(result.asset);
  if (!validation.valid) {
    throw new AtlasBundleImportError(
      `復元したAssetが現行schemaを満たしません: ${validation.errors.join(' / ')}`,
    );
  }
  return result;
}
