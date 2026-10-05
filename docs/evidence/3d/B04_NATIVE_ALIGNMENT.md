# B04 world軸で部品を整列する

## 要件・範囲

MODEL-02 MUSTの整列、EDIT-02/03/05とB04組立の部分受入。既存native 0.1.0のnode local translationだけで表す。固定基準を明示し、選択中の他の部品をworld X/Y/Zの一軸へ平行移動する。referenceの変形は変更しない。

基準は選択部品の中から利用者が指定する。原点、形の最小側・中心・最大側を選ぶ。形の範囲は子孫の描画面が参照する頂点をworldへ変換した軸範囲で、未使用vertexを含めない。meshless groupでも子の形を含む。形がない場合はbounds整列を拒否し、原点整列を選べる。centreは外接範囲の中点で、重心とは呼ばない。

同じreferenceの位置へ各選択rootを別々に合わせる。等間隔配置、grid snap、全体重心への整列ではない。共有meshは移動してもgeometry自体を編集しない。

## 正本と失敗境界

選択は2個以上・重複なし・参照有効・親子の重複なし。変更対象/祖先に影響するskin/clipは初期未対応として拒否する。新しいschema field、DB migration、dependency、importer/GLBを追加しない。

全targetを元snapshotから計算し、親のinverse linearでworld差分をlocal translationへ戻す。回転/倍率を再分解せず保持する。軸ごとの位置・非対象軸・形状保持を数値検査し、逆変換や表示精度で保持できなければ全体を拒否する。基準やgeometry/UV/normal/材質/原本bytesを変更しない。全targetが既に整列済みなら空履歴を作らない。

commandはcandidate全体を検査して一回確定する。途中失敗は元project/Undo/Redo不変。UIはproject/revision/selection確認を要求し、Undo・別編集・選択変更後に古い対象へ適用しない。IME中は実行しない。組立action button上のcomposing Enter/229は既定のbutton起動も抑止し、文字入力の変換確定は妨げない。referenceを変更した場合も再確認する。

## 受入と証拠

- domain: 全world軸/anchor、回転・不均一/負scale親、子付きgroup、面参照点のみのbounds、固定reference、全属性保持
- failure: 欠損・重複・親子重複・空bounds・skin/clip・逆変換/精度不成立・全no-opで完全不変
- history: 一回Undo/Redo、native backup再読込
- product: 375px touchで対象/基準/anchor選択、IME中不変、keyboard Enterで適用、reference固定・world最大側一致、touch Undo/Redo、no-op、3D描画、独立browser contextへのbackup復元
- 既存Chromium/WebKit/productionのnative editing受入へ追加し、CI設定は変更しない。有限の小fixtureを使用し、大容量割当はしない

結果は最終headのCI・画像・独立レビューに基づき記録する。Nodeだけでbrowser/実機合格としない。

## 互換性・戻し方・残件

schema0.1.0、保存・backup形式、2D形式は不変。操作はUndoで戻せる。UI/commandを戻しても既存形式のtranslationとして保存結果を再編集できる。

全B04、材質のemissive/alpha等の契約拡張、永続visibility/lock、rig/animation、GLB、物理iPhoneは未完。GLBの受入は別工程で確認する。

## 独立レビューによる是正

- ALIGN-01: 整列成功でpreviewが自動起動するため、E2Eの重複open操作を除き、成功後の表示を直接確認する
- ALIGN-02: 基準変更・選択解除/再選択後の再確認、組立button上のIME Enter/229の既定動作抑止を追加。通常Enterは適用できることを確認する
- ALIGN-03: 回転・非均一/負scale親の下で再整列すると丸め誤差だけのrevisionが増えた。完了/no-opへ同じcomponent別machine-roundoff判定を使用し、軸とanchorの繰返し・小さい有意変位・他軸巨大offsetを回帰。独立レビューで再整列の完全不変と薄い三角形の途中拒否が原本を保持することを再確認した

独立domain再レビューは35件の整列検査に加え、1e-30/1e-16/1e-12の有限小変位、先行targetの後で薄い面/短辺が失敗するfixtureを確認した。独立UI再レビューで修正必須事項は残っていない。最終browser/画像はこのNode証拠と別に検証する。

## 再開後のbrowser検査

PR #308の初回CI（run 37292936497、head a8981902）はbuild/unit成功、WebKitの新規整列例だけ失敗、同段階の既存20件は成功した。reportのstep記録では最初の基準selectの`getByLabel(..., exact: true)`で停止し、画面snapshotには基準のcomboboxとbox-node optionが存在していた。既存native受入と同じaccessible role/nameの`getByRole('combobox', ...)`へ、基準とanchorの2つのselect locatorを修正する。制限時間・期待値・操作・否定検査は維持し、最終headのCIで再確認する。失敗runを成功へ読み替えない。
