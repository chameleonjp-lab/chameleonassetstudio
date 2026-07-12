# 0012-target-extension-and-unknown-data

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§10 対象別情報と拡張領域、§11 入力の来歴・安全性）
関連 fixture: `src/core/model/targetContract.fixtures.test.ts`（ADR-0012）

---

## 文脈

書き出し先（Canvas2D / PixiJS / Phaser / 将来の Unity・Godot・RPG ツクール MZ 等）ごとに固有の情報を持ちたい要望が今後見込まれる。しかし、その情報を `Asset.gameAttributes`（ゲーム内で意味を持つユーザー定義値のための自由 object）に無制限に混ぜると、target を切り替えたときに無関係な値が残り続け、意味が汚染される。また、将来 target 固有メタデータ用の名前空間付き領域（`extensions`）を導入する前に、(a) 出力の都合と (b) 素材そのものに紐づく target 固有メタデータを区別せず設計すると、ExportPreset と Asset のどちらに置くべきかが実装ごとにばらつく。本 ADR は、この区別と unknown data（validator を通るが解釈しないデータ）の扱いの**契約境界**を先に固定する。`extensions` フィールドの実装・schema 追加は行わない。

## 決定

1. **二層分離**: target 固有情報は 2 種類に分けて置き場所を固定する。
   - (a) **出力の都合・出力設定**（helper 同梱選択、scale、padding、target バージョン等）→ **ExportPreset（`settings/export-presets.json`、既存 `ExportPreset.target: 'generic' | 'canvas2d' | 'pixijs' | 'phaser'`）側**に置く。`asset.json` には置かない。
   - (b) **素材そのものに紐づく target 固有メタデータ**（例: エンジン側 import 時のヒント値）→ 将来の **`Asset.extensions?`（名前空間付き optional 領域、契約 §10 の構造）**に置く。導入は schema 変更を伴うため、**`2D-1A-MIGRATION` 後の契約レーン別 PR**（Opus 4.8 設計レビュー + 人間確認必須）で行う。本 ADR はこの導入を先取りしない。
2. **名前空間規則**: `extensions` を導入する際、キーは kebab-case の名前空間とし、`chameleon` / `canvas2d` / `pixijs` / `phaser` / `unity` / `godot` / `rpgmaker-mz` を予約する（`chameleon` はアプリ自身の将来用）。その他のベンダー名前空間の追加も許容する。各名前空間の値は **JSON として安全に検証できる値**（プリミティブと浅いオブジェクト / 配列）のみとし、API key・アクセストークン・個人情報などの秘密情報の保存を禁止する（契約 §11 と一貫。検出は `2D-1A-VALIDATION` の preflight に接続する）。
3. **unknown data の規範 = read-preserve-ignore**: 理解しない名前空間・未知フィールドを持つデータは「読める（エラーにしない）・保持する（編集操作で削除しない）・無視する（挙動に影響させない）」を規範とする。現行実装では未知フィールドは validator を通る（ADR-0011）が、**再保存時の保持は編集経路依存で保証されない**という事実を引き継いで記録する。保持保証の実装と、保持できない場合の version 判断は `extensions` 正式導入 PR（`2D-1A-MIGRATION` 後）で行う。
4. **`gameAttributes` の境界**: `Asset.gameAttributes`（現行 `Record<string, unknown>`、schema は自由 `{"type":"object"}`）は「ゲーム内で意味を持つユーザー定義値」（score / rarity 等）専用とし、target 固有の出力調整値を新たに入れないことを規範とする。既存データの `gameAttributes` は移動・変換しない。
5. **export への反映**: `extensions` は既定で**エンジン向け派生出力**（atlas.json、helper API、examples）へ**出さない**（2D-1A-VALIDATION フォローアップ: PROVENANCE レビュー軽微 1 の解消）。target preset が明示的に選択した名前空間のみ、`2D-4` の出力契約で反映を判断する（ADR-0009 が定めた「event は既定で出さない」と同型の判断）。ここでの「出さない」は**エンジン向け派生出力**（atlas.json、helper API、examples）を指し、export ZIP / `.casproj` に同梱される保存正本 `asset.json` の複製は strip しない（ADR-0013 と同一規範。2D-1A-PROVENANCE レビューのフォローアップ）。
6. **0.1.0 無変換条件**: `extensions` は optional・additive とする。不在時の挙動は現行と一致させ、migrate は恒等のまま（ADR-0011 の共通条件に従う）。

## 根拠

- `Asset.gameAttributes: Record<string, unknown>`（`src/core/model/asset.ts:107`）は自由な object 型であり、`src/core/schema/asset.schema.json` の `gameAttributes` は `{"type":"object"}` のみで、プロパティ制約が無い（103〜105 行目）。root オブジェクトにも `additionalProperties` が指定されておらず（`asset.schema.json` の `description`、5 行目「未対応の追加プロパティは検証エラーにせず保持する」）、未知の root フィールド（例: 将来の `extensions`）が validator を通る現行実装の事実がある。
- `src/core/model/exportPreset.ts` の `EXPORT_TARGETS = ['generic', 'canvas2d', 'pixijs', 'phaser']` と `ExportPreset.target` が、出力先ごとの設定（`imageFormats` / `scale` / `includeSampleHtml` 等）を保持する既存の置き場所であり、target 固有の**出力設定**を asset 側ではなく preset 側に置く前例になっている。
- ADR-0011（`docs/adr/0011-motion-forward-compatibility.md`）が固定した「未知フィールドは現行 validator を通るが、再保存時の保持は編集経路依存で保証しない」という事実は、`extensions` のような将来の名前空間付き未知データにもそのまま適用される。
- ADR-0009（`docs/adr/0009-animation-event-boundary.md`）の「export への反映は既定で出さない」という判断パターンを、target 固有メタデータにも適用する。
- 契約 `docs/future/2D_ASSET_DATA_CONTRACT.md` §10・§11 の規範文がそのまま本 ADR の決定内容の根拠になっている。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §10。
- 影響実装: なし（今回は実装しない。将来 `extensions` を追加する PR が `src/core/model/asset.ts` / `asset.schema.json` / preflight 検証を変更する）。
- fixture: `src/core/model/targetContract.fixtures.test.ts` の ADR-0012 セクションで次を固定する。
  - `gameAttributes` が自由 object であり、ネストした値（文字列・数値・配列・オブジェクト混在）を持つ asset が `validateAsset` を通ること。
  - 未知 root フィールド `extensions`（例: `{ "unity": { "pixelsPerUnit": 100 } }`）を持つ asset が現行 validator を通ること（ADR-0011 の系を `extensions` 名指しで固定）。
  - `extensions` 付き asset を `exportCasproj` → `importCasproj` した実挙動（本リポジトリでは現行実装上、未知 root フィールドは `migrateDocument` のオブジェクトスプレッドと ajv の非 `removeAdditional` 検証により **保持される**ことを確認して固定した。下記「現状の制限」を参照）。
  - `EXPORT_TARGETS` の現行値集合 `['generic', 'canvas2d', 'pixijs', 'phaser']` の固定。
  - `buildAtlas` の出力トップレベルキー集合に `extensions` / `gameAttributes` が現行でも含まれないことの固定。

## 現状の制限

- 本 ADR 作成時点の fixture 確認では、`.casproj` の `exportCasproj` → `importCasproj` roundtrip において、asset の未知 root フィールド（`extensions` 相当）は**保持される**ことを実挙動で確認した（`migrateDocument` が `{ ...source }` でオブジェクト全体をスプレッドし、`validateAsset` が ajv の `removeAdditional` 未設定のまま検証のみ行うため）。ただし、これは `2D-1A-MIGRATION` より前の 0.1.0 実装の**副次的な現状**であり、`extensions` を正式導入する際に、他の編集経路（`assetOps.ts` 等のオブジェクトスプレッド関数、UI 経由の再保存）が同様に保持するかは個別に確認する必要がある（ADR-0011 の先取りしない方針を継承）。本 ADR はこの現状を保証として固定するものではない。

## 再検討条件

`Asset.extensions` を実際に導入する場合は、schema 変更（`asset.schema.json`）、名前空間ごとの値検証、秘密情報検出（`2D-1A-VALIDATION` の preflight）、export 契約（`2D-4`）との整合、既存編集経路（`assetOps.ts` 等）の unknown data 保持確認を含む別の設計 PR + Opus 4.8 レビュー + 人間確認を経てから着手する。`gameAttributes` の意味づけ（ゲーム内属性専用）を変更する場合、または `extensions` の export 既定値（出さない）を変更する場合も同様に別 PR とする。ADR-0011 の導入 gate 4 条件（docs 同時更新・旧データ fixture + roundtrip・flip / 複製 / export 影響テスト・Opus 4.8 レビュー + 人間確認）は `extensions` の導入 PR にも適用する（2D-1A-PROVENANCE レビューのフォローアップ）。
