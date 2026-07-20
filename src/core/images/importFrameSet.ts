import {
  TILE_COLLISION_TYPES,
  createImageAsset,
  generateId,
  type Anchor,
  type Animation,
  type Asset,
  type AssetProvenanceRecord,
  type AssetType,
  type Collider,
  type EffectSettings,
  type Frame,
  type Layer,
  type TileSettings,
  type TextureRef,
  type Vec2,
} from '../model';
import { INPUT_SAFETY_LIMITS } from '../input/inputSafety';
import {
  assetNameFromFileName,
  blobKeyFor,
  decodeValidatedImageFile,
  encodeDecodedImageRegion,
  encodeDecodedThumbnail,
  importImageAsLayer,
  importImageFile,
  sourceFileProvenance,
  type ImportImageResult,
  type ImportLayerResult,
} from './importImage';

/** iPhoneを含む既存画像batch契約と揃えた、1回のanimated import上限。 */
export const MAX_FRAME_SET_ITEMS = INPUT_SAFETY_LIMITS.maxImageBatchFiles;
export const DEFAULT_FRAME_SET_FPS = 8;

export interface FrameSetPreview {
  mode: 'sequence' | 'sheet' | 'tileset' | 'atlas';
  title: string;
  fileNames: string[];
  assetCount: 1;
  layerCount: number;
  frameCount: number;
  animationCount: number;
  details: string[];
  losses: string[];
  warnings: string[];
}

export interface PreparedFrameSetImport {
  asset: Asset;
  blobs: Array<{ key: string; blob: Blob }>;
  preview: FrameSetPreview;
}

export class FrameSetImportError extends Error {
  readonly file?: File;

  constructor(message: string, options?: ErrorOptions & { file?: File }) {
    super(message, options);
    this.name = 'FrameSetImportError';
    this.file = options?.file;
  }
}

function compareAsciiText(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** localeに依存せず、連続したASCII数字を数値として比較する。完全同値は選択順を維持する。 */
export function compareNaturalFileNames(left: string, right: string): number {
  const leftParts = left.match(/\d+|\D+/g) ?? [left];
  const rightParts = right.match(/\d+|\D+/g) ?? [right];
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index];
    const b = rightParts[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const aTrimmed = a.replace(/^0+(?=\d)/, '');
      const bTrimmed = b.replace(/^0+(?=\d)/, '');
      if (aTrimmed.length !== bTrimmed.length) {
        return aTrimmed.length - bTrimmed.length;
      }
      if (aTrimmed !== bTrimmed) {
        return aTrimmed < bTrimmed ? -1 : 1;
      }
      continue;
    }
    const compared = compareAsciiText(a, b);
    if (compared !== 0) {
      return compared;
    }
  }
  return 0;
}

export function naturalFileOrder<T extends { name: string }>(files: readonly T[]): T[] {
  return files
    .map((file, index) => ({ file, index }))
    .sort(
      (left, right) =>
        compareNaturalFileNames(left.file.name, right.file.name) || left.index - right.index,
    )
    .map(({ file }) => file);
}

function assertFrameSetCount(count: number, label: string): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new FrameSetImportError(`${label}は1件以上必要です。`);
  }
  if (count > MAX_FRAME_SET_ITEMS) {
    throw new FrameSetImportError(
      `${label}は最大${MAX_FRAME_SET_ITEMS}件です（指定: ${count}件）。`,
    );
  }
}

export function buildFrameSetFrames(layers: readonly Layer[], names: readonly string[]): Frame[] {
  return layers.map((activeLayer, frameIndex) => ({
    id: generateId('frame'),
    name: names[frameIndex] ?? `frame_${frameIndex + 1}`,
    layerStates: layers.map((layer) => ({
      layerId: layer.id,
      visible: layer.id === activeLayer.id,
    })),
  }));
}

function animationFor(assetName: string, frames: readonly Frame[]): Animation {
  return {
    id: generateId('anim'),
    name: assetName,
    fps: DEFAULT_FRAME_SET_FPS,
    loop: true,
    frameIds: frames.map((frame) => frame.id),
  };
}

async function importSequenceFirstFile(file: File): Promise<ImportImageResult> {
  try {
    return await importImageFile(file);
  } catch (error) {
    throw new FrameSetImportError(
      `${file.name}を連番として準備できませんでした: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error, file },
    );
  }
}

async function importSequenceLayerFile(file: File, asset: Asset): Promise<ImportLayerResult> {
  try {
    return await importImageAsLayer(file, asset);
  } catch (error) {
    throw new FrameSetImportError(
      `${file.name}を連番として準備できませんでした: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error, file },
    );
  }
}

/** 同寸法の画像列を、source/edit/layer/frameを持つ1 Assetへメモリ上で準備する。 */
export async function prepareSequenceImport(
  files: readonly File[],
): Promise<PreparedFrameSetImport> {
  assertFrameSetCount(files.length, '連番画像');
  const ordered = naturalFileOrder(files);
  const first = await importSequenceFirstFile(ordered[0]);
  const additions: ImportLayerResult[] = [];
  for (const file of ordered.slice(1)) {
    additions.push(await importSequenceLayerFile(file, first.asset));
  }

  const firstSize = first.asset.canvasSize;
  const sizes = [
    firstSize,
    ...additions.map(({ textures }) => textures.find((texture) => texture.kind === 'edit')!.size),
  ];
  const mismatchIndex = sizes.findIndex(
    (size) => size.width !== firstSize.width || size.height !== firstSize.height,
  );
  if (mismatchIndex >= 0) {
    const file = ordered[mismatchIndex];
    const size = sizes[mismatchIndex];
    throw new FrameSetImportError(
      `連番画像はすべて同じ寸法にしてください。${file.name}は${size.width} x ${size.height}、先頭は${firstSize.width} x ${firstSize.height}です。自動拡縮やpaddingは行いません。`,
      { file },
    );
  }

  const layers = [first.asset.layers[0], ...additions.map(({ layer }) => layer)].map(
    (layer, index) => ({ ...layer, visible: index === 0 }),
  );
  const frameNames = ordered.map((file) => assetNameFromFileName(file.name));
  const frames = buildFrameSetFrames(layers, frameNames);
  const asset: Asset = {
    ...first.asset,
    updatedAt: new Date().toISOString(),
    textures: [...first.asset.textures, ...additions.flatMap(({ textures }) => textures)],
    layers,
    frames,
    animations: [animationFor(first.asset.name, frames)],
    provenance: [
      ...(first.asset.provenance ?? []),
      ...additions.map(({ provenance }) => provenance),
    ],
  };

  return {
    asset,
    blobs: [...first.blobs, ...additions.flatMap(({ blobs }) => blobs)],
    preview: {
      mode: 'sequence',
      title: `連番「${asset.displayName}」`,
      fileNames: ordered.map((file) => file.name),
      assetCount: 1,
      layerCount: layers.length,
      frameCount: frames.length,
      animationCount: 1,
      details: [
        `${firstSize.width} x ${firstSize.height}の画像${ordered.length}件をファイル名の数値順で取り込みます。`,
        '各元fileをsource Blobとしてそのまま保持し、edit PNG・layer・frame・provenanceを1件ずつ作成します。',
        `animationは${DEFAULT_FRAME_SET_FPS}fps・loop有効、thumbnailは先頭frameから作成します。`,
      ],
      losses: [],
      warnings: [],
    },
  };
}

export interface ManualGridInput {
  cellWidth: number;
  cellHeight: number;
  margin: number;
  spacing: number;
}

export interface ManualGridCell {
  index: number;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManualGridLayout {
  columns: number;
  rows: number;
  cells: ManualGridCell[];
  rightRemainder: number;
  bottomRemainder: number;
}

export interface ExplicitFrameRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameRegionAnimationInput {
  name: string;
  fps: number;
  loop: boolean;
  frameNames: string[];
}

export interface PrepareImageRegionsOptions {
  mode: 'sheet' | 'tileset' | 'atlas';
  sourceLabel: string;
  assetName: string;
  displayName?: string;
  assetType?: AssetType;
  regions: ExplicitFrameRegion[];
  animations?: FrameRegionAnimationInput[];
  origin?: Vec2;
  anchors?: Array<Omit<Anchor, 'id'>>;
  colliders?: Collider[];
  tile?: TileSettings;
  effect?: EffectSettings;
  additionalProvenance?: AssetProvenanceRecord[];
  preview: {
    title: string;
    fileNames: string[];
    details: string[];
    losses: string[];
    warnings: string[];
  };
}

export interface TileSetImportInput {
  grid: ManualGridInput;
  tileSize: { width: number; height: number };
  collisionType: TileSettings['collisionType'];
  visualType: string;
}

function assertGridInteger(value: number, label: string, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new FrameSetImportError(`${label}は${minimum}以上の整数で指定してください。`);
  }
}

/** uniform outer marginとcell間spacingから、完全に収まるcellを左上・行優先で列挙する。 */
export function computeManualGrid(
  imageSize: { width: number; height: number },
  input: ManualGridInput,
): ManualGridLayout {
  assertGridInteger(input.cellWidth, 'cell幅', 1);
  assertGridInteger(input.cellHeight, 'cell高さ', 1);
  assertGridInteger(input.margin, '外周margin', 0);
  assertGridInteger(input.spacing, 'cell間spacing', 0);

  const availableWidth = imageSize.width - input.margin * 2;
  const availableHeight = imageSize.height - input.margin * 2;
  const columns =
    availableWidth < input.cellWidth
      ? 0
      : Math.floor((availableWidth + input.spacing) / (input.cellWidth + input.spacing));
  const rows =
    availableHeight < input.cellHeight
      ? 0
      : Math.floor((availableHeight + input.spacing) / (input.cellHeight + input.spacing));
  const count = columns * rows;
  assertFrameSetCount(count, '生成cell');

  const usedWidth = columns * input.cellWidth + Math.max(0, columns - 1) * input.spacing;
  const usedHeight = rows * input.cellHeight + Math.max(0, rows - 1) * input.spacing;
  const cells: ManualGridCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push({
        index: cells.length,
        row,
        column,
        x: input.margin + column * (input.cellWidth + input.spacing),
        y: input.margin + row * (input.cellHeight + input.spacing),
        width: input.cellWidth,
        height: input.cellHeight,
      });
    }
  }
  return {
    columns,
    rows,
    cells,
    rightRemainder: Math.max(0, availableWidth - usedWidth),
    bottomRemainder: Math.max(0, availableHeight - usedHeight),
  };
}

function sheetLosses(input: ManualGridInput, layout: ManualGridLayout): string[] {
  const losses: string[] = [];
  if (input.margin > 0) {
    losses.push(`外周margin ${input.margin}pxはedit frameへ含めません。`);
  }
  if (input.spacing > 0) {
    losses.push(`cell間spacing ${input.spacing}pxはedit frameへ含めません。`);
  }
  if (layout.rightRemainder > 0 || layout.bottomRemainder > 0) {
    losses.push(
      `格子に収まらない右端 ${layout.rightRemainder}px・下端 ${layout.bottomRemainder}pxはedit frameへ含めません。`,
    );
  }
  return losses;
}

function assertExplicitRegions(
  regions: readonly ExplicitFrameRegion[],
  imageSize: { width: number; height: number },
): void {
  assertFrameSetCount(regions.length, '生成frame');
  const names = new Set<string>();
  for (const [index, region] of regions.entries()) {
    if (region.name.trim() === '') {
      throw new FrameSetImportError(`frame ${index + 1}のnameが空です。`);
    }
    if (names.has(region.name)) {
      throw new FrameSetImportError(`frame nameが重複しています: ${region.name}`);
    }
    names.add(region.name);
    for (const [label, value] of Object.entries({
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
    })) {
      const minimum = label === 'width' || label === 'height' ? 1 : 0;
      if (!Number.isInteger(value) || value < minimum) {
        throw new FrameSetImportError(
          `frame「${region.name}」の${label}は${minimum}以上の整数で指定してください。`,
        );
      }
    }
    if (region.x + region.width > imageSize.width || region.y + region.height > imageSize.height) {
      throw new FrameSetImportError(
        `frame「${region.name}」の領域が画像範囲${imageSize.width} x ${imageSize.height}を超えています。`,
      );
    }
  }
}

function cloneColliderWithNewId(collider: Collider): Collider {
  if (collider.shape === 'rect') {
    return {
      id: generateId('collider'),
      name: collider.name,
      purpose: collider.purpose,
      shape: 'rect',
      visible: collider.visible,
      rect: { ...collider.rect },
    };
  }
  return {
    id: generateId('collider'),
    name: collider.name,
    purpose: collider.purpose,
    shape: 'circle',
    visible: collider.visible,
    circle: { ...collider.circle },
  };
}

async function prepareValidatedImageRegions(
  file: File,
  validated: Awaited<ReturnType<typeof decodeValidatedImageFile>>,
  options: PrepareImageRegionsOptions,
): Promise<PreparedFrameSetImport> {
  const { decoded, mimeType, extension, hash } = validated;
  assertExplicitRegions(options.regions, { width: decoded.width, height: decoded.height });
  const firstRegion = options.regions[0];
  const thumbnail = await encodeDecodedThumbnail(decoded, firstRegion);
  const now = new Date();
  const base = createImageAsset({
    name: options.assetName,
    displayName: options.displayName ?? options.assetName,
    size: { width: firstRegion.width, height: firstRegion.height },
    sourceMimeType: mimeType,
    sourceExtension: extension,
    thumbnailMimeType: thumbnail.blob.type === 'image/webp' ? 'image/webp' : 'image/png',
    thumbnailSize: thumbnail.size,
    now,
  });
  const baseSource = base.textures.find((texture) => texture.kind === 'source');
  const baseEdit = base.textures.find((texture) => texture.kind === 'edit');
  const thumbnailTexture = base.textures.find((texture) => texture.kind === 'thumbnail');
  const baseLayer = base.layers[0];
  if (!baseSource || !baseEdit || !thumbnailTexture || !baseLayer) {
    throw new FrameSetImportError(`${options.sourceLabel}用Assetのtexture/layer定義が不正です。`);
  }

  const sourceTexture: TextureRef = {
    ...baseSource,
    size: { width: decoded.width, height: decoded.height },
  };
  const textures: TextureRef[] = [sourceTexture, thumbnailTexture];
  const layers: Layer[] = [];
  const regionBlobs: Array<{ key: string; blob: Blob }> = [];

  for (const [index, region] of options.regions.entries()) {
    const layerId = index === 0 ? baseLayer.id : generateId('layer');
    const texture: TextureRef =
      index === 0
        ? { ...baseEdit, name: region.name }
        : {
            id: generateId('tex'),
            kind: 'edit',
            name: region.name,
            mimeType: 'image/png',
            size: { width: region.width, height: region.height },
            path: `textures/${layerId}.png`,
          };
    const layer: Layer = {
      ...(index === 0 ? baseLayer : {}),
      id: layerId,
      name: region.name,
      layerType: 'image',
      visible: index === 0,
      locked: false,
      opacity: 1,
      transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
      textureId: texture.id,
    };
    textures.push(texture);
    layers.push(layer);
    regionBlobs.push({
      key: blobKeyFor(base.id, texture.path),
      blob: await encodeDecodedImageRegion(decoded, region),
    });
  }

  const frames = buildFrameSetFrames(
    layers,
    options.regions.map((region) => region.name),
  );
  const frameIdByName = new Map(frames.map((frame) => [frame.name, frame.id]));
  const animations = options.animations?.map((animation) => ({
    id: generateId('anim'),
    name: animation.name,
    fps: animation.fps,
    loop: animation.loop,
    frameIds: animation.frameNames.map((name) => {
      const frameId = frameIdByName.get(name);
      if (!frameId) {
        throw new FrameSetImportError(
          `animation「${animation.name}」が存在しないframe「${name}」を参照しています。`,
        );
      }
      return frameId;
    }),
  })) ?? [animationFor(options.assetName, frames)];
  const importedAt = now.toISOString();
  const asset: Asset = {
    ...base,
    assetType: options.assetType ?? base.assetType,
    textures,
    layers,
    frames,
    animations,
    origin: options.origin ? { ...options.origin } : base.origin,
    anchors: (options.anchors ?? []).map((anchor) => ({
      id: generateId('anchor'),
      name: anchor.name,
      role: anchor.role,
      position: { ...anchor.position },
    })),
    colliders: (options.colliders ?? []).map(cloneColliderWithNewId),
    provenance: [
      sourceFileProvenance(file, hash, importedAt, sourceTexture.id),
      ...(options.additionalProvenance ?? []),
    ],
    ...(options.tile
      ? {
          tile: {
            tileSize: { ...options.tile.tileSize },
            collisionType: options.tile.collisionType,
            visualType: options.tile.visualType,
          },
        }
      : {}),
    ...(options.effect ? { effect: { ...options.effect } } : {}),
  };

  return {
    asset,
    blobs: [
      { key: blobKeyFor(asset.id, sourceTexture.path), blob: file },
      ...regionBlobs,
      { key: blobKeyFor(asset.id, thumbnailTexture.path), blob: thumbnail.blob },
    ],
    preview: {
      mode: options.mode,
      title: options.preview.title,
      fileNames: options.preview.fileNames,
      assetCount: 1,
      layerCount: layers.length,
      frameCount: frames.length,
      animationCount: animations.length,
      details: options.preview.details,
      losses: options.preview.losses,
      warnings: options.preview.warnings,
    },
  };
}

/** decode済み画像の明示regionだけを、source/edit/layer/frameへ展開する共通入口。 */
export async function prepareImageRegionsImport(
  file: File,
  options: PrepareImageRegionsOptions,
): Promise<PreparedFrameSetImport> {
  let validated;
  try {
    validated = await decodeValidatedImageFile(file);
  } catch (error) {
    throw new FrameSetImportError(
      `${file.name}を${options.sourceLabel}として準備できませんでした: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error, file },
    );
  }
  try {
    return await prepareValidatedImageRegions(file, validated, options);
  } finally {
    validated.decoded.close();
  }
}

/** 1枚のsheet原本を保持しつつ、手動格子の各cellをedit/layer/frameへ展開する。 */
export async function prepareSpriteSheetImport(
  file: File,
  gridInput: ManualGridInput,
): Promise<PreparedFrameSetImport> {
  let validated;
  try {
    validated = await decodeValidatedImageFile(file);
  } catch (error) {
    throw new FrameSetImportError(
      `${file.name}をSprite Sheetとして準備できませんでした: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error, file },
    );
  }

  const { decoded } = validated;
  try {
    const layout = computeManualGrid({ width: decoded.width, height: decoded.height }, gridInput);
    const assetName = assetNameFromFileName(file.name);
    const losses = sheetLosses(gridInput, layout);
    return await prepareValidatedImageRegions(file, validated, {
      mode: 'sheet',
      sourceLabel: 'Sprite Sheet',
      assetName,
      regions: layout.cells.map((cell) => ({
        ...cell,
        name: `${assetName}_${String(cell.index + 1).padStart(3, '0')}`,
      })),
      preview: {
        title: `Sprite Sheet「${assetName}」`,
        fileNames: [file.name],
        details: [
          `${decoded.width} x ${decoded.height}の原本から${layout.columns}列 x ${layout.rows}行を左上・行優先で切り出します。`,
          'sheet原本をsource Blobとしてそのまま保持し、provenanceは元sheet 1件だけを記録します。',
          `各cellをedit PNG・layer・frameへ展開し、${DEFAULT_FRAME_SET_FPS}fps・loop有効のanimationを作成します。`,
          'thumbnailは先頭cellから作成します。透明cellも件数どおり保持します。',
        ],
        losses,
        warnings:
          losses.length > 0
            ? ['原本には残りますが、格子外のpixelは編集用frameへ反映されません。']
            : [],
      },
    });
  } finally {
    decoded.close();
  }
}

/** 手動格子を独立したtile Assetへ変換し、cellごとのlayer/frameとAsset全体設定を作る。 */
export function assertTileSetImportInput(input: TileSetImportInput): void {
  for (const [label, value] of Object.entries({
    tile幅: input.tileSize.width,
    tile高さ: input.tileSize.height,
  })) {
    if (!Number.isInteger(value) || value < 1) {
      throw new FrameSetImportError(`${label}は1以上の整数で指定してください。`);
    }
  }
  if (
    input.tileSize.width > input.grid.cellWidth ||
    input.tileSize.height > input.grid.cellHeight
  ) {
    throw new FrameSetImportError('tileSizeはcellSize以下にしてください。');
  }
  if (!(TILE_COLLISION_TYPES as readonly string[]).includes(input.collisionType)) {
    throw new FrameSetImportError(`未対応のcollision設定です: ${input.collisionType}`);
  }
}

export async function prepareTileSetImport(
  file: File,
  input: TileSetImportInput,
): Promise<PreparedFrameSetImport> {
  try {
    assertTileSetImportInput(input);
  } catch (error) {
    throw new FrameSetImportError(error instanceof Error ? error.message : String(error), {
      cause: error,
      file,
    });
  }

  let validated;
  try {
    validated = await decodeValidatedImageFile(file);
  } catch (error) {
    throw new FrameSetImportError(
      `${file.name}をTilesetとして準備できませんでした: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error, file },
    );
  }
  const { decoded } = validated;
  try {
    const layout = computeManualGrid({ width: decoded.width, height: decoded.height }, input.grid);
    const assetName = assetNameFromFileName(file.name);
    const losses = sheetLosses(input.grid, layout);
    const warnings: string[] = [];
    if (
      input.grid.cellWidth % input.tileSize.width !== 0 ||
      input.grid.cellHeight % input.tileSize.height !== 0
    ) {
      warnings.push('cellSizeをtileSizeで割り切れないため、ゲーム側の分割に端数が残ります。');
    }
    if (input.collisionType === 'none' || input.collisionType === 'custom') {
      warnings.push(
        `collision「${input.collisionType}」がゲーム側の意図と一致するか確認してください。`,
      );
    }
    if (input.visualType.trim() === '') {
      warnings.push('見た目タイプが空です。用途を一覧やゲーム側で区別しにくくなります。');
    }
    return await prepareValidatedImageRegions(file, validated, {
      mode: 'tileset',
      sourceLabel: 'Tileset',
      assetName,
      assetType: 'tile',
      regions: layout.cells.map((cell) => ({
        ...cell,
        name: `${assetName}_tile_${String(cell.index + 1).padStart(3, '0')}`,
      })),
      animations: [],
      tile: {
        tileSize: { ...input.tileSize },
        collisionType: input.collisionType,
        visualType: input.visualType,
      },
      preview: {
        title: `Tileset「${assetName}」`,
        fileNames: [file.name],
        details: [
          `${decoded.width} x ${decoded.height}の原本から${layout.columns}列 x ${layout.rows}行を左上・行優先で切り出します。`,
          `Asset typeはtile、cellSizeは${input.grid.cellWidth} x ${input.grid.cellHeight}px、tileSizeは${input.tileSize.width} x ${input.tileSize.height}pxです。`,
          `collisionはAsset全体で「${input.collisionType}」、visualTypeは「${input.visualType || '空'}」です。colliderは自動生成しません。`,
          '各cellをedit PNG・layer・frameへ展開します。Tilesetとして自動animationは作成しません。',
          'sheet原本をsource Blobとしてそのまま保持し、provenanceは元sheet 1件だけを記録します。',
        ],
        losses,
        warnings: [
          ...(losses.length > 0
            ? ['原本には残りますが、格子外のpixelは編集用frameへ反映されません。']
            : []),
          ...warnings,
        ],
      },
    });
  } finally {
    decoded.close();
  }
}
