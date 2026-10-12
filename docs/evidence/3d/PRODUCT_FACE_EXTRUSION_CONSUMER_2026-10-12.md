# 製品UIの面押出しから独立consumerまでの確認（2026-10-12）

## 目的と範囲

AC-02「基本制作」の未実証だったソフトウェア縦経路を追加確認する。既存の制作E2Eは二種類の基本形、部品編集、面押出し、Undo/Redo、backupと別context復元までを扱う一方、既存の独立consumer E2Eは単純なboxを出力するため、押出し済みの製品データが同じGLB bytesを通じてconsumerへ到達する経路が不足していた。

追加した `e2e/native-consumer.spec.ts` のE2Eは、製品UIでboxとsphereを用意し、boxの面を0.2 m押し出す。backup内で頂点が3つ、面が6つ増えたことを確認し、Undoで元meshへ戻り、Redoで押出し後meshへ戻ることを照合する。続けて材質の赤成分を0.85へ変更して保存し、`.cas3dproj` backupを別のproduct browser contextへコピー復元する。

復元contextからGLBと `game.json` を出力し、sidecarのmodel hashがGLBのSHA-256と一致すること、Khronos `gltf-validator` のエラーが0件かつ結果がnon-truncatedであることを検査する。その後、別browser contextのBabylon.js consumer（9.28.0）へ同じGLB・sidecar bytesを渡して次を照合する。

| 観点 | 検査結果 |
| --- | --- |
| runtimeの整合 | Babylon runtimeと独立position/node oracleがpass。 |
| 出力形状 | boxとsphereの双方が存在し、boxの三角形数はbackup保存meshの面数と一致。backup meshの全頂点位置がconsumer runtime geometryに存在。 |
| 材質 | consumerが返す材質に赤成分0.8超のものが存在。 |
| 通信・視覚証拠 | consumer用の外部通信なし。Babylon consumer画面のスクリーンショットをPlaywright添付として取得。 |

## ローカル検査結果

| 検査 | 結果 |
| --- | --- |
| subject commit | `1a86daccc3499f1c763569c93da5f46593461be7` |
| 追加AC-02ケース | Chromium 1/1、WebKit 1/1 成功。 |
| `e2e/native-consumer.spec.ts` | Chromium/WebKit合計26件成功。 |
| unit suite | 185 test files / 3,531 tests 成功。 |
| `npm run format:check` | 成功。 |
| `npm run lint` | exit 0、error 0。既存 `NativeViewportPanel.tsx:205` にReact Hook dependency warningが1件。 |
| `npm run build` | TypeScript検査・production build成功。既存の500 kB超chunk advisoryあり。 |

数値・JSON記録とconsumer画像はPlaywright test attachmentsに出力する。

## 限界

本記録は固定したUI-authored fixture、Chromium/WebKit、Babylon.js consumerによるソフトウェア確認であり、AC-02全体や3D release acceptanceの合格ではない。Unity/Godotのproduction runtime、物理端末、異なるGPU・端末での表示、実利用者による画像・寸法の視覚確認は未実施であり、AC-02の総合状態はpartialのままにする。

`ACCEPTANCE_STATUS_2026-10-10.md` は2026-10-10時点のsnapshotである。本記録は同表のAC-02「new consumer vertical path unrun」という記述を2026-10-12時点で補うが、overall statusを昇格させない。

本差分はE2Eとその範囲・証拠の記録だけであり、製品コード、保存形式、DB、export schema、依存関係、CI workflowは変更しない。ローカル実行結果は提出headのGitHub CIや未検証runtime gateの代替としない。
