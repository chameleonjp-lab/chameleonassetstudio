import type { Anchor } from './anchor';
import type { Animation, Frame } from './animation';
import type { Collider } from './collider';
import type { IsoDateTimeString, Size, Vec2, VersionString } from './common';
import type { Layer } from './layer';
import type { Part } from './part';
import type { TextureRef } from './texture';

export const ASSET_FORMAT = 'chameleon-asset' as const;

/** asset.json の現行バージョン。破壊的変更時は上げて migrate を用意する。 */
export const CURRENT_ASSET_VERSION: VersionString = '0.1.0';

export const ASSET_TYPES = [
  'character',
  'item',
  'background',
  'tile',
  'gimmick',
  'effect',
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * ゲームに組み込む 1 つの素材。`asset.json` に対応する。
 * UI 状態（ズーム倍率、選択状態、開いているパネルなど）は含めない。
 */
export interface Asset {
  format: typeof ASSET_FORMAT;
  version: VersionString;
  id: string;
  assetType: AssetType;
  /** 英数字ベースの識別名（例: tomato_player）。 */
  name: string;
  /** 画面表示用の名前（例: トマトプレイヤー）。 */
  displayName: string;
  canvasSize: Size;
  /** ゲーム上に置くときの基準点。キャラクターは足元中央を基本にする。 */
  origin: Vec2;
  textures: TextureRef[];
  layers: Layer[];
  parts: Part[];
  anchors: Anchor[];
  colliders: Collider[];
  /** アニメーション用フレーム。未使用のアセットでは省略できる。 */
  frames?: Frame[];
  animations: Animation[];
  tags: string[];
  /** ゲーム側で自由に使う属性（例: maxHp、rarity）。 */
  gameAttributes: Record<string, unknown>;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}
