# 0016-import-optional-format-classification

ステータス: accepted
上位文書: `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`（§4.1 取り込み形式）、`docs/future/2D_2_IMPORT_PLAN.md`（§4 F、G1+L1+Q1+P1+F1+A1+W1+S1 accepted 2026-07-19）
関連 fixture: `src/core/images/importOptionalContract.fixtures.test.ts`（ADR-0016）

---

## 文脈

2D 完成ロードマップの `2D-2-IMPORT-OPTIONAL` は判断必須 work package であり、SVG / GIF / APNG / Aseprite / PSD / OpenRaster / Krita を `editable-import` / `rasterized-import` / `reference-only` / `unsupported` のどれにするかを ADR で決めるまで実装を開始しない（ROADMAP §6.5）。互換 matrix §4.1 はこれらを「将来候補」「調査・設計前」とし、製品仕様 §5.2 は「SVG は任意コードとして実行せず、安全な画像またはベクター情報として扱う」「外部制作形式は、完全に再編集できる形式、画像として取り込む形式、元ファイルを保存して参照する形式を区別する」ことを求めている。

ユーザー向け通常取り込みは PNG / JPEG / WebP の 3 形式のみで、宣言 MIME type の検査（`checkImportFile`）は他形式を拒否する。ADR-0019のSlice E前提補正により、保存層の実体署名検査（`detectImageMimeType` / `assertFileImageSignature`）はSVG / GIFを識別し、APNG宣言をPNGコンテナとして扱えるようになった。画像 decode は browser 標準 API のみで、外部 library への依存はない。

## 決定

1. **SVG = `rasterized-import`**: browser 標準の画像 decode 経由で raster 化して取り込む。SVG 内の script / 外部 URL 参照 / 任意コードは実行しない decode 方式（`<img>` 要素系の sandbox された decode）に限定する。ベクター情報を保持する `editable-import` は将来の別 ADR とする。
2. **GIF / APNG = `rasterized-import`（frame 列）**: frame 列として取り込み、既存の layers / frames / animations schema（G1）へ写像する。`ImageDecoder`（WebCodecs）が利用できる環境では全 frame を取り込み、利用できない環境では先頭 frame のみ + loss warning を表示する。動画編集の代替にはしない（互換 matrix §4.1）。
3. **Aseprite（`.aseprite` / `.ase`）= `unsupported`**: native parser は dependency 追加とライセンス・商用利用条件の評価が必要であり、現段階では理由付きで明示拒否する。AsepriteからPNG sprite sheetを書き出し、Chameleonの手動格子で取り込む手順をimport-notesとして案内する。Aseprite JSON metadataは読み込まず、Phaser / Aseprite等の外部JSONは別ADRまで対象外とする。
4. **PSD / OpenRaster（`.ora`）/ Krita（`.kra`）= `unsupported`**: 理由付きで明示拒否する。`reference-only`（原本 Blob 保存のみ）は保存容量を消費しながら編集できない状態を作り、対応していると誤解させるため採用しない。
5. **表示原則**: 分類は形式名だけでなく「どう扱われるか」（画像として取り込む / frame 列として取り込む / 対応していない + 理由）として UI と docs に表示する（互換 matrix §4.2）。未実装の形式・環境で decode できない場合を「対応済み」と表現しない。
6. **dependency 追加なし**: 本分類の実装（Slice E）は browser 標準 API のみで行う。外部 parser library の採用は、ライセンス・商用利用・browser 対応・bundle size の評価記録を伴う別 ADR とする。
7. **分類の変更は別 ADR**: 本 ADR の分類（`unsupported` → `editable-import` 等の昇格を含む）を変更する場合は、評価記録付きの別 ADR を経る。OpenRaster は ZIP + PNG 構造で既存の `fflate` により読める可能性があるため、`editable-import` 昇格の最有力候補として再検討条件に記録する。

## 根拠

- 現行の宣言 MIME 検査: `SUPPORTED_IMPORT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']`（`src/core/images/importImage.ts:15`）と `checkImportFile`（`:27-37`）が、他形式を「対応していないファイル形式です」の理由付きで拒否する現行実装。
- source保存層の実体署名検査: `detectImageMimeType`はPNG / JPEG / WebP / GIF87a / GIF89a / UTF-8 SVG rootを判定する。`assertFileImageSignature`は宣言と実体の不一致を`InputSafetyError`で拒否し、PNG実体と`image/apng`宣言だけを同じコンテナとして許可する（ADR-0019）。
- dependency 不使用: 画像 decode は `createImageBitmap` → `HTMLImageElement` fallback（`src/core/images/decodeImageSource.ts:14-46`）のみで、`package.json` の dependencies に画像 parser はない（`fflate` は `.casproj` ZIP 用、`ajv` は JSON Schema 検証用）。
- 受け皿 schema: `Frame`（`layerStates[]`）と `Animation`（`fps` / `loop` / `frameIds`）が既存であり（`src/core/model/animation.ts:13-41`）、GIF / APNG の frame 列は G1（既存 schema の範囲で受ける）に従い新 field なしで写像できる。
- 安全要件: 製品仕様 §5.2（SVG は任意コードとして実行しない）、互換 matrix §4.2（悪意ある SVG / JSON の拒否または隔離、対応しない内容の取り込み前表示）。

## 影響と fixture

- 影響 docs: `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md` §4.1（状態列に本 ADR の分類を反映）、`docs/future/2D_2_IMPORT_PLAN.md`（状態行）。
- 影響実装: 本ADR自体は分類の確定のみ。ADR-0019でsource MIME / signature / Asset migrationの前提を先行実装し、rasterized-import UIとanimated decodeはSlice Eの別PRで扱う。
- fixture: `src/core/images/importOptionalContract.fixtures.test.ts` の ADR-0016 セクションで次を固定する。
  - `SUPPORTED_IMPORT_MIME_TYPES` が PNG / JPEG / WebP の 3 形式のままであること（Slice E での拡張を意図的な変更にする）。
  - `checkImportFile` が SVG / GIF / PSD / 不明形式を理由付きで拒否すること。
  - `detectImageMimeType` が SVG / GIF を識別し、APNGをPNGコンテナとして扱うこと。通常importの宣言MIME gateは別PRまで3形式を維持すること。

## 現状の制限

- APNG は PNG と同一署名のため、source TextureRef / Blobでは`image/png`へcanonical化し、元の`image/apng`宣言はprovenanceへ保持する。通常importはSlice EまでAPNGを許可せず、frame列取り込みも未実装である。
- `ImageDecoder`（WebCodecs）は2026-07-21時点でもlimited availabilityであるため、Slice Eでは機能検出と利用できない環境のfallback（先頭 frame + loss warning）を必須とする。

## 再検討条件

- OpenRaster の `editable-import` 昇格: ZIP + PNG 構造の layer 合成規則（`stack.xml` の合成モード・不透明度）と既存 layers schema の対応を検証し、評価記録付きの別 ADR で判断する。
- Aseprite native / PSD / Krita の分類変更: parser dependency の評価記録（ライセンス・商用利用・browser 対応・bundle size）付きの別 ADR で判断する。
- Phaser atlas JSON / Aseprite sprite sheet JSON など外部 JSON 形式への対応は W1（自形式 atlas roundtrip のみ初期対象）の再検討と併せて別 ADR とする。
