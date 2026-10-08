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

## 2026-10-08 補足: native色調入力の刻み判定

基準mainは `a2c7b9175ce1c38de6adffb88bf84dcca0e74e28`。既存 `nativeImage.ts` の `validateSettings` は有限値を確認し、RGB倍率を0〜4、明るさを-1〜1、彩度を0〜2に制限する。この契約を保ち、`NativeTexturePanel.tsx` のRGB倍率・明るさ・彩度の数値入力を `step="any"` にする。最小値・最大値は残し、入力値を丸めない。

既存 `e2e/native-texture-product.spec.ts` の320px、375px、375px・200%文字の入力検査に、5項目それぞれの `checkValidity()` と `validity.stepMismatch` の確認を追加する。既存の0.25 / 1.5 / 1.25、明るさ-0.25、彩度1.25の保存値、Tab/Enter、44px領域、画面画像、適用前の正本不変、1 revision、原画像bytes、Undo/Redoの受入を保つ。空欄およびRGB・明るさ・彩度の範囲外値では、正本・revision・履歴・原画像bytesが変わらないことを確認する。

この追補は旧「別の入力仕様課題」という記録に対する後続実装であり、旧本文はその時点の記録として残す。codec、schema、保存形式、CI設定、画像処理は変更しない。物理iPhone、実機keyboard、pinch zoomは従来どおり未確認。
