# 0013-provenance-and-ai-record-boundary

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§11 入力の来歴・安全性）
関連 fixture: `src/core/model/provenanceContract.fixtures.test.ts`（ADR-0013）

---

## 文脈

`2D_ASSET_DATA_CONTRACT.md` §11 は、元データの来歴（ファイル名・形式・ハッシュ・取得元・利用条件・作成日）と、AI 利用時の送信記録（送信先・モデル名・生成日時・承認状態）を任意で記録できるようにすること、および秘密情報を保存しないことを規範として定めている。同じ §11 には SVG / atlas JSON / ZIP / 画像の不正入力検査（任意コード実行・外部 URL 自動読込・zip bomb・巨大画像・パス外参照の禁止）も含まれるが、これは別の関心事（入力の安全性検査）であり、`2D-1A-VALIDATION` / `2D-1B-INPUT-SAFETY` の work package の範囲である。本 ADR は §11 のうち**来歴・利用条件・AI 送信記録の保存境界のみ**を対象とし、不正入力検査は対象外とする。

現行実装には AI 連携・外部送信コードが存在しない。素材の来歴に相当する情報も、`Asset` 型には専用のフィールドが無いまま、`assetNameFromFileName` によるファイル名正規化・source Blob の verbatim 保持・`createdAt`/`updatedAt` という形で暗黙的に存在している。将来 `Asset.provenance?` を追加する前に、(a) 置き場所と単位、(b) 任意性と非捏造の原則、(c) AI 送信記録との境界、(d) 秘密情報の禁止、(e) export への反映範囲、(f) 導入時の共通条件、(g) quarantine との役割分担を、実装前に契約として固定する。`Asset.provenance` の実装・schema 追加は行わない。

## 決定

1. **置き場所と単位**: 来歴は将来の `Asset.provenance?`（optional / additive な配列）とする。1 レコード = 取り込み元ファイル 1 つに対応させる。各レコードは source texture（`kind: 'source'`）の id を任意で参照できるようにする。フィールド候補は §11 の列挙（元ファイル名・形式・ハッシュ・取得元・利用条件・作成日）とし、具体的なフィールド名・ハッシュアルゴリズムは導入 PR で確定する（本 ADR は決めすぎない）。`gameAttributes`（ゲーム内で意味を持つユーザー定義値専用）や `extensions`（target 固有メタデータ用の名前空間付き領域）に来歴を混ぜない（ADR-0012 が固定した境界と一貫させる）。
2. **任意性と非捏造**: 記録は任意とする。不在時の挙動は現行と一致させる。既存データ・過去の取り込みへ遡って推定値を自動補完しない（migrate は恒等のまま。ADR-0011 の共通条件の系）。現行実装が既に持つ「暗黙の来歴」（`assetNameFromFileName` によるファイル名正規化、source Blob の verbatim 保持、`Asset.createdAt`/`updatedAt`）は事実として記録するが、これらの値を `provenance` へ自動昇格・自動転記しない。
3. **AI 送信記録の境界**: 現行アプリに AI 連携・外部送信コードは存在しない（根拠に記載の確認結果を参照）。AI 送信記録（送信先・モデル名・生成日時・承認状態）の具体的なフィールド・保存形式は `2D-2-AI-BOUNDARY` の ADR で確定する。本 ADR は保存境界のみを固定する: 記録する場合は provenance と同じ族（asset に紐づく任意メタデータ）として保存データに残し、外部送信の事実を隠さない（§11 と一貫）。エンジン向け派生出力（atlas.json、helper API、examples）へは出さない。
4. **秘密情報の禁止**: provenance / AI 送信記録の値にも ADR-0012 の決定 2 と同一の禁止を適用する。API key・アクセストークン・個人情報・外部サービスの秘密設定を保存しない。JSON として安全に検証できる値（プリミティブと浅いオブジェクト / 配列）のみを許容する。認証情報付き URL（例: クエリにトークンを含む URL）を取得元として保存しない。検出は `2D-1A-VALIDATION` の preflight に接続する。
5. **export への反映（「既定で出さない」の適用範囲の明確化）**: 「既定で出さない」とは**エンジン向け派生出力**（atlas.json、helper API、examples）に出さないことを指す。保存正本 `asset.json` の複製が同梱される場所（`.casproj` 内 `assets/<id>/asset.json`、export ZIP 内 `asset.json`）では **strip せず verbatim を維持**する（strip する新変換を導入しない。roundtrip 同一性と read-preserve-ignore を優先する）。利用条件など配布物へ意図的に含める opt-in 出力は将来の export 設計 PR で扱う。
6. **将来フィールドの共通条件**: `provenance` / AI 送信記録は optional / additive とし、0.1.0 データは無変換のままとする。ADR-0011 が固定した導入 gate 4 条件（docs 同時更新・旧データ fixture + roundtrip 確認・flip / 複製 / export 影響テスト・Opus 4.8 設計レビュー + 人間確認）を `provenance` の導入 PR にも適用する。
7. **quarantine（検査記録層）との役割分担**: quarantine は「壊れた入力の隔離記録」であり、`QuarantineRecord`（`id` / `fileName` / `importedAt` / `errorMessage` / `size` / 任意の `bytes`）として IndexedDB の quarantine ストアのみに保存され、`asset.json` / `.casproj` / export ZIP には一切含まれない。provenance は「正常に取り込んだ素材の来歴」である。両者を混ぜず、quarantine 記録を `asset.json` へ昇格しない（ADR-0007 が固定したデータ層分離と一貫させる）。

## 根拠

- 元ファイル名の正規化: `assetNameFromFileName(file.name)`（`src/core/images/importImage.ts:192`）が取り込み時のファイル名から `Asset.name` を導出する現行の唯一の処理であり、正規化前の元ファイル名そのものは `Asset` 型に保持されない。
- source Blob の verbatim 保持: `{ key: blobKeyFor(asset.id, sourceTexture.path), blob: file }`（`src/core/images/importImage.ts:212`）が、取り込んだ元ファイル（`file`、加工前）をそのまま `kind: 'source'` の texture Blob として保存する処理であり、元データを消さないという契約 §2 の実装箇所である。
- 作成・更新日時: `Asset.createdAt: IsoDateTimeString` / `Asset.updatedAt: IsoDateTimeString`（`src/core/model/asset.ts:116-117`）が、現行 `Asset` 型が持つ唯一の日時記録であり、来歴の「作成日」に相当する情報は既にここへ暗黙に存在する。
- AI 連携・外部送信コードの不在: `src/` 内で確認できる外部 URL 参照は、export した example HTML 内の CDN 参照（`src/core/export/examples.ts:257` の PixiJS CDN、`src/core/export/examples.ts:404` の Phaser CDN）と、JSON Schema の `$id`（例: `src/core/schema/asset.schema.json:3` の `https://chameleonjp-lab.github.io/...`）のみであり、いずれもエンジン読み込み用 CDN 参照とスキーマ識別子であって、AI サービスへの送信・外部 API 呼び出しではない。helper 側の `fetch` 呼び出し（`src/core/export/examples.ts:154,297,497`）もローカルの `../atlas/atlas.json` を読むのみで外部送信ではない。
- 秘密情報禁止の前例: `docs/adr/0012-target-extension-and-unknown-data.md` 決定 2 が、`extensions` の値について「JSON として安全に検証できる値のみとし、API key・アクセストークン・個人情報などの秘密情報の保存を禁止する」と既に固定しており、本 ADR は同じ禁止を provenance / AI 送信記録に適用する。
- export への反映範囲の前例: `exportAssetJson`（`src/core/export/exportAsset.ts:176-178`）が `asset.json` をそのまま整形して書き出す処理であり、export ZIP 内の `asset.json` は保存正本の verbatim コピーであることを示す。`.casproj` 側も `entries[\`assets/${asset.id}/asset.json\`] = toJsonBytes(asset)`（`src/core/storage/casproj.ts:139`）が同様に asset オブジェクト全体を整形するのみで strip しない。一方 `buildAtlas`（`src/core/export/atlas.ts:82`）はエンジン向け派生出力であり、`frames` / `animations` / `origin` / `anchors` / `colliders` / `tile` / `effect` のみを明示的に組み立てる関数で、`provenance` に相当するキーを含む経路が無い。
- 0.1.0 無変換条件・導入 gate の前例: `docs/adr/0011-motion-forward-compatibility.md` が固定した「0.1.0 データは無変換のまま」「導入 PR は docs 同時更新・旧データ fixture + roundtrip・flip / 複製 / export 影響テスト・Opus 4.8 レビュー + 人間確認を満たす」という共通条件を、本 ADR も踏襲する。
- quarantine との層分離の前例: `QuarantineRecord { id, fileName, importedAt, errorMessage, size, bytes? }`（`src/core/storage/quarantineStore.ts:11-19`）が、`STORE_QUARANTINE`（IndexedDB 専用ストア）にのみ保存され、`asset.json` / `.casproj` / export ZIP のいずれにも含まれないことの実装箇所である。
- unknown data の read-preserve-ignore 規範と、texture 配列要素内の未知フィールド（入れ子レベル）の保持事実: `src/core/model/migrate.ts` の `migrateDocument`（`data = { ...source }` によるオブジェクトスプレッド、`ASSET_MIGRATIONS` は空配列のため実質恒等）と `src/core/schema/validate.ts` の `new Ajv({ allErrors: true })`（`removeAdditional` 未設定）により、root の未知フィールドだけでなく `textures[]` 要素内の未知フィールドも失われない実挙動を、`src/core/model/provenanceContract.fixtures.test.ts` で確認して固定した（下記「現状の制限」参照）。`texture` の schema 定義（`src/core/schema/asset.schema.json:172-197`）に `additionalProperties` の指定が無いことが、この挙動の schema 側の裏付けである。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §11（境界確定の注記のみ、本文は書き換えない）。
- 影響実装: なし（今回は実装しない。将来 `Asset.provenance` を追加する PR が `src/core/model/asset.ts` / `asset.schema.json` / preflight 検証を変更する）。
- fixture: `src/core/model/provenanceContract.fixtures.test.ts` の ADR-0013 セクションで次を固定する。
  - 未知 root フィールド `provenance`（§11 候補フィールドを持つレコード配列）を持つ asset が `validateAsset` を通ること。
  - `textures[0]` に未知フィールド（`provenance: { source: 'local-file' }`）を足した asset が `validateAsset` を通ること（入れ子レベルの未知フィールド許容を、texture について名指しで初めて固定した）。
  - root `provenance` と `textures[0]` の未知フィールドの両方を持つ asset を `exportCasproj` → `importCasproj` した実挙動として、**両方とも保持される**ことと、`appliedMigrations` が空であることを固定した。
  - `buildAtlas` の出力トップレベルキー集合に `provenance` が含まれないこと。

## 現状の制限

- 本 ADR 作成時点の fixture 確認では、元ファイル名そのもの・ハッシュ・取得元・利用条件は現行実装に記録されていない（`assetNameFromFileName` は正規化後の名前のみを `Asset.name` に残し、正規化前の元ファイル名や取得元 URL・ハッシュ・利用条件を保持するフィールドが `Asset` 型に無い）。
- `.casproj` の `exportCasproj` → `importCasproj` roundtrip において、root の未知フィールド（`provenance` 相当）だけでなく、`textures[]` 要素内の未知フィールド（入れ子レベル）も**保持される**ことを実挙動で確認した（`migrateDocument` のオブジェクトスプレッドが浅い spread であるため、既に JSON.parse 済みの入れ子構造がそのまま残ることと、`validateAsset` が ajv の `removeAdditional` 未設定のまま検証のみ行うことによる）。ただし、これは `2D-1A-MIGRATION` より前の 0.1.0 実装の**副次的な現状**であり、`provenance` を正式導入する際に、他の編集経路（`assetOps.ts` 等のオブジェクトスプレッド関数、UI 経由の再保存、texture 差し替え処理）が同様に入れ子レベルの未知フィールドを保持するかは個別に確認する必要がある（ADR-0011 / ADR-0012 の先取りしない方針を継承する。本 ADR はこの現状を保証として固定するものではない）。
- AI 送信記録の具体的なフィールド・保存形式は本 ADR では定めない。`2D-2-AI-BOUNDARY` の ADR が確定するまでは、決定 3 の保存境界のみが有効である。

## 再検討条件

`Asset.provenance` を実際に導入する場合は、schema 変更（`asset.schema.json`）、フィールド名・ハッシュアルゴリズムの確定、秘密情報検出（`2D-1A-VALIDATION` の preflight）、export 契約（`2D-4`）との整合、既存編集経路（`assetOps.ts` 等）の入れ子レベル unknown data 保持確認を含む別の設計 PR + Opus 4.8 レビュー + 人間確認（ADR-0011 の導入 gate 4 条件）を経てから着手する。AI 送信記録の具体的なフィールド・保存形式を確定する場合は `2D-2-AI-BOUNDARY` の ADR で行い、本 ADR の決定 3（保存境界）と矛盾しないことを確認する。決定 5（export への反映範囲）を変更する場合、または `provenance` を配布物へ意図的に含める opt-in 出力を設計する場合も同様に別 PR とする。
