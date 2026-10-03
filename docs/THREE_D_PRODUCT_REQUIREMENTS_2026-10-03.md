# Asset Studio 2D 3D 分離と 3D 制作機能の要件仕様書

版: 0.1.0 / 2026-10-03 JST  
状態: **レビュー用要件案。実装完了・ライブラリ採用・公開承認を意味しない。**  
調査基準: main `ab3fb93a94911531122fbe085e46172d1afab43d`（PR #293 後）  
対象: `chameleonjp-lab/chameleonassetstudio`

## 1. この文書で決めること

Asset Studio のトップを軽い入口とし、2D と 3D を独立した制作環境として選べるようにする。3D は利用者の操作で別タブに開く。3D では、素材を取り込んで見るだけでなく、空のプロジェクトから形を作り、材質・骨格・動きを編集し、保存・復旧・ゲーム用出力まで完走できることを目指す。

この PR は**要件仕様書のみ**を対象にする。利用者が指定した提出順は、要件仕様書の PR → 実装計画書の PR → フォルダ・ファイル階層と読取関係図の PR → 計画に基づく実装である。本書は後二者の成果物を先取りせず、それらが満たす条件を定義する。merge は人間の判断とし、本書の作成をコード実装開始や自動 merge の許可に読み替えない。

### 1.1 依頼で確定した方針と設計提案

| 区分 | 内容 | この文書での扱い |
| --- | --- | --- |
| 利用者指定 U01 | トップの下に 2D と 3D を置く | 必須 |
| 利用者指定 U02 | 両方を同時に読み込まない。3D は別タブで開く | 必須。資源分離と背景停止も含めて検証する |
| 利用者指定 U03 | 3D の超詳細要件を基に計画、図、実装へ進む | 必須。PR 順序を維持 |
| 利用者指定 U04 | ハーネス同様、構成・読取を図で管理し必要部分だけ読む | 必須。図そのものは第三 PR |
| 既存品質目標 Q01 | 制作機能・成果物・使いやすさ・信頼性・ゲーム受渡し | 継続。800 米ドルは品質比較の目安のみ |
| 本書の具体化 P01 | プリミティブ制作、限定メッシュ編集、材質、手動リグ、キー編集等 | 採用を提案する要件。利用者が個別機能を既に承認したとは記録しない |
| 技術選択 P02 | renderer、保存形式、DB、数値上限、export の詳細 | 比較・実測・契約レビュー後に確定。特定候補の採用を先取りしない |

優先度の **MUST** は「本書が受理された場合の基本完成条件」、**SHOULD** は「実用性向上の推奨」、**FUTURE** は「追加判断なしに実装へ混ぜない将来候補」を表す。MUST を実装しない場合は、理由・代替・影響を記録して要件変更をレビューする。SHOULD を未実装にする場合も、存在するかのような画面・説明を出さない。

### 1.2 既存文書との関係

- 2D の正本、保存形式、受渡しは [既存要件](REQUIREMENTS_SPECIFICATION.md)、[2D データ契約](future/2D_ASSET_DATA_CONTRACT.md)、[2D の完成工程](RELEASE_COMPLETION_PLAN_2026-10-02.md) を維持する。
- 旧 [3D 準備モード要件](future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md) と [旧 3D 完成形](future/3d/3D_COMPLETE_PRODUCT_SPEC.md) の「検品・整備だけで完成」「空からの作成を完成条件にしない」は、今回の制作方向の見直し対象である。本書受理後の 3D 製品完成判定では本書を優先する。旧文書は履歴として消さない。
- 旧 [連携・骨格・モーション仕様](future/3d/3D_INTEROP_VRM_VR_AND_CREATION_SPEC.md) の原本保持、骨格フィット、ウェイト、動作、来歴の論点を継承する。旧仕様の「完全対応」等は実装・実機証拠ではない。
- 2D Pro Gate の既存承認を取り消したり再申請したりしない。ただし [3D ライブラリ評価](future/3d/reports/3D_LIB_EVALUATION.md) は部分評価・未採用であり、2D の承認を 3D の性能合格に転用しない。
- 今回はコード・dependency・schema・保存 DB・配信設定を変更しない。以前の部分的な 3D 作業を完成済みと見なさない。実装に入る前に、その時点の main と未完作業を別途確認する。

## 2. 対象利用者と完成体験

主対象は個人〜少人数のブラウザゲーム制作者。専門 DCC の全機能をブラウザへ再実装するのではなく、小物・背景パーツ・簡単な動くキャラクターを作成・修正し、実際のゲームへ渡す流れを成立させる。PC、タブレット、スマートフォンで入口・データ保護・対応範囲の説明を共通にする。端末ごとの性能差を隠さない。

### 2.1 代表制作物

| ID | 制作物 | 必要な作業 | 完成を判断する出力 |
| --- | --- | --- | --- |
| FLOW-01 | 箱・円柱等から作る宝箱または道具 | 新規作成、部品追加、整列、材質、pivot、開閉動作 | 編集可能な保存ファイル、動作付き GLB、ゲーム用 metadata |
| FLOW-02 | シンプルな人型または関節付きキャラクター | パーツ制作または取込、骨格、bind、ウェイト、ポーズ、短い動作 | skin が動く GLB、複数 clip、再編集できる project |
| FLOW-03 | 建物または地形パーツ | 複数 object、寸法、テクスチャ、配置、anchor、collider | 見た目と寸法を保持した GLB と sidecar |
| FLOW-04 | 外部モデルの修正 | 原本取込、破損検出、向き・寸法・材質・動作修正 | 原本を保持した派生、変更後の実バイト、比較記録 |
| FLOW-05 | 2D と 3D を使い分ける制作 | 2D 作業を保存、トップから 3D 別タブ、背景停止、再開 | 2D 未保存内容の無断消去なし、両方の成果物を独立復元 |
| FLOW-06 | モバイルでの再開 | 外部保存を開く、選択・数値編集・ポーズ・保存・出力 | タッチ操作で完走した証拠、未対応操作の明示 |

FLOW-02 は「既存 clip を再生した」だけでは合格しない。利用者が骨格またはポーズを変更し、キーを作って保存し、その動きが出力先で再生される必要がある。空からの制作と外部取込の両方を検証する。

### 2.2 今回の基本完成に含めないもの

外部生成 AI、モデル重み、クラウド保存、アカウント、課金、共同編集、ランキング、サブスクリプションは必須にしない。新規有料 API・有料素材を前提にしない。WebGPU 必須化、FBX / `.blend` のブラウザ直接編集、総合 sculpt、retopology、映画品質シミュレーション、物理ボーン、完全な DCC / engine 双方向同期は FUTURE とする。未実装の高機能を「対応済み」と表示しない。

## 3. トップと 2D 3D の分離要件

### 3.1 入口と移動

| ID | 優先 | 要件 | 受入条件 |
| --- | --- | --- | --- |
| NAV-01 | MUST | トップに 2D と 3D の二つの明確な入口、用途、対応状況を表示 | 初回利用者が制作目的に合う入口を選べる。3D 準備中を完成済みと表示しない |
| NAV-02 | MUST | 3D はユーザーのクリック・タップ・キーボード操作による別 browsing context 起動 | 自動 popup なし。新タブで開く説明、実リンク、`noopener` 相当の opener 分離。ブラウザ設定による別ウィンドウ化は制御不能と扱う |
| NAV-03 | MUST | トップ・2D を開いただけでは 3D を fetch / parse / initialize しない | cold load の network と build import graph に 3D renderer / loader / decoder / worker / 大型 sample がない。modulepreload / prefetch による混入も検査 |
| NAV-04 | MUST | 3D を開いただけでは 2D editor / image worker / 全 project 素材を読み込まない | 3D entry の network と module graph に 2D editor がない。必要な小さな純関数共有は依存一覧で説明 |
| NAV-05 | MUST | 各入口へ直接アクセス・reload・戻る・進むができる | 配信 base path 下で URL が解決。トップへの復帰で project が勝手に新規化されない |
| NAV-06 | MUST | 別タブを開けない場合も作業を失わない | 同じ安全なリンクを再操作し、URL のコピーやブラウザの新規タブ操作を案内できる。無断 redirect しない。同じタブへの切替は別タブ原則の例外案として未採用 |
| NAV-07 | MUST | 連続クリックや戻る操作が高価な処理を重複開始しない | 単一 activation で複数 editor を開かない。3D 内の二重 import / 二重 save を検知。noopener の戻り値だけで popup 成否を断定しない |
| NAV-08 | MUST | 旧 2D データ・既存リンクへの配慮 | root を新トップへ変更しても、既存 project の発見・2D 入口・保存データの使用は維持。URL 移行方針と対象 URL fixture を計画 PR で固定 |

別タブは両 editor の同時初期化を避ける境界であり、ブラウザ全体のメモリ削減を自動保証しない。同じ端末で二つのタブが開けば合計資源は増え得る。OS が別プロセスへ分ける保証もない。したがって、分離だけでなく第 4 章の停止・解放・復旧を完成条件に含める。opener 分離の根拠は [HTML Standard](https://html.spec.whatwg.org/multipage/links.html#link-type-noopener) を参照。

### 3.2 既存 2D との契約

| ID | 優先 | 維持するもの | 受入条件 |
| --- | --- | --- | --- |
| COMPAT-01 | MUST | 2D の Asset / Layer / Frame / Animation の意味 | 3D 情報のためにフィールド意味・座標・時間を変更しない |
| COMPAT-02 | MUST | 旧 `.casproj`、IndexedDB、trash、snapshot、原本画像 | 既存 fixture の読込・migration・再保存・再読込が成功。3D の DB 初期化で 2D を消去しない |
| COMPAT-03 | MUST | 旧 ZIP と Web / PixiJS / Phaser の実出力 | export→consumer 読込の既存検査を維持。新入口移動だけで出力内容を変えない |
| COMPAT-04 | MUST | 既存の 0.2.0 Asset と新しい 2D 出力契約 | Project、Asset、atlas、package の version を一括変更しない。[ADR-0019](adr/0019-optional-source-mime-and-asset-0.2.0.md) と各契約の独立版を維持 |
| COMPAT-05 | MUST | 編集・履歴・復旧・モバイル品質 | 2D 回帰テストを削除・skip・期待値緩和して 3D を通さない。不具合を独立分類 |
| COMPAT-06 | MUST | 2D→3D テクスチャ受渡し | 暗黙に editor 全体を import しない。明示 export/import か小さい versioned data 境界。転送先・対象・更新方向を見せ、双方向同期を装わない |

## 4. 読み込みと資源寿命

### 4.1 観察可能な実行状態

状態名は要件上の用語であり、具体的な module 配置・状態図は第三 PR で定義する。

| 状態 | 必須の挙動 | 保存データとの関係 |
| --- | --- | --- |
| 未起動 | entry 表示のみ。renderer / scene / worker 未作成 | project 一覧には軽量 metadata のみ |
| 読込中 | 進捗・取消・失敗理由。候補データを正本から隔離 | 完了検証前に現 project を上書きしない |
| 編集中 | 変更時描画、再生中のみ連続描画、所有資源を追跡 | 編集 revision と永続化 revision を区別 |
| 背景停止 | animation / 不要な frame loop / 非必須 timer を止める | 未保存変更を保持。停止だけでは GPU 解放済みと呼ばない |
| 休止 | 復元可能な保存を確かめ、高価な表示資源を解放 | 保存失敗時に唯一の編集内容を捨てない |
| 復帰中 | renderer と必要素材を再構築し、revision 整合を確認 | camera / selection 等の復元範囲を利用者へ説明 |
| context 喪失 | 操作を安全に止め、データを守り、再構築・再試行を提示 | GPU object を永続 project と混同しない |
| 閉鎖・破棄 | job を停止、listener・URL・画像・GPU・worker を解放 | project 削除ではない。編集破棄は別の明示操作 |

| ID | 優先 | 要件と受入条件 |
| --- | --- | --- |
| LIFE-01 | MUST | 2D と 3D の renderer、scene、render loop、workers、decode cache は独立所有。片方の停止・障害で他方の保存を壊さない |
| LIFE-02 | MUST | 特定機能を開くまで optimizer、rig solver、GLB 等の重い export encoder、圧縮 decoder、sample を遅延読込。隠れた UI の mount だけで一式を読まない。最小の保存/完全 backup 救出経路は例外として編集受付前に確保 |
| LIFE-03 | MUST | `visibilitychange` 等で背景停止し、復帰時に経過時間を一気に animation へ適用しない。タブが見えることと focus の違いを扱う |
| LIFE-04 | MUST | mount/unmount、失敗、取消、model 差替え、連続再読込で同じ資源解放保証。geometry、material、texture、render target、bitmap、object URL、listener、worker を対象にする |
| LIFE-05 | MUST | shared resource は最後の所有者が解放。先に他の mesh の texture を壊さない。二重 dispose による例外と二重 loop がない |
| LIFE-06 | MUST | 非同期 job に project ID、input revision、job ID を持たせる。古い decode/export/rig 結果が新しい project に適用されない。取消後の遅延結果も解放 |
| LIFE-07 | MUST | visibility / pagehide / reload / BFCache 復帰を検証し、終了直前の callback だけを保存保証にしない。復帰時に二重 subscription / 二重 loop を作らない |
| LIFE-08 | MUST | 休止機能を利用者が選べる。自動休止の時間・条件は実測後の設定提案とし、未保存内容を失う自動破棄をしない |
| LIFE-09 | MUST | 同時 2D/3D、3D 二つのタブ、OS 中断を含む資源検査。片方を閉じる案内はできるが、無断で他タブを閉じない |
| LIFE-10 | MUST | WebGL 非対応・context 作成失敗でもトップ・project 一覧・保存済みデータの救出を可能にする。無限 reload しない |

[Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) は背景状態を知る手段であり、メモリ解放命令ではない。ブラウザによる timer 制限だけに依存しない。renderer ごとの解放方法は採用版の公式資料で確認し、実装計画に具体化する。

### 4.2 背景化と中断の処理別契約

すべて MUST。ブラウザ/OS の freeze 中は JavaScript の進捗・保存完了を保証しない。復帰時に実状態を再照合する。

| 処理 | 非表示になった時の要件 | context loss / freeze / 復帰の要件 |
| --- | --- | --- |
| animation / turntable | 停止し現在時刻を維持 | 経過した実時間をまとめて適用せず、明示再生または保存した再生状態から再開 |
| drag / gizmo / stroke | 未確定 transaction は取消し、確定済みだけ残す | pointercancel/画面回転も同じ一回の取消。復帰で突然 commit しない |
| autosave / 手動 save | 実行可能なら継続。新しい dirty revision を記録 | 中断した transaction の成否を確認し、成功未確認を saved としない |
| import / rig / optimize | 表示用処理を停止。長い計算 job は checkpoint で停止または安全取消を既定 | 復帰時に input revision と結果を照合。取消不能なら worker 終了して正本保持 |
| export | snapshot 上の処理として可能なら継続。状態を表示 | freeze で中断しても部分ファイルを正常扱いしない。download 起動は必要な user gesture を再取得 |
| file picker / OS 保存 UI | ユーザー操作を待つ | cancel と成功を区別。OS UI から戻っただけで保存済み・export 完了にしない |

実装計画で処理別の停止方法を具体化する。異なる背景動作を採用する場合は、消費資源・取消・データ保護・利用者表示をこの表と同等に満たす変更としてレビューする。

## 5. プロジェクトと編集データ

### 5.1 データの責務

| ID | 優先 | 要件 |
| --- | --- | --- |
| DATA-01 | MUST | Project、editable scene、source bytes、derived assets、UI state、runtime GPU objects を区別。renderer object をそのまま保存形式にしない |
| DATA-02 | MUST | node / mesh / material / texture / skeleton / joint / clip / anchor / collider は安定 ID で参照。名前変更・並べ替えで結び付けがずれない |
| DATA-03 | MUST | 原本はバイト列として保持。編集結果を source と呼んで上書きしない。派生には親の ID/hash、処理・設定・版を記録 |
| DATA-04 | MUST | 単位、handedness、up、forward、model/local/world space、pivot、rotation 表現を一つの契約へ固定。表示用補正と export 焼込を二重適用しない |
| DATA-05 | MUST | 保存 schema と export schema の版は独立。未知将来版は破壊せず拒否または read-only 救出。migration はコピー上で検証し成功後に置換 |
| DATA-06 | MUST | node の親循環、欠落参照、重複 ID、非有限数、不正 index、負/ゼロ scale の制約を validation で扱う。UI と import の両経路で同じ不変条件 |
| DATA-07 | MUST | 複製・削除時に参照する clip / skin / anchor / collider / material の影響を列挙。利用中の依存を黙って削除しない |
| DATA-08 | MUST | 保存 contract、型、validator、fixtures、docs を同じ変更で更新。schema を通ることと描画・動作が正しいことを区別 |

3D 専用 project 形式（従来案 `.cas3dproj` を含む）、専用 DB 名、schema 初版は**技術提案**であり本書だけでは確定しない。2D 形式へ混在させず、ライフサイクルと migration を独立管理することが必須条件である。glTF の座標・材質・animation 等の基準は [Khronos glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) を参照し、独自 project の意味を glTF へ無条件に押し込まない。

### 5.2 基本編集と Undo

| ID | 優先 | 操作 | 受入条件 |
| --- | --- | --- | --- |
| EDIT-01 | MUST | 新規、名称変更、複製、一覧、開く、保存、閉じる | 未保存/保存中/保存済み/保存失敗を区別。空 project を復元可能 |
| EDIT-02 | MUST | object 選択、複数選択、階層、表示・lock、削除 | scene と list の選択が一致。lock 対象を gizmo で変更しない |
| EDIT-03 | MUST | 移動・回転・拡縮、数値入力、local/world 切替、snap | 単位と適用空間を表示。drag と同じ結果を数値操作で作れる |
| EDIT-04 | MUST | 親子付け替え、group、複製、名称整理 | world pose 保持の有無を明示。循環を拒否。ID と参照を再構成 |
| EDIT-05 | MUST | 全ての制作変更に Undo/Redo | 一回の drag / slider / brush stroke を一 transaction。中断は commit しない。Undo→新編集で redo 分岐を説明 |
| EDIT-06 | MUST | 取り込み・重処理の適用を原子的にする | 成功した候補のみ一操作で commit。失敗・取消で編集前と等価。中途半端な mesh を正本に残さない |
| EDIT-07 | MUST | 履歴容量制御 | 大型 source bytes を毎操作コピーしない。上限到達で古い履歴を整理するなら事前に挙動を明示。保存済み原本を履歴と一緒に消さない |
| EDIT-08 | SHOULD | 検索、複数 rename、整列、grid 設定、孤立表示 | 選択に限定して可逆に適用。非表示 object への意図しない更新を検出 |

## 6. 形を作る要件

### 6.1 基本制作

| ID | 優先 | 機能と詳細 | 受入条件 |
| --- | --- | --- | --- |
| MODEL-01 | MUST | box、plane、sphere、cylinder、cone 等の基本形を追加。寸法と分割数を設定 | 空 project から複数形状を組み合わせて FLOW-01/03 を完成。過大分割を生成前に制限 |
| MODEL-02 | MUST | 部品組立、複製、mirror、整列、pivot 編集 | 左右反転後の面向き・normal を検査。pivot 操作で意図せず geometry を移動しない |
| MODEL-03 | MUST | 限定メッシュ編集として vertex / edge / face 選択、移動、face の押出し、削除 | 細部を一か所以上修正して保存・GLB 再読込。invalid topology を拒否または問題を表示。単なる object transform だけを mesh 編集と呼ばない |
| MODEL-04 | MUST | 法線再計算、flat / smooth の選択、裏面・wireframe 確認 | smoothing による見た目を比較でき、Undo で戻る。UV/skin を壊す変更を黙って適用しない |
| MODEL-05 | MUST | primitive parameter と mesh 直接編集の関係 | 非破壊 parameter 再編集が維持できない操作では、変換前に説明し複製を選べる |
| MODEL-06 | SHOULD | 押出し用 2D 輪郭、bevel、簡易 boolean、repeat 配置 | 対応範囲と失敗を明示。自己交差、極小面、非多様体で永続データを壊さない |
| MODEL-07 | SHOULD | 部品・template の保存と再利用 | 内蔵素材のライセンス、元 template、変更範囲を追跡。テンプレを利用者 project へ無断同期しない |
| MODEL-08 | FUTURE | sculpt、retopology、高度 modifier、procedural graph | 基本完成と切り離し、性能と操作性の別評価後に採否判断 |

MUST の限定メッシュ編集は「Blender 同等」を意味しない。対応外操作と適用前条件を一覧にする。ブラウザ上で安全に実現できない場合は、viewer へ黙って縮小せず、要件変更と代替制作手段をレビューする。

### 6.2 topology と付随データの基本境界

MUST の初期採用案を次に固定する。法線・UV・材質・skin の扱いを「壊さない」だけで曖昧にしない。後続で操作を拡張する場合は同じ表に追加する。

| 操作 | 未 bind mesh | bind 済み / clip 参照のある mesh | 受入の対 |
| --- | --- | --- | --- |
| vertex 移動 | UV / index / material 割当を保持し normal を再計算可能 | 初期は rest shape を変える操作として影響を明示し、skin 再検証なしの適用を拒否 | 既知の UV と材質を保持する成功 / 拒否で完全不変 |
| face 押出し | 新 vertex/face の ID、normal、UV、材質の生成規則を定義 | 初期は明示 unbind した派生コピーに対してのみ実行。元 mesh/skin/clip は保持 | 新側面の texture と export の成功 / 元 skin を変えない否定 |
| face 削除 | 開いた表面を許容し、未使用参照だけ整合整理 | 初期は上記と同じ unbind 派生経路 | 穴のある plane を許容 / out-of-range index を拒否 |
| mirror | 巻順・normal・UV 方針を固定。元と派生を分離可能 | bone/clip 参照を自動 mirror したと見なさず、未対応の同時変換は拒否 | 反転後の見た目と数値 / 他部位不変 |
| reparent / pivot / 単位補正 | local と world の適用空間、rest 時点を明示 | 全 clip の pose を保つ保証がない処理は拒否または別派生への明示 bake | 回転+非一様 scale の親、skin 子、複数 clip を使用 |

この表は non-manifold・開いた面・縮退三角形を同じ「invalid」としない。許容/警告/拒否条件を validator ごとに定義する。geometry の安全な参照整合と、物理/造形上の望ましさを区別する。MUST の制作 flow は未 bind で造形してから skin を作る経路で完走し、bind 後の制約を隠さない。

### 6.3 材質・画像

| ID | 優先 | 機能と詳細 | 受入条件 |
| --- | --- | --- | --- |
| MAT-01 | MUST | material 作成・複製・割当。baseColor、metallic、roughness、emissive の基本 factor、alpha mode/cutoff、double-sided を編集可能 | 編集値が preview と出力に反映。値域を検証し、共有 material の変更対象を事前表示。高度な material extension は追加範囲として区別 |
| MAT-02 | MUST | baseColor texture の取込・差替え・除去、UV set と transform の対応表示 | image 原本保持、色空間・上下反転を固定し fixture で比較。texture 欠落を色だけで隠さない |
| MAT-03 | MUST | primitive の既定 UV、UV preview、適用 UV の確認 | texture が貼れる形状を作成できる。未対応の UV 再構成は明示 |
| MAT-04 | MUST | baseColor の色調修正を派生画像として適用 | 2D editor 全体を同時起動しない。元画像へ戻せる。UV と他 map を意図せず変更しない |
| MAT-05 | SHOULD | normal、occlusion、metallic-roughness、emissive map、UV の簡易配置・scale・回転 | channel packing / linear と sRGB / normal convention を説明し、対象 engine の証拠で検証 |
| MAT-06 | SHOULD | 小さな texture paint・mask 編集、palette、material preset | stroke 単位 Undo、入力 cancellation、解像度上限、外部 image 未送信 |
| MAT-07 | FUTURE | 高度 UV unwrap、UDIM、procedural material、生成 texture | 未対応 map を捨てて成功表示しない。必要なら原本保存のみと区別 |

## 7. 描画と制作画面

| ID | 優先 | 要件 | 受入条件 |
| --- | --- | --- | --- |
| VIEW-01 | MUST | orbit / pan / zoom、正面・側面・上面、選択へ focus、camera reset | モデルが極小/巨大/遠方でも戻せる。数値 camera と keyboard 操作を用意 |
| VIEW-02 | MUST | perspective / orthographic、grid・axis・ground、bounds、gizmo | 補助表示は export geometry へ混入しない。model space と見た目を混同しない |
| VIEW-03 | MUST | solid / material / wireframe、light と背景 preset | light 調整で素材本体が勝手に変更されない。法線・alpha 問題を観察できる |
| VIEW-04 | MUST | edit / pose / animation 等の mode と対象を明示 | 誤 mode の操作は適用しない。現在の mode・変更対象・保存状態を見失わない |
| VIEW-05 | MUST | undo、redo、save、export、error recovery が到達可能 | 小画面でも重要操作が画面外へ消えず、viewport と panel scroll が衝突しない |
| VIEW-06 | MUST | thumbnail / 静止画 PNG の保存 | project の見た目から生成。canvas 読出し失敗を説明。editor overlay の有無を明示 |
| VIEW-07 | SHOULD | turntable、比較表示、背景透明、影品質・描画解像度設定 | 比較は必要時だけ二つ目の資源を確保。終了時に解放。比較のため常時二重 renderer にしない |
| VIEW-08 | FUTURE | photoreal path tracing、動画出力、複数 viewport | 高コスト処理として別採否。基本編集の必須条件にしない |

## 8. リグとスキニング

### 8.1 機能要件

| ID | 優先 | 機能と詳細 | 受入条件 |
| --- | --- | --- | --- |
| RIG-01 | MUST | 既存 skeleton、joint hierarchy、bind pose、skin の表示・検査 | joint index、inverse bind、重複名、欠落参照、未ウェイト vertex を検知 |
| RIG-02 | MUST | 基本 skeleton の新規作成、joint 追加・移動・親変更・名前、rest pose の設定 | 骨なしの対応モデルへ関節を設定し保存できる。親循環・ゼロ長 bone の扱いが明確 |
| RIG-03 | MUST | smooth skin の新規 bind とウェイト割当・修正。rigid part の bone 割当も別操作として提供 | 関節を動かすと複数 bone の weight に応じて mesh が変形し、出力 GLB でも再現。rigid parent だけで smooth skin の完成条件を満たさない |
| RIG-04 | MUST | ウェイトの数値確認と限定手動修正、正規化、未割当の修正 | 非有限・負値・全ゼロを検出。影響数上限を target profile で管理し、切詰めは事前表示 |
| RIG-05 | MUST | bind/rebind の明示操作、rest pose と animation pose の分離 | rebind が既存 clip や anchor へ与える影響を表示。失敗時に元へ戻り、Undo/Redo 可能 |
| RIG-06 | MUST | humanoid 等の少数 template と手動 fit | 対応する形状条件と左右・forward を示す。対象外の四足等へ人型を黙って適用しない |
| RIG-07 | SHOULD | 自動ウェイト | Worker 上で進捗・取消・quality warning。代表形状で変形品質を観察。近接パーツや薄い部位の失敗を手動修正できる |
| RIG-08 | SHOULD | bone mirror、簡易 IK、関節制限、ウェイト brush | 解けない姿勢の説明、reversible な bake。極端な scale や mirrored rig を検査 |
| RIG-09 | FUTURE | 任意形状の完全自動 rig、物理骨、筋肉、顔の高度 rig | 生成 AI や外部サービスを無断追加しない |

自動ウェイトの採否は品質・計算量を検証して決める。基本完成の逃げ道を「リグ情報を表示するだけ」にせず、手動で成立する RIG-02〜05 を MUST に置く。humanoid template が使えない入力でも、理由と外部編集の案内を出し原本を救出できる。

smooth skin の合格 fixture は一つの連続 mesh に複数 joint の混合寄与があること。全 vertex が一つの bone に 100% 追従するだけのモデルは、rigid 経路の証拠にはなるが smooth skin の証明にしない。手動 weight 変更→変形→rebind/Undo→保存再読込→GLB 再生を検証する。

### 8.2 必須の不変条件

- rest pose の編集と pose の編集は別 command。camera の変更を bone pose として保存しない。
- source / derived ごとの node ID と hash を対応付け、別モデルの node index を流用しない。
- bone の削除・rename・reparent・mesh topology 変更に対し、skin・clip・anchor の再結付けか操作拒否を明示する。
- setup の単位・向き補正を rig 作成と export で二回掛けない。変換順と bake 履歴を契約として検査する。
- 複数 mesh、複数 skin、非一様 scale、反転、未対応 morph を fixture へ含める。対応不能な組合せを正常終了扱いしない。

## 9. アニメーション制作

| ID | 優先 | 機能と詳細 | 受入条件 |
| --- | --- | --- | --- |
| ANIM-01 | MUST | clip 作成・複製・名称・削除、duration、loop、再生・停止・scrub | 複数 clip を独立保存。再生中の編集 mode と自動 key の状態を明示 |
| ANIM-02 | MUST | object と bone の translation / rotation / scale key 追加・移動・複製・削除 | 空 clip に利用者が複数 key を作成し、保存後に同じ動きを再生 |
| ANIM-03 | MUST | 時刻と補間の契約 | TRS の STEP と LINEAR を基本制作で提供。保存は明示時間単位。fps は表示/サンプリング設定と区別し、rotation の適切な quaternion 補間で不連続を防ぐ |
| ANIM-04 | MUST | timeline の zoom・選択・数値編集、先頭・末尾・指定時刻 | タッチ・keyboard で key を選んで時刻/値を変えられる。重複時刻のルールを一つに固定 |
| ANIM-05 | MUST | 非破壊 preview と変更確定 | 再生を停止した時に未確定 pose を勝手に key 化しない。scrub が Undo 履歴を埋めない |
| ANIM-06 | MUST | clip の出力・再読込・対象 runtime 再生 | GLB は key/時間/補間/対象骨格を保持。loop 等の再生方針は project/sidecar と consumer の契約で保持・実行する。clip 再生だけで制作対応完了としない |
| ANIM-07 | MUST | loop 境界・停止・背景復帰 | 大きな time jump、末尾→先頭、短い clip、ゼロ duration を検証。背景からの復帰で pose が飛ばない |
| ANIM-08 | SHOULD | idle / walk / jump 等の motion template | 適用前 preview と scale / speed / amplitude。2D の motion 型・実装を流用しない |
| ANIM-09 | SHOULD | 外部 clip 取込と retarget | source/target mapping、rest pose、root motion、左右・身長差の警告。結果を派生保存し元 clip を保持 |
| ANIM-10 | SHOULD | curve editor、CUBICSPLINE、motion blend、root motion の扱い | 補間再現性、bake の誤差、loop を数値と画面で検証 |
| ANIM-11 | FUTURE | 動画から motion 生成、AI motion、複雑な constraint graph | 外部処理と新規費用を別判断。基本作成を代替しない |

ゲーム用 event は clip 内時刻と payload のデータとして SHOULD。実行コードは保存・import しない。イベントの再生境界・再入・seek 時の発火規則は専用 contract の採用前に実装しない。2D の event と同名でも 3D の意味を無断共有しない。

glTF 2.0 の animation は、loop・再生順・自動開始等の runtime 方針を規定しない。本書の loop は GLB 単体の標準 property として保証せず、編集 project と sidecar に明記し採用 consumer で実行する。根拠: [glTF animations](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#animations)。

ANIM の fixture には空 clip、単一 key、同時刻 key、最後の key より長い編集 duration、clip 切替後の非 key 対象、quaternion の符号違いと短経路、loop seam を含める。CUBICSPLINE は採用前は「原本保持/読込不可/編集不可/明示 bake」のどれかを format profile に固定し、黙って LINEAR としない。比較時刻と姿勢/時間の許容誤差を決め、画面の見た目だけで同値としない。

## 10. ゲーム用情報と対象別受渡し

| ID | 優先 | 要件 | 受入条件 |
| --- | --- | --- | --- |
| GAME-01 | MUST | asset 種類、寸法・単位・原点・前方向 | feet / center / custom の preview。GLB と sidecar の適用順が明確 |
| GAME-02 | MUST | anchor 作成、名前、用途、transform、node/bone 追従 | モデル変更・animation・export 後にも正しい部位へ結び付く |
| GAME-03 | MUST | box / sphere / capsule collider の追加・編集・削除 | local pose、purpose、radius/height/size の意味を明示。capsule の全高/円柱部を混同しない |
| GAME-04 | MUST | metadata はゲームロジックや physics 実装ではない | collider を入れただけで全 engine で衝突するとの表示をしない。読込手順を提供 |
| GAME-05 | SHOULD | bounded な JSON custom properties、用途別 preset | 深さ・サイズ・型上限、予約キー、未対応値の警告。script 実行なし |
| GAME-06 | FUTURE | mesh collider、複雑な physics、engine plugin 同期 | engine ごとの検証と別採用判断 |

## 11. 取り込み

### 11.1 対応表

| 入力 | 優先 | 基本対応範囲 | 未対応時の扱い |
| --- | --- | --- | --- |
| GLB glTF 2.0 | MUST | 静止 geometry、PBR 基本、texture、hierarchy、skin、TRS clip の採用 subset | extension と制約を列挙。原本を維持し、変換不能を警告 |
| 3D project backup | MUST | source、editable state、設定、来歴、必要な参照を復元 | 破損・未来版は現 project を変更せず救出案内 |
| PNG / JPEG / WebP | MUST | 材質画像としての取込 | MIME と実体・寸法を検査。解凍サイズはファイルサイズと別管理 |
| glTF + bin + texture bundle | SHOULD | 利用者がまとめて選んだローカル一式 | 外部 URL を勝手に fetch しない。欠落・相対参照衝突を説明 |
| Meshopt / Draco / KTX2 | SHOULD | 採用済み decoder と target profile の組合せのみ | decoder 不足時に未対応理由。自動 CDN 読込しない |
| VRM | SHOULD | バージョン識別、利用条件表示、対応可能な読込と原本保持 | VRM 編集・再出力の完全保持を約束しない。未知拡張を黙って消さない |
| OBJ + MTL | FUTURE | 静止モデル変換候補 | skin / animation 非保持を説明 |
| FBX / `.blend` / 任意 URL | FUTURE | 直接処理は基本対象外 | 誤った MIME での強制読込なし。外部変換案内 |

### 11.2 取り込み transaction

| ID | 優先 | 要件と受入条件 |
| --- | --- | --- |
| IMP-01 | MUST | file selection→header/size 検査→staging→構造検査→必要資源 decode→preview→適用の段階を区別。段階ごとに取消・失敗・残資源を検証 |
| IMP-02 | MUST | ユーザー filename、MIME、宣言 size を信用しない。magic、GLB length/chunk、buffer/accessor/index の範囲、整数 overflow、非有限数、node depth を検査 |
| IMP-03 | MUST | ZIP 系では path traversal、絶対 path、重複正規化 path、entry 数、展開後 byte 数、圧縮比、参照循環を制限。全展開してから上限判定しない |
| IMP-04 | MUST | texture は decode 前後の dimension・pixel 数・推定 memory を検査。巨大 data URI や小さい圧縮ファイルの巨大展開を上限から除外しない |
| IMP-05 | MUST | 外部 URI、script、HTML、任意 shader、未知 extension のコードを実行しない。localhost や内部 host も含め、モデル内 URI の自動 network fetch をしない |
| IMP-06 | MUST | unsupported optional / required extension を区別。描画できても保存・再出力で保持できない内容は loss report と原本維持を示す |
| IMP-07 | MUST | error に段階、対象、原因、修正方法、再試行可能性を示す。未検証内容を「正常」としない。個人 path や生の素材を telemetry へ送らない |
| IMP-08 | MUST | project 差替え・再選択・cancel と完了の race を検証。前 project が保持され、採用されなかった candidate は解放される |

## 12. 保存と復旧

| ID | 優先 | 要件 | 受入条件 |
| --- | --- | --- | --- |
| SAVE-01 | MUST | 手動保存と autosave、dirty 状態と revision | 書込完了前に「保存済み」と言わない。quota / transaction abort 後も dirty を維持 |
| SAVE-02 | MUST | atomic snapshot と完全性確認 | source と edit state の片方だけ新しい復元状態を作らない。checksum / refs を検査 |
| SAVE-03 | MUST | project backup を外部ファイルに保存・再読込 | 元 storage、元 local path、network へアクセスできない空の環境で backup だけから編集再開。download 起動と利用者の端末保存完了を区別 |
| SAVE-04 | MUST | 自動復旧候補と最後に正常な保存を区別 | 異常終了後に時刻・revision・差を示して選択。復旧で最後の正常版を無断上書きしない |
| SAVE-05 | MUST | 同一 project の複数タブ競合 | 単一 writer lease + revision 比較等で last-write-wins 消失を防ぐ。期限切れ、crash、clock 差の扱いは設計で固定 |
| SAVE-06 | MUST | storage 不足・private mode・永続化不可 | 保存不可を早めに知らせ、download backup を案内。永続性を保証する表示はしない |
| SAVE-07 | MUST | 名前変更・複製・削除・復元 | 削除対象と依存を説明。trash の範囲・期限を表示。復元不能削除は別確認 |
| SAVE-08 | MUST | schema migration と rollback | fixture を読み、コピーを変換→検証→commit。失敗した旧 project を保持。再試行できる |
| SAVE-09 | MUST | storage の整理と cache eviction | 再生成できる cache を優先。原本・唯一の未保存変更・他 project を無断削除しない |
| SAVE-10 | SHOULD | named snapshot、export revision に戻る、差分比較 | 使用中 resource と履歴参照を正しく保持。見た目比較は必要時のみ資源確保 |

SAVE-01 の競合検査には同一タブも含む。revision A の save 開始→B へ編集→A 成功の場合、B を保存済みとしない。B が永続化された後の A の遅延応答/再試行で永続版が A へ戻らない。手動 save と autosave は直列化等の手段で整合させる。

backup と復旧候補の読込時、同じ project ID が既にあれば別 ID のコピーとして復元するか、影響と競合を説明して明示置換する。現行版や他タブを黙って巻き戻さない。backup の必要 payload は texture、geometry、skin、clip/補間、anchor/collider、来歴を含む。UI state / undo history をどこまで持ち運ぶかは明記し、保存対象外の情報を再編集保証へ含めない。

未保存編集を受け付ける状態では、最小のローカル保存と完全 backup 救出経路が新しい network fetch に依存しないことを MUST とする。救出に必要な encoder 等が未取得なら編集開始前に準備するか、安全な代替 backup 経路を既に使用可能にする。GLB 等の重いゲーム用 export はこの救出経路と分ける。cold 起動→作成→初回 backup の前に offline / 未取得 chunk の 404→完全 backup→空環境で復元を AC-13 の必須 fixture とする。起動前から offline でアプリ自体が取得不能な場合の保証とは区別する。

ブラウザ保存は永久保証ではない。容量見積りや persistent storage の利用可能性は端末で異なるため、[Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) を根拠に外部 backup を必須導線とする。タブの強制終了では最後の入力まで完全保護できると約束せず、保存間隔・未保存範囲・復旧点を表示する。

2D と 3D の DB 名・所有責務を分けても、同じ origin の保存容量が独立とは限らない。3D が容量を消費した状態の 2D autosave、2D 編集中の 3D import/backup、trash/cache/派生を含む合計容量を MUST 検査に含める。合否は常に保存できる保証ではなく、正常保存の保全、不足の事前または即時表示、他 domain の無断削除なし、network 不要の backup 救出で判断する。ブラウザ/OS の eviction、利用者による site data 削除、アプリの project 削除を区別して説明する。

## 13. 書き出し

### 13.1 成果物の区別

| 出力 | 優先 | 必須の意味 |
| --- | --- | --- |
| 編集 project backup | MUST | 制作を続けるための正本。原本、編集可能 scene、rig/clip、参照・版を保持 |
| 編集後 GLB | MUST | 実際の mesh / material / rig / animation 変更が実バイトへ反映されたゲーム用モデル |
| 3D asset ZIP | MUST | GLB、独自 game metadata、manifest/hash、制限と import notes。詳細配置は契約レビューで固定 |
| preview PNG | MUST | 見た目確認用。編集 project や geometry 出力の代用ではない |
| glTF bundle | SHOULD | target ごとの URI/texture 配置を含む開発者向け出力 |
| LOD / 圧縮 variant | SHOULD | 元と差を比較できる派生。decoder・品質低下・対象制約を表示 |

| ID | 優先 | 要件と受入条件 |
| --- | --- | --- |
| EXP-01 | MUST | export は固定 revision の snapshot から作る。export 中の編集が混入しない。開始 revision と後の編集差を表示 |
| EXP-02 | MUST | preview の wrapper transform だけを保存して「編集 GLB」と呼ばない。原点・向き・scale・geometry・材質・bone・key の意図が成果物へ反映 |
| EXP-03 | MUST | unsupported / loss report を事前提示。silent dropping なし。原本コピー、編集後モデル、metadata-only の出力を明確に区別 |
| EXP-04 | MUST | export 前後に schema・reference・hash・寸法・clip を検査。export→別 context import→再編集→再出力の round-trip fixture |
| EXP-05 | MUST | image encoding / ZIP / geometry 処理の進捗と取消。失敗・容量超過で正常 ZIP を装わず、temporary bytes / URLs を解放 |
| EXP-06 | MUST | source の権利・利用条件・申告と変換履歴を必要範囲で記録。申告を権利検証済みと表示しない |
| EXP-07 | MUST | engine 対応は format support / import notes only / runtime verified を区別。対象版、importer、fixture、clip・material の実証がない verified 表示は禁止 |
| EXP-08 | MUST | Web の採用 runtime を少なくとも一つ固定し、代表制作物を実行。Three.js / Babylon.js 候補の採用は既存評価を更新して判断 |
| EXP-09 | SHOULD | Unity / Godot / Blender 向け notes と固定版 round-trip。実 engine を未実行なら未検証。ブラウザ GLB 表示や一般ガイドだけで合格にしない |
| EXP-10 | MUST | 2D export ZIP と 3D export ZIP を混同しない。拡張子、manifest、種別を検査し誤った importer へ渡した際に安全拒否 |

画像原本と出力画像は区別する。WebP を入力として扱うことは、標準 GLB の任意環境で WebP がそのまま読めることを意味しない。基本 GLB 出力は対応 PNG/JPEG へ変換し、WebP 等の出力は採用 extension と target profile が一致する場合のみ選べる。EXIF 等の向き、色変換、alpha、画像 dimensions を固定 fixture で検査し、変換後も原本 bytes を project に保持する。alpha を保持できない出力形式への変換は警告して選択させる。根拠: [glTF images](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#images)。

基本の編集後 GLB は必要な buffer/texture を含む自己完結型とし、元ファイル位置・元 storage・network がない環境で採用 runtime が再生できることを MUST とする。GLB というコンテナ名だけで自己完結と判定せず、URI を検査する。外部参照を必要とする出力は別の bundle/profile として明示する。

game metadata は**最終出力 GLB** の revision/hash と node/joint/clip の対応を識別することを MUST とする。内部の stable ID だけで最終 GLB の index を保証せず、export の並べ替え・未使用 node 除去後に mapping を再検証する。名前だけで binding しない。GLB A + sidecar B の取り違えは拒否または明示的な不整合となり、誤った部位に anchor/collider を黙って付けない。rename/reorder/prune の fixture と組合せ違いの否定 fixture を EXP-04 に含める。具体的な mapping 保存方式は契約レビューで固定する。標準の根拠: [GLB](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification)、[indices and names](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#indices-and-names)。

## 14. 軽量化と検品

| ID | 優先 | 要件 | 受入条件 |
| --- | --- | --- | --- |
| QA-01 | MUST | vertices / triangles / primitives / materials / textures / joints / clips / decoded pixels / bounds / file bytes の把握 | 計算方法と共有 geometry の二重計数有無を明示。測れない GPU memory は 0 で埋めない |
| QA-02 | MUST | warning から対象 object・修正操作へ移動 | 何が、なぜ、ゲームにどう影響するか、どう直すかを説明。重要 warning を export で消さない |
| QA-03 | SHOULD | texture resize、未使用 data 除去、mesh 圧縮、LOD | before/after の実画像・clip・size 比較、Undo/原本復帰。派生 lineage を保つ |
| QA-04 | MUST | 自動修正による損失を事前表示 | 未使用判定が skin/clip/anchor 参照を見落とさない。強い削減を自動適用しない |
| QA-05 | MUST | 比較結果は revision に結び付く | 変更後は stale と表示。古い検品結果を現在の品質保証にしない |

## 15. 性能と端末の受入

### 15.1 数値予算の扱い

数値の最終値は現時点で未確定である。根拠のない「全端末で一定 MB / fps」を要件として断定しない。以下の項目は**実装計画で測定方法と暫定値を提案し、実装のリリース判定前に対象端末ごとに値・理由・上限動作を確定**する。数値未確定のまま性能対応済みとして出荷しない。

| ID | 測定対象 | 必須の条件と超過時動作 |
| --- | --- | --- |
| PERF-01 | トップ / 2D / 3D の初回転送・parse・初期化 | cold/warm、圧縮前後、cache 状態、module graph。不要 domain の転送は不許可 |
| PERF-02 | import 開始→検証→first visible frame | fixture bytes/hash、network 含有、decode と描画を分離。上限超過前に拒否/低負荷案内 |
| PERF-03 | 入力応答・長時間 task・frame time | selection、drag、scrub、save の各操作。平均 fps だけで stall を隠さない |
| PERF-04 | source/decoded/geometry/texture/undo/export peak | 推定値と観測値を区別。二つの tab・比較・export 複製分を含める |
| PERF-05 | job 進捗・cancel 応答 | import/rig/export/optimize。協調取消不能時の worker 終了と正本保護 |
| PERF-06 | mount/unmount・モデル交換の反復 | 回数、前後状態、resource count、cache 方針、baseline への復帰。単発成功を leak 検証としない |
| PERF-07 | archive/file/texture/topology/skin の hard limit | bytes と個数、dimension と pixel、階層深さ、joints/weights/keys を別管理。上限は一つの正本から参照 |
| PERF-08 | autosave 間隔と最悪未保存範囲 | UI に保存状態。停止/中断時だけでなく操作中に継続保存。負荷と損失窓を測る |

すべて MUST。上限を超えたときは現 project を保ち、原因と小さくする方法を表示する。品質を下げる場合は描画だけを下げたのか、成果物を変えたのかを区別する。端末に利用可能メモリを正確に知る共通 API があるとは仮定しない。

### 15.2 端末層

| 対象 | 必須の到達点 | 証拠 |
| --- | --- | --- |
| PC の採用 Chrome 系 / Safari / Firefox 対象版 | MUST 制作・保存・出力の全工程 | OS/GPU/browser/版、fixture と画面、input/回復結果 |
| iPad Safari | タッチで代表制作・rig/pose・timeline・保存・出力 | 物理端末結果。mouse mode と touch を別検証 |
| iPhone Safari | 対応 preset 内で FLOW-06、基本制作の数値経路と保存・復旧 | 実機の縦横切替、OS 中断、tab 切替、download、context loss の観測 |
| Android Chrome | touch の代表制作・保存・復旧 | 物理端末の性能・memory pressure と操作結果 |
| 3D 非対応 / 対象外端末 | トップ、説明、保存済み backup 救出 | 無限 loading / crash loop がなく 2D 利用を妨げない |

上表は対象群の要件であり、すべての端末・すべてのモデルの無制限対応ではない。具体機種・最低版・対応 preset は実測で確定する。自動 WebKit と viewport エミュレーションを物理 iPhone Safari の代用にしない。iOS の OS kill は確実な事前イベントを期待せず、正常 snapshot と外部 backup からの復元を検証する。

### 15.3 操作ごとの端末対応案

本書の基本完成における MUST の到達性は次のように提案する。端末により UI を変えても、対応 preset 内で機能を viewer へ縮小しない。低性能端末で上限を超えた場合は read-only 救出・backup を提示し、見えない geometry / skin / clip を削除しない。

| 操作 | PC | iPad | iPhone | Android phone |
| --- | --- | --- | --- | --- |
| primitive 作成・配置・材質 | 全 MUST | touch/数値で MUST | 分割画面と数値で MUST | 分割画面と数値で MUST |
| 限定 mesh 選択・移動・押出し | 全 MUST | touch/選択 list で MUST | list/数値経路で MUST | list/数値経路で MUST |
| joint 作成・fit・bind・weight 修正 | 全 MUST | touch/数値で MUST | list/数値経路で MUST | list/数値経路で MUST |
| key 作成・値/時間・clip 操作 | 全 MUST | timeline/数値で MUST | key list/数値で MUST | key list/数値で MUST |
| save/backup/復元/GLB 出力 | 全 MUST | MUST | MUST | MUST |
| SHOULD の brush/IK/curve等 | 採否別 | 採否別 | 採否別、未対応は明示 | 採否別、未対応は明示 |

狭い画面で高度な gizmo を強制せず、hover・右クリック・物理 keyboard なしで必須操作へ到達する。実測からこの表を変える必要があれば、計画に黙って縮小範囲を入れず要件変更としてレビューする。FLOW-06 は再開の代表であり、上表の新規制作検査を免除しない。

## 16. 操作性とアクセシビリティ

| ID | 優先 | 要件と受入条件 |
| --- | --- | --- |
| UX-01 | MUST | 日本語の操作名、用語の短い説明、作業 mode・選択・保存状態の一貫表示。内部例外だけを利用者へ投げない |
| UX-02 | MUST | mouse / pen / touch の入力を区別。pointer capture、pointercancel、二本指と object drag、画面回転、panel scroll を検査 |
| UX-03 | MUST | mobile の pan/zoom と object 編集は誤操作を避ける mode。全 page に touch-action none を置かず panel scroll と pinch accessibility を維持 |
| UX-04 | MUST | keyboard で主要操作、選択、transform 数値、key 編集、save/export、dialog の退出へ到達。shortcut は text input 中に誤発火しない |
| UX-05 | MUST | scene tree・properties・timeline の text 情報で canvas を補う。accessible name、focus 順、dialog 復帰、status/error 読上げ、色以外の状態表示 |
| UX-06 | MUST | reduced motion、停止できる animation、十分な contrast と target size を採用基準へ固定。zoom で重要 UI が消えない |
| UX-07 | MUST | 新タブ、削除、不可逆変換、lossy export、再bind には結果を事前説明。繰返し確認で日常編集を妨げず、重大操作だけ明確化 |
| UX-08 | MUST | loading・empty・error・unsupported・offline の各画面から次の行動が分かる。エラー後に作成・保存へ戻れる |
| UX-09 | SHOULD | 初回 tutorial と少数の自作 sample、操作 undo の説明。sample のダウンロードは明示選択後。巨大 template を起動時に読まない |

数値入力は IME composition、画面 keyboard、空文字、非数、桁あふれ、範囲外、確定/取消を検査する。IME 確定の Enter と command 確定を二重適用しない。file picker 取消や drag 中の OS 中断でも未確定 command を commit しない。touch で採用 MUST を一つずつ完了できる検査を UX-02〜05 に含める。

## 17. 安全性 ライセンス 通信

| ID | 優先 | 要件と受入条件 |
| --- | --- | --- |
| SEC-01 | MUST | 既定はブラウザ内ローカル処理。素材・project・filename・画像を無断外部送信しない。network allowlist と実測で確認 |
| SEC-02 | MUST | import する JSON / 名称 / metadata を不活性 data として表示。DOM injection・prototype pollution・任意コード実行を防ぐ |
| SEC-03 | MUST | loader と decoder は採用した版・取得元・hash・LICENSE を記録。初期化に無断 CDN、外部 API、モデル重みを使わない |
| SEC-04 | MUST | 依存追加はコード LICENSE、商用利用、再配布、NOTICE、WASM/decoder/関連依存の条件を確認してから採用。候補の README だけで確定しない |
| SEC-05 | MUST | fixtures / template / font / texture の権利と由来を管理。外部 asset の権利未確認を合格にしない。素材の制限を export で落とさない |
| SEC-06 | MUST | 利用条件申告と埋込 VRM meta の矛盾は両方残して警告。利用者申告で元の制限を自動上書きしない |
| SEC-07 | MUST | debug log に素材内容・秘密情報・個人 local path を残さない。error ID と revision 等の最小情報で再現可能にする |
| SEC-08 | MUST | CSP 等の方針変更、外部通信、storage 権限拡張は 3D 追加へ紛れ込ませない。必要な変更だけ独立説明・確認 |
| SEC-09 | MUST | 不正入力検査は fixture を使う防御的検証。拒否された操作やアクセス制限を回避する手段を実装工程に含めない |

## 18. 文書と必要部分だけ読む要件

ここでは成果物の条件を定義する。フォルダ・ファイルの具体配置、全体図、domain 図、読取図の提出は利用者指定の第三 PR で行う。

| ID | 優先 | 要件 | 受入条件 |
| --- | --- | --- | --- |
| DOC-01 | MUST | トップ入口→作業分類→必要 domain→契約→対象 code/tests の順で進める索引 | 2D 修正、3D rig、保存障害、export 修正の例で全資料を読まず対象へ到達 |
| DOC-02 | MUST | 2D と 3D の文書を明確に区分。共通契約は小さく保つ | 3D の作業で 2D 全仕様を自動読込しない。共通部分が必要な理由を示す |
| DOC-03 | MUST | folder/file の所有責務と依存関係を図示 | 実在 path、entry、contract、tests が対応し、将来案と現状を区別 |
| DOC-04 | MUST | runtime 読込図・resource lifecycle 図と、AI 文書参照図を分離 | 「lazy bundle」と「必要資料だけ読む」を同じ矢印で混同しない |
| DOC-05 | MUST | 図と index の正本を一つに定める | node/edge/ID の整合、リンク切れ、参照循環、重複 ID を検査。図が全資料読込命令にならない |
| DOC-06 | MUST | 安定 ID、状態、版、担当範囲、requires、変更理由、履歴 | proposed / approved / implemented / verified を区別。新版リンクと置換元を残す |
| DOC-07 | MUST | 要件→設計判断→実装単位→検査→証拠の追跡 | 本書の ID を後続計画から参照。未実装・失敗・未実機検証が埋もれない |
| DOC-08 | MUST | 古い 3D 文書の矛盾を管理 | 検品限定の旧方針と制作機能の新提案を混ぜない。履歴の完了印を現在の完了へ流用しない |
| DOC-09 | MUST | 採用ハーネス版と参照候補を分離 | Studio 側採用 pin が未確認なら未確認と記録。他作品の採用 commit を流用しない |

参照したハーネスは [browser-game-harness](https://github.com/chameleonjp-lab/chameleonjp-browser-game-harness/tree/f4f9de455e3e1f5cfc5e566170912d0d2d383011) の `f4f9de455e3e1f5cfc5e566170912d0d2d383011`、2026-10-03 確認。README、AGENTS、registry、core contract/execution の入口と選択方針を参照した。**Studio にその版を採用済みとは確認していない**。本書でハーネスや他作品の採用版を更新しない。

### 18.1 本書を読む最小単位

本書そのものも毎回の全文読込を要求しない。まず §1 の状態・優先関係と今回の対象を確認し、以下の該当箇所を読む。設計・実装ファイルへの最終的な索引は第三 PR で追加する。

| 今回の対象 | 本書内の最小読取 | 追加条件 |
| --- | --- | --- |
| トップ / 2D / 3D 入口 | §3、§4、NAV/LIFE の受入、COMPAT | 配信変更なら §19.4 |
| 造形 / 材質 / viewport | §5〜7、該当 PERF / UX | topology を変えるなら §8 の skin/clip 影響も読む |
| リグ / 動作 | §5、§8〜9、§13 の保持条件 | 外部 clip の取込時だけ §11 |
| 保存 / 復旧 / 競合 | §5、§12、§19.4 | schema 変更なら COMPAT と OPEN-02 |
| import / export | §10〜13、§17、§19.3 | decoder 追加なら OPEN-01 と SEC-04 |
| 実機 / 性能 | §4、§15〜16、対象 AC | 保存中断を扱うなら §12 |
| 文書 / 要件レビュー | §1、§18、§20〜22 | 問題のある domain だけ詳細へ進む |

## 19. 検査と証拠の契約

### 19.1 テスト分類

| 分類 | 対応要件 | 必須の観察 |
| --- | --- | --- |
| 純粋 model / command | DATA、EDIT、MODEL、RIG、ANIM | 不変条件、Undo/Redo、数値境界、参照整合、変換順 |
| importer / exporter | IMP、EXP、GAME | 正常・破損・過大・未知拡張・取消・古い job、実バイト round-trip |
| 保存 integration | SAVE、COMPAT | quota、transaction abort、crash、migration、競合、原本 hash |
| bundle / route | NAV、LIFE、PERF-01 | entry ごとの初回 network、module graph、preload、URL 直開き、popup fallback |
| renderer integration | VIEW、MAT、RIG、ANIM | geometry、texture、skin、clip の実描画、mount/unmount、context loss |
| UI / E2E | FLOW-01〜06、UX | happy path と取消・再試行・二重操作・navigation interruption |
| 対象 runtime | EXP、GAME | 実 GLB と sidecar の読込、見た目、dimension、clip、anchor/collider の利用 |
| 物理端末 | LIFE、PERF、UX、SAVE | Safari を含む tab 切替・OS 中断・回復・触操作、性能と限界 |
| 文書整合 | DOC | ID、状態、リンク、正本、読取範囲、要件の未対応一覧 |
| 2D 回帰 | COMPAT | 既存 test と代表 `.casproj`・ZIP・Web/PixiJS/Phaser flow |

### 19.2 代表受入シナリオ

各シナリオには fixture hash、subject commit、端末/ブラウザ版、操作、expected、actual、status、artifact、limitations を記録する。

1. **AC-01 分離:** cache を消してトップ、2D、3D の順に個別計測。未選択 domain の重い runtime を一切取得しない。3D のリンクはユーザー操作で別 context に開き opener がない。
2. **AC-02 基本制作:** 空 project→二種類以上の primitive→部品編集→face 押出し→材質→Undo/Redo→save→別 context 復元→GLB。出力を実 runtime で表示し変更箇所を確認。
3. **AC-03 動く制作物:** 対応 mesh→joint 作成/fit→bind→手動 weight 修正→pose→複数 key→clip→save→GLB→runtime で clip 再生。表示だけ/metadata-only は不合格。
4. **AC-04 既存修正:** 対応 GLB 取込→原点/単位/材質/clip 変更→export→再取込。source hash 不変、二重 transform なし、変更は実バイトへ反映。
5. **AC-05 復旧:** dirty project で保存失敗→quota 解消または backup→復元。失敗中に saved と表示しない。正常 snapshot が壊れない。
6. **AC-06 多重タブ:** 同一 project を二つで開き競合更新。片方の変更を無警告上書きしない。2D と 3D は独立し、片方の DB 更新が他方を壊さない。
7. **AC-07 寿命:** model を反復交換、import 取消、export 取消、tab 背景化、context loss、再開。render loop/worker/URL が累積せず、復帰時に最新 revision だけ反映。
8. **AC-08 不正入力:** header/length 不整合、参照欠落、過大 texture、archive bomb 相当の制限 fixture、外部 URI、未知 required extension。外部 fetch せず安全に拒否し現 project を保持。
9. **AC-09 モバイル:** iPhone/iPad/Android の採用物理端末で入力切替、画面回転、panel scroll、timeline 数値変更、背景→復帰、backup 保存を完走。未検証を pass に数えない。
10. **AC-10 2D 保護:** 旧・現 `.casproj`、独立 frame、rig bake、event、比較、通常 ZIP / Web / PixiJS / Phaser を従来条件で回帰。3D 追加前との変化を説明。
11. **AC-11 読取:** 指定した一つの 2D 修正と一つの 3D rig 修正で、入口から必要 contract/tests へ短い path で到達。未関連文書の全文読込を要求しない。
12. **AC-12 見た目と使いやすさ:** 自作の代表制作物を初回利用者が作成・修正・受渡し。迷い、誤操作、欠落、再修正、所要時間を記録。CI 件数だけで高品質と判断しない。

結果は `pass / fail / not_run / blocked / not_applicable` を区別し、後三者は理由を必須とする。画像を保存しただけで観察済みとしない。古い SHA の証拠、headless Chromium、2D の人間承認、docs-only CI を 3D 実機・品質の代用にしない。

### 19.3 形式ごとに検証する保持表

この表の「必須」は目標であり、現時点の実装証拠ではない。対応 subset の詳細値は OPEN-06 で固定し、この表に対する pass/fail を残す。

| 意味情報 | project backup | 基本 GLB 入出力 | sidecar / notes | 失敗・非対応条件 |
| --- | --- | --- | --- | --- |
| source bytes と来歴 | 不変保持必須 | 原本 GLB と編集後 GLB を区別 | 親 hash / 変換履歴 | source 欠落時に完全 backup と表示しない |
| editable primitive / mesh | 再編集可能必須 | 結果 geometry を保持必須 | procedural 性の喪失を説明 | GLB から元の parameter 履歴が戻ると約束しない |
| transform / 階層 / 単位 | 契約通り保持必須 | 一回だけ適用必須 | forward / origin の解釈 | 非一様 scale、鏡映、親 transform の誤適用 |
| PBR / texture / UV | 対応値・原本・派生保持必須 | 採用 subset を保持必須 | 非対応 map / extension | 色空間、alpha、texture transform の損失 |
| bone / bind / weights | 再編集可能必須 | 採用 skin subset 保持必須 | target の影響数 / joint 制約 | index 範囲、再bind、未割当、無断切詰め |
| TRS clip / key / 補間 | 編集 state 保持必須 | 採用補間の動作保持必須 | loop / root motion 方針 | 非対応補間を LINEAR と偽る、duration 変化 |
| anchor / collider / 属性 | ID と追従保持必須 | 独自意味を engine 標準と装わない | versioned metadata 必須 | stale node binding、capsule の寸法解釈差 |
| selection / camera / UI | 復元範囲を明示 | 原則 editor state は含めない | 不要 | game camera との混同 |
| unknown extensions / VRM | 原本を保持、編集保証と区別 | 保持不能時は lossy を明示 | 制限・権利情報 | 原本保存だけで編集後 export の完全保持としない |

部分取込を許す場合は、欠落内容と影響を適用前に確認でき、利用者が取消できること。整合不能な required extension は「一部は見える」だけを理由に強制適用しない。round-trip の同値性は byte 一致だけでなく、採用 contract 上の geometry / pose / material / 時間の同値とする。誤差許容値、色比較条件、対象環境は計画で固定し、失敗後に基準を緩めない。

同じ実装の exporter/importer だけの往復で相殺バグを見逃さないよう、GLB は独立 validator と採用 consumer、既知の数値 fixture・描画を併用する。backup はフィールド別等価と source hash を確認する。派生画像の再符号化や浮動小数には許容誤差、原本には byte 一致、既知の loss には明示分類を適用する。

### 19.4 サービス提供と保守の要件

ローカル処理中心の静的 Web ツールでも、配信、更新、データの救出、利用者への説明は製品品質に含まれる。ここでの「サービス」は課金、アカウント、SLA 契約の導入を意味しない。

| ID | 優先 | 要件 | 受入条件 |
| --- | --- | --- | --- |
| OPS-01 | MUST | アプリ版・source revision・schema 版・対応状況の表示 | 利用者と検査者が同じ配信物を識別。アプリ全体と project の版を混同しない |
| OPS-02 | MUST | 配信更新中の chunk 不整合・404・取得失敗を回復可能にする | 古い HTML から新 chunk を探す場合、通信中断、cache 残留を再現。未保存内容を保存/backup してから明示 reload。無断再読込なし |
| OPS-03 | MUST | 2D と 3D の障害範囲を分離 | 3D の lazy import / decoder / renderer 失敗でもトップと 2D が利用できる。障害表示に現在の未保存範囲を含める |
| OPS-04 | MUST | リリースと rollback の互換条件 | 新版で保存した project を旧版で開くとき安全な拒否/救出。アプリ rollback が data rollback ではないと説明。2D の既存 DB を downgrade しない |
| OPS-05 | MUST | offline・再接続の境界 | 起動済み・読込済み機能はローカル編集/保存を続行。未取得 chunk は offline と表示し再試行可能。完全 offline 起動を未実装なら保証しない |
| OPS-06 | MUST | ユーザー向けガイドと対応表 | 新規制作、保存場所、backup、端末移行、権利、推奨上限、制限、復旧を具体的操作で説明。環境差がある操作は代替を記載 |
| OPS-07 | MUST | 問題報告用の最小診断情報 | version、error ID、機能、browser、再現手順をコピー可能。素材・project を自動添付しない。共有前に内容を確認・削除できる |
| OPS-08 | MUST | 利用データの所在と削除の説明 | ブラウザ profile ごとのローカル保存、site data 削除の影響、export の所在、cache と原本の違いを説明。設定リセットで project を消さない |
| OPS-09 | MUST | 更新時の release note と既知制約 | 追加機能、保存/出力影響、未検証端末、復旧策を表示。未完 SHOULD を無言で消さない |
| OPS-10 | MUST | 新規依存・fixture の保守 | 固定版、LICENSE/NOTICE、既知脆弱性の確認結果、更新根拠、影響 tests を追跡。脆弱性ゼロや永久安全を宣言しない |
| OPS-11 | MUST | エラー再現と復旧を優先 | 深刻な保存/出力破損、無限 crash、3D→2D 巻込は release blocker。データを無断送信する診断や検査の弱体化を解決策にしない |
| OPS-12 | SHOULD | 軽量な稼働確認と配信 revision 検査 | public ページ到達だけで editor 正常としない。個人素材を使わない自作 fixture でトップ/入口/保存/出力の smoke を確認 |

Service Worker / PWA の導入は必須としない。採用する場合は scope が 2D と 3D を巻き込まないか、cache version と data schema の更新順、offline 復帰、古い tab、cache purge の範囲を専用判断にする。取得済み機能のローカル動作とアプリ全体の offline 対応を区別する。

受入シナリオを追加する。

13. **AC-13 更新失敗:** 編集中に新しい配信へ切替、未取得 chunk を 404、再接続。dirty 内容を失わず backup と安全な再起動を案内。新規空 project でごまかさない。
14. **AC-14 配信復旧:** 対象版と配信 revision を特定し、既知の安全な app へ rollback する手順を検査。既存・新版 project の保存互換を区別し、DB を無断巻き戻さない。実際の本番 rollback 操作は別承認とする。
15. **AC-15 診断とプライバシー:** エラーから診断を作成し内容を確認。file 内容、texture、個人 path、認証情報を含まない。送信操作は自動化せず宛先と内容を明示。

### 19.5 多角的レビューの記録

要求の網羅表を読んだだけで「レビュー完了」としない。少なくとも制作体験、3D 制作/リグ/動作、runtime/資源、保存/整合、format/interop、mobile/accessibility、安全/権利、サービス提供、検査/リリースの視点から、矛盾・境界・異常系・観察方法を調べる。

記録には `finding ID / 視点 / 対象要件 / severity / 問題 / 処置 / 再確認 / 残る判断` を残す。役割名を付けた自己点検は独立レビューと呼ばない。実際の独立担当、調べた文書 revision、指摘と処置がある場合だけ独立と記録する。要求の追加回数を目標にせず、重大な曖昧さ・矛盾・無断損失の可能性を解消するまで同じ要件 PR を更新する。

BLOCKER/MUST 指摘が残る間は ready としない。renderer 選択や数値予算等の技術判断を後続で行う場合は、OPEN と要件を対応させ、決定前に実装/出荷してはならない境界が明確なら「未確定事項を管理できている」と評価する。未確定事項を記載しただけで技術上の成立を検証済みとしない。

## 20. 未確定事項と採用の条件

| ID | 未確定事項 | 進める前に必要な根拠 | 影響 |
| --- | --- | --- | --- |
| OPEN-01 | renderer / loader / decoder と固定版 | 既存評価の更新、LICENSE/NOTICE、型統合、dispose、実機、bundle | 3D 描画・入出力 dependency |
| OPEN-02 | 3D project 形式・DB・初版 schema | 原本保持、atomic save、migration、未来版、2D 非干渉の設計レビュー | 保存実装 |
| OPEN-03 | MUST mesh 操作の実現方法・許容入力・属性保持の詳細 | MODEL-03 の fixture、§6.2 の skin/UV/normal 保持方針、性能。MUST 操作の縮小は要件変更レビュー | 制作実装の実現方法 |
| OPEN-04 | rig・weight の algorithm と上限 | 手動経路、品質 fixture、取消・性能・license | rig の高度化 |
| OPEN-05 | 対象端末・版・全数値予算 | 測定 fixture、方法、実測、超過時 UI | リリース判定 |
| OPEN-06 | glTF subset・extensions・lossless 範囲 | 実 importer/exporter の往復証拠、target profile | import/export 表示 |
| OPEN-07 | Web の代表 runtime と engine 検証版 | LICENSE、実行 fixture、目視・animation・game data | verified 表示 |
| OPEN-08 | パス移行・既存 root の扱い | 旧 URL fixture、base path 配信、2D データの見付けやすさ | トップ分離 |
| OPEN-09 | 背景停止から休止へ移る条件 | 保存成功条件、モバイルの復帰時間/peak、利用者説明 | memory 制御 |
| OPEN-10 | Studio 採用ハーネス版 | Studio 側採用記録と exact commit の確認 | 文書参照と後続図 |

これらを「利用者が毎回すべて判断しなければ何もできない」状態にしない。実装計画 PR で推奨案・代替・根拠・可逆性・未検証範囲をまとめ、重大な保存契約や依存採用だけを明確な判断点にする。未確定を勝手に承認済みへ変更しない。

## 21. 本書の完成条件と 3D 製品の完成条件

### 21.1 要件 PR

- U01〜U04、既存 2D 保護、実制作、rig/animation、入出力、保存、資源寿命、端末、ライセンス、図/読取の全領域に ID と受入条件がある。
- MUST / SHOULD / FUTURE と依頼で確定した範囲を区別する。未採用 technology と仮予算を確定扱いしない。
- 実装計画・関係図・製品コードをこの PR に混ぜない。既存入口は本書への最小限のリンクだけ追加する。
- 後続計画が本書 ID を使って、設計判断・実装単位・検査・証拠・残項目を追跡できる。

### 21.2 3D 製品

本書受理後に確定した MUST、代表 flow、既存 2D 回帰が証拠付きで満たされ、重大不具合・無断データ損失・未解消の互換性破壊がなく、制限と未実装 SHOULD/FUTURE が表示されていること。保存・出力・実ゲーム利用までを含み、ファイル検査、viewer、画面雛形、文書 merge、CI 緑だけで「3D 完成」と呼ばない。

実装が完了しても merge・本番公開・サービス運用の開始は別の判断である。後続 PR の順序を守り、旧履歴の完了印を現製品の証拠へ読み替えない。

## 22. 参照と改訂履歴

### 22.1 参照

- [制作品質の目標](PRODUCT_VALUE_PLAN_2026-10-02.md): 800 米ドルを課金要件へ広げない。
- [既存 3D 計画入口](future/3d/README.md): 過去の範囲・判断・評価の所在。
- [旧 3D 整合リスク](future/3d/3D_DECISION_LOG_AND_OPEN_ITEMS.md): transform 二重適用、node index、派生 lineage、骨格/clip 参照の論点。
- [3D ライブラリ部分評価](future/3d/reports/3D_LIB_EVALUATION.md): 未採用・実機未完の状況。
- [ハーネス固定参照](https://github.com/chameleonjp-lab/chameleonjp-browser-game-harness/tree/f4f9de455e3e1f5cfc5e566170912d0d2d383011): 選択式の最小読取、証拠と状態の分離の参考。
- [HTML Standard noopener](https://html.spec.whatwg.org/multipage/links.html#link-type-noopener)、[Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)、[Storage](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)、[glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html): 2026-10-03 確認。具体 implementation の採用版に対して再確認する。

### 22.2 改訂履歴

| 版 | 日付 | 変更 | 状態 |
| --- | --- | --- | --- |
| 0.1.0 | 2026-10-03 JST | トップ/2D/3D 分離、別タブ、実制作・rig・animation、資源・保存・読取要件を新設 | proposed。要件 PR の review 対象 |
