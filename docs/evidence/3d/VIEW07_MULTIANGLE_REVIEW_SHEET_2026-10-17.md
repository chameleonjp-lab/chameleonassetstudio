# VIEW-07 部分採用: 6方向レビューシート — 2026-10-17

## 調査と判断

[Charakuru](https://github.com/nanocle/Charakuru) の操作資料では、生成物をそのまま受け入れず、人が候補を見比べ、正面・側面・背面・上面などから形を確認して選ぶ段階が重視されている。AssetStudioにはすでにモデルの手動orbit、正面・右側面・上面、rest PNG、明示的なimport preview/確定がある。重複する生成・自動適用ワークフローは持ち込まず、候補選びに役立つ「同じ作品を複数方向から確認する」部分だけをVIEW-07の部分採用とした。

## 実装範囲

- 「6方向レビューシートを保存」で、現在視点・正面・右側面・背面・左側面・上面を順番に撮影し、**1440 × 960 pxのPNG一枚**に合成する。
- 既存の単一rendererを再利用し、同時viewportや第二のWebGL rendererは作らない。各画像は逐次処理し、ImageBitmapを使用直後に閉じる。出力canvasも処理終了時に解放する。
- 既存のrest PNG経路と同様に変形プレビュー中は開始しない。途中でプロジェクト/revision・表示状態・編集接続が変わった場合はシートをダウンロードしない。
- 一時的なcamera変更は終了時に元へ戻す。ページがhidden/frozenの間は復元を保留し、表示復帰後に再試行する。
- 出力はブラウザのローカルダウンロードのみ。プロジェクト本体、revision、Undo/Redo、backup、GLB/package、schema、外部サービスへは書き込まない。別の候補との比較には同じ表示設定で各候補のシートを作り、人が並べて確認する。

## 今回採用しないもの

- 二候補を同時に表示する比較viewer（同時rendererのGPU・lifecycle budgetとVIEW-08の複数viewport評価が必要）。
- turntable/自動回転、透明背景、品質設定、比較スコア、自動選択。
- AI生成、agentによる自動修正、クラウド保存、外部素材の追加。

VIEW-07全体の完了ではなく、実装状況は`implemented-candidate`、検査状態は`partial`とする。実端末・支援技術での操作、最終画像の目視受入、二候補同時比較、透明背景・品質設定の需要と資源評価は未確認または未採用。

## ライセンス・帰属

Charakuruの[LICENSE](https://github.com/nanocle/Charakuru/blob/main/LICENSE)（2026-10-07版）はMIT等ではない独自のsource-available licenseで、対象資料・コードの商用利用や再配布に条件を置いている。AssetStudioにはCharakuruのコード、文章、Skill、素材、バイナリを複製・同梱せず、依存関係も追加しない。取り入れたのは一般的な人間主導の多方向レビューという考え方だけであり、独立実装である。これは法的適合性の判断ではない。

## 検証

`src/adapters3d/three/renderer.test.ts` は正面・右・背面・左・上の方向とup-vectorを検証する。`npx vitest run --reporter=dot` は187 files・3,559 tests pass、`npm run build`（TypeScript型検査を含む）、`npm run consumer:build`、`npm run format:check`、`npm run test:ci-scope`（8/8）もpass。`npm run lint` は0 errorsだが、既存のprops同期`useLayoutEffect`に1 warningが残る。

`npm run e2e:quality -- --project=chromium e2e/native-viewport-product.spec.ts` は24/24 pass。PNG signature・1440×960寸法・ファイル名・camera復元・canonical revision不変・各方向操作・Tab順を確認する。HTML reporterに添付された代表的な箱のレビューシートを目視し、6枚のラベル・3×2配置・画像の収まりに欠落や切れがないことを確認した。対称な箱では背面と左側面の画素が一致することがあるため、その方向差は画像差でなくcamera座標で検証する。

production buildでは、app/consumerの500 KB超chunkについてViteの非致命的な警告が出る。今回依存は追加していない。WebKit、実端末・支援技術、異なる実プロジェクトでの最終画像品質、二候補同時比較は未確認または未採用で、VIEW-07全体の受入完了とはしない。
