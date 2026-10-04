# B04 native部品組立と材質割当

実装入口: [B04計画](../../THREE_D_IMPLEMENTATION_PLAN_2026-10-03.md#b04-空から造形し材質を仕上げる)、[native造形の契約](B04_NATIVE_AUTHORING.md)。この差分はPR301のnative command・保存・数値制作基盤（`f95ca1debb87f848865cc28d02ad21ccfdbec340`）を利用する。最終base/head/treeとCIはPR本文へ記録する。

## 要件と完了境界

| 要件 | この工程 | 残る範囲 |
| --- | --- | --- |
| EDIT-04 / MODEL-02 | 複数対象のグループ化、明示world/local保持の親変更、meshなしgroup解除、原点移動、独立した反転コピー | group全体の複製、整列、gizmo/snapなど |
| MAT-01 | 未割当材質の新規作成・複製、全mesh/選択面への割当、既存factor編集 | emissive、alpha mode/cutoff、double-sided、texture |
| EDIT-05/06 / SAVE | 一操作Undo/Redo、candidate失敗の原子性、ID/属性/階層の保存と独立backup復元 | drag/brush入力、既存crash後pin整理 |
| UX / VIEW | 複数選択list、target/revisionに結び付く確認、375px入力、明示的なエラー | 実機iPhone、scene pickingとの選択同期 |

native 0.1.0のschema/version、既存2D形式、旧ZIP、Web/PixiJS/Phaser出力、依存packageを変更しない。材質だけの準備ではGPU表示を新たに起動しない。GLB/texture/rig/animation・旧停止レビューはこの工程の対象外。B04全体や3D製品全体を完成扱いしない。

## 階層とworld姿勢

- group/reparentは親と子孫の同時選択、重複ID、欠落ID、循環を拒否する。選択する新しい親を明示する
- keep-worldは操作前world行列を保持し、新親worldの逆行列からlocalを計算する。keep-localはlocal TRSを保持するため、見た目が変わり得るとUIへ表示する
- localは既存のtranslation/quaternion/scaleで表現する。回転付き非一様scaleでshearが必要になる場合、近似へ勝手に変換せず拒否する。負scaleを含むTRSは保持可能な範囲で扱う
- 浮動小数の行列再構成比較は相対1e-10。これは演算誤差の検査で、shearを焼き込む許可や端末精度の保証ではない
- ungroupはmeshを持たないcontainerだけ。子を元groupの親へ移す際もworld/localを明示し、group自身へのrig/clip参照がある変更を拒否する
- 影響するsubtree、祖先、新親とその祖先のskin/clip参照を検査する。無関係な参照を勝手に削除しない

## 原点と鏡映

原点移動は新しいpivot fieldを保存しない。local offsetだけmesh頂点を逆方向へ移動し、nodeのtranslationをR×S×offsetで補償する。直下の子のlocal translationも補償し、全体のworld geometryを維持する。共有meshは直接変更せず、独立コピーを先に作る。

Double値が有限でも、Float32で頂点が潰れたり原点移動前と形状が変わるoffsetは拒否する。局所形状のextentを基準に検査し、原点から遠いというだけで大きな形状誤差を許さない。

mirrorは選択したleafの独立コピーを作り、指定local軸で頂点・法線を反転、面cornerの並びを反転する。corner UV/normalとmaterial割当を同じ順で対応させる。vertex/face/material IDは新しい所有へ再構成し、元のmesh/materialは変更しない。JSON backupで-0/0が不必要な差にならないよう反射後の0を正規化する。

## 材質

- 未割当材質も作品の一部として保存する。新規は表示中のfactorを使うと明記し、複製は選択材質の保存値を使うと区別する
- 既存factorの変更前はtarget IDとrevisionに合う現在値の再読を要求する
- 割当は指定face IDだけ、または明示したmesh全faceだけを更新する。UV/normal/skin/source bytesは変更しない
- mesh共有時は一部instanceだけのつもりで全instanceへ割り当てないよう拒否する。先に部品を独立コピーする
- 共有materialのfactor編集は影響node名/IDを表示し、材質複製経路を維持する

## UIと資源

組立一覧は外側の閉じたdetailsにまとめ、作品を開くだけで全nodeの長いID一覧がcanvasを下へ押し出さない。region/headingは常に読める。IDは省略した値で照合せず、native selectは短いlabel、完全名/IDは折返して別表示する。

確認済みtargetとrevisionを候補にも照合し、rapid repeat・Undo・対象変更後に古い選択へ適用しない。IME中の適用を止め、失敗時はdraft/選択/正本を保持する。制作・組立・viewportの兄弟React keyはそれぞれ所有prefixを付ける。

## 検査と画像証拠

単体: cross-parent group、world/local、負scale、shear/cycle拒否、原点と子のworld姿勢、Float32の形状保持、mirror winding/UV/normal/material独立、skin/clip拒否、Undo/Redoとbackup。材質作成・コピー・面割当は独立回帰を追加する。

Browser: 空projectで未割当材質を準備（GPU未起動）→box/cone→移動→group→group変形→keep-world親変更→ungroup→原点移動→mirror→全face/単一face材質割当→Undo/Redo→保存→独立context復元。実際のbackupからworld頂点と属性を検査し、375px横幅、canvas PNGと画面PNGを保存する。

通常の本番CIで生成したnative PNGを `native-production-visuals` artifactへ分離する。大きなHTML report全体とは別に画像だけを取得できるようにし、権限・secret・公開先・保存期間を増やさない。既存の全回帰と変更分類を維持する。未確認の画像や実機を成功と記載しない。

最終headの検査・独立レビュー所見・目視結果はPR本文へ記録する。異常時はcommandをUndo、失敗candidateは未commit、表示不能でも既存backup経路を保持する。保存migrationや作品の自動削除は不要。

## 独立レビューの是正

| ID | 再現した問題 | 是正と検査 |
| --- | --- | --- |
| ASM-01 | 幅0.001・高さ1000のboxをXへ100000の原点移動すると、最大extent基準ではXのFloat32潰れを許容した | 軸ごとの変位誤差、faceの辺ベクトル、三角面の面積/向きを検査。薄いaxis・広いbounds内の細い三角形・off-center形状を拒否し、通常の平面の面外移動は維持 |
| ASM-02 | 大きいworld Xがtranslation列全体の許容誤差を広げ、keep-world親変更やmeshless group原点移動で小さいYを失えた | translationは成分ごとに比較。X=1e8、Y=0.001の保持失敗を、別軸の大きさで許さない。hierarchyとpivotの双方で失敗時の全体不変を確認 |
| ASM-03 | assembly以外の古いrender handlerはUIのreadinessだけに依存していた | 共通sessionに描画時id/revisionを渡し、candidateを変更する前に照合。遅延操作ではmutation callbackを呼ばず、正本/履歴を保持 |

修正後、独立した読取レビューで有限・小さい自作fixtureの再現をやり直し、全て拒否と原本不変を確認した。scene34・material4・session13の関連51件が成功。最終headの全体検査とbrowser/画像は別に確認する。

## 本番WebKitの引継ぎ入力

head `8f36be34` で先行native受入、Chromium全回帰、WebKit全回帰は成功した。本番受入は新制作を含む33件が成功し、既存の2タブ引継ぎ1件で新所有者名が元の名前のままという失敗が出た。一覧更新はsessionを読み替えないため、入力が新sessionへ到達する時点を重点確認する。

session切替後の見出しfocusはpassive effectだった。編集欄が操作可能になってから遅れてfocusを奪う可能性を除くため、paint前のlayout effectへ移す。旧失敗の原因がこれだけだったとは断定せず、入力直後のvalue/focus/readOnly/disabled/visibilityを検査ログへ出し、保存前後にも名前を確認する。既存の競合・コピー救出・最終所有者名のassertionは維持する。

生成済みnative PNGは、別の本番caseが失敗しても保存する。専用artifactをalwaysへ変更し、画像がない場合のerror判定・保存期間・権限は維持する。取得不能な既存URLへ別経路で接続する変更ではない。

同じ失敗を長い全回帰の末尾まで待たないよう、本番WebKitの引継ぎcaseを区切りCIの先頭側でも実行する。全Chromium/WebKit・本番・H3/Pagesは維持する。入力DOMだけでなく正本から表示するheadingと、保存済みrevision 1も確認する。

## 実画像のfixture整理

head `2fe7da2e` は先行WebKit8件、引継ぎ1件、Chromium309件、WebKit122件、本番34件、H3とPages開閉が成功した。専用画像artifactは6,187,600 bytesで取得でき、両engineのPNGと375pxの入力表示を確認した。

組立fixtureでは元boxと反転コピーが同じ面を重ねており、Chromiumでdepth競合の縞が出ていた。独立コピーを数値操作で離して配置し、元部品のworld位置不変も検査する。rendererのdepth判定は変更しない。球・円錐の表示fixtureは最低分割の多面体から分割数4へ変更し、形の区別を見やすくする。最低分割のgeometry検査はunitに維持する。最終headで画像と全回帰を再確認する。
