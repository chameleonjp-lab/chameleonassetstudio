/**
 * Sprite Sheet 用のグリッド配置と Atlas JSON の組み立て（Phase 10、要件 11.9）。
 * ブラウザ API に依存しない純関数のみを置き、Node でもテストできるようにする。
 */
import type { Asset } from '../model';

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
}

/**
 * アセットとレイアウトから Atlas JSON を組み立てる。
 * layout.positions の frameId は基本的に Asset.frames の id を想定するが、
 * 対応するフレームが見つからない場合（フレーム未使用のアセットを 1 コマとして
 * 書き出す場合など）は frameId 自体をコマ名として使う（'default' など）。
 */
export function buildAtlas(asset: Asset, layout: SheetLayout): AtlasJson {
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
    // tile アセットは tile 設定（tileSize / collisionType / visualType）をそのまま同梱する（Phase 14）
    ...(asset.tile ? { tile: asset.tile } : {}),
  };
}
