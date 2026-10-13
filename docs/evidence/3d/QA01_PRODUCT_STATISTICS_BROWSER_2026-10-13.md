# QA-01 product statistics — 2026-10-13 JST

**状態: 固定fixtureによる本番preview製品E2E。QA-01全体の受入合格ではない。**

## 対象

- E2E source commit: `6de520027f95ad8aa190a299bbeae7f1b21bfae9`
- Test: `e2e/native-quality-product.spec.ts` — `QA-01 product statistics distinguish shared geometry, instances and unknown measurements`
- Production previewの製品UIで `.cas3dproj` のcopy restore、品質検査worker、画面上の統計表示を連結して検証。
- 元fixtureの同じ8頂点・12三角形meshを、保存TRSが異なる2 nodeから共有。別に2×2 RGBA PNG、2 joints、2 clips（うち1つは非empty）を用意。
- 復元後backupを独立に読み、mesh数、頂点・face数、mesh参照instance数、textureの元bytesを照合してから、製品UIの統計欄と期待値を比較。

## 結果

| 表示項目 | 期待値 / 検査内容 |
| --- | --- |
| `vertices` / `triangleFaces` | 8 / 12。mesh-local geometryは1回だけ計上 |
| `materialGroups` | 1。GLB primitive数とは同一視しない |
| `meshInstances` / `instanceTriangleFaces` | 2 / 24。2 instanceの参照面数は別欄 |
| `materials` / `textures` | 1 / 1 |
| `joints` / `clips` / `nonemptyClips` | 2 / 2 / 1 |
| `bounds` | 保存TRSによるworld-space AABB: min `[-0.5,-0.5,-0.5]`, max `[2.5,0.5,0.5]`, size `[3,1,1]` |
| `decodedPixels` | `4`。PNG画像ヘッダーの2×2寸法からの値 |
| `retainedBlobBytes` / `projectJsonBytes` | 復元したPNG byte length / 復元ProjectのUTF-8 JSON byte lengthと一致 |
| `exportedGlbBytes` / `gpuMemoryBytes` | 未計測としてunknownの説明を表示。0とは報告しない |

## 実行

- 対象ケースをChromiumとPlaywright `webkit-critical` で各3回: **6/6 passed**。
- `native-quality-product.spec.ts` 全体を両browserで実行: **14/14 passed**。
- `npm test -- --reporter=dot`（検査着手時の親HEAD `9949fb30232c041422be718640352953794bbf1b`）: 186 files / **3,553 tests passed**。
- 対象E2EのPrettier check、ESLint、`git diff --check` passed。Production previewでapp + independent consumer build passed。既存のVite `>500 kB` chunk advisoryあり。
- Remote CIは確認していない。

## 未完了境界

- `decodedPixels` は実画素decode結果ではなく画像ヘッダー寸法の合計。画面にもdecode成功を保証しない旨が表示される。実decoder・実描画に基づくpixel計測は未検証。
- 統計に専用のglTF `primitives` 値はなく、本検査の `materialGroups` をprimitive countへ読み替えない。
- 最終GLB出力byte数、実GPU memory/driver、外部engineでの実描画、実端末・支援技術、real-world asset範囲は未検証。
- よって今回の対象はQA-01の製品表示subsetに限る。QA-01はpartialを維持し、リリース受入・物理受入の代替にはしない。
