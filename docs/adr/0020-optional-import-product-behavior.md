# 0020-optional-import-product-behavior

ステータス: accepted（2026-07-21 人間承認、1A + 2A + 3A）
上位文書: `docs/future/2D_2_IMPORT_PLAN.md`（Slice E）、`docs/adr/0016-import-optional-format-classification.md`、`docs/adr/0019-optional-source-mime-and-asset-0.2.0.md`
関連 fixture: `src/core/images/imageInputSafety.test.ts`、`src/core/images/decodeAnimatedImage.test.ts`、`src/core/images/importOptionalImage.test.ts`、`e2e/import-optional.spec.ts`

---

## 文脈

ADR-0016はSVG / GIF / APNGを`rasterized-import`、Aseprite / PSD / OpenRaster / Kritaを`unsupported`と分類した。ADR-0019とPR #135は、SVG / GIF原本を失わず保存できるAsset 0.2.0のsource契約を先に整えた。一方、製品入口、SVGの安全境界、animated画像のframe数・時間・repeat写像、`ImageDecoder`非対応時のfallbackは未確定だった。

2026-07-21に人間が1A + 2A + 3Aを承認したため、Slice E製品実装の挙動を次のとおり固定する。

## 決定

1. **新規Asset入口だけを拡張する。** file pickerとdrag & dropによる新規Asset作成でPNG / JPEG / WebP / SVG / GIF / APNGを受ける。1回に最大16 fileで、通常画像とoptional形式の混在を許可する。全fileをpreview用に準備できた場合だけ共通previewへ進み、1件でも失敗した場合はAsset / Project / Blobを1件も保存しない。既存Assetへのlayer追加、連番、Sprite Sheet、Tileset、Chameleon Atlasの画像gateはPNG / JPEG / WebPのまま維持する。Files providerがMIMEを空または`application/octet-stream`で渡した場合に限り、既知拡張子と実体signatureが一致すれば既知MIMEへ正規化する。矛盾する実体やその他の非空MIMEは従来どおり拒否する。
2. **SVGは厳格検査後にpixelへrasterizeする。** UTF-8 SVG原本bytes、SHA-256、provenanceはsourceとしてverbatim保持し、editとthumbnailだけをbrowser画像contextからraster化する。SVG DOMをlive documentへ挿入せず、sourceを書き換えたりsanitizeしたりしない。DOCTYPE、外部処理命令、script / SVG animation / CSS animation・transition / `foreignObject` / iframe / object / embed / link、rendered text・font、event handler属性、外部href / src、base URL、CSS `@import`、local fragment以外の`url()`、外部resourceを取り得るCSS画像関数、CSS escapeによる難読化を1件でも含むSVGは理由付きで取り込み前に拒否する。active構造の拒否は壊れた画像とは断定できないためquarantineへ保存しない。一方、invalid UTF-8やmalformed XMLはsignature失敗として既存quarantineへ接続する。
3. **animated形式はbounded preflightで個数・repeat・宣言寸法を確定する。** GIFはblock列をfile境界内で走査し、logical screenと各image descriptorの範囲、image descriptor件数、NETSCAPE / ANIMEXTS repeatを読む。PNGはchunk境界、IHDR canvas、各`fcTL`範囲とIENDを検査し、IDAT前の一意な8-byte `acTL`、宣言frame数、`fcTL`件数を照合する。`image/png`宣言でも`acTL`があればAPNGとして扱う。4096px上限とframe範囲をcodec起動前に検査する。frameは1〜16件だけを受け、17件以上は切り捨てず理由付き拒否し、quarantineへ保存しない。
4. **対応環境では全frameをdecodeする。** `ImageDecoder`と対象MIMEの対応を機能検出し、対応時は宣言frame数との一致を確認して全frameを順番にdecodeする。各`VideoFrame`はPNG化後すぐ閉じ、decoderも必ず閉じる。API不在、対象MIME非対応、constructorの`NotSupportedError`だけを先頭frame fallbackへ送る。対応済みdecoderがbad dataや途中失敗を返した場合は先頭だけを成功扱いにせず、decode失敗として既存quarantineへ接続する。
5. **時間は現行uniform fpsへ決定的に写像する。** 全frame durationを取得できる場合は`fps = clamp(round(frameCount * 1000 / totalDurationMs), 1, 240)`とし、元の合計時間を`Animation.durationMs`へinformational値として残す。現行の再生・export正本は引き続きfpsとframe数であり、可変duration自体は保持しない。1件でもdurationが欠ける、有限でない、または0以下なら8fpsを使い、`durationMs`を追加しない。可変時間、丸め、clamp、fallbackは確定前lossとして表示する。
6. **repeatは現行boolean loopへ保守的に写像する。** repeatなしは`loop: false`、無限repeatだけを`loop: true`、有限repeatは`loop: false`とする。有限回数は保存できないため、無限loopへ変更せずlossを表示する。対応decoderの`repetitionCount`で上書きせず、対応時・fallback時ともbounded preflightで得たrepeat分類を使う。
7. **変換lossと非対応形式を常時説明する。** SVGのvector構造、GIF / APNG固有の圧縮・metadata・disposal、可変時間、有限repeat、先頭frame fallbackは共通previewで明示し、loss / warningがあれば確認checkboxを必須にする。AsepriteはPNG Sprite Sheet、PSD / OpenRaster / KritaはPNGまたはWebPへの書き出しを代替手順として理由付き表示し、専用原本だけのreference保存は行わない。

## 根拠

- 新規Asset入口だけを拡張すれば、既存layer / sequence / sheet / tileset / atlasの意味と検証境界を変更せず、mixed batchの原子性を共通previewで維持できる。
- source原本とrasterized editを分けることで、ADR-0007、ADR-0016、ADR-0019を同時に満たせる。
- frame数をdecode前のbounded parserで制限すれば、宣言上限を超える入力へ大量の画像resourceを割り当てない。
- 現行schemaはframe単位durationと有限repeat回数を持たない。総時間からuniform fpsを決定的に導出し、失われる意味を隠さない。
- active SVGを削除して受理すると、元fileと表示結果の差やsanitize仕様を新たに正本化する。厳格拒否はその曖昧さを作らない。

## 影響と fixture

- 実装: `src/core/images/importOptionalImage.ts`、`decodeAnimatedImage.ts`、`imageInputSafety.ts`、`EditorScreen.tsx`、`ImportPreviewDialog.tsx`。
- unit: GIF / PNG bounded parser、宣言canvas・frame範囲、APNG自動判別、frame count / repeat、SVG local参照の受理とactive CSS / font / external構造の拒否、generic MIMEと拡張子・signature照合、uniform fps / duration / 8fps fallback / clamp、loop写像、入口gate分離、unsupported代替表示を固定する。
- E2E: SVG source bytes / hash / rasterize / cancel / Undo / Redo / reload、悪意あるSVGの非実行・非通信・非quarantine、malformed SVGのquarantine、GIF / APNG全frameとpixel・時間・loop、`ImageDecoder`不在fallback、codec前の巨大宣言寸法と17frame拒否、375 x 667 touch導線をChromiumで確認する。
- 影響なし: Asset / Project / export-presets / atlas / app version、JSON Schema、migration、IndexedDB version / store / index、`.casproj`配置、product export ZIP、dependencies。

## 現状の制限

- SVGのpath / shape / styleをvectorとして編集できない。外部resource、data URL、font、active contentは許可しない。
- animated画像は最大16frameで、frame単位duration、有限repeat回数、GIF / APNG metadataを保存しない。
- `ImageDecoder`非対応環境では先頭frameだけになる。source原本は保持するため、対応browserで改めて全frame取り込みできる。
- 自動E2EはChromiumであり、iPhone / iPad SafariのFiles pickerが渡すMIME、decode対応、native dialog、safe-area、memoryは実機確認を残す。

## 再検討条件

SVGのvector編集・sanitize・外部resource許可、17frame以上、frame単位duration、有限repeat回数、別animated decoder dependency、既存Assetへのoptional layer追加、unsupported形式の昇格を行う場合は、schema / version / storage / security / resource上限を監査する別ADR、独立review、人間承認を経る。
