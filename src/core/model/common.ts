/** 2D 座標。キャンバス左上を原点、右方向 x+、下方向 y+ とする。 */
export interface Vec2 {
  x: number;
  y: number;
}

/** 幅と高さ。単位はピクセル。 */
export interface Size {
  width: number;
  height: number;
}

/** ISO 8601 形式の日時文字列（例: 2026-07-02T00:00:00.000Z）。 */
export type IsoDateTimeString = string;

/** セマンティックバージョン文字列（例: 0.1.0）。 */
export type VersionString = string;
