# R05候補版の一括確認素材

状態: D3は2026-10-02の利用者指示で採用済み。PR #290の品質修正を含む最終候補の物理iPhone Safari・公開版の結果は未確認。
計画書§10の一括実機確認と[R06手順](R06_RELEASE_QUALITY.md)へ合わせて使う。

## 用意したファイル

| 出力倍率 | 編集用バックアップ | 参考ZIP | 元キャンバス |
| --- | --- | --- | --- |
| 1倍 | [r05-1x.casproj](../public/release-fixtures/r05-1x.casproj) | [r05-1x.zip](../public/release-fixtures/r05-1x.zip) | 1062×1062 |
| 2倍 | [r05-2x.casproj](../public/release-fixtures/r05-2x.casproj) | [r05-2x.zip](../public/release-fixtures/r05-2x.zip) | 537×537 |
| 3倍 | [r05-3x.casproj](../public/release-fixtures/r05-3x.casproj) | [r05-3x.zip](../public/release-fixtures/r05-3x.zip) | 362×362 |

自作の単色・透明画像で、外部の作品は含まない。製品画面で設定を保存し、.casprojと新版ZIPをダウンロードして作成した。
画像サイズは各倍率で透明余白除去後1050×1050となる。2素材・各3コマがそれぞれ3ページへ分かれる。
参考ZIPは初回RAFでdelta=0とする修正後の見本・helperを含む。3倍率とも現行runtimeとの一致を自動確認する。
各ZIPの全エントリをそのまま公開用ディレクトリにも配置し、ZIPとのバイト一致を検査する。
PR #290のmerge・Pages更新後は、iPhoneから[HTTPSの確認素材一覧](https://chameleonjp-lab.github.io/chameleonassetstudio/release-fixtures/index.html)へ直接アクセスできる。
一覧からバックアップ・ZIPをダウンロードし、3倍率それぞれのCanvas 2D / PixiJS / Phaser見本を開ける。
ファイル・manifest・ページ・runtimeのhashは[確認素材の記録](evidence/r05-field-kit-2026-10-02.json)へ保存した。
大きい1倍用素材を2倍・3倍で出すと2048pxページ上限を超える。対応する倍率の素材を使う。

## 一続きの確認

1. 最終候補版のURL・表示commit、iPhone 17 ProのOS/Safari、日時と縦横を記録する。
2. ホームの「.casprojを読み込む」で1倍用バックアップを取り込み、「Rich engine integration 1x」を開く。2素材を区別して選べることを確認する。
3. 1コマだけ描き直し、他のコマを確認する。Undo/Redo、前後表示、再生・停止、Safariを閉じて再開を行う。
4. .casprojを「ファイル」へ保存し、別コピーとして再取込する。新版設定の通常Web・透明余白除去・対応倍率・画像間余白2pxが復元されることを確認する。
5. 両素材を選び、新版ZIPを出す。通常Web、PixiJS、Phaserの利用先を切り替える。取消後に遅れてダウンロードしないことも確認する。
6. 2倍・3倍用バックアップで同じ受取を確認する。縦横、キーボード、文字拡大、VoiceOverで主要操作を確認する。失敗した経路だけを再確認する。

再取込ではAsset IDを付け替えるため、ZIPのhashは変わる。次の画素・時間・ゲーム情報を一致条件にする。

## 受取で期待する結果

- 1番目の素材は赤→緑→青→赤、2番目は黄→緑→青→黄。表示時間は100/200/300/100ms、loopは700ms周期、onceは最後の色を保持して停止する。
- 同じFrame IDの反復でもeventを受け取る。payloadの文字列がコードとして実行されることはない。
- 各素材のPNGは3ページ。透明部分は透明で、全倍率の色面は1050×1050。
- ワールド原点を(20,30)にすると、色面の左上は(20−2×倍率, 30−2×倍率)、アンカーは(20＋3×倍率, 30＋3×倍率)。
- 緑コマの判定は非表示指定を保持し、矩形は(20＋6×倍率, 30＋6×倍率)、大きさ12×13に倍率を掛けた値。他コマは(20＋2×倍率, 30＋2×倍率)、大きさ8×9に倍率を掛けた値。

自分で出したZIPは展開してHTTPSで配信し、`examples/canvas2d.html`、`examples/pixijs.html`、`examples/phaser.html`を開く。
画像のSHA-256照合はWebCryptoを使うため、iPhoneからLANの平文HTTPで開く方法では動作しない。端末が信頼する証明書のHTTPSを使う。
PC上だけで確認する場合は展開先で`npx serve .`を実行し、そのPCの`http://localhost:3000`（実際に表示されたポート）を開く。
上のHTTPS一覧は同梱する参考ZIPの受取確認用であり、実機で新たに出したZIPの確認結果を代用しない。
PixiJS 8.12.0・Phaser 4.2.0の見本はCDN取得のため通信が必要。`file://`ではfetchできない。

実ゲームの比較には`helpers/`のadapterを使い、上記ワールド原点を渡す。
見本HTMLは元キャンバスをそのまま見せるため、表示の原点は元素材の原点を使う。[受取API](D3_BROWSER_RUNTIME.md)を参照。
確認結果は成功・失敗・未確認で記録し、自動WebKitの成功を物理Safariの成功へ置き換えない。
