# 0014-validation-staging

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§12 検証の段階）
関連 fixture: `src/core/model/validationContract.fixtures.test.ts`（ADR-0014）

---

## 文脈

`2D_ASSET_DATA_CONTRACT.md` §12 は、将来のデータ機能を JSON Schema を通るだけで完了にしないため、検証を構造検証・意味検証・出力検証の三段に分けることを規範として定めている。しかし現行実装では、この三段が明示的な統一パスとして存在せず、(a) ajv による構造検証、(b) `assetOps.ts` / `rig.ts` に分散した編集時の予防ガードと `casproj.ts` の export 時 Blob 完全性チェック、(c) 未実装の出力検証（preflight）に分かれている。将来、統一意味検証パスと preflight を実装する前に、三段の境界・各段の失敗時の既定動作・現行コードがどの段を（部分的に）担っているかを契約として先に固定する必要がある。本 ADR は統一意味検証パス・preflight の実装は行わない。

## 決定

1. **三段検証モデルの固定**: §12 が定める三段（構造検証 / 意味検証 / 出力検証）と、各段の失敗時の扱いを契約として固定する。
   - 構造検証（schema）失敗 → 保存・書き出しを止める。
   - 意味検証（runtime）失敗 → 原則として修復を求め、何が不足するかを示す。
   - 出力検証（preflight）失敗 → preset ごとに警告、または書き出しを止める。
2. **現行実装の各段への対応づけ**: 現行コードを三段に対応づけると次のとおりである。
   - 構造検証 = ajv validators（`validateAsset` / `validateProject` / `validateAnimation` / `validateExportPresets`、いずれも `.casproj` 境界（`exportCasproj` / `importCasproj`）で invalid なら throw）。
   - 意味検証 = 現状は統一された**検出（detection）パス**が無く、分散した**編集時の予防（prevention）**（part 親子循環防止、rig visited-guard、layer 削除時の part 参照除去）と、**export 時の Blob 完全性チェック**（`.casproj` 書き出し時のみ）だけが存在する。
   - 出力検証 = 未実装。`buildAtlas` は frame name → id フォールバックのみを行い、重複名の検出・警告をしない。
3. **意味検証の必須対象の固定**（§12 の列挙を契約化。実装は将来の統一パスで行う）:
   - (a) image layer が実在する texture を参照する。
   - (b) part / frame / animation の参照が切れていない。
   - (c) part 親子に循環がない。
   - (d) `.casproj` の必要 Blob が揃う。
   - (e) 出力用の一意名を生成できる。
   現行の分散ガード（循環防止・Blob 完全性チェック）は「予防」であり、将来の統一意味検証パスはこれらの既存の予防を置き換えるのではなく補完する。
4. **失敗時の既定動作の境界**（ADR-0006/0007 の「正本を壊さない」原則との一貫）:
   - 構造検証失敗 = 保存・export を止める（正本を壊さない）。
   - 意味検証失敗 = 原則「修復要求 + 不足の明示」とし、自動修復・自動削除で黙って直さない（ユーザーに何が起きたか示す）。
   - 出力検証失敗 = preset ごとに警告 or 停止とし、保存正本は止めない（編集は続けられる）。
5. **秘密情報検出の接続点の固定**: ADR-0012 決定 2 / ADR-0013 決定 4 が preflight に接続すると述べた秘密情報検出（`extensions` / `provenance` / AI 送信記録の値に含まれる API key・アクセストークン・個人情報などの検出）を、**出力検証（preflight）段の一部**として位置づける。検出の具体アルゴリズムは preflight 実装 PR（`2D-4-PREFLIGHT`）で確定する（本 ADR は接続点のみを固定する）。保存自体は止めないが、配布物への出力・外部送信前に警告する境界とする。
6. **将来フィールドの共通条件 / 0.1.0 無変換**: 検証の追加（統一意味検証パス・preflight）は保存データ形式を変えない read-only 追加（「止める・警告する」の判断を足すのみでデータを書き換えない）とする。したがって 0.1.0 データの読み込み・保存挙動を変えない。純粋な read-only 検証の追加は ADR-0011 の形式変更 gate（4 条件）の対象外とするが、Opus 4.8 の設計レビューは通す。一方、検証結果の保存や意味検証の自動修復の既定適用はデータ形式・保存挙動に影響するため、ADR-0011 の導入 gate 4 条件を適用する。
7. **他 work package との境界**: 不正入力（信頼しない ZIP / JSON / 画像）の検査・隔離は `2D-1B-INPUT-SAFETY` の範囲であり、本 ADR の「入力の構造・意味・出力の検証」とは別の関心事である（§11 の不正入力検査は ADR-0013 が既に `2D-1A-VALIDATION` / `2D-1B-INPUT-SAFETY` へ振り分け済み）。preflight の具体実装は `2D-4-PREFLIGHT` が担当する。本 ADR は段の分解と境界のみを固定する。

## 根拠

- 構造検証: `src/core/schema/validate.ts` の `validateAsset` / `validateProject` / `validateAnimation` / `validateExportPresets`（8 行目 `const ajv = new Ajv({ allErrors: true });`、`removeAdditional` 未設定）が現行の唯一の構造検証実装である。境界での enforcement は `src/core/storage/casproj.ts:98-118`（`exportCasproj` が `validateProject` / `validateAsset` / `validateExportPresets` のいずれかが invalid なら `CasprojError` を throw する）と `importCasproj`（migrate 後に同じ validator を通し、invalid なら throw する）である。
- 意味検証の統一パスが未実装である事実: 分散した編集時ガードとして、part 親子循環防止は `src/core/model/assetOps.ts:528` の `setPartParent`（`parentId` が循環を作る場合は変更せず asset をそのまま返す）と、その判定に使う `isPartAncestor`（`assetOps.ts:504-515`、visited-guard で循環データがあっても無限ループしない）に実装されている。rig 側の visited-guard は `src/core/rig/rig.ts:113-131` の `collectChain`（`accumulatePartChain` / `partWorldMatrix` が内部で使用する、循環を検出した時点で打ち切るチェーン収集）に実装されている。layer 削除時の part 参照除去は `assetOps.ts:76-87` の `removeLayer`（レイヤー削除時に `part.layerIds` から該当 id を除去する）に実装されている。export 時の Blob 完全性チェックは `src/core/storage/casproj.ts:120-132`（全 `asset.textures` に対応するファイルが `bundle.files` に揃っていなければ `CasprojError` を throw する）に実装されている。これらはいずれも編集操作・書き出し操作の一部として組み込まれた個別のガードであり、統一的に「asset 全体を検査して問題一覧を返す」意味検証関数（preflight 相当）は存在しない。
- 出力検証が未実装である事実: `src/core/export/atlas.ts:82` の `buildAtlas` は、`atlas.ts:92`（`nameById.get(position.frameId) ?? position.frameId`）で frame の id から name を解決するのみで、複数 frame が同じ `name` を持つ場合の重複検出・警告・dedup を行わない。
- 秘密情報検出の接続先: `docs/adr/0012-target-extension-and-unknown-data.md` 決定 2（「API key・アクセストークン・個人情報などの秘密情報の保存を禁止する（契約 §11 と一貫。検出は `2D-1A-VALIDATION` の preflight に接続する）」）と `docs/adr/0013-provenance-and-ai-record-boundary.md` 決定 4（「認証情報付き URL（例: クエリにトークンを含む URL）を取得元として保存しない。検出は `2D-1A-VALIDATION` の preflight に接続する」）が、すでに preflight への接続を明示している。本 ADR はこの接続点を出力検証段の一部として確定する。
- ADR-0011（`docs/adr/0011-motion-forward-compatibility.md`）の導入 gate 4 条件（docs 同時更新・旧データ fixture + roundtrip 確認・flip / 複製 / export 影響テスト・Opus 4.8 設計レビュー + 人間確認）を、データ形式・保存挙動に影響する検証機能（検証結果の保存、自動修復の既定適用）にも適用する前例として踏襲する。
- ADR-0006（`docs/adr/0006-migration-and-recovery-boundaries.md`）/ ADR-0007（`docs/adr/0007-data-layer-separation.md`）の「正本を壊さない」原則を、本 ADR の失敗時の既定動作（構造検証失敗のみ保存・export を止め、意味検証・出力検証の失敗では原則として編集を継続できる）の一貫性の根拠とする。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §12（境界確定の注記のみ、本文は書き換えない）。
- 影響実装: なし（今回は実装しない。将来、統一意味検証パスと preflight を追加する PR が `src/core/model/` 配下に新しい検証関数を追加し、`src/core/export/atlas.ts`（重複名検出）と `2D-4-PREFLIGHT` の preflight 実装を変更する）。
- fixture: `src/core/model/validationContract.fixtures.test.ts` の ADR-0014 セクションで次を実挙動から固定した。
  - 必須フィールド（`name` / `textures`）を欠いた asset が `validateAsset` で `valid: false` になり、該当項目を含む `errors` が返ること（構造検証は機能している）。
  - 存在しない `textureId` を参照する image layer を持つ asset（他の必須フィールドは揃っている）が `validateAsset` を**通る**（`valid: true`、`errors: []`）こと。実際に実行して確認し、schema が参照整合性を検査しないという「現状の制限」と一致することを確認した。
  - texture の Blob ファイルが `bundle.files` に無い bundle を `exportCasproj` に渡すと `CasprojError`（`/画像 Blob が見つかりません/` を含むメッセージ）を throw すること（`casproj.ts:120-132` の現行の予防が機能している）。
  - 同じ `name`（`'idle'`）を持つ 2 frame を含む asset を `buildAtlas` に渡すと、出力 `frames` に `['idle', 'idle']` がそのまま出ること（重複名を検出・dedup しない）。

## 現状の制限

- 統一意味検証パス（asset 全体を検査して問題一覧を返す関数）は未実装である。現行は `assetOps.ts` / `rig.ts` に分散した個別の編集時ガードと、`casproj.ts` の export 時 Blob 完全性チェックのみが存在する。
- 出力検証（preflight）は未実装である。`buildAtlas`（`src/core/export/atlas.ts:82`）は重複 frame 名を検出せず、`atlas.ts:92` のフォールバック（`nameById.get(position.frameId) ?? position.frameId`）により、frame が見つからない場合は id をそのまま名前として出力する。
- **参照切れ（dangling reference）は現行の構造検証（schema）を通ってしまう**ことを fixture で確認した。`asset.schema.json` の layer 定義（`textureId: { "type": "string", "minLength": 1 }`）は文字列として妥当であることしか検査せず、対応する `textures[].id` が実在するかを検査しない。同様に、`asset.schema.json` は `parts[].layerIds` や `animations[].frameIds` についても存在する id への参照であることを検査しない（型は `string` / `string[]` のみ）。これらの意味検証は現行実装のどこにも実装されていない（`assetOps.ts` の各操作は自分が生成する参照のみ有効な id に絞り込むが、外部から任意の JSON を読み込んだ場合の dangling ref は検出されない）。
- 秘密情報検出の具体アルゴリズム（正規表現パターン、対象フィールド、誤検知率の許容）は本 ADR では定めない。

## 再検討条件

統一意味検証パスを実際に実装する場合は、対象範囲（決定 3 の (a)〜(e)）・失敗時のエラー形式（構造検証の `ValidationResult` と同型にするか、別の形式にするか）・呼び出しタイミング（自動保存前、UI 操作時、export 前のいずれか、または複数）を含む別の設計 PR + Opus 4.8 設計レビュー + 人間確認を経てから着手する。preflight（`2D-4-PREFLIGHT`）を実装する場合は、target ごとの警告基準（決定 1 の「preset ごとに警告 or 書き出し停止」の具体的な閾値）、秘密情報検出のアルゴリズム（決定 5）、`buildAtlas` の重複名検出をどの段（意味検証か出力検証か）に置くかの確定を含む別 PR + Opus 4.8 設計レビュー + 人間確認を経てから着手する。秘密情報検出を実装する場合は、対象フィールド（`extensions` / `provenance` / AI 送信記録）ごとの検出ロジックと誤検知時の扱い（警告のみか、値のマスクか）を含む別 PR + Opus 4.8 設計レビュー + 人間確認を経てから着手する。ADR-0011 の導入 gate 4 条件は、検証結果の保存や自動修復の既定適用を伴う実装にも適用する。
