/**
 * Sprite Sheet 用のグリッド配置と Atlas JSON の組み立て（Phase 10、要件 11.9）。
 * ブラウザ API に依存しない純関数のみを置き、Node でもテストできるようにする。
 */
import type { Asset } from '../model';
import { assertFrameColliderOverridesValid } from '../model';
import { assertFixedFpsAnimationExportSafe } from './animationLoss';
import { assertColliderOverrideExportSafe } from './colliderOverrideLoss';

/** Sprite Sheet 上のグリッド配置。 */
export interface SheetLayout {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  /** 各コマの左上位置（Sprite Sheet 内のピクセル座標）。 */
  positions: Array<{ frameId: string; x: number; y: number }>;
  width: number;
  height: number;
}

/**
 * フレーム数から正方形に近いグリッド配置を計算する。
 * 列数は `ceil(sqrt(n))`、行数は `ceil(n / 列数)` とし、左上から行優先で配置する。
 *
 * frameIds が空の場合は 0 コマのレイアウト（columns / rows / positions がすべて空）を返す。
 * 現在の表示状態を 1 コマとして書き出したい場合は、SheetLayout.positions の frameId を
 * null 扱いにするのではなく、呼び出し側が `['default']` のような 1 件の id を渡すこと
 * （`buildAtlas` はフレーム未登録の id をそのまま名前として使う）。
 */
export function computeSheetLayout(
  frameIds: string[],
  cellWidth: number,
  cellHeight: number,
): SheetLayout {
  const count = frameIds.length;
  const columns = count === 0 ? 0 : Math.ceil(Math.sqrt(count));
  const rows = count === 0 ? 0 : Math.ceil(count / columns);
  const positions = frameIds.map((frameId, index) => ({
    frameId,
    x: (index % columns) * cellWidth,
    y: Math.floor(index / columns) * cellHeight,
  }));
  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    positions,
    width: columns * cellWidth,
    height: rows * cellHeight,
  };
}

export const ATLAS_FORMAT = 'chameleon-atlas' as const;

/** atlas.json の現行バージョン。破壊的変更時は上げる。 */
export const CURRENT_ATLAS_VERSION = '0.1.0' as const;

export const DISTRIBUTION_FORMAT = 'chameleon-distribution' as const;
export const CURRENT_DISTRIBUTION_VERSION = '0.1.0' as const;
export const DISTRIBUTION_PROFILE = 'fixed-grid' as const;

export interface DistributionFileReferences {
  manifest: string;
  assetJson: string;
  atlasJson: string;
  pages: string[];
  mainPng: string;
  mainWebp: string | null;
  readme: string;
  examples: string[];
  helpers: string[];
  engines: string[];
}

export interface DistributionManifestFrame {
  name: string;
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  sourceSize: { width: number; height: number };
  contentRect: { x: number; y: number; width: number; height: number };
  contentOffset: { x: number; y: number };
  rotated: false;
}

export interface DistributionManifest {
  format: typeof DISTRIBUTION_FORMAT;
  version: typeof CURRENT_DISTRIBUTION_VERSION;
  profile: typeof DISTRIBUTION_PROFILE;
  scale: 1;
  source: { assetJson: string; canonical: true };
  files: DistributionFileReferences;
  pages: Array<{ path: string; width: number; height: number; rotated: false }>;
  frames: DistributionManifestFrame[];
  animations: AtlasJson['animations'];
  origin: AtlasJson['origin'];
  anchors: AtlasJson['anchors'];
  colliders: AtlasJson['colliders'];
  tile?: Asset['tile'];
  effect?: Asset['effect'];
  integrity?: { algorithm: 'SHA-256'; manifestHash: string };
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalizeJsonValue(entry)]),
    );
  }
  return value;
}

/** 決定性検査に使うJSON。配列順は意味として保持し、objectのkeyだけを整列する。 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

function atlasBounds(atlas: AtlasJson): { width: number; height: number } {
  return atlas.frames.reduce(
    (bounds, frame) => ({
      width: Math.max(bounds.width, frame.x + frame.width),
      height: Math.max(bounds.height, frame.y + frame.height),
    }),
    { width: 0, height: 0 },
  );
}

/**
 * legacy Atlasからdistribution manifestの共通部分を組み立てる。
 * fixed-gridのみを担当し、packed / trim / scaleは後続sliceで拡張する。
 */
export function buildDistributionManifest(
  asset: Asset,
  atlas: AtlasJson,
  entryPaths: readonly string[],
): Omit<DistributionManifest, 'integrity'> {
  const paths = [...new Set(entryPaths)].sort();
  const pagePath = `atlas/${atlas.texture}`;
  const bounds = atlasBounds(atlas);
  const pagePaths = paths.filter((path) => path.startsWith('atlas/') && path.endsWith('.png'));
  const pages = pagePaths.length > 0 ? pagePaths : [pagePath];

  return {
    format: DISTRIBUTION_FORMAT,
    version: CURRENT_DISTRIBUTION_VERSION,
    profile: DISTRIBUTION_PROFILE,
    scale: 1,
    source: { assetJson: 'asset.json', canonical: true },
    files: {
      manifest: 'manifest.json',
      assetJson: 'asset.json',
      atlasJson: 'atlas/atlas.json',
      pages,
      mainPng: 'textures/main.png',
      mainWebp: paths.includes('textures/main.webp') ? 'textures/main.webp' : null,
      readme: 'README.md',
      examples: paths.filter((path) => path.startsWith('examples/')).sort(),
      helpers: paths.filter((path) => path.startsWith('helpers/')).sort(),
      engines: paths.filter((path) => path.startsWith('engines/')).sort(),
    },
    pages: pages.map((path) => ({
      path,
      width: bounds.width,
      height: bounds.height,
      rotated: false as const,
    })),
    frames: atlas.frames.map((frame) => ({
      name: frame.name,
      page: 0,
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      sourceSize: { width: asset.canvasSize.width, height: asset.canvasSize.height },
      contentRect: { x: 0, y: 0, width: frame.width, height: frame.height },
      contentOffset: { x: 0, y: 0 },
      rotated: false as const,
    })),
    animations: atlas.animations,
    origin: atlas.origin,
    anchors: atlas.anchors,
    colliders: atlas.colliders,
    ...(atlas.tile ? { tile: atlas.tile } : {}),
    ...(atlas.effect ? { effect: atlas.effect } : {}),
  };
}

/** `atlas/atlas.json` に対応する内容。 */
export interface AtlasJson {
  format: typeof ATLAS_FORMAT;
  version: typeof CURRENT_ATLAS_VERSION;
  /** 対応する Sprite Sheet 画像のファイル名。 */
  texture: string;
  cellSize: { width: number; height: number };
  frames: Array<{ name: string; x: number; y: number; width: number; height: number }>;
  /** frames は Frame.name の配列（Animation.frameIds を名前解決したもの）。 */
  animations: Array<{ name: string; fps: number; loop: boolean; frames: string[] }>;
  origin: { x: number; y: number };
  anchors: Array<{ name: string; role: string; x: number; y: number }>;
  colliders: Asset['colliders'];
  /** tile アセットの設定をそのまま含める。ゲーム側が各コマを tileSize で分割するために使う。 */
  tile?: Asset['tile'];
  /** effect アセットの設定をそのまま含める。ゲーム側が再生時間・blendMode を atlas だけで読めるようにする（Phase 17）。 */
  effect?: Asset['effect'];
}

/**
 * アセットとレイアウトから Atlas JSON を組み立てる。
 * layout.positions の frameId は基本的に Asset.frames の id を想定するが、
 * 対応するフレームが見つからない場合（フレーム未使用のアセットを 1 コマとして
 * 書き出す場合など）は frameId 自体をコマ名として使う（'default' など）。
 */
export function buildAtlas(asset: Asset, layout: SheetLayout): AtlasJson {
  assertFrameColliderOverridesValid(asset);
  assertFixedFpsAnimationExportSafe(asset);
  assertColliderOverrideExportSafe(asset);
  const frames = asset.frames ?? [];
  const nameById = new Map(frames.map((frame) => [frame.id, frame.name]));

  return {
    format: ATLAS_FORMAT,
    version: CURRENT_ATLAS_VERSION,
    texture: 'spritesheet.png',
    cellSize: { width: layout.cellWidth, height: layout.cellHeight },
    frames: layout.positions.map((position) => ({
      name: nameById.get(position.frameId) ?? position.frameId,
      x: position.x,
      y: position.y,
      width: layout.cellWidth,
      height: layout.cellHeight,
    })),
    animations: asset.animations.map((animation) => ({
      name: animation.name,
      fps: animation.fps,
      loop: animation.loop,
      frames: animation.frameIds.map((frameId) => nameById.get(frameId) ?? frameId),
    })),
    origin: { x: asset.origin.x, y: asset.origin.y },
    anchors: asset.anchors.map((anchor) => ({
      name: anchor.name,
      role: anchor.role,
      x: anchor.position.x,
      y: anchor.position.y,
    })),
    colliders: asset.colliders,
    // tile アセットのみ tile 設定（tileSize / collisionType / visualType）をそのまま同梱する（Phase 14）。
    // 種別変更後に asset.tile が残っていても、非 tile アセットの atlas には出さない。
    ...(asset.assetType === 'tile' && asset.tile ? { tile: asset.tile } : {}),
    // effect アセットのみ effect 設定をそのまま同梱する（Phase 17）。
    // 種別変更後に asset.effect が残っていても、非 effect アセットの atlas には出さない。
    ...(asset.assetType === 'effect' && asset.effect ? { effect: asset.effect } : {}),
  };
}
