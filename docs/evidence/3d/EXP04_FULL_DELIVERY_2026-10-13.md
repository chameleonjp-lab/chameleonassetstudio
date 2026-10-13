# EXP-04 full delivery browser evidence — 2026-10-13 JST

検査対象snapshotは `075459a`（PR #395 head）。この追補では製品コードを変更せず、既存のend-to-end browser caseを本番previewで実行した。

## 実行結果

| 項目 | 証拠 |
| --- | --- |
| Spec / run | `e2e/native-consumer.spec.ts` — `edited textured mixed skin and two clips survive backup, re-edit and actual independent delivery with verified sidecar metadata`。`playwright.production.config.ts`、Chromium + WebKit、各1回で2/2 pass。 |
| Product UI authoring | 3D project/boxを作成し、頂点移動、PNG baseColor textureと出典入力、Root/Tip skinning/weights、loop/non-loop二つのanimation clipsを編集して保存。 |
| Backup / re-edit | 保存済み`.cas3dproj`を別browser contextの製品画面でcopy restore。mesh/skin/PNG blob bytesがbackupと一致し、二つ目のclip keyだけを再編集できることを検査。 |
| Export validation | 再編集後のGLBと`game.json`を出力。`gltf-validator` errorsは0、sidecar `modelHash`はGLB SHA-256と一致し、clip ID/name/duration/loop metadataを照合。 |
| Independent delivery | GLB/sidecarを新しいconsumer browser contextから固定Babylon 9.28.0の独立test consumerへ渡した。GLB hash、vertex、skeleton、texture、二つのanimation clips/sample pose/playback end、外部requestなしを確認。各browserは実行時metadataとvisual artifactをPlaywrightへ添付。 |

## 残る境界

この検査は1つのproduct-authored fixture、固定2×2 PNG、固定Babylon runtime上のbrowser実行であり、多数のreal-world source model、画像形式/色管理/UV/alpha variants、別engine/版を網羅しない。consumerはrepository内の独立test entryで、第三者ソフトや物理GPU/driver/mobile deviceの受入ではない。backupを別browser contextへrestoreした検査であり、OS/process再起動後の実端末検査でもない。

台帳で「別context実UI再編集/再exportと独立consumer case未実行」としていた箇所は実行済みに更新できるが、製品全体・任意GLB・外部runtimeの受入を示すものではないためEXP-04はpartialのまま。
