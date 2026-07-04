# Chameleon Asset Studio エンジン連携書

最終更新日: 2026-07-04
対象バージョン: 0.1.0
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md` / `docs/EXPORT_FORMATS.md`

---

## 1. 目的

この文書は、Chameleon Asset Studio で作ったアセットを他のゲーム制作環境で使うときの関係と範囲を定義する（Phase 16）。

大原則: **独自形式（`asset.json` / `.casproj`）が正本である。** 他エンジン向けの出力・ガイドはすべて派生物であり、正本の情報を欠落なく持ち運ぶことは保証しない。

---

## 2. 対応の一覧

| 連携先 | 提供するもの | 提供しないもの |
| --- | --- | --- |
| Canvas 2D | サンプル HTML（Phase 11）+ helper snippet（`helpers/chameleon-helpers.js`） | フレームワーク化・npm パッケージ |
| PixiJS v8 | サンプル HTML + helper snippet（`helpers/chameleon-pixi.js`） | プラグイン・完全なローダー統合 |
| Phaser 4 | サンプル HTML + helper snippet（`helpers/chameleon-phaser.js`） | Scene 自動生成 |
| Godot 4 | 取り込みガイド（`engines/README-godot.md`） | `.tscn` / Resource の自動生成 |
| Unity | 取り込みガイド（`engines/README-unity.md`） | `.prefab` / `.asset` の自動生成 |
| Rive / Spine | この文書での関係説明のみ | 書き出し・互換・変換 |

いずれも書き出し ZIP（`docs/EXPORT_FORMATS.md`）に同梱される。helper は「組み込む部品」、examples は「動く見本」で、役割を分けている（重複させない）。

---

## 3. Rive / Spine との関係

Chameleon Asset Studio は Rive / Spine の代替でも互換ツールでもない。

- **用途の違い**: Rive / Spine はベクター・メッシュ変形・ボーン IK を中心とした高機能アニメーションツールである。本ツールは「画像を取り込み、原点・アンカー・当たり判定などのゲーム用データを付けて、フレームアニメーションとして書き出す」ことに特化する。簡易リグ（Phase 15）はフレームへの焼き込み手段であり、ランタイムボーンアニメーションではない。
- **互換性**: `.riv` / Spine JSON の読み書きには対応しない。「Spine 互換」「Rive 互換」を名乗らない。
- **正本**: プロジェクトの正本は常に `asset.json` / `.casproj` である。将来、Rive / Spine からの取り込み補助（画像・アトラスの参照補助）を検討する場合も、変換結果は正本へ取り込んだ時点で本ツールの形式に従う。
- **将来課題**: 取り込み補助・参照補助は未実装であり、実装時期も未定である。

---

## 4. Godot / Unity import helper script（将来課題の設計メモ）

Phase 16 では Markdown ガイドの生成までとし、エディタスクリプトは実装しない。将来実装する場合の入力仕様:

- 入力: 書き出し ZIP の `atlas/atlas.json`（形式は `docs/EXPORT_FORMATS.md` 4 章）と `atlas/spritesheet.png`
- Godot: `@tool` スクリプトで `SpriteFrames` リソースと `CollisionShape2D` 群を生成する案
- Unity: `ScriptedImporter` または Editor メニューで Sprite スライスと AnimationClip を生成する案
- どちらも「生成後にユーザーが調整できる」ことを前提にし、再生成で手動調整を上書きしない設計とする
