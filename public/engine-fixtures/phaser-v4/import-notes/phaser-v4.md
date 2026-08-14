# Phaser 4.2.0 import notes

1. HTTPでこのfixtureのindex.htmlを開く。
2. manifest.jsonのpacked distribution dataと2ページの画像を読み込む。
3. fixture-local adapterがcontentOffsetをsourceSize内の配置へ使い、animation順を確認する。
4. 本番利用では対象versionと読み込み結果を再確認する。

このfixtureの成功は、Phaser標準atlas完全互換やproject自動生成を意味しません。
