# 2D-2-IMPORT-GATE + 2D-2-IMPORT-OPTIONAL + 2D-2-AI-BOUNDARY 契約監査・実装計画

作成日: 2026-07-19（最終更新: 2026-07-20）
状態: `G1+L1+Q1+P1+F1+A1+W1+S1 accepted (2026-07-19) / Slice AはPR #125でmainへmerge済み / Slice B（provenance基盤）実装中`
正式work package: `2D-2-IMPORT-GATE` + `2D-2-IMPORT-OPTIONAL` + `2D-2-AI-BOUNDARY`（2D完成ロードマップ PR group 11）
Slice B基準main: `7018984`（PR #125 merge、Slice A closeout）
前段: `2D-2-VARIANT + 2D-2-BATCH`（group 10）は全slice merge・遡及Opus review・closeout補修まで完了。

## 1. 目的

「画像を取り込むだけ」の入口を、元データ保持とloss表示付きの取り込み体験へ完成させ、任意形式とAI境界の判断必須項目をADRで固定する。

判断の観点:

1. 連番、sprite sheet、tileset、既知atlas bundleを、既存schema（layers / frames / animations / tile）の範囲で受けるか、新しい保存表現を作るか。
2. 取り込み確定前のloss / warning表示と、失敗・中断時の正本保護。
3. 失敗入力のquarantine接続。
4. `Asset.provenance?`（ADR-0013で境界確定済み）の導入時期とfield確定。
5. SVG / GIF / APNG / Aseprite / PSD / OpenRaster / Kritaの`editable-import` / `rasterized-import` / `reference-only` / `unsupported`分類（ADR判断）。
6. AI境界（consent、provenance、外部送信、new layer / variant、Undo、手動代替）の固定（ADR判断）。
7. dependency追加なしで実装できる範囲の確定。

## 2. 前段closeoutと開始条件

- group 10はPR #116〜#123で完了。CI Run #398 / PR #123 CIまで全成功。
- 契約監査はPR #124、Slice AはPR #125（merge `7018984` / CI Run #404全成功）でmainへmerge済み。PR #125のGitHub上のreview / comment / thread記録は0件であり、独立Opus review完了とは扱わない。
- 判断必須項目（`2D-2-IMPORT-OPTIONAL` / `2D-2-AI-BOUNDARY`）はADR-0016 / ADR-0017として正式確定済み。Slice B以降はaccepted契約の範囲だけを直列実装する（ROADMAP §6.5）。

## 3. 現状実装の確認

- 取り込み経路: `EditorScreen.tsx:236`の`IMPORT_ACCEPT`（`image/png,image/jpeg,image/webp`）、`handleFiles`（`:2155-2210`、`assertImageBatchCount`で最大16 file）、file input（`:2392`）とdrag & drop（`:2401`）。1 file = 1 Asset（`importImageFile`）または既存Assetへのlayer追加（`importImageAsLayer`）。
- `src/core/images/importImage.ts`: 上限25MiB / 4096px（`:6-7`）、MIME 3種（`:15`）、署名一致検査（`imageInputSafety.ts:28-45`）、source Blob verbatim保持（`:212,303`）、edit BlobのPNG正規化、thumbnail生成。decodeは`createImageBitmap`→`HTMLImageElement` fallback（`decodeImageSource.ts:14-46`）で外部library不使用。
- 失敗時: `ImageImportError` throw → `setEditorError`表示のみ。quarantine store（`quarantineStore.ts`、上限3件 / 50MiB超はbytes非保存）は`.casproj` / ZIP / JSON経路専用で、画像import失敗には未接続。
- provenance: Slice Bでoptional / additiveな`Asset.provenance?`配列を正式導入する。P1 source recordは`sourceFileName` / `mimeType` / `byteLength` / source Blob原本bytesの`sha256:<64hex>` / `importedAt`を必須、`textureId` / `origin` / `license`を任意とする。既存のADR-0013 candidate recordとADR-0017 AI recordはopen recordとして保持し、version / migrationは変更しない。単枚・layer追加の両経路で1 file = 1 recordを記録する。
- 受け皿schema: `Frame`（`layerStates[]`）、`Animation`（`fps / loop / frameIds`）、`Part`、tile系設定は既存。sheet分割・連番一括・tileset metadata・atlas bundle逆取り込みは未実装。`buildAtlas`（`export/atlas.ts:82`）は出力方向のみ。
- dependencies: 画像処理は全てbrowser標準API。`fflate`は`.casproj` ZIP用。

## 4. 判断候補

### G: 取り込み単位と受け皿

- **G1（推奨）**: 既存schemaの範囲で受ける。連番file群 = 1 Asset（fileごとにlayer + source/edit Blob、frame iはlayer iのみ可視の`layerStates`、`Animation`を1本自動生成）。sprite sheetは手動格子指定（cellSize / margin / spacing）でcellごとにedit Blobを切り出してlayer + frame化し、sheet原本はsource Blobとしてverbatim保持。tilesetはtile系asset type + tileSize設定で同じ格子分割を使う。既知atlas bundleはframes / animations / origin / anchors / collidersを復元して再編集可能なAssetを生成。schema変更なし（provenance除く）。
- G2: sheetを単一textureのまま参照する新しいregion fieldを追加する。→ schema gate対象になり、`buildAtlas`と二重表現になるため非推奨。

### L: loss表示と確定前preview

- **L1（推奨）**: 取り込み確定前に「取り込む内容 / 失われる・対応しない内容 / warning」を理由付きで表示し、明示確定後に既存保存経路で原子的に保存する。分類・確認UIはgroup 10 Slice Dのpreview / warning確認パターンを踏襲する。
- L2: 取り込み後にwarning表示のみ。→ IMPORT-GATEの「loss表示付き」要件を弱めるため非推奨。

### Q: 失敗入力のquarantine接続

- **Q1（推奨）**: 画像import失敗（署名不一致・寸法超過・decode失敗）を既存quarantine storeへ記録する。`QuarantineRecord`形式・上限3件・50MiB制限・IndexedDB storeは変更しない。UIは既存quarantine表示を再利用する。
- Q2: 現状維持（エラー表示のみ）。→ データ契約§11 / 互換matrix共通要件（拒否または隔離）と不整合のため非推奨。

### P: `Asset.provenance?`の導入

- **P1（推奨）**: ADR-0013の再検討条件に従い、optional / additiveな`Asset.provenance?`を導入する。field確定案: `sourceFileName`（正規化前の元file名）、`mimeType`、`byteLength`、`hash`（`sha256:<64hex>`、対象はsource Blob原本bytes = `importImage.ts:212`のfile）、`importedAt`、`textureId?`（source texture参照）、`origin?` / `license?`（手動入力任意）。1取り込み元file = 1 record（layer追加経路も同様）。既存データへの遡及自動補完なし。version bumpなし（additive、ADR-0015）。導入sliceにADR-0011のgate 4条件（docs同時更新・旧data fixture + roundtrip・flip / 複製 / export影響テスト・Opus review + 人間確認）とADR-0013再検討条件の4 checklist（textureId付替え規則・dangling検出の意味検証接続・hash対象bytesの確定・layer追加経路の1 file 1 record）を適用する。
- P2: 導入見送り。→ hash記録はroundtrip検証・重複検出・来歴表示の基盤であり、取り込み工程と同時導入が最小コストのため非推奨。

### F: IMPORT-OPTIONAL形式分類（ADR-0016で確定）

- **F1（推奨）**:
  - SVG = `rasterized-import`。browser標準decodeでraster化し、script / 外部URL / 任意コードを実行しないことをfixtureで固定する。editable（ベクター保持）は将来の別ADR。
  - GIF / APNG = `rasterized-import`（frame列）。`ImageDecoder`（WebCodecs）が使える環境では全frame → layer + frames、使えない環境では先頭frame + loss warning。dependency追加なし。
  - Aseprite（`.aseprite` / `.ase`）= `unsupported`。native parserはdependency + ライセンス評価が必要。Asepriteの標準PNG + JSON sprite sheet出力を経由する手順をimport-notesに明記する。
  - PSD / OpenRaster（`.ora`）/ Krita（`.kra`）= `unsupported`（理由付き表示）。reference-only（原本Blob保存のみ）は容量と誤解リスクに対して利点が薄い。OpenRasterはZIP + PNG構造でfflateにより将来`editable-import`候補になり得ることをADRの再検討条件に記録する。
- F2: OpenRasterを初回から`editable-import`にする。→ layer合成規則の互換検証が未了のため非推奨（将来候補として記録のみ）。
- F3: 未対応形式を一律`reference-only`にする。→ 「保存されているのに編集できない」状態を量産するため非推奨。

### A: AI境界（ADR-0017で確定）

- **A1（推奨）**: 境界のみ固定し、AI機能の実装は行わない。
  1. 外部送信ゼロを既定とし、将来AI連携を追加する場合は送信先・送る内容・保存期間の表示と明示consent UIを前提条件として固定する。現行の「外部送信コード不在」を検査 / fixtureで維持する。
  2. AI出力の受け入れはnew layerまたはnew variant（Family manual variant）としてのみ許可し、既存layer / source Blobの直接上書きを禁止する。既存History経路でUndo可能にする。
  3. AI送信記録（送信先・モデル名・生成日時・承認状態）はADR-0013決定3の族（asset紐づきoptionalメタデータ）として保存し、engine向け派生出力へ出さない。
  4. API key・認証情報・個人情報の保存禁止（ADR-0012決定2準用）。
  5. 手動代替原則: すべてのAI補助は手動操作で代替可能とする（製品仕様§7）。
  6. SaaS / アカウント / クラウド / 課金 / 外部API必須化は導入しない。
- A2: AI連携の具体実装を本工程で開始する。→ 外部送信・費用・プライバシーは人間承認事項であり非推奨。

### W: 既知atlas bundleの範囲

- **W1（推奨）**: 初期対象はChameleon独自atlas（`buildAtlas`出力のatlas.json + texture）の再取り込み（roundtrip）のみとする。sprite sheet + JSONのJSON対応も自形式と手動格子指定に限定する。Phaser atlas JSON / Aseprite JSONなど外部形式は将来の別ADRで形式ごとに対応範囲を明示する（互換matrix §4.1）。
- W2: Aseprite sprite sheet JSONを初回から対象にする。→ 形式検証・fixture整備の負担が大きく、W1完了後の追加が安全なため非推奨。

### S: slice分割と直列順

- **S1（推奨）**: 直列5 slice。各sliceは最新mainからbranchを作り、Draft PR → CI → 独立Opus review → 人間確認で進める。
  - **Slice A**: 契約確定。ADR-0016（IMPORT-OPTIONAL分類）+ ADR-0017（AI境界）の新規作成、関連fixture、互換matrix / データ契約 / DATA_FORMATの同期。docs + fixture-only。
  - **Slice B**: provenance基盤（P1）。schema additive追加、意味検査接続、roundtrip fixture、既存単枚import経路への記録開始。
  - **Slice C**: 連番 + sprite sheet（手動格子）取り込み。loss preview（L1）、quarantine接続（Q1）、Desktop / touch / iPhone SE E2E。
  - **Slice D**: tileset + 自形式atlas bundle再取り込み（W1）。tileSize / collision確認、roundtrip E2E。
  - **Slice E**: optional形式（F1: SVG / GIF / APNG rasterized + unsupported表示）。E2E。
- S2: provenanceを最後のsliceにする。→ 取り込みsliceのretrofitが必要になるため非推奨。

## 5. 受け入れ条件

### contract / fixture（Slice A、B）

- ADR-0016 / ADR-0017がacceptedになり、fixtureで固定される。
- `provenance`不在の既存0.1.0 Assetが無変換・意味不変で読める。`provenance`付きAssetが`.casproj` export → import → save → exportで保持される。
- `buildAtlas`出力・engine向け派生出力に`provenance` / AI送信記録が含まれない（既存fixture維持 + 拡張）。
- flip copy / 複製 / `.casproj`再取り込みのID付替え時に`provenance[].textureId`が一貫して更新され、dangling参照が意味検証で検出される。

### import共通（Slice C以降）

- source Blobをverbatim保持し、取り込み確定前にloss / warningを理由付き表示する。
- 失敗・中断・取消で正本Project / Asset / Blobを変更しない。取り込み確定は1回のUndoで全体が戻る。
- 既存の署名検査・25MiB / 4096px上限・batch件数上限を維持し、失敗入力をquarantineへ記録する。
- 連番 / sheet分割結果のframe / animationが保存・reload・flip・atlas出力後も意味を保つ。
- tileset / 自形式atlas roundtripでframes / animations / origin / anchors / colliders / tile設定の意味が一致する。
- SVGでscript / 外部URLを実行しない。GIF / APNG decode不可環境では先頭frame + loss warningになる。unsupported形式は理由付きで明示拒否される。
- Desktop / touch context / iPhone SE級viewportで取り込みpreview・warning・確定・Undo・reloadへ到達できる。
- 各slice: lint、format、build、unit、該当E2E、GitHub Actionsが全成功する。

## 6. 安全境界

本監査PRではdocs以外を変更しない。accepted後の実装でも次を変更しない。

- Project / Asset schema version、migration（provenanceはoptional / additiveでversion維持。ADR-0011 gate 4条件を適用）
- IndexedDB version / store / index（quarantine storeの形式・上限を含む）
- `.casproj` ZIP配置、product export ZIP構成、engine向けmanifest
- source / edit / thumbnail Blobの既存意味、既存Asset / Projectデータ
- dependencies（本工程は全てbrowser標準APIで実装する）
- 3D、生成AIの実装、外部送信の実装、WebGPU、SaaS / アカウント / 課金

accepted後の実装でも、次は別契約まで行わない。

- 外部atlas JSON形式（Phaser / Aseprite等）の取り込み
- SVGのeditable-import、OpenRasterのeditable-import
- AI連携の具体実装（consent UI含む）

## 7. 検証方針

- 本監査PR: docs-only。内容確認のみ（コード用testは不要）。
- Slice A: fixture追加 + `npm run test`。
- Slice B以降: lint / format / build / unit / E2E + CI。schema・保存への影響はcompatibility reviewと人間確認。

## 8. acceptance記録

推奨組み合わせ: **G1 + L1 + Q1 + P1 + F1 + A1 + W1 + S1**

- 状態: **accepted**
- accepted日: 2026-07-19（ユーザー承認）
- 実装review条件: 各slice Draft PR → CI → 独立Opus review → 人間確認。A→B→C→D→Eの直列順。各sliceは前sliceのmerge後に最新mainからbranchを作る。
- Slice AはPR #125でmainへmerge済み。Slice Bは最新main `7018984`から開始し、Draft PR → CI → 独立review → 人間確認の順で進める。独立Opus reviewの証拠が得られるまでは、その工程を完了扱いにしない。
