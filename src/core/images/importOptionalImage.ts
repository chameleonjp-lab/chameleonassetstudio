import { decodeImageSource } from './decodeImageSource';
import {
  DEFAULT_OPTIONAL_ANIMATION_FPS,
  decodeAnimatedImage,
  deriveUniformAnimationTiming,
} from './decodeAnimatedImage';
import {
  assertFileImageSignature,
  detectFileImageMimeType,
  imageMimeTypesMatch,
  inspectSvgSafety,
  inspectGifAnimation,
  inspectPngAnimation,
  type AnimatedImagePreflight,
  type AnimationRepetition,
  type DetectedImageMimeType,
} from './imageInputSafety';
import {
  ImageImportError,
  MAX_IMPORT_FILE_BYTES,
  SUPPORTED_IMPORT_MIME_TYPES,
  assetNameFromFileName,
  blobKeyFor,
  checkImageDimensions,
  encodeDecodedImageRegion,
  encodeDecodedThumbnail,
  importImageFile,
  sha256Blob,
  sourceFileProvenance,
} from './importImage';
import {
  createImageAsset,
  generateId,
  type Animation,
  type Asset,
  type Layer,
  type TextureRef,
} from '../model';
import { formatBytes } from '../storage/storageUsage';
import { buildFrameSetFrames, MAX_FRAME_SET_ITEMS } from './importFrameSet';

export const RASTER_IMPORT_ACCEPT = 'image/png,image/jpeg,image/webp';
export const NEW_ASSET_IMPORT_ACCEPT =
  'image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/apng,.svg,.gif,.apng';

export type NewAssetImportFormat = 'standard' | 'svg' | 'gif' | 'apng';

export interface NewAssetImportPreview {
  format: NewAssetImportFormat;
  modeLabel: string;
  details: string[];
  losses: string[];
  warnings: string[];
}

export interface PreparedNewAssetImageImport {
  asset: Asset;
  blobs: Array<{ key: string; blob: Blob }>;
  preview: NewAssetImportPreview;
}

export function animationLoopForRepetition(repetition: AnimationRepetition): boolean {
  return repetition === 'infinite';
}

function fileExtension(fileName: string): string {
  return fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? '';
}

const GENERIC_FILE_MIME_TYPES = new Set(['', 'application/octet-stream']);

function expectedMimeTypeForGenericFile(fileName: string): string | null {
  switch (fileExtension(fileName)) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'gif':
      return 'image/gif';
    case 'apng':
      return 'image/apng';
    default:
      return null;
  }
}

export function genericFileMimeTypeMatches(
  fileName: string,
  detected: DetectedImageMimeType,
): boolean {
  const expected = expectedMimeTypeForGenericFile(fileName);
  return expected !== null && imageMimeTypesMatch(detected, expected);
}

async function normalizeGenericFileMimeType(file: File): Promise<File> {
  if (!GENERIC_FILE_MIME_TYPES.has(file.type.toLowerCase())) {
    return file;
  }
  const expected = expectedMimeTypeForGenericFile(file.name);
  if (expected === null) {
    return file;
  }
  let detected: DetectedImageMimeType;
  try {
    detected = await detectFileImageMimeType(file);
  } catch (error) {
    throw new ImageImportError(error instanceof Error ? error.message : String(error), {
      cause: error,
      kind: 'signature',
    });
  }
  if (!imageMimeTypesMatch(detected, expected)) {
    throw new ImageImportError(
      `画像の拡張子と実体が一致しません: ${file.name}（拡張子 ${
        fileExtension(file.name) || '不明'
      } / 実体 ${detected}）`,
      { kind: 'signature' },
    );
  }
  return new File([file], file.name, {
    type: expected,
    lastModified: file.lastModified,
  });
}

function unsupportedFormatMessage(file: Pick<File, 'name' | 'type'>): string | null {
  const extension = fileExtension(file.name);
  if (extension === 'ase' || extension === 'aseprite' || file.type === 'application/x-aseprite') {
    return 'Aseprite形式には対応していません。AsepriteからPNG Sprite Sheetを書き出し、「Sprite Sheet（手動格子）」で取り込んでください。Aseprite JSON metadataは読み込みません。';
  }
  if (
    extension === 'psd' ||
    file.type === 'image/vnd.adobe.photoshop' ||
    file.type === 'application/photoshop'
  ) {
    return 'PSD形式には対応していません。PNGまたはWebPへ書き出してから取り込んでください。';
  }
  if (extension === 'ora' || file.type === 'image/openraster') {
    return 'OpenRaster（ORA）は現在対応していません。PNGへ書き出してから取り込んでください。原本だけをreference保存することも行いません。';
  }
  if (extension === 'kra' || file.type === 'application/x-krita') {
    return 'Krita（KRA）形式には対応していません。PNGまたはWebPへ書き出してから取り込んでください。';
  }
  return null;
}

export function explainUnsupportedNewAssetFile(file: Pick<File, 'name' | 'type'>): string | null {
  return unsupportedFormatMessage(file);
}

function assertOptionalFileSize(file: File): void {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new ImageImportError(
      `ファイルサイズが大きすぎます（${formatBytes(file.size)}）。1枚あたり${formatBytes(
        MAX_IMPORT_FILE_BYTES,
      )}までです。`,
      { kind: 'file-size' },
    );
  }
}

async function assertOptionalSignature(file: File): Promise<void> {
  try {
    await assertFileImageSignature(file);
  } catch (error) {
    throw new ImageImportError(error instanceof Error ? error.message : String(error), {
      cause: error,
      kind: 'signature',
    });
  }
}

function sourceAndRasterTextures(asset: Asset) {
  const source = asset.textures.find((texture) => texture.kind === 'source');
  const edit = asset.textures.find((texture) => texture.kind === 'edit');
  const thumbnail = asset.textures.find((texture) => texture.kind === 'thumbnail');
  const layer = asset.layers[0];
  if (!source || !edit || !thumbnail || !layer) {
    throw new ImageImportError('optional画像用Assetのtexture/layer定義が不正です。', {
      kind: 'asset',
    });
  }
  return { source, edit, thumbnail, layer };
}

async function prepareSvgImport(file: File): Promise<PreparedNewAssetImageImport> {
  assertOptionalFileSize(file);
  await assertOptionalSignature(file);
  if (typeof DOMParser === 'undefined') {
    throw new ImageImportError('この環境ではSVG構造を安全に検査できません。', {
      kind: 'environment',
    });
  }

  let svgText: string;
  try {
    svgText = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch (error) {
    throw new ImageImportError('SVGはUTF-8で保存してください。', {
      cause: error,
      kind: 'signature',
    });
  }
  const inspection = inspectSvgSafety(svgText);
  if (inspection.kind === 'malformed') {
    throw new ImageImportError(inspection.message ?? 'SVGのXML構造を解析できませんでした。', {
      kind: 'signature',
    });
  }
  if (inspection.kind === 'unsafe') {
    throw new ImageImportError(`安全のためSVGを取り込めません: ${inspection.message}`, {
      kind: 'unsafe-svg',
    });
  }

  const hash = await sha256Blob(file);
  let decoded;
  try {
    decoded = await decodeImageSource(file);
  } catch (error) {
    throw new ImageImportError(
      'SVGを画像としてデコードできませんでした。ファイルが壊れている可能性があります。',
      { cause: error, kind: 'decode' },
    );
  }
  try {
    const dimensionError = checkImageDimensions(decoded.width, decoded.height);
    if (dimensionError) {
      throw new ImageImportError(dimensionError, { kind: 'dimension' });
    }
    const [editBlob, thumbnail] = await Promise.all([
      encodeDecodedImageRegion(decoded, {
        x: 0,
        y: 0,
        width: decoded.width,
        height: decoded.height,
      }),
      encodeDecodedThumbnail(decoded),
    ]);
    const name = assetNameFromFileName(file.name);
    const importedAt = new Date();
    const asset = createImageAsset({
      name,
      displayName: name,
      size: { width: decoded.width, height: decoded.height },
      sourceMimeType: 'image/svg+xml',
      sourceExtension: 'svg',
      thumbnailMimeType: thumbnail.blob.type === 'image/webp' ? 'image/webp' : 'image/png',
      thumbnailSize: thumbnail.size,
      now: importedAt,
    });
    const textures = sourceAndRasterTextures(asset);
    asset.provenance = [
      sourceFileProvenance(file, hash, importedAt.toISOString(), textures.source.id),
    ];
    return {
      asset,
      blobs: [
        { key: blobKeyFor(asset.id, textures.source.path), blob: file },
        { key: blobKeyFor(asset.id, textures.edit.path), blob: editBlob },
        { key: blobKeyFor(asset.id, textures.thumbnail.path), blob: thumbnail.blob },
      ],
      preview: {
        format: 'svg',
        modeLabel: 'SVG rasterized import',
        details: [
          `${file.name}をbrowser画像contextで${decoded.width} x ${decoded.height}のPNGへrasterizeします。`,
          'SVG原本bytes・SHA-256・provenanceをsourceとして保持します。',
          'script・CSS animation・font・event handler・外部URL・埋め込みHTMLを含むSVGは、原本を書き換えず取り込み前に拒否します。',
        ],
        losses: [
          `${file.name}: path・shape・style等のベクター構造は編集対象にせず、edit画像はPNG pixelになります。`,
        ],
        warnings: [],
      },
    };
  } finally {
    decoded.close();
  }
}

function frameTexture(
  baseEdit: TextureRef,
  baseLayer: Layer,
  index: number,
  size: { width: number; height: number },
  name: string,
): { texture: TextureRef; layer: Layer } {
  const layerId = index === 0 ? baseLayer.id : generateId('layer');
  const texture: TextureRef =
    index === 0
      ? { ...baseEdit, name, size }
      : {
          id: generateId('tex'),
          kind: 'edit',
          name,
          mimeType: 'image/png',
          size,
          path: `textures/${layerId}.png`,
        };
  return {
    texture,
    layer: {
      ...(index === 0 ? baseLayer : {}),
      id: layerId,
      name,
      layerType: 'image',
      visible: index === 0,
      locked: false,
      opacity: 1,
      transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
      textureId: texture.id,
    },
  };
}

async function prepareAnimatedImport(
  file: File,
  format: 'gif' | 'apng',
  bytes: Uint8Array,
  preflight: AnimatedImagePreflight,
): Promise<PreparedNewAssetImageImport> {
  const preflightDimensionError = checkImageDimensions(preflight.width, preflight.height);
  if (preflightDimensionError) {
    throw new ImageImportError(preflightDimensionError, { kind: 'dimension' });
  }
  if (preflight.frameCount > MAX_FRAME_SET_ITEMS) {
    throw new ImageImportError(
      `${format.toUpperCase()}は最大${MAX_FRAME_SET_ITEMS}frameです（宣言 ${preflight.frameCount}frame）。先頭だけを切り捨て取り込みはしません。`,
      { kind: 'frame-count' },
    );
  }

  const canonicalMimeType = format === 'gif' ? 'image/gif' : 'image/png';
  const sourceBlob =
    format === 'apng' && file.type !== 'image/png' ? file.slice(0, file.size, 'image/png') : file;
  const [decoded, hash] = await Promise.all([
    decodeAnimatedImage(sourceBlob, bytes, canonicalMimeType, preflight),
    sha256Blob(file),
  ]);
  if (decoded.size.width !== preflight.width || decoded.size.height !== preflight.height) {
    throw new ImageImportError(
      `画像の宣言canvas寸法とdecoder結果が一致しません（宣言 ${preflight.width} x ${preflight.height} / decode ${decoded.size.width} x ${decoded.size.height}）。`,
      { kind: 'decode' },
    );
  }
  const timing = decoded.usedFallback
    ? deriveUniformAnimationTiming([null])
    : deriveUniformAnimationTiming(decoded.durationsMicroseconds);
  const repetition = decoded.repetition;
  const name = assetNameFromFileName(file.name);
  const importedAt = new Date();
  const base = createImageAsset({
    name,
    displayName: name,
    size: decoded.size,
    sourceMimeType: canonicalMimeType,
    sourceExtension: format === 'gif' ? 'gif' : 'png',
    thumbnailMimeType: decoded.thumbnail.blob.type === 'image/webp' ? 'image/webp' : 'image/png',
    thumbnailSize: decoded.thumbnail.size,
    now: importedAt,
  });
  const baseParts = sourceAndRasterTextures(base);
  const frameParts = decoded.frames.map((_, index) =>
    frameTexture(
      baseParts.edit,
      baseParts.layer,
      index,
      decoded.size,
      `${name}_${String(index + 1).padStart(3, '0')}`,
    ),
  );
  const layers = frameParts.map(({ layer }) => layer);
  const frames = buildFrameSetFrames(
    layers,
    frameParts.map(({ layer }) => layer.name),
  );
  const animation: Animation = {
    id: generateId('anim'),
    name,
    fps: timing.fps,
    loop: animationLoopForRepetition(repetition),
    frameIds: frames.map((frame) => frame.id),
    ...(timing.durationMs !== undefined ? { durationMs: timing.durationMs } : {}),
  };
  const asset: Asset = {
    ...base,
    textures: [baseParts.source, ...frameParts.map(({ texture }) => texture), baseParts.thumbnail],
    layers,
    frames,
    animations: [animation],
    provenance: [sourceFileProvenance(file, hash, importedAt.toISOString(), baseParts.source.id)],
  };

  const losses = [
    `${file.name}: ${format.toUpperCase()}固有の圧縮・metadata・frame disposal設定は編集対象にせず、各表示frameをPNG pixelへrasterizeします。`,
  ];
  const warnings: string[] = [];
  if (decoded.usedFallback) {
    losses.push(
      `${file.name}: この環境ではImageDecoderを利用できないため、${preflight.frameCount}frame中の先頭1frameだけを取り込みます。`,
    );
    warnings.push(
      '全frameが必要な場合はImageDecoder対応browserで同じsource原本を取り込んでください。',
    );
  } else {
    if (timing.variableDurations) {
      losses.push(
        `${file.name}: frameごとの可変表示時間は保持できないため、合計${timing.durationMs}msを${timing.fps}fpsの等間隔再生へ変換します。`,
      );
    }
    if (timing.missingDuration) {
      losses.push(
        `${file.name}: frame durationを取得できないため${DEFAULT_OPTIONAL_ANIMATION_FPS}fpsを使用します。`,
      );
    }
    if (timing.rounded || timing.clamped) {
      losses.push(
        `${file.name}: 現行の整数fps（1〜240）へ丸め、再生時間は約${
          Math.round(timing.playbackDurationMs * 1000) / 1000
        }msになります。`,
      );
    }
  }
  if (repetition === 'finite') {
    losses.push(
      `${file.name}: 有限回repeatは保持できないため、無限loopへ変えずloop無効で取り込みます。`,
    );
  }

  return {
    asset,
    blobs: [
      { key: blobKeyFor(asset.id, baseParts.source.path), blob: sourceBlob },
      ...decoded.frames.map((blob, index) => ({
        key: blobKeyFor(asset.id, frameParts[index].texture.path),
        blob,
      })),
      { key: blobKeyFor(asset.id, baseParts.thumbnail.path), blob: decoded.thumbnail.blob },
    ],
    preview: {
      format,
      modeLabel: `${format.toUpperCase()} rasterized frame import`,
      details: [
        `${file.name}から${decoded.frames.length}件のedit PNG・layer・frameとanimationを作成します。`,
        `animationは${timing.fps}fps・loop ${animation.loop ? '有効' : '無効'}です。`,
        `${format.toUpperCase()}原本bytes・SHA-256・provenanceをsourceとして保持し、thumbnailは先頭frameから作成します。`,
      ],
      losses,
      warnings,
    },
  };
}

function standardPreview(file: File): NewAssetImportPreview {
  return {
    format: 'standard',
    modeLabel: '通常画像（1 file = 1 Asset）',
    details: [
      `${file.name}: source Blobは入力bytesのまま保持し、edit PNG・thumbnail・provenanceを作成します。`,
      `${file.name}: 対応していない内容や失われる画像pixelはありません。`,
    ],
    losses: [],
    warnings: [],
  };
}

/** 新規Asset入口だけで通常画像とoptional形式を分類し、保存前の完全なbundleを準備する。 */
export async function prepareNewAssetImageImport(file: File): Promise<PreparedNewAssetImageImport> {
  const unsupportedMessage = unsupportedFormatMessage(file);
  if (unsupportedMessage) {
    throw new ImageImportError(unsupportedMessage, { kind: 'unsupported-type' });
  }
  assertOptionalFileSize(file);
  file = await normalizeGenericFileMimeType(file);

  if (file.type === 'image/svg+xml') {
    return prepareSvgImport(file);
  }
  if (file.type === 'image/gif') {
    await assertOptionalSignature(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let preflight: AnimatedImagePreflight;
    try {
      preflight = inspectGifAnimation(bytes);
    } catch (error) {
      throw new ImageImportError(error instanceof Error ? error.message : String(error), {
        cause: error,
        kind: 'signature',
      });
    }
    return prepareAnimatedImport(file, 'gif', bytes, preflight);
  }
  if (file.type === 'image/png' || file.type === 'image/apng') {
    await assertOptionalSignature(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let inspection;
    try {
      inspection = inspectPngAnimation(bytes);
    } catch (error) {
      throw new ImageImportError(error instanceof Error ? error.message : String(error), {
        cause: error,
        kind: 'signature',
      });
    }
    const dimensionError = checkImageDimensions(inspection.width, inspection.height);
    if (dimensionError) {
      throw new ImageImportError(dimensionError, { kind: 'dimension' });
    }
    if (inspection.animated) {
      return prepareAnimatedImport(file, 'apng', bytes, inspection);
    }
    if (file.type === 'image/apng' || fileExtension(file.name) === 'apng') {
      throw new ImageImportError('APNG宣言ですがacTL animation chunkがありません。', {
        kind: 'signature',
      });
    }
  }

  if ((SUPPORTED_IMPORT_MIME_TYPES as readonly string[]).includes(file.type)) {
    const result = await importImageFile(file);
    return {
      asset: result.asset,
      blobs: result.blobs,
      preview: standardPreview(file),
    };
  }

  throw new ImageImportError(
    `対応していないファイル形式です（${file.type || '不明'}）。PNG / JPG / WebP / SVG / GIF / APNGを選んでください。`,
    { kind: 'unsupported-type' },
  );
}
