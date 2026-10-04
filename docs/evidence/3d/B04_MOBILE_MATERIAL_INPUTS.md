# B04 材質画像の数値入力を狭幅で読む

## 範囲と依存

B04のphone数値編集、MAT-04、UX-04/05/06の部分受入。PR305の画像制作・保存契約（head e85198aa）へ依存する。B04全体、物理iPhone、browser pinch zoom、rig/animation、GLBの完成を意味しない。

375pxの実browser画像でRGB倍率の0.25が末尾まで見えない問題を確認した。3列固定の入力幅が原因だった。製品変更は `src/features/editor3d/nativeTexturePanel.css` のgain gridと数値欄のfont継承のみ。文字寸法に応じた最小幅で折返し、幅が小さい場合は一列へ移す。元の44px targetを保つ。数値欄のfont継承を共通inputの1rem指定より明確に優先し、文字拡大時にも値が拡大する。renderer、command、schema、blob、Undo、依存package、CI設定は変更しない。

## 受入

既存 `e2e/native-texture-product.spec.ts` に320px/375px通常文字、375px・200%文字拡大を追加。同じ既存Chromium/WebKit/production経路で実行する。

- 実数値0.25/1.5/1.25をkeyboard入力し、Tabで倍率→明るさ→彩度→適用へ到達
- touch対応contextで各倍率をtapし、focus、中央hit test、44px targetを確認
- 実文字幅・padding・spinner用余白がinput内へ収まることと、computed fontが2倍になることを確認。値だけのDOM検査に依存せず画像も残す
- 確定前の入力は正本を変更しない。確定は一revision、保存された派生設定に正確な小数を保持、原本bytes保持、touchでUndo/Redo
- 横溢れと操作パネル画像を確認。旧画像工程の独立backup復元・UV・取消検査も継続

200%は検査内で材質画像パネルの文字を拡大する条件であり、OS文字設定・全page browser zoom・実機keyboardの実証ではない。物理iPhone、画面keyboard、pinch zoomは未確認として残す。

## 残件と戻し方

RGB inputの既存step=0.1とcodecが受ける細かい小数の不一致は別の入力仕様課題。今回HTML validityやcodecの許容値を変更しない。MAT-01のemissive/alpha mode/cutoff/double-sided、永続visibility/lockは現保存契約にないため未実装。契約変更と互換判断を経ずに追加しない。

CSSを前のgridへ戻すだけで旧表示へ復帰できる。データmigrationや破棄はない。元版はGitの親commit、修正差分と検査結果はこのPRで保持する。

## 検査記録

独立読取レビューで固定3列によるglyph clippingと既存E2Eの値/横溢れ検査だけでは不足する点を確認した。独立再レビューでblocking issueはなく、関連lint・型・整形を確認した。最終headのCI・画像確認は実施結果をPRへ追記する。未実行を成功としない。
