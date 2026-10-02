import distributionSchemaSource from '../schema/distribution-0.2.0.schema.json?raw';
import packageSchemaSource from '../schema/package-0.2.0.schema.json?raw';
import runtimeSource from './distributionRuntime.js?raw';
import canvasSource from './distributionCanvas.js?raw';
import pixiSource from './distributionPixi.js?raw';
import phaserSource from './distributionPhaser.js?raw';
import manifestSource from './distributionManifestV2.js?raw';
import { buildRichDistributionExample } from './richDistributionExamples';
import { strToU8, zip, type Zippable } from 'fflate';
import type { Asset } from '../model';
import { canonicalJson, normalizeDistributionScale } from './atlas';
import { buildDistributionFrameData } from './distributionFrameData';
import { buildDistributionTimelines } from './distributionTimeline';
import { ExportError, loadAssetBitmaps, renderDistributionPages } from './exportAsset';
import { validateRichDistributionManifest, validateRichPackage } from './distributionManifestV2.js';
import { inspectDistributionPreflight, type DistributionPreflightOptions } from './preflight';

export interface RichDistributionOptions extends DistributionPreflightOptions {
  target?: 'canvas2d' | 'pixijs' | 'phaser';
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export const RICH_DISTRIBUTION_MAX_ASSETS = 32;
export const RICH_DISTRIBUTION_MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
export const RICH_DISTRIBUTION_MAX_WORKING_BYTES = 256 * 1024 * 1024;

/** Legacy checks remain unchanged. Only losses represented by 0.2 and label collisions differ. */
export function inspectRichDistributionPreflight(
  asset: Asset,
  options: RichDistributionOptions = {},
) {
  const legacy = inspectDistributionPreflight(asset, options);
  const issues = legacy.issues.filter((issue) => {
    if (issue.code === 'PREFLIGHT-LOSS') return false;
    return !(
      issue.code === 'PREFLIGHT-COLLISION' && /^\/(frames|animations)\/\d+\/name$/.test(issue.path)
    );
  });
  if (!issues.some((issue) => issue.code === 'PREFLIGHT-SCHEMA')) {
    const pixels =
      asset.canvasSize.width * asset.canvasSize.height * Math.max(1, asset.frames?.length ?? 0);
    const decodedPixels = asset.textures
      .filter((texture) => texture.kind === 'edit')
      .reduce((total, texture) => total + texture.size.width * texture.size.height, 0);
    const workingBytes = 4 * (pixels + decodedPixels + 4 * 2048 * 2048);
    if (!Number.isFinite(workingBytes) || workingBytes > RICH_DISTRIBUTION_MAX_WORKING_BYTES)
      issues.push({
        code: 'PREFLIGHT-BUDGET',
        severity: 'block',
        path: '/',
        message: '配布準備に必要な画像容量が上限を超えます。素材を小さくするか分けてください。',
      });
    const frameCount = asset.frames?.length ?? 0;
    const occurrenceCount = asset.animations.reduce(
      (sum, animation) => sum + animation.frameIds.length,
      0,
    );
    const frameMetadataBytes = strToU8(JSON.stringify([asset.anchors, asset.colliders])).length;
    let estimatedManifestBytes = Math.max(1, frameCount) * (1024 + frameMetadataBytes * 2);
    for (const animation of asset.animations) {
      const counts = new Map<string, number>();
      for (const frameId of animation.frameIds) counts.set(frameId, (counts.get(frameId) ?? 0) + 1);
      for (const event of animation.events ?? [])
        estimatedManifestBytes +=
          (counts.get(event.frameId) ?? 0) * strToU8(JSON.stringify(event)).length;
    }
    estimatedManifestBytes += occurrenceCount * 256;
    const oversized =
      frameCount > 4096 || occurrenceCount > 4096 || estimatedManifestBytes > 4 * 1024 * 1024;
    if (oversized)
      issues.push({
        code: 'PREFLIGHT-METADATA',
        severity: 'block',
        path: '/',
        message: '動き・イベント・判定の配布情報が読取上限を超えます。素材を分けてください。',
      });
    try {
      if (oversized) throw new Error('配布情報が上限を超えます。');
      const refs = (asset.frames ?? []).map((frame) => ({ id: frame.id, page: 0 }));
      buildDistributionTimelines(asset, refs);
    } catch (error) {
      issues.push({
        code: 'PREFLIGHT-TIMELINE',
        severity: 'block',
        path: '/animations',
        message: error instanceof Error ? error.message : '動きの参照が不正です。',
      });
    }
  }
  if (options.target !== undefined && !['canvas2d', 'pixijs', 'phaser'].includes(options.target))
    issues.push({
      code: 'PREFLIGHT-TARGET',
      severity: 'block',
      path: '/target',
      message: '未対応の出力先です。',
    });
  const blocks = issues.filter((issue) => issue.severity === 'block');
  return {
    issues,
    blocks,
    warnings: issues.filter((issue) => issue.severity === 'warning'),
    valid: blocks.length === 0,
  };
}

export async function richSha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function zipEntries(entries: Zippable, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = zip(entries, (error, result) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
      else if (error) reject(error);
      else resolve(result);
    });
    const abort = () => {
      cancel();
      reject(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** New rich path never calls exportZip/buildAtlas or weakens their information-loss guards. */
export async function exportRichDistributionZip(
  assets: readonly Asset[],
  options: RichDistributionOptions = {},
): Promise<Blob> {
  options.signal?.throwIfAborted();
  if (assets.length === 0 || assets.length > RICH_DISTRIBUTION_MAX_ASSETS)
    throw new ExportError('配布する素材は1〜32件で選択してください。');
  const ids = new Set<string>();
  for (const asset of assets) {
    if (ids.has(asset.id)) throw new ExportError('素材IDが重複しています。');
    ids.add(asset.id);
    const preflight = inspectRichDistributionPreflight(asset, options);
    if (!preflight.valid)
      throw new ExportError(preflight.blocks.map((issue) => issue.message).join('\n'));
  }
  // Snapshot every source before the first await so later editor changes cannot mix revisions.
  const sources = structuredClone(assets);
  const scale = normalizeDistributionScale(options.scale);
  const entries: Record<string, Uint8Array> = {};
  let archiveBytes = 0;
  let decodedPageBytes = 0;
  const add = (path: string, bytes: Uint8Array) => {
    const resourceLimit = path.endsWith('/asset.json')
      ? 16 * 1024 * 1024
      : path.endsWith('/manifest.json')
        ? 4 * 1024 * 1024
        : path === 'package-manifest.json'
          ? 1024 * 1024
          : path.endsWith('.png')
            ? 20 * 1024 * 1024
            : RICH_DISTRIBUTION_MAX_ARCHIVE_BYTES;
    if (bytes.byteLength > resourceLimit) throw new ExportError('配布の読取容量上限を超えます。');
    archiveBytes += bytes.byteLength;
    if (archiveBytes > RICH_DISTRIBUTION_MAX_ARCHIVE_BYTES)
      throw new ExportError('配布ファイルが64MiBの上限を超えます。素材を分けて出力してください。');
    if (entries[path]) throw new ExportError('配布ファイルの参照が重複しています。');
    entries[path] = bytes;
  };
  const packages = [];
  options.onProgress?.(0, sources.length);
  for (const asset of sources) {
    options.signal?.throwIfAborted();
    const prefix = `assets/${await richSha256(strToU8(asset.id))}/`;
    const assetBytes = strToU8(`${canonicalJson(asset)}\n`);
    add(`${prefix}asset.json`, assetBytes);
    const bitmaps = await loadAssetBitmaps(asset, options.signal);
    let rendered;
    try {
      options.signal?.throwIfAborted();
      rendered = await renderDistributionPages(
        asset,
        bitmaps,
        { ...options, compactPages: true },
        scale,
      );
    } finally {
      for (const image of bitmaps.values()) image.close();
    }
    options.signal?.throwIfAborted();
    decodedPageBytes += rendered.layout.pages.reduce(
      (sum, page) => sum + page.width * page.height * 4,
      0,
    );
    if (decodedPageBytes > RICH_DISTRIBUTION_MAX_WORKING_BYTES)
      throw new ExportError('受取側の画像容量上限を超えます。素材を分けてください。');
    const pages = [];
    for (const [index, blob] of rendered.pages.entries()) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const page = rendered.layout.pages[index];
      add(prefix + page.path, bytes);
      pages.push({
        path: page.path,
        width: page.width,
        height: page.height,
        sha256: await richSha256(bytes),
      });
    }
    const unsigned = {
      format: 'chameleon-distribution',
      version: '0.2.0',
      assetId: asset.id,
      profile: rendered.layout.profile,
      scale,
      source: { assetJson: 'asset.json', canonical: true, sha256: await richSha256(assetBytes) },
      pages,
      frames: buildDistributionFrameData(asset, rendered.layout.frames, scale),
      animations: buildDistributionTimelines(asset, rendered.layout.frames),
    };
    const manifestHash = await richSha256(strToU8(canonicalJson(unsigned)));
    const manifest = { ...unsigned, integrity: { algorithm: 'SHA-256', manifestHash } };
    validateRichDistributionManifest(manifest);
    add(`${prefix}manifest.json`, strToU8(`${canonicalJson(manifest)}\n`));
    packages.push({
      id: asset.id,
      name: asset.displayName,
      manifest: `${prefix}manifest.json`,
      manifestHash,
    });
    options.onProgress?.(packages.length, sources.length);
  }
  const packageManifest = {
    format: 'chameleon-package',
    version: '0.2.0',
    target: options.target ?? 'canvas2d',
    assets: packages,
  };
  validateRichPackage(packageManifest);
  add('package-manifest.json', strToU8(`${canonicalJson(packageManifest)}\n`));
  add('schema/distribution-0.2.0.schema.json', strToU8(distributionSchemaSource));
  add('schema/package-0.2.0.schema.json', strToU8(packageSchemaSource));
  for (const [name, source] of Object.entries({
    distributionRuntime: runtimeSource,
    distributionCanvas: canvasSource,
    distributionPixi: pixiSource,
    distributionPhaser: phaserSource,
    distributionManifestV2: manifestSource,
  }))
    add(`helpers/${name}.js`, strToU8(source));
  for (const target of ['canvas2d', 'pixijs', 'phaser'] as const)
    add(`examples/${target}.html`, strToU8(buildRichDistributionExample(target)));
  add(
    'README.md',
    strToU8(
      'Chameleon distribution 0.2.0\n\nHTTPサーバーでexamples/' +
        (options.target ?? 'canvas2d') +
        '.htmlを開いてください。素材はIDで分離され、asset.jsonが正本です。helpers/のESM部品は同じフォルダ構成で利用できます。原点・アンカー・判定の座標は出力倍率適用後です。visibleは判定のデバッグ表示だけを制御します。イベントpayloadは自動実行しません。旧Atlas 0.1.0の読取処理では開けません。Canvas/PixiJS8.12.0/Phaser4.2.0以外の実行環境やiPhone実機の検証証拠はこのZIPに含みません。\n',
    ),
  );

  const result = await zipEntries(entries, options.signal);
  options.signal?.throwIfAborted();
  return new Blob([result.buffer as ArrayBuffer], { type: 'application/zip' });
}
