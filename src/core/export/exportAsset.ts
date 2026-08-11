/**
 * アセットの書き出し（Phase 10、要件 11.9）。
 * Canvas 2D 合成、IndexedDB からの画像読み込み、Blob URL ダウンロードを使うためブラウザ専用。
 */
import { strToU8, unzipSync, zip, type Zippable } from 'fflate';
import { decodeImageSource, type DecodedImageSource } from '../images/decodeImageSource';
import { blobKeyFor } from '../images/importImage';
import { applyFrameToAsset, type Asset } from '../model';
import { validateAssetForPersistence } from '../schema/validate';
import { loadBlob } from '../storage';
import { assertFixedFpsAnimationExportSafe } from './animationLoss';
import { assertColliderOverrideExportSafe } from './colliderOverrideLoss';
import {
  buildAtlas,
  buildDistributionManifest,
  canonicalJson,
  computeDistributionSheetLayout,
  computeSheetLayout,
  DISTRIBUTION_PAGE_SIZE,
  normalizeDistributionScale,
  scaleDistributionRect,
  scaleDistributionSize,
  type AtlasJson,
  type DistributionManifest,
  type DistributionScale,
  type DistributionSheetFrameInput,
  type DistributionSheetLayout,
} from './atlas';
import { buildGodotGuide, buildUnityGuide } from './engineGuides';
import { buildCanvasExample, buildPhaserExample, buildPixiExample } from './examples';
import { buildCanvasHelpers, buildPhaserHelpers, buildPixiHelpers } from './helpers';

export class ExportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ExportError';
  }
}

/** 書き出し前の schema 検証（要件 11.9）。不正な場合は理由をまとめて ExportError にする。 */
function assertValidAsset(asset: Asset): void {
  const result = validateAssetForPersistence(asset);
  if (!result.valid) {
    throw new ExportError(`アセットの内容が不正です: ${result.errors.join(' / ')}`);
  }
}

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getContext2d(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  const context = canvas.getContext('2d') as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!context) {
    throw new ExportError('この環境では Canvas 2D が使えません。');
  }
  return context;
}

/** 希望の MIME タイプでエンコードする。非対応環境（主に WebP）では null を返す。 */
async function encodeCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    try {
      const blob = await canvas.convertToBlob({ type });
      return blob.type === type ? blob : null;
    } catch {
      return null;
    }
  }
  const element = canvas as HTMLCanvasElement;
  const blob = await new Promise<Blob | null>((resolve) =>
    element.toBlob((result) => resolve(result), type),
  );
  return blob && blob.type === type ? blob : null;
}

/**
 * アセットの編集用テクスチャ Blob 群を IndexedDB から読み、
 * DecodedImageSource の Map（textureId → DecodedImageSource）を作る。
 * 使い終わったら呼び出し側で close() を呼ぶこと。
 */
async function loadAssetBitmaps(asset: Asset): Promise<Map<string, DecodedImageSource>> {
  const bitmaps = new Map<string, DecodedImageSource>();
  const textureIds = new Set(
    asset.layers.map((layer) => layer.textureId).filter((id): id is string => Boolean(id)),
  );
  for (const textureId of textureIds) {
    const texture = asset.textures.find((tex) => tex.id === textureId);
    if (!texture) {
      // 透明な空画像を正常な書き出しとして扱わない（Phase 15.5-A）
      throw new ExportError(
        `画像テクスチャ定義が見つかりません: asset=${asset.id} texture=${textureId}（書き出し合成）`,
      );
    }
    if (texture.kind !== 'edit') {
      throw new ExportError(
        `書き出し対象レイヤーは edit テクスチャを参照する必要があります: asset=${asset.id} texture=${texture.id} kind=${texture.kind}`,
      );
    }
    const blob = await loadBlob(blobKeyFor(asset.id, texture.path));
    if (!blob) {
      throw new ExportError(
        `画像 Blob が見つかりません: asset=${asset.id} texture=${texture.id} path=${texture.path}（書き出し合成）`,
      );
    }
    bitmaps.set(textureId, await decodeImageSource(blob));
  }
  return bitmaps;
}

/**
 * レイヤーを canvasSize の canvas へ合成する（表示・不透明度・変形を反映）。
 * frameId を指定した場合は applyFrameToAsset を通したレイヤー状態を使う。
 * view を使わない等倍合成とし、座標の解釈はキャンバス描画（renderScene の drawLayer）と揃える
 * （position はテクスチャ左上のアセット座標、scale / rotation はテクスチャ中心が基準。
 * `docs/DATA_FORMAT.md` 6.2 を参照）。
 */
async function compositeAssetToCanvas(
  asset: Asset,
  bitmaps: Map<string, DecodedImageSource>,
  frameId?: string,
): Promise<OffscreenCanvas | HTMLCanvasElement> {
  const source = frameId ? applyFrameToAsset(asset, frameId) : asset;
  const canvas = createCanvas(asset.canvasSize.width, asset.canvasSize.height);
  const ctx = getContext2d(canvas);
  for (const layer of source.layers) {
    if (!layer.visible || !layer.textureId) {
      continue;
    }
    const decoded = bitmaps.get(layer.textureId);
    const texture = asset.textures.find((tex) => tex.id === layer.textureId);
    if (!decoded || !texture) {
      continue;
    }
    const { transform } = layer;
    const centerX = transform.position.x + texture.size.width / 2;
    const centerY = transform.position.y + texture.size.height / 2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity));
    ctx.translate(centerX, centerY);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.scale(transform.scale.x, transform.scale.y);
    ctx.drawImage(
      decoded.source,
      -texture.size.width / 2,
      -texture.size.height / 2,
      texture.size.width,
      texture.size.height,
    );
    ctx.restore();
  }
  return canvas;
}

/** ZIP に同梱するファイル 1 件。 */
export interface ExportFile {
  path: string;
  blob: Blob;
}

/**
 * 単体画像の書き出し（現在の表示状態を合成した結果）。
 * type に 'image/webp' を指定した環境が WebP エンコードに対応していない場合は ExportError を投げる。
 */
export async function exportImage(asset: Asset, type: 'image/png' | 'image/webp'): Promise<Blob> {
  assertValidAsset(asset);
  const bitmaps = await loadAssetBitmaps(asset);
  try {
    const canvas = await compositeAssetToCanvas(asset, bitmaps);
    const blob = await encodeCanvas(canvas, type);
    if (!blob) {
      if (type === 'image/webp') {
        throw new ExportError('この環境では WebP 書き出しに対応していません。');
      }
      throw new ExportError('画像の書き出しに失敗しました。');
    }
    return blob;
  } finally {
    for (const decoded of bitmaps.values()) {
      decoded.close();
    }
  }
}

/** asset.json の書き出し（そのまま整形した JSON）。書き出し前に schema 検証する。 */
export function exportAssetJson(asset: Asset): Blob {
  assertValidAsset(asset);
  return new Blob([`${JSON.stringify(asset, null, 2)}\n`], {
    type: 'application/json',
  });
}

/**
 * Sprite Sheet（PNG）と Atlas JSON の書き出し。
 * フレームがあれば全フレームを 1 枚のシートへ合成し、無ければ現在の表示状態を 'default' の 1 コマにする。
 */
export async function exportSpriteSheet(asset: Asset): Promise<{ sheet: Blob; atlas: AtlasJson }> {
  assertValidAsset(asset);
  assertFixedFpsAnimationExportSafe(asset);
  assertColliderOverrideExportSafe(asset);
  const frames = asset.frames ?? [];
  const frameIds = frames.length > 0 ? frames.map((frame) => frame.id) : ['default'];
  const layout = computeSheetLayout(frameIds, asset.canvasSize.width, asset.canvasSize.height);

  const bitmaps = await loadAssetBitmaps(asset);
  try {
    const sheetCanvas = createCanvas(layout.width, layout.height);
    const sheetCtx = getContext2d(sheetCanvas);
    for (const position of layout.positions) {
      const frameCanvas = await compositeAssetToCanvas(
        asset,
        bitmaps,
        frames.length > 0 ? position.frameId : undefined,
      );
      sheetCtx.drawImage(frameCanvas, position.x, position.y);
    }
    const sheet = await encodeCanvas(sheetCanvas, 'image/png');
    if (!sheet) {
      throw new ExportError('Sprite Sheet の書き出しに失敗しました。');
    }
    return { sheet, atlas: buildAtlas(asset, layout) };
  } finally {
    for (const decoded of bitmaps.values()) {
      decoded.close();
    }
  }
}

interface DistributionFrameDefinition {
  id: string;
  name: string;
  sourceSize: { width: number; height: number };
}

function distributionFrameDefinitions(asset: Asset): DistributionFrameDefinition[] {
  const frames = asset.frames ?? [];
  return frames.length > 0
    ? frames.map((frame) => ({
        id: frame.id,
        name: frame.name,
        sourceSize: { ...asset.canvasSize },
      }))
    : [
        {
          id: 'default',
          name: 'default',
          sourceSize: { ...asset.canvasSize },
        },
      ];
}

function scaleDistributionFrameInput(
  input: DistributionSheetFrameInput,
  scale: DistributionScale,
): DistributionSheetFrameInput {
  return {
    ...input,
    sourceSize: scaleDistributionSize(input.sourceSize, scale),
    contentRect: scaleDistributionRect(input.contentRect, scale),
  };
}

function assertDistributionSheetSourceFitsPage(asset: Asset, scale: DistributionScale): void {
  const scaledSize = scaleDistributionSize(asset.canvasSize, scale);
  if (scaledSize.width > DISTRIBUTION_PAGE_SIZE || scaledSize.height > DISTRIBUTION_PAGE_SIZE) {
    throw new ExportError(
      `1フレームがdistribution pageの上限 ${DISTRIBUTION_PAGE_SIZE}×${DISTRIBUTION_PAGE_SIZE} にscale ${scale}で収まりません`,
    );
  }
}

function assertDistributionSheetFixedGridPreflight(
  asset: Asset,
  options: DistributionExportOptions,
  scale: DistributionScale,
): void {
  const inputs = distributionFrameDefinitions(asset)
    .map((frame) => ({
      ...frame,
      contentRect: {
        x: 0,
        y: 0,
        width: frame.sourceSize.width,
        height: frame.sourceSize.height,
      },
    }))
    .map((input) => scaleDistributionFrameInput(input, scale));
  try {
    computeDistributionSheetLayout(inputs, {
      profile: options.profile ?? 'fixed-grid',
      padding: options.padding,
    });
  } catch (error) {
    throw new ExportError(
      error instanceof Error ? error.message : 'distribution sheetを配置できません',
    );
  }
}

function contentRectFromCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  sourceSize: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const context = getContext2d(canvas);
  if (typeof context.getImageData !== 'function') {
    throw new ExportError('この環境ではtrimの画素検査に対応していません。');
  }
  const { data } = context.getImageData(0, 0, sourceSize.width, sourceSize.height);
  let minX = sourceSize.width;
  let minY = sourceSize.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sourceSize.height; y += 1) {
    for (let x = 0; x < sourceSize.width; x += 1) {
      if (data[(y * sourceSize.width + x) * 4 + 3] === 0) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0 || maxY < 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

interface DistributionRenderedFrame {
  definition: DistributionFrameDefinition;
  canvas: OffscreenCanvas | HTMLCanvasElement;
  contentRect: { x: number; y: number; width: number; height: number };
}

async function renderDistributionPages(
  asset: Asset,
  bitmaps: Map<string, DecodedImageSource>,
  options: DistributionExportOptions,
  scale: DistributionScale,
): Promise<{ layout: DistributionSheetLayout; pages: Blob[] }> {
  const definitions = distributionFrameDefinitions(asset);
  const rendered: DistributionRenderedFrame[] = [];
  for (const definition of definitions) {
    const frameCanvas = await compositeAssetToCanvas(
      asset,
      bitmaps,
      definition.id === 'default' ? undefined : definition.id,
    );
    rendered.push({
      definition,
      canvas: frameCanvas,
      contentRect:
        options.profile === 'packed'
          ? contentRectFromCanvas(frameCanvas, definition.sourceSize)
          : {
              x: 0,
              y: 0,
              width: definition.sourceSize.width,
              height: definition.sourceSize.height,
            },
    });
  }

  const baseInputs: DistributionSheetFrameInput[] = rendered.map((frame) => ({
    id: frame.definition.id,
    name: frame.definition.name,
    sourceSize: frame.definition.sourceSize,
    contentRect: frame.contentRect,
  }));
  const inputs = baseInputs.map((input) => scaleDistributionFrameInput(input, scale));
  let layout: DistributionSheetLayout;
  try {
    layout = computeDistributionSheetLayout(inputs, {
      profile: options.profile ?? 'fixed-grid',
      padding: options.padding,
    });
  } catch (error) {
    throw new ExportError(
      error instanceof Error ? error.message : 'distribution sheetを配置できません',
    );
  }

  const canvases = layout.pages.map(() =>
    createCanvas(DISTRIBUTION_PAGE_SIZE, DISTRIBUTION_PAGE_SIZE),
  );
  const contexts = canvases.map(getContext2d);
  for (const context of contexts) {
    context.imageSmoothingEnabled = false;
  }
  for (const frame of layout.frames) {
    const renderedFrame = rendered.find((candidate) => candidate.definition.id === frame.id);
    if (!renderedFrame) {
      throw new ExportError(`distribution frameの描画元が見つかりません: ${frame.id}`);
    }
    const context = contexts[frame.page];
    if (!context) {
      throw new ExportError(`distribution pageの描画先が見つかりません: ${frame.page}`);
    }
    const source = renderedFrame.canvas;
    const rect = renderedFrame.contentRect;
    if (options.profile === 'packed') {
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }
      context.drawImage(
        source,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        frame.rect.x,
        frame.rect.y,
        frame.rect.width,
        frame.rect.height,
      );
    } else {
      context.drawImage(
        source,
        0,
        0,
        renderedFrame.definition.sourceSize.width,
        renderedFrame.definition.sourceSize.height,
        frame.rect.x,
        frame.rect.y,
        frame.rect.width,
        frame.rect.height,
      );
    }
  }

  const pages: Blob[] = [];
  for (const canvas of canvases) {
    const page = await encodeCanvas(canvas, 'image/png');
    if (!page) {
      throw new ExportError('distribution Sprite Sheetの書き出しに失敗しました。');
    }
    pages.push(page);
  }
  return { layout, pages };
}

/**
 * ZIP に同梱する README.md の内容を作る（純関数）。
 * アセット名、内容説明、座標系、原点・アンカー・当たり判定の説明を含める。
 */
export function buildExportReadme(asset: Asset, options: { distribution?: boolean } = {}): string {
  const lines: string[] = [
    `# ${asset.displayName}`,
    '',
    `Chameleon Asset Studio から書き出したアセットです（識別名: \`${asset.name}\`、種別: \`${asset.assetType}\`）。`,
    '',
    '## 同梱ファイル',
    '',
    '- `asset.json` … アセットのメタデータ（原点・アンカー・当たり判定・アニメーションを含む）',
    ...(options.distribution
      ? ['- `manifest.json` … distribution出力のprofile、frame、座標、参照ファイル、検査hash']
      : []),
    '- `textures/main.png` … 現在の表示状態を合成した画像',
    '- `textures/main.webp` … 同上の WebP 版（書き出し環境が対応している場合のみ同梱）',
    '- `atlas/spritesheet.png` … フレームを並べた Sprite Sheet',
    '- `atlas/atlas.json` … Sprite Sheet 内の各コマの位置とアニメーション定義',
    '- `examples/example-canvas.html` … Canvas 2D でアセットを読み込む最小例（外部依存なし）',
    '- `examples/example-pixi.html` … PixiJS でアセットを読み込む最小例（PixiJS を CDN から読み込む）',
    '- `examples/example-phaser.html` … Phaser でアセットを読み込む最小例（Phaser を CDN から読み込む）',
    '- `helpers/chameleon-helpers.js` … Canvas 2D / エンジン非依存の helper（コピーして組み込む部品）',
    '- `helpers/chameleon-pixi.js` … PixiJS v8 用 helper',
    '- `helpers/chameleon-phaser.js` … Phaser 4 用 helper',
    '- `engines/README-godot.md` … Godot 4 への読み込み手順ガイド',
    '- `engines/README-unity.md` … Unity への読み込み手順ガイド',
    '',
    '## サンプルコード（examples/）',
    '',
    'いずれも完成したゲームではなく、atlas.json / spritesheet.png を読み込んで表示する最小例です。原点・アンカー・当たり判定のデバッグ表示と、アニメーション再生例を含みます。',
    '',
    '`fetch()` は `file://` では動作しないため、フォルダをローカルサーバーで開いてください（例: `npx serve .`）。PixiJS 版・Phaser 版はそれぞれのライブラリを CDN（jsdelivr）から読み込むため、インターネット接続が必要です。',
    '',
    '## helper（helpers/）とエンジンガイド（engines/）',
    '',
    'examples は「動く見本」、helpers は自分のコードへコピーして使う「組み込む部品」です（ESM）。Godot / Unity へは engines/ の手順ガイドを参照してください（シーン / プレハブの自動生成には対応していません）。',
    '',
    '## 座標系',
    '',
    'キャンバス左上を原点 (0, 0) とし、右方向を x+、下方向を y+ とする。単位はピクセル、回転の単位は度。',
    '',
    '## 原点（origin）',
    '',
    `ゲーム上に置くときの基準点。この素材では (${asset.origin.x}, ${asset.origin.y})。キャラクターは足元中央が基本。`,
    '',
    '## アンカー（anchors）',
    '',
  ];
  if (asset.anchors.length === 0) {
    lines.push('なし。');
  } else {
    lines.push('手、弾の発射位置、影などゲーム側で参照する座標。');
    lines.push('');
    for (const anchor of asset.anchors) {
      lines.push(
        `- ${anchor.name}（用途: ${anchor.role}）: (${anchor.position.x}, ${anchor.position.y})`,
      );
    }
  }
  lines.push('', '## 当たり判定（colliders）', '');
  if (asset.colliders.length === 0) {
    lines.push('なし。');
  } else {
    for (const collider of asset.colliders) {
      const shape =
        collider.shape === 'rect'
          ? `矩形 x=${collider.rect.x} y=${collider.rect.y} width=${collider.rect.width} height=${collider.rect.height}`
          : `円 x=${collider.circle.x} y=${collider.circle.y} radius=${collider.circle.radius}`;
      lines.push(`- ${collider.name}（用途: ${collider.purpose}）: ${shape}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function zipAsync(data: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(data, (error, output) => {
      if (error) {
        reject(new ExportError('ZIP の作成に失敗しました', { cause: error }));
      } else {
        resolve(output);
      }
    });
  });
}

/**
 * ZIP 一式（asset.json、画像、Sprite Sheet、Atlas JSON、README）の書き出し。
 * WebP は書き出し環境が対応している場合のみ同梱し、非対応環境では静かに省略する。
 */
export async function exportZip(asset: Asset): Promise<Blob> {
  assertValidAsset(asset);
  assertFixedFpsAnimationExportSafe(asset);
  assertColliderOverrideExportSafe(asset);
  const assetJsonBlob = exportAssetJson(asset);
  const pngBlob = await exportImage(asset, 'image/png');
  let webpBlob: Blob | null = null;
  try {
    webpBlob = await exportImage(asset, 'image/webp');
  } catch (error) {
    if (!(error instanceof ExportError)) {
      throw error;
    }
    // WebP 非対応環境: textures/main.webp を省略する
  }
  const { sheet, atlas } = await exportSpriteSheet(asset);

  const files: ExportFile[] = [
    { path: 'asset.json', blob: assetJsonBlob },
    { path: 'textures/main.png', blob: pngBlob },
    { path: 'atlas/spritesheet.png', blob: sheet },
  ];
  if (webpBlob) {
    files.push({ path: 'textures/main.webp', blob: webpBlob });
  }

  const entries: Zippable = {
    'atlas/atlas.json': strToU8(`${JSON.stringify(atlas, null, 2)}\n`),
    'examples/example-canvas.html': strToU8(buildCanvasExample(asset)),
    'examples/example-pixi.html': strToU8(buildPixiExample(asset)),
    'examples/example-phaser.html': strToU8(buildPhaserExample(asset)),
    'helpers/chameleon-helpers.js': strToU8(buildCanvasHelpers(asset)),
    'helpers/chameleon-pixi.js': strToU8(buildPixiHelpers(asset)),
    'helpers/chameleon-phaser.js': strToU8(buildPhaserHelpers(asset)),
    'engines/README-godot.md': strToU8(buildGodotGuide(asset)),
    'engines/README-unity.md': strToU8(buildUnityGuide(asset)),
    'README.md': strToU8(buildExportReadme(asset)),
  };
  for (const file of files) {
    entries[file.path] = new Uint8Array(await file.blob.arrayBuffer());
  }

  const zipped = await zipAsync(entries);
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}

export interface DistributionExportOptions {
  profile?: 'fixed-grid' | 'packed';
  padding?: number;
  scale?: number;
}

export function getDistributionZipFileName(asset: Asset, scale?: number): string {
  let normalizedScale: DistributionScale;
  try {
    normalizedScale = normalizeDistributionScale(scale);
  } catch (error) {
    throw new ExportError(error instanceof Error ? error.message : 'distribution scaleが不正です');
  }
  return `${asset.name}-distribution-${normalizedScale}x.zip`;
}

async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new ExportError('この環境ではdistribution manifestのSHA-256検査に対応していません。');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * legacy/default ZIPを変更せず、manifest.jsonとSHEET pageを追加したdistribution ZIPを作る。
 * fixed-grid / packed / trim / multi-pageを扱い、scaleは後続sliceへ残す.
 */
export async function exportDistributionZip(
  asset: Asset,
  options: DistributionExportOptions = {},
): Promise<Blob> {
  const profile = options.profile ?? 'fixed-grid';
  let scale: DistributionScale;
  try {
    scale = normalizeDistributionScale(options.scale);
  } catch (error) {
    throw new ExportError(error instanceof Error ? error.message : 'distribution scaleが不正です');
  }
  if (profile !== 'fixed-grid' && profile !== 'packed') {
    throw new ExportError(`未対応のdistribution profileです: ${profile}`);
  }

  assertValidAsset(asset);
  assertFixedFpsAnimationExportSafe(asset);
  assertColliderOverrideExportSafe(asset);
  assertDistributionSheetSourceFitsPage(asset, scale);
  if (profile === 'fixed-grid') {
    assertDistributionSheetFixedGridPreflight(asset, options, scale);
  }

  const legacyZip = await exportZip(asset);
  const legacyEntries = unzipSync(new Uint8Array(await legacyZip.arrayBuffer()));
  const atlasBytes = legacyEntries['atlas/atlas.json'];
  if (!atlasBytes) {
    throw new ExportError('legacy ZIPにAtlas JSONがありません。');
  }
  const atlas = JSON.parse(new TextDecoder().decode(atlasBytes)) as AtlasJson;

  const bitmaps = await loadAssetBitmaps(asset);
  let rendered: { layout: DistributionSheetLayout; pages: Blob[] };
  try {
    rendered = await renderDistributionPages(asset, bitmaps, options, scale);
  } finally {
    for (const decoded of bitmaps.values()) {
      decoded.close();
    }
  }

  const pageEntries = await Promise.all(
    rendered.pages.map(async (page, index) => ({
      path: rendered.layout.pages[index].path,
      bytes: new Uint8Array(await page.arrayBuffer()),
    })),
  );
  const entryPaths = [...Object.keys(legacyEntries), ...pageEntries.map((entry) => entry.path)];
  const unsignedManifest = buildDistributionManifest(
    asset,
    atlas,
    entryPaths,
    rendered.layout,
    scale,
  );
  const manifestHash = await sha256Hex(canonicalJson(unsignedManifest));
  const manifest: DistributionManifest = {
    ...unsignedManifest,
    integrity: { algorithm: 'SHA-256', manifestHash },
  };
  const entries: Record<string, Uint8Array> = { ...legacyEntries };
  entries['README.md'] = strToU8(buildExportReadme(asset, { distribution: true }));
  for (const page of pageEntries) {
    entries[page.path] = page.bytes;
  }
  entries['manifest.json'] = strToU8(`${canonicalJson(manifest)}
`);
  const orderedEntries = Object.fromEntries(
    Object.entries(entries).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
  const zipped = await zipAsync(orderedEntries);
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}

/** Blob URL でダウンロードを開始する（要件 11.9: スマホでも ZIP ダウンロードを開始できる）。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Safari / iOS はダウンロード開始が非同期のため、即時 revoke すると失敗することがある。
  // 30 秒後の解放で「開始は確実に間に合い、URL も溜め込まない」バランスを取る（Phase 15.5-E）
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
