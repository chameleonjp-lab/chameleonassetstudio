# B04 native造形・材質の限定実装

基準: PR300 merge `a58f99d0d522b2a074dd490c58c2405e56081e36`。そのtree `e1ba0fc08f5efd4e9b367b3c0d19d00e832d6f4d` は検査済みPR headと一致する。公開hub/2D/3Dのbuild-infoも同revision、dirty=false、HTTP200を確認した。最終実装SHA・統合CIはPR本文へ記録する。

## 範囲と採用境界

[計画B04 / DEC-03 / S02](../../THREE_D_IMPLEMENTATION_PLAN_2026-10-03.md#b04-空から造形し材質を仕上げる)のnative部分。新規依存なし。既存native 0.1.0の厳密な保存contractと採用済みThree adapterを使う。既存2D、旧ZIP、Web/PixiJS/Phaser出力、0.2出力、保存schema/versionを変更しない。

旧GLB資源レビューの具体対象不明部分は停止を維持する。GLTFLoader・入力decode・旧レビューは再試行しない。この工程のfixtureは自作の小さいnative形状で、GLB入出力・セキュリティ評価・S02全体の合格証拠ではない。

| 要件 | この工程の実装と検証対象 | 残る範囲 |
| --- | --- | --- |
| MODEL-01 | box/plane/sphere/cylinder/cone、寸法と分割数、生成前の一操作上限、corner UV/normal | FLOW-01/03全体の制作完走 |
| MODEL-02、EDIT-03/04 | local TRS、独立mesh/material複製、名前、負scaleの反転 | world切替、gizmo/snap、group/reparent/pivot、baked mirror |
| MODEL-03 | stable IDの頂点/辺/三角面選択、local差分移動、単一三角面押出し/削除 | scene pickingとの選択同期、GLB再読込 |
| MODEL-04 | flat/smoothのcorner normalを正本へ保存、Undo | 実機・全UV/skin組合せ、baked mirror評価 |
| MODEL-05 | 作成前に直接mesh化・parameter非保持を表示、複製とUndo | 持続的parameter再編集・既存parameterからの変換 |
| MAT-01 | RGBA/metallic/roughness、共有影響表示、材質複製とmeshへの割当 | emissive、alpha mode/cutoff、double-sided、新規空材質作成 |
| MAT-03 | 生成形状のcorner UV、選択面のUV数値/欠落表示 | UV図、textureとの対応画像 |
| EDIT-05/06/07、SAVE | candidate→検査→一回commit、Undo/Redo、失敗不変、既存予算/保存/backup/コピー復元 | drag/brush transaction、crash pin整理など既存未完項目 |
| UX、VIEW-04/05 | 375pxのlist/数値入力、44px、IME中不適用、削除後のstale ID拒否 | physical iPhone、touch drag/gizmo・lock |

B04全体、AC-02全体、3D製品全体の完成とは呼ばない。MAT-02/04のtexture/派生画像、rig/animation、GLB/B07・consumer/B08、実機/B09は未完。保存contractにないfieldを0.1.0へ無断追加しない。

## commandと属性契約

- 形状は全て三角面。canonicalがpolygonを許容しても現adapterはtriangle限定なので、描画できないpolygonを生成しない
- box/planeの分割は一辺ごと、曲面は四分円ごと。sphereは周方向4n・極間2n。planeはXZ・+Y、heightは未使用。範囲は `PRIMITIVE_LIMITS` をUIと生成器で共有する。一操作の工学的制約であり総メモリや端末保証ではない
- 新規生成はparametric履歴を保存せず直接editable meshを作る。既存addBoxと旧保存boxは変更せず、UV欠落を「未設定」と表示する
- 選択はcanonical ID。辺は安定endpoint pairから導出する。複数cornerが参照する同じ頂点は一回だけ移動。Undoで対象が消えた場合は選択を空表示し、別indexへ付け替えない
- 座標はlocal metre。部品回転はUIでlocal XYZ度数、正本では正規化Quaternion、負scaleは非破壊のnode反転。階層付きTRSを維持し、非表現可能なshearを黙って焼き込まない
- move/extrude/deleteはmesh全体のflat法線を再計算すると操作前に表示する。UV/materialと無関係IDを保持。別のsmooth commandはcorner normalを保存する
- 押出しは選択三角形を新capと6側面へ置換する。capに新ID、UV/materialは元faceから保持。元UVなしならcapも未設定。側面quadごとに[0,1]UV、元face material。signed距離はlocal面法線方向。選択faceの辺隣接と向きを検査し、不適合時はcommitしない
- 削除は開面/空meshを許容し、孤立vertex IDは保持する。参照破損、退化三角形、不正座標は適用前に拒否
- 複数nodeから共有されたmeshを直接変更しない。独立複製でvertex/face/material IDを再構成し元と別所有にする。skin/該当clip付き形状変更も拒否し、skin/clipを勝手に削除しない
- 材質factorは0〜1、RGBはlinear。共有材質の影響node名/IDを表示する。複製指定は選択meshの同材質面だけを新materialへ付け替える
- UI draftは保存しない。数値は明示Apply、一操作一revision。IME composition中・空欄・invalid値・readOnlyでは適用しない。preview/drag対応とは呼ばない

## 役割別レビューで見つかった設計上の制約

| 観点 | 所見 | 対応 |
| --- | --- | --- |
| 正本互換 | 0.1.0にemissive/alpha/visibility/lock/parameter/pivot fieldがない | 既存fieldに限定し、残要件を上表で明示 |
| renderer境界 | canonical polygonをadapterは拒否する | 全primitive/押出しをtriangleで作成 |
| 入力transaction | history.previewはrevision不変、viewportは同revisionの再描画を省略 | 今回は明示Applyのみ。drag previewを実装済みとしない |
| 共有データ | mesh共有やskin/clip参照へ単純な頂点変更を適用すると他対象へ波及する | 直接変更を拒否、独立複製・対象参照の検査 |
| mobile/accessibility | 長いnative optionは以前WebKitの横幅を広げた | 短い連番label＋完全名/IDを折返し表示、要素位置も数値表示 |
| 法線・UV | stored normalを移動後に保持すると見た目が古くなる | 形状変更はflat再計算を明示、UV cornerを維持 |
| 保存・復旧 | UIだけで変更すると履歴/backupへ到達しない | ProjectSession.executeAuthoring→history→既存autosave。別DB restore後に再編集を検査 |

## 受入と証拠

- core: 寸法/winding/UV seam/normal/stable IDs、非退化、失敗原子性、共有/skin/clip拒否、Undo/Redo、backup roundtrip
- integration: 保存session/readOnly/失敗revision不変、別DBへbackup復元後の編集、renderer buffer attributes/material groupの一致
- browser: 空project→plane+sphere→頂点/辺移動→face押出し/削除→Undo/Redo→smooth→材質→保存→新contextへbackup復元→再編集。原本不変、PNG、375px横幅ゼロ。空欄/IMEのrevision不変
- 最終HEADでtypes/lint/format/build/unitと既存全Chromium/WebKit/本番/H3/Pages検査。専用受入は既存native product specへ追加し、先行WebKit検査にも入る
- local Chromium socket拒否の再実行は行わず、実browser証拠は既存CI。実機/iPhone GPU memoryをCI passで代替しない

独立レビューで次の2点を是正した。browserの合否は最終CIへ記録し、未実行のpassを記載しない。

| ID | 再現した問題 | 是正・回帰 |
| --- | --- | --- |
| AUTH-01 | AのTRS/材質を読んだ後Bへ切り替えると、古いdraftをBの全factorへ適用できる。Undo後も同様 | 読取済みtarget IDとrevisionを紐付け、切替/Undo/別編集後のApplyを無効化して再読を要求。draft自体は保持。browserでswitch/Undo/Redoを確認 |
| AUTH-02 | 1e-50の倍率はdoubleで非0でもFloat32で0になる。1e-40はnormal逆行列がFloat32で無限大になる | local倍率と逆数、親子合成3×3行列とそのFloat32丸め後の逆行列をcommit前に検査。nested rotated/nonuniformで列が非0でも特異になる例、負の通常倍率、失敗不変のunitを追加 |

1283件の初回全unit、lint/format/buildは成功した。その後AUTH-01/02を是正し、関連30件を確認した。最終SHAの区切り検査件数と実画像はPR本文を正本とする。

## 戻し方

commandは既存Undoで戻せる。失敗candidateは正本に入らず、表示失敗時も保存/backup shellは残る。コードの回帰は作業branchで戻し、保存migration不要。作品の自動削除・履歴の無断消去を行わない。

## CIで見つかったpanel重複

最初のhead `eb589a6d` の先行WebKitでは、旧5caseが成功、新制作2caseが「制作パネルが2個ある」ため失敗した。新panelとviewportの兄弟elementが同じproject IDをReact keyに使っていた。role検索をfirstへ弱めず、所有別のkey prefixへ修正し、表示後の制作regionが必ず1個という回帰を追加する。初回CIのtypes/lint/format/build/unitは成功しているが、修正headでbrowserを再確認する。
