# 0009-animation-event-boundary

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§8.2 可変時間とイベント、§11 入力の来歴・安全性）
関連 fixture: なし（将来フィールドの境界確定のみ。今回は実装・schema 追加をしない）

---

## 文脈

将来、攻撃判定・足音・発射物生成などのタイミングをゲーム側へ伝える animation event を追加する必要がある。しかし event の形・発火タイミング・参照方式・payload の安全性を先に決めておかないと、実装時に任意コード実行や秘密情報の混入、frame 削除時の整合崩壊といった問題を後から契約変更で塞ぐことになる。本 ADR は**境界の確定のみ**であり、`events` フィールドの実装・schema 追加は行わない。

## 決定

- 将来追加する形: `Animation.events?: Array<{ id: string; name: string; frameId: string; payload?: JSON安全な値 }>`（optional・additive）。
- 発火タイミングの正本は対象 frame の**表示開始時**とする。同一 frame が `frameIds` に複数回登場する場合は、その各出現ごとに発火する（1 回の animation 再生内で複数回発火し得る）。
- 参照は frame の **id**（ADR-0002 の「参照は id」規則に従う）。frame 削除により dangling になった event は、保存時に拒否せず、`2D-1A-VALIDATION` の意味検証（§12 の「意味検証」段階）で検出する。
- `name` は自由文字列とする。`attack_start` / `attack_end` / `projectile_spawn` / `footstep` / `damage_start` 等を UI 候補として提示してよいが、名前によってアプリ内部でゲームロジックを実行しない（契約 §8.1「`idle`、`walk`、`attack` のような名前は候補であり、内部で特別なゲームロジックを実行しない」を event 名にも適用する規範化）。
- `payload` は JSON として安全に検証できる値（プリミティブと浅いオブジェクト / 配列）のみを許可する。実行可能コード文字列、外部 URL の自動読み込み、API key・秘密情報の格納を禁止する（契約 §8.2、§11 と一貫）。
- export への反映は既定で「出さない」から開始する。atlas.json 等の出力へ含めるかどうかは `2D-1A-TARGET` / `2D-4` の出力契約側で決定する。本 ADR は event を export へ出すことを先取りしない。

## 根拠

- 現行 `Animation`（`src/core/model/animation.ts:33`〜）には `events` フィールドが存在しない。`buildAtlas`（`src/core/export/atlas.ts:82`〜）が組み立てる `animations` は `{name, fps, loop, frames}` のみで、event を出力する経路は無い。
- frame 参照を id で行う既存規則は ADR-0002（`docs/adr/0002-id-name-reference-rules.md`）で固定済みであり、`Animation.frameIds`（`animation.ts:38`）がすでに id 配列であることと整合する。
- 契約 §8.1・§8.2・§11 の規範文がそのまま本 ADR の決定内容の根拠になっている（`docs/future/2D_ASSET_DATA_CONTRACT.md` 171, 180〜181, 238〜241 行目付近）。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §8.2。
- 影響実装: なし（今回は実装しない。将来 `events` を追加する PR が `src/core/model/animation.ts` / `asset.schema.json` / `animation.schema.json` を変更する）。
- fixture: 専用 fixture は無い。ただし ADR-0011 の fixture（`src/core/model/motionContract.fixtures.test.ts`）で、`events` のような未知フィールドを持つ animation データが現行 validator を通ることを固定し、本 ADR が定義する将来形の追加が additive で可能であることの前提を裏付ける。
- flip copy 時の `events[].frameId` の新 ID への張り替えは ADR-0010 の決定を参照（events 実装 PR のチェックリストに含めること）。

## 再検討条件

`events` フィールドを実際に実装する場合は、schema 変更（`animation.schema.json` / `asset.schema.json`）、payload の安全性検証ロジック、`2D-1A-VALIDATION` の dangling frameId 検出、export 契約（`2D-1A-TARGET`）との整合を含む別の設計 PR + Opus 4.8 レビュー + 人間確認を経てから着手する。発火タイミング（表示開始時）や参照方式（id）を変更する場合も同様に別 PR とする。
