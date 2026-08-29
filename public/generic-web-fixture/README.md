# Generic Web fixture

`generic-web-v1` は、特定のゲームengineに依存しないHTTP / Canvas 2Dの候補fixtureです。

- 入口: `index.html`
- package入口: `package-manifest.json`
- 確認対象: 2ページ、trim後のcontentRect / contentOffset、scale、origin、anchor、rect / circle collider、animation順
- 正本の例: `asset.json`
- `status` は `candidate`。Chromium CIの成功を、物理端末・特定engine・`verified`の根拠へ広げません。
- `mainPng` は同梱し、SVGの複数pageはtrim / 複数page確認用に使用します。`mainWebp`は任意で未同梱です。
- `package-manifest.json` は `atlas/atlas.json` と、その `atlasTexture` (`atlas/spritesheet.png`) もpackage closureとして明示します。
- `asset.json` のtextureはcanonicalな1x値、distributionのSVG pageは`scale: 2`の出力値として保持します。
- `verification/record.json` の `sourceCommit` は記録自身の自己参照を避ける入力基準commitです。CI実行headはActions artifactのrun metadataで対応付けます。

HTTP server経由で `index.html` を開いてください。`file://` 直開きではfetchが制限されます。
