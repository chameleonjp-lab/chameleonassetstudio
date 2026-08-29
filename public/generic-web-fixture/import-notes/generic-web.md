# Generic Web v1 import notes

1. HTTP server経由でこのfixtureの `index.html` を開く。
2. `package-manifest.json` から `manifest.json`、2ページのSVG、sidecarを読み込む。
3. `manifest.json` の `contentOffset` と `scale` を使ってCanvas 2Dへ描画する。
4. 本番利用では、このfixtureのprofile・座標系・出力範囲を自分の実行環境で再確認する。

このfixtureの成功は、PixiJS、Phaser、Unity、Godot、RPG Maker MZや物理iPhone Safariの互換性を意味しません。
