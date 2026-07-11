# 0008-motion-time-semantics

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§8.1 基本、§8.2 可変時間とイベント、§8.3 状態と骨）
関連 fixture: `src/core/model/motionContract.fixtures.test.ts`（ADR-0008）

---

## 文脈

`Animation` は `fps` と `frameIds` を持つ一方、schema 上は optional な `durationMs` も許容している。さらに簡易リグ（Phase 15）は `RigAnimation.durationMs`（必須）から `Frame[]` を焼き込む（bake）。将来、可変フレーム時間や frame 別上書きを追加する前に、「時間の正本はどこか」「rig 編集データと bake 後データのどちらが正本か」を固定しないと、可変時間の導入時に既存の fps ベース再生・export の意味が壊れる危険がある。

## 決定

- 再生・export の時間の正本は **fps × フレーム数**である。アプリ内再生（`EditorScreen.tsx` の `intervalMs = 1000 / fps`）、atlas export（`{name, fps, loop, frames}`）、Canvas / PixiJS / Phaser の export helper はすべて fps ベースで、`durationMs` を参照しない。
- `Animation.durationMs`（`src/core/model/animation.ts:40`、schema 上 optional）は**現行実装で未使用の休眠フィールド**である。契約上は「informational（rig bake 元の duration 記録などの参考値）」と定義する。再生・export はこれを読まない。既存データ互換のため削除もしない。
- 将来の可変フレーム時間は **Frame 単位の optional `durationMs` 上書き**（新フィールド）として導入する。`fps` は既定値の導出元として残し、上書きが無い frame は `1000 / fps` ミリ秒とする。既存 fps-only データは自動変換しない。導入は schema 変更を伴うため、**`2D-1A-MIGRATION` 後の契約レーン別 PR**（Opus 4.8 レビュー + 人間確認必須）でのみ行う。
- **rig 編集データと bake 後データの正本関係**: bake 後の `Frame[]` / `Animation` が再生・export の正本である。`rigAnimations`（`src/core/model/rig.ts:15`、`RigAnimation.durationMs` は必須）は編集補助の元データであり、bake（`bakeRigAnimation`、`src/core/rig/rig.ts:266`〜、`frameCount = Math.max(1, Math.round((rig.durationMs / 1000) * rig.fps))`、`rig.ts:267`）実行時にのみ `Frame` へ反映される。bake 後に `rigAnimations` を編集しても、再 bake するまで既存の `frames` / `animations` は変わらない（`bakeRigAnimation` は新しい `Frame[]` と `Animation` を追加するのみで、入力の `rig` を読み返す経路を持たないため一方向）。これは ADR-0003 の「派生データは元データを自動一括更新しない」原則と一貫する。
- `flipCopyAsset` が `rigAnimations` を `undefined` にする現行挙動（ADR-0005）は、「bake 済み frames が正本であり、bake 前の rig 編集データが無くても再生・export に支障がない」という本 ADR の前提のもとで安全と位置づける。

## 根拠

- `EditorScreen.tsx:292` の `const intervalMs = 1000 / Math.max(1, fps);`（再生ループが fps のみを参照する）。
- `src/core/export/atlas.ts` の `buildAtlas`（82〜119 行目、特に 98〜103 行目）が組み立てる `animations: Array<{ name, fps, loop, frames }>` に `durationMs` を含めない。
- `src/core/export/helpers.ts`（165 行目 `const intervalMs = 1000 / animation.fps;`、235 行目 `sprite.animationSpeed = animation ? animation.fps / 60 : 1;`、367 行目 `frameRate: animation.fps`）が Canvas / PixiJS / Phaser のいずれも fps ベースであること。
- `src/core/model/animation.ts:40` の `durationMs?: number;`（コメント「再生時間（ミリ秒）。未指定時は frameIds.length / fps から導出する。」はあるが、実際にこの値を読む実装が存在しない）。
- `src/core/model/rig.ts:15` の `durationMs: number;`（`RigAnimation` は必須）と、`src/core/rig/rig.ts:267` の `bakeRigAnimation` の frameCount 計算式。
- `src/core/model/flipCopy.ts:207` の `rigAnimations: undefined`（コメント「リグ編集データの反転は将来対応（焼き込み frames は反転済み）」）。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §8.1, §8.2, §8.3。
- 影響実装（現状維持）: `src/core/model/animation.ts`、`src/core/model/rig.ts`、`src/core/rig/rig.ts`、`src/core/export/atlas.ts`、`src/core/export/helpers.ts`、`src/features/editor/EditorScreen.tsx`。
- fixture: `src/core/model/motionContract.fixtures.test.ts` の ADR-0008 セクションで、(1) `durationMs` 付き 2 フレーム/8fps animation を `buildAtlas` に通しても出力 `animations` のキー集合が `{name, fps, loop, frames}` のみであること、(2) `bakeRigAnimation` の frameCount 境界（1000ms×8fps=8、125ms×8fps=1、1ms×8fps=1 の `max(1, ...)` 下限）、(3) bake 後に `rigAnimations` を書き換えても既存 `frames` が変わらないことを数値で固定する。

## 再検討条件

Frame 単位の `durationMs` 上書きを導入する場合は、`2D-1A-MIGRATION` 後の契約レーン別 PR で、schema 変更・旧データ fixture・roundtrip テスト・Opus 4.8 設計レビュー・人間確認を経てから着手する（ADR-0011 と同一の gate）。
