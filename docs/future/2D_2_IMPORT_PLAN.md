# 2D-2-IMPORT-GATE + 2D-2-IMPORT-OPTIONAL + 2D-2-AI-BOUNDARY 契約監査・実装計画

作成日: 2026-07-19（最終更新: 2026-07-21）
状態: `G1+L1+Q1+P1+F1+A1+W1+S1 accepted / Slice A〜D・Slice D closeoutはmainへmerge済み / Slice E source契約補正中`
正式work package: `2D-2-IMPORT-GATE` + `2D-2-IMPORT-OPTIONAL` + `2D-2-AI-BOUNDARY`（2D完成ロードマップ PR group 11）
Slice E契約補正基準main: `55750d2`（PR #133 merge、Slice D closeout）
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
- 契約監査はPR #124、Slice AはPR #125（merge `7018984` / CI Run #404全成功）、Slice BはPR #126（final head `6e69621`、merge `5a1663b` / CI Run #407全成功）でmainへmerge済み。PR #126は独立read-only reviewで`BLOCKER 0 / MUST 0`を確認した一方、GitHub上のreview / comment / thread記録は0件であり、Opus review完了とは扱わない。
- Slice C本体はPR #127（merge `eaeb110`）、preview中の背景永続変更・Undo / Redo防止補修はPR #128（final head `f9e0bc5`、merge `be887a1`）でmainへmerge済み。CI Run #413はlint / format / build / unit / Chromium E2E 125件を含め全成功。独立read-only再reviewは`BLOCKER 0 / MUST 0 / SHOULD 0 / NOTE 0`だがOpus reviewではなく、その事実と残リスクをPR #128へ記録した。
- 判断必須項目（`2D-2-IMPORT-OPTIONAL` / `2D-2-AI-BOUNDARY`）はADR-0016 / ADR-0017として正式確定済み。Slice B以降はaccepted契約の範囲だけを直列実装する（ROADMAP §6.5）。
- Slice D開始監査でADR-0007 / ADR-0015とW1の衝突、raw atlas JSONの保存先不在、完全roundtrip不能を確認した。2026-07-20の人間承認によりADR-0018をacceptedとし、現行Chameleon atlasの意味上roundtripを限定例外として固定した。
- Slice DはPR #129（final head `5b98b24`、merge `33ebad4`）でmainへmerge済み。CI Run #415はlint / format / build / unit / Chromium E2Eを含め全成功した。独立read-only reviewのSHOULD 2件（tile / effect Atlas意味比較E2E、外部・不整合Atlas拒否時のquarantine非追加直接assert）はPR #133（merge `55750d2`）でcloseoutした。次はこのmainを基準にSlice Eを進める。

## 3. 現状実装の確認

- 取り込み経路: `EditorScreen.tsx`の`IMPORT_ACCEPT`（`image/png,image/jpeg,image/webp`）、`handleFiles`（`assertImageBatchCount`で最大16 file）、file inputとdrag & drop。1 file = 1 Asset（`importImageFile`）または既存Assetへのlayer追加（`importImageAsLayer`）を維持し、`ImportFrameSetPanel`から連番 / 手動格子sheet / tileset / Chameleon atlasを明示的な別モードとして準備する。
- `src/core/images/importImage.ts`: 上限25MiB / 4096px、MIME 3種、署名一致検査（`imageInputSafety.ts`）、source Blob verbatim保持、edit BlobのPNG正規化、thumbnail生成。decodeは`createImageBitmap`→`HTMLImageElement` fallback（`decodeImageSource.ts`）で外部library不使用。
- 失敗時: Slice Cでは`ImageImportError.kind`で原因を分類し、署名不一致・寸法超過・decode失敗だけを既存quarantine store（上限3件 / 50MiB超はbytes非保存）へ接続する。unsupported MIME、file size上限、hash / encode / 環境 / 保存失敗は理由表示のみで、入力破損として隔離しない。
- provenance: Slice Bでoptional / additiveな`Asset.provenance?`配列を実装済み。P1 source recordは`sourceFileName` / `mimeType` / `byteLength` / source Blob原本bytesの`sha256:<64hex>` / `importedAt`を必須、`textureId` / `origin` / `license`を任意とする。既存のADR-0013 candidate recordとADR-0017 AI recordはopen recordとして保持し、version / migrationは変更していない。単枚・layer追加の両経路で1 file = 1 recordを記録する。
- 受け皿schema: `Frame`（`layerStates[]`）、`Animation`（`fps / loop / frameIds`）、`Part`、tile / effect設定は既存。Slice Cの連番・手動格子に続き、Slice Dは明示region stagingでtilesetとChameleon atlasの復元可能な意味を既存schemaへ写す。`buildAtlas`は出力生成とcanonical fixtureに再利用する。
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
  - Aseprite（`.aseprite` / `.ase`）= `unsupported`。native parserはdependency + ライセンス評価が必要。PNG sprite sheetを書き出して手動格子で取り込み、Aseprite JSON metadataは読み込まない手順をimport-notesに明記する。
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

- **W1（accepted、ADR-0018で限定具体化）**: 初期対象はexactな`atlas.json + spritesheet.png`、`chameleon-atlas/0.1.0`のcanonical subsetだけとする。元Asset完全復元ではなく、新IDのflattened Assetへframes / animations / origin / anchors / colliders / tile / effectとpixelの意味を復元する。PNG原本はverbatim保持し、JSONはraw bytesを保存せずhash等をprovenanceへ記録してloss表示する。Phaser / Aseprite / Tiled等の外部JSONは理由付き拒否し、将来の別ADRまで対象外とする。
- W2: Aseprite sprite sheet JSONを初回から対象にする。→ 形式検証・fixture整備の負担が大きく、W1完了後の追加が安全なため非推奨。

### S: slice分割と直列順

- **S1（推奨）**: 直列5 slice。各sliceは最新mainからbranchを作り、Draft PR → CI → 独立Opus review → 人間確認で進める。
  - **Slice A**: 契約確定。ADR-0016（IMPORT-OPTIONAL分類）+ ADR-0017（AI境界）の新規作成、関連fixture、互換matrix / データ契約 / DATA_FORMATの同期。docs + fixture-only。
  - **Slice B**: provenance基盤（P1）。schema additive追加、意味検査接続、roundtrip fixture、既存単枚import経路への記録開始。
  - **Slice C**: 連番 + sprite sheet（手動格子）取り込み。loss preview（L1）、quarantine接続（Q1）、Desktop / touch / iPhone SE E2E。
  - **Slice D**: tileset + 自形式atlas bundle再取り込み（W1）。tileSize / collision確認、roundtrip E2E。
  - **Slice E**: optional形式（F1: SVG / GIF / APNG rasterized + unsupported表示）。E2E。
- S2: provenanceを最後のsliceにする。→ 取り込みsliceのretrofitが必要になるため非推奨。

### Slice C 実行契約（2026-07-20 accepted）

本SliceはG1 / L1 / Q1を次の追加条件で具体化する。

- 通常画像（1 file = 1 Asset）、連番画像、Sprite Sheet（手動格子）は明示的に別モードとし、既存の通常画像の意味を変更しない。
- 連番は1〜16 file。同じ寸法だけを受け入れ、自動拡縮・paddingは行わない。ASCII数字を数値として扱う決定的な自然順で並べ、数値表記の先頭0や英字の大小だけが異なる同順位を含め、比較が同値なら選択順を維持する。
- sheetはuniformな外周marginとcell間spacingを用い、左上から行優先で完全に収まるcellだけを1〜16件切り出す。margin、spacing、右端・下端の余りpixelはsource原本へ残し、編集frameへ入らないlossとして確定前に表示する。
- 連番は元fileごとにsource / edit / layer / frame / provenanceを1件、sheetは原本source / provenanceを1件とcellごとのedit / layer / frameを作る。各frameは対応layerだけを可視にする完全な`layerStates`を持つ。
- 自動animationは8fps、loop有効、frame順はpreview順。thumbnailは先頭file / 先頭cellから作る。
- 通常画像batch、既存Assetへのlayer追加、連番、sheetの全経路を共通L1 previewへ通す。preview表示中は背景をmodal化し、背景の永続変更とUndo / Redo（button・keyboard shortcut）を拒否する。確定時はpreview準備時のProject / Asset状態が現在も一致することを検証する。取消・準備失敗では正本を変更せず、確定は原子保存し、session内の1回のUndo / Redoで取り込み全体を往復する。
- 署名不一致、decode失敗、寸法超過だけを既存quarantineへ接続する。unsupported MIME、file size上限、hash / encode / 環境 / 保存失敗は入力破損と決めつけて隔離しない。
- schema / version / migration、IndexedDB version / store / index、`.casproj`配置、product export ZIP構成、dependencyは変更しない。

### Slice D 実行契約（2026-07-20 accepted、ADR-0018）

- Tilesetは独立モードとし、手動格子の1〜16cellを各1 edit texture / layer / frameへ展開する。`assetType: tile`、`canvasSize = cellSize`、`tileSize = cellSize`を既定とし、tileSizeはcellSize以下を必須、非除算をwarningとする。
- collisionType / visualTypeはAsset全体で1設定とし、colliderを自動生成しない。Tileset cell列をanimationとはみなさず、自動animationを作らない。margin / spacing / remainderはSlice Cと同じloss境界を使う。
- Atlas入力はbasenameがexactな`atlas.json + spritesheet.png`の2 fileだけとする。ZIP、directory、外部URL、外部Atlas JSONを受理しない。
- JSONは既存`parseBoundedJson`の4MiB / UTF-8 / depth 64を通し、exactなformat / version / texture、既知field、1〜16件の非空・一意frame名、正整数cell geometry、`computeSheetLayout`の行優先配置、実texture寸法、animation参照、anchor role、collider union、tile / effect設定をruntime validatorで検査する。
- 5 frameの3 x 2 sheetなど末尾空cellを誤生成しないよう、manual gridではなくJSONの`frames[]` regionだけを切り出す。frame / animation / anchor / colliderの内部IDは新規生成する。
- spritesheet PNGはsource Blobとしてverbatim保持する。atlas JSONは2件目のsource-file provenanceへfile名 / MIME / byte数 / SHA-256 / importedAtを記録するが、raw bytesは保存しない。この例外と元layer / part / tag / gameAttributes / rig / provenance / identity / animation durationMsの非復元を常時loss表示する。
- tile / effect metadataがあればAsset typeを推定し、それ以外は利用者がnameとtypeを明示指定する。確定はSlice Cのcommon preview / stale guard / atomic save / History 1 entryを再利用する。
- quarantineはspritesheet画像のsignature不一致・decode失敗・寸法超過だけとする。JSON parse / version / geometry / reference / external format違反は正本無変更の理由付き拒否とし、隔離しない。
- schema / version / migration、IndexedDB version / store / index、`.casproj`配置、product export ZIP構成、dependencyは変更しない。

### Slice E source保存契約補正（2026-07-21 accepted、ADR-0019）

Slice Eの実装前監査で、SVG / GIFの原本をverbatim source Blobとして保持するF1と、PNG / JPEG / WebPしか許可しないAsset 0.1.0の`TextureRef.mimeType` / schemaが両立しないことを確認した。2026-07-21に人間が選択肢Aを承認したため、UI / animated decodeより先に次を独立PRで固定する。

- Assetだけを`0.2.0`へ進め、既存フィールドを変更しない`0.1.0 -> 0.2.0` migrationを追加する。Project / export-presets / atlas / app versionは`0.1.0`を維持する。
- source TextureRefへ`image/svg+xml` / `image/gif`を追加し、edit / thumbnailはPNG / JPEG / WebPだけに制限する。
- APNGはPNGコンテナとしてsource TextureRef / Blobを`image/png`へcanonical化し、元の`image/apng`宣言はprovenanceへ保持する。
- SVG / GIFの実体署名、`.casproj` staged import、TextureRef / Blob MIME一致、verbatim bytes、旧fixture roundtripを固定する。
- 通常importの許可MIME、SVG安全rasterize、GIF / APNG全frame decodeとfallback、loss / unsupported UI、E2Eは変更せず、次のSlice E製品実装PRへ分ける。

## 5. 受け入れ条件

### contract / fixture（Slice A、B）

- ADR-0016 / ADR-0017がacceptedになり、fixtureで固定される。
- `provenance`不在の既存0.1.0 Assetが、既存フィールドを変えず0.2.0へ移行し、provenanceを遡及生成しない。`provenance`付きAssetが`.casproj` export → import → save → exportで保持される。
- `buildAtlas`出力・engine向け派生出力に`provenance` / AI送信記録が含まれない（既存fixture維持 + 拡張）。
- flip copy / 複製 / `.casproj`再取り込みのID付替え時に`provenance[].textureId`が一貫して更新され、dangling参照が意味検証で検出される。

### import共通（Slice C以降）

- 画像source Blobをverbatim保持し、取り込み確定前にloss / warningを理由付き表示する。ADR-0018のatlas JSONだけはhash provenanceを保持し、raw bytes非保持を常時loss表示する。
- 失敗・中断・取消で正本Project / Asset / Blobを変更しない。preview中はfocusをdialog内へ保ち、背景操作とkeyboard Undo / Redoで準備済み状態を古くしない。取り込み確定は1回のUndoで全体が戻る。
- 既存の署名検査・25MiB / 4096px上限・batch件数上限を維持し、失敗入力をquarantineへ記録する。
- 連番 / sheet分割結果のframe / animationが保存・reload・flip・atlas出力後も意味を保つ。
- tileset / 自形式atlasの意味上roundtripでframes / animations / origin / anchors / colliders / tile / effect設定とframe pixelが一致する。元編集構造・raw JSON・内部IDの完全一致は要求しない。
- SVGでscript / 外部URLを実行しない。GIF / APNG decode不可環境では先頭frame + loss warningになる。unsupported形式は理由付きで明示拒否される。
- Desktop / touch context / iPhone SE級viewportで取り込みpreview・warning・確定・Undo・reloadへ到達できる。
- 各slice: lint、format、build、unit、該当E2E、GitHub Actionsが全成功する。

## 6. 安全境界

契約監査PR #124ではdocs以外を変更しなかった。後続実装の原則は次のとおりだが、source原本保持との矛盾を解消するため、2026-07-21の人間承認とADR-0019に限りAsset schema / version / migrationを独立した契約補正PRで変更する。

- Project schema / version / migration。AssetはADR-0019のsource MIME追加と0.1.0→0.2.0 migrationだけを例外とし、それ以外の構造を変更しない
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

- 契約監査PR #124: docs-only。内容確認のみ（コード用testは不要）。
- ADR-0019契約補正PR: Asset migration、source MIME、保存・復旧fixture、実ブラウザーdecode E2Eを含め、lint / format / build / unit / E2E + CIを必須とする。
- Slice A: fixture追加 + `npm run test`。
- Slice B以降: lint / format / build / unit / E2E + CI。schema・保存への影響はcompatibility reviewと人間確認。

## 8. acceptance記録

推奨組み合わせ: **G1 + L1 + Q1 + P1 + F1 + A1 + W1 + S1**

- 状態: **accepted**
- accepted日: 2026-07-19（ユーザー承認）
- 実装review条件: 各slice Draft PR → CI → 独立Opus review → 人間確認。A→B→C→D→Eの直列順。各sliceは前sliceのmerge後に最新mainからbranchを作る。
- Slice AはPR #125、Slice BはPR #126、Slice CはPR #127とrepair PR #128、Slice DはPR #129、Slice D closeoutはPR #133でmainへmerge済み。Slice EはADR-0019のsource契約補正PRを先行し、そのmerge後にUI / decode実装PRを直列で進める。各sliceはDraft PR → CI → 独立review → 人間確認の順を維持し、独立Opus reviewの証拠が得られるまではOpus review工程を完了扱いにしない。
