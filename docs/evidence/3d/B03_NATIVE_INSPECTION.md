# B03 nativeモデルのカメラ・観察表示

対象: PR #299 merge後の main `9ab2f19bdea00b38edd60112be03c3824326a6f1`。既存の[限定採用](B03_NATIVE_VIEWPORT.md)を引き継ぐ。新しいpackage・loader・decoder・保存schemaを導入しない。

## 要件と今回の受入範囲

169件全体の[対応表](../../THREE_D_PLAN_TRACEABILITY_2026-10-03.md)のB03/M06/M13/M14を拡張する。

| 要件 | この工程の契約 | 対象と検査 | 残条件 |
| --- | --- | --- | --- |
| VIEW-01 | 正面/右側面/上面、canonical IDリストから部分木へのfocus、位置/注視点/画面上方向/画角/平行投影高さの数値設定。既存orbit/pan/zoom/resetと併用 | `NativeInspectionControls.tsx`、`renderPort.ts`、`renderer.ts`。数値とportrait fitのunit、keyboard/IMEと実PNGのbrowser検査 | GLB由来モデル、iPhone実機・確定profileの極端なsceneは未確認 |
| VIEW-02 | 透視/平行投影、grid/axes/全体boundsを表示専用資源として切替 | model boundsからhelperを除外、正本不変、projection変更/resize/再構築のunitとbrowser検査 | groundの独立表示と編集gizmoは未実装。要件全体は部分完了 |
| VIEW-03 | material/solid/wireframe、背景2種、照明2種。派生materialだけを変更 | source materialとrevision不変、設定変更のPNG差、休止前後PNG一致 | texture/skin/animation非対応のnative subset。輸入素材の観察は別gate |
| VIEW-04 | 静止モデルの観察modeと選択対象を明記 | phone対応のlabel・対象ID・誤認防止文言 | edit/pose/animation modeと対象切替はB04以降 |
| VIEW-05/06 | 既存保存/復旧に届き、PNGに含む背景・補助線を明示 | 保存revision不変、backup系回帰、44px、375px横overflowなし | thumbnail管理や本出力は別工程 |

VIEW-01/02/03のfixtureはF01/F02/F11/F12のうち自作native mesh・別entry・小画面に限定する。T04/T05/T07に相当するresource、camera/表示操作、keyboard/touch用UIを検査する。AC-01/02/09全体や、B03の安全な取込縦経路を完了と呼ばない。

## 不変条件

- camera、選択、補助表示は一時的な観察状態。作品のrevision、Undo、mesh/material値、backup正本を変更しない。再読込や新しいprojectは初期表示へ戻す
- 数値は下書きと適用を分ける。現在値の読取ボタンを設け、ドラッグ後の古い下書きを現在値と誤認させない。空欄/非有限/同一点/不成立projectionは適用前に拒否し、既存表示を保持する。IME変換中に適用しない
- projection切替のcontrols、helper geometry/material、派生materialには所有者を一つ置く。pause/context loss後も同一projectのcamera/viewを復元し、disposeで破棄する
- helperは表示sceneだけに置き、focus/fitのmodel boundsに含めない。PNGには表示中のhelperを含むのでUIで明記し、チェックを外して除外できる
- top/2DへThreeや追加3D UIを読み込ませない。3D lazy chunkのoffline復旧経路を維持する

## 検査記録

初回ローカル検査は1196 unit tests（renderer67件）、lint、整形、型、app/H3/評価entry build、CI分類7件が成功。hub/2Dのbuild graphに追加3D moduleが入らないこと、文書の相対リンクを確認した。

独立レビューでは、real OrbitControlsを使った非GPUの小さな再現から次の問題を検出した。初回mock検査の成功だけでは実camera操作の整合を証明できなかったため、修正と回帰を追加する。

| ID | 問題と証拠 | 是正 |
| --- | --- | --- |
| INS-01 | 上面preset後のpointer orbit→休止復帰でupが-ZからYへ変わり、同じモデル点の投影が変わる | screen-upをcamera契約/数値下書きに保持。復帰・focus・再構築は維持し、preset/resetは明示的に選ぶ。非有限/ゼロ/平行のupを適用前に拒否 |
| INS-02 | 上面からkeyboard左回転が約0.00573度しか動かず、pointerの15度操作と不整合 | OrbitControlsと同じup→Y座標変換で球面回転して戻し、upを保持 |
| INS-03 | upの平行判定が実Controlsのpole近傍1e-6radを拒否し、通常のpointer操作後の復帰に失敗する | squared-sineとpan基準軸の閾値を実Controlsより十分小さくし、exact parallel拒否を維持。keyboardも同じmakeSafe極角制約を使用 |
| INS-04 | 極小だが有限の画角は適用できても、reset時fitの失敗を通知せず復旧できない | 通常の画角は維持し、reset-fit失敗時だけ45度へ復旧。再失敗や全体fit失敗はUIへ説明 |

是正後はreal OrbitControlsとpointer eventを使う非GPU回帰、pole近傍、極端な画角からのresetを追加し、renderer85件が成功した。全体検査の最終件数はPRへ記録する。両投影で上面→pointer回転後の数値再適用・休止・context復帰・同project再構築を検査し、keyboard4方向を実Controlsの15度回転と照合した。最終head・CI・実画像はPR本文へ記録する。未実行の実機・GPUメモリをunitのpassで代替しない。

## 既存境界と戻し方

旧GLB資源レビューの不明な停止対象は再実行・別経路での再評価を行わない。この工程は採用済みnative正本の表示だけを変更する。G03の未検証GLB/decoder/skin/clip/exportは保留を維持する。

問題時は当該adapter/UIの変更を作業branchで戻す。保存DB/正本schemaの移行・破壊的操作は不要。表示失敗時は既存の軽量shellで保存・backupを行える。公開はユーザーのmerge後の既存Pages運用に従う。


## Browser受入の読取方法の是正

最初のPR head `0f68d5ded87948246d1a1dd695f6ba7c19b70813` のCIでは、context復帰前後のPNG完全一致を通過した後、座標の約2e-15mの丸め差をobject全体の厳密一致が拒否した。位置/注視点だけ12桁小数精度で比較し、PNGとprojection等の設定は厳密一致を維持する。

別caseでは、アクセシビリティsnapshot上に正しい名前と2つのoptionを持つcomboboxがある一方、内包label全文へのexact検索がoptionを取得できなかった。selectをrole=comboboxと正確なaccessible nameで検索する。製品code・待機時間・復旧/保存/画像/小画面の受入条件を変更しない。
