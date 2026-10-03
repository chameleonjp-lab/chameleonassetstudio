# Asset Studio 3D 制作機能の実装計画

版: 0.1.0 / 2026-10-03 JST  
状態: **計画レビュー用。製品実装・依存採用・性能合格を意味しない。**  
基準 main: `45bba8889edb37b4ce63c5f7060c9f3cd4512c7a`  
上位: [3D 制作要件](THREE_D_PRODUCT_REQUIREMENTS_2026-10-03.md) / [要件レビュー](THREE_D_REQUIREMENTS_REVIEW_2026-10-03.md)

## 1. 目的と現在位置

要件 PR #294 は 2026-10-03 04:38:22 UTC に merge され、上記 main に含まれることを再確認した。本書は指定された第二段階、**実装計画書の PR** である。本書の merge 後にフォルダ・ファイル階層、runtime 資源寿命、AI の必要部分だけ読む関係を図で定義する第三 PR を作る。その後、確認済みの実装範囲に進む。図成果物や製品コードを本 PR へ混ぜない。

完成対象は、空からの形状制作→mesh 修正→材質→smooth skin と手動 weight→key/clip→保存と独立環境復元→編集後 GLB と metadata→実 consumer 利用である。viewer、検品画面、文書、CI のみで完成としない。2D の制作・形式・出力品質を維持する。

### 1.1 実装前の停止境界

現在は、以前の 3D 作業の安全停止対象となった正確な操作・範囲が未特定である。**本書では実行コード、renderer の試作、ライブラリの install、以前の作業再開を実施しない。** 計画作成と通常の読み取り監査は独立して行う。安全制限を別 executor・別方法で回避しない。実装開始の前提は、後述 G00 の対象操作の確認と、実行可能な範囲の確定である。一般的な「実装してよい」という意図を、未解決の安全制限を解除する根拠にしない。

runtime の技術実証が必要なものは「未実行の限定検証」として入力・操作・期待結果を固定する。計画の文書整合が確認できても、未検証の実現性を proven としない。

### 1.2 読み方

1. 今回の作業が文書・実装・検査・公開のどれかを確認する。
2. §2 の現状差分、§3 の gate、該当 Bxx を読む。
3. [要件対応表](THREE_D_PLAN_TRACEABILITY_2026-10-03.md) の必要 ID から設計判断・fixture・検査へ進む。
4. 3D 全仕様や旧 Phase 文書の全文を毎回読まない。保存なら B01、造形なら B04、rig なら B05 を主入口とする。

## 2. 読み取り監査と再利用の境界

| 確認した所在 | 現状 | 計画への影響 |
| --- | --- | --- |
| `src/main.tsx`、`src/app/App.tsx` | React 単一 entry。home は通常 import、2D editor は lazy | hub / 2D / 3D の配信 entry を独立させる必要あり。2D の editor 自体の再実装は不要 |
| `vite.config.ts` | base path と revision 埋込、現在 scope は 2d | 複数 entry、manifest と chunk 非混入、entry別 build info が必要 |
| `src/core/storage/db.ts` | 2D DB `chameleon-asset-studio` v2。projects/assets/blobs/trash/snapshots/quarantine | 3D のため変更せず別 DB。論理分離でも origin quota は共有し得る |
| `src/core/storage/autosave.ts` | 保存 task の直列/失敗保持、既定 debounce 800ms | 原理は参考。static activeQueues を3Dへ共有し、flushAllで別domainを操作しない |
| `src/core/storage/casproj.ts` | 2D model/schema/inputSafetyへ依存した ZIP 読書 | 3D保存への直流用は不可。fflateの既存依存と純粋な検査原理のみ参考 |
| `src/core/storage/projectBackup.ts` | 読取 transaction で2Dの一貫snapshot取得 | 3Dでもsnapshot一貫性を要求。型・保存storeは分ける |
| `tools/pages/assemble.mjs` | distへH3を配置しindexを検査 | hub/2d/3d/guide/h3の全経路検査を追加。H3の開閉ルールを壊さない |
| `package.json` / lock | React、AJV、fflate等。3D renderer依存なし | candidateのライセンスと固定版確認から行う。未追加依存を採用済みとしない |
| `docs/R01_DEVELOPMENT_WORKFLOW.md` | 関連検査→工程末の全検査、docs-only分類、main検査再利用は未実装 | 小commitごとの全runを避ける既存方針を維持。CI gateを弱めない |
| `.github/workflows/ci.yml` / `tools/ci/classify-changes.mjs` | PR更新でCI。Markdownのみcode/e2eなし、未知diffは全実行 | 本PRは分類のみ。後の入口/依存/CI変更は必要な全検査。3D用新pathを分類が漏らさないかB02で検査 |

監査対象は既存 main と文書である。以前の未commit 3D作業フォルダは今回の環境には見当たらず、内容・安全停止対象・テスト成功を推測して引き継がない。要件番号 D3 と「3D」の文字が一致していても、既存 D3 consumer runtime を3D rendererと誤認しない。

## 3. gate と実装順

| gate | 条件 | 未達時の扱い |
| --- | --- | --- |
| G00 実行境界 | 過去の停止操作と現在実行できる範囲を確認。未解決制限の回避なし | substantive実装/試作は止め、文書と通常read-only監査だけ継続 |
| G01 計画受理 | 要件169IDと本文の横断条件を追跡。重大指摘解消。技術提案/未検証を明示 | 同じ計画Draft PRで修正 |
| G02 関係図受理 | 第三PRで実在/予定path、所有、依存、読取、resource状態の図と索引を整合 | 製品実装を先行しない |
| G03 技術採用 | G03a候補評価の許可と配布物確認、G03b各DECの限定検証、G03c製品採用を区別。S06全flowはG05で確認 | 関連実装だけ保留。runtime未検証を検証済みにしない |
| G04 制作vertical slice | B01〜B07で空→制作→save→GLBが成立し、2D回帰が通る | viewer完了とせず同じ工程内で修正 |
| G05 受渡し/端末品質 | B08〜B09の独立consumer・実機・予算、復旧・多重tabを検証 | 未検証対象は出荷対応済みにしない。MUST縮小は要件変更 |
| G06 完了判断 | B10、全MUST、採用SHOULD、全AC、既知不具合/制限、同一版の証拠 | 未実施をpassで埋めない。人間のmerge/公開判断を維持 |

順序は B00 → B01 → B02 → B03 → B04 → B05 → B06 → B07 → B08 → B09 → B10。B11は採用したSHOULDだけを扱う任意工程で、基本完成を条件なく延期させない。B09のmobile/性能検査は最後だけに行わず、B03以降の各工程で同じfixtureを累積評価し、B09で確定版の統合受入を行う。

各 Bxx は一つの利用者成果と、コード・テスト・ガイド・関連文書・レビュー修正をまとめる単位である。一要件一PRに細切れにしない。既存同目的PRがあればそのPRを更新する。工程間の境界がデータ契約と利用体験に一致しない場合は、計画上の対応を保って統合できるが、未検査変更を無関係な工程に溜め込まない。

G03aはG00/G02後の隔離評価に限定した候補取得・実行の判断であり、製品dependencyへの採用ではない。LICENSE/取得元/integrity確認と具体的な評価範囲を満たしてから行う。G03bはS01ならB03、S02ならB04、S03ならB05、S04ならB07、S05ならB01の工程内で、小さなfixtureを使って必要な境界を先に実証する。その結果を確認したG03cで該当dependency/contractの製品採用を記録する。未採用candidateを本体全体へ広げない。

下記Bxxの「Sxx」はその工程内の先行検証であり、同じ工程の完成版が既に存在することを入口条件にはしない。S06の全制作経路はB09/G05の最終適合検査。B00ではそのprotocolと対象手段だけを固定し、完成flowをB00の前提にする循環を作らない。

## 4. 未確定事項への具体提案

以下は本計画の推奨案。要件PRのmergeだけでライブラリ・schema・性能の採用まで決まったとは扱わない。「文書から根拠を確認済み」「runtime未実行」「人間採用判断待ち」を区別する。

### DEC-01 描画とライブラリ

**推奨:** `three@0.186.1`（r186）を3D専用adapterへ限定し、WebGLRenderer、GLTFLoader/GLTFExporter、OrbitControls等を機能ごとに必要な範囲だけ読込。WebGPUは必須にしない。Three.jsはrender/GLB変換の境界に使い、編集の正本モデル・履歴・保存をThree objectのserializeへ依存させない。

根拠は既存の [部分評価](future/3d/reports/3D_LIB_EVALUATION.md)、公式の geometry/skin/animation/export API とLICENSE。旧評価の三角形viewerだけで選定を完了しない。S01でReact lifecycle、skin/clip、export、bundle、disposeを確認する。Babylon.js候補は代替として残すが、選定を避けるため両方を本体へ同梱しない。

採用前にpackage tarball、固定commit/tag、npm integrity、LICENSE/NOTICE、同梱addon/decoder、必要な型packageの版と条件を記録する。`^`で無関係な新版へ自動移動しない。型packageが必要な場合はその正確な版を別に検証する。本書の候補だけを根拠にinstallしない。

公式tag r186のannotated tag objectは `48dd7be01263658aad497fd72e09d1e4c6213461`、dereference先は `9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8`。[このcommitのpackage manifest](https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/package.json) は0.186.1であり、旧評価の0.186.0と同一成果物とは扱わない。[LICENSE](https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/LICENSE) はMIT。npm tarball/integrityとlockの一致はまだ未検証である。

この版のWebGLRendererはWebGL2前提である。WebGL1-only環境では3D描画を非対応として説明し、トップ/2D/backup救出を維持する。Three選定は低level編集adapterとの整合による提案で、他候補より速い/小さいとの実測結論ではない。

### DEC-02 保存と版管理

**推奨:** 3D専用 `.cas3dproj`（ZIPコンテナ）と `project3d` schema `0.1.0`、別IndexedDB `chameleon-asset-studio-3d` v1。既存2D `.casproj`、DB名/version、Asset0.2.0、export ZIPは変更しない。

保存の責務はprojectのroot revision、immutableな編集snapshot、content-addressedなbinary、staging、復旧/trash、writer leaseに分ける。具体的なファイル/モジュール配置は第三PRで図示する。native backupはmanifest、schema版、source/derived/geometry/texture等の必要binaryとhash、編集scene/rig/clip/game dataを含む。UI selection/cameraは任意session復元、Undo履歴は初版backup保証外と明示する。backup復元後もmodel/rig/keyを再編集できることは必須。

B01で先に固定するcanonical契約は、右手系、meter、Y-up、assetの既定forward=+Z、cameraの向きは別、column-vector、world=parentWorld×T×R×S、local quaternion=(x,y,z,w)正規化、時間=秒とする。pivotは明示parentで扱い、表示補正とexport bakeを一回だけ適用。matrix/shearをTRSへ安全分解できない入力は編集非対応とし原本を保持。bound skinの負/ゼロscaleは初版編集profile外、unbound mirrorはgeometryへ明示bakeする。これはcontract提案でありB01のschema/validator/数値fixtureを同時レビューする。

source/derivedには安定ID、親ID/hash、処理名/設定/実装版、利用者申告のrightsと元の埋込条件を別々に保存する。申告が元条件を上書きしない。sourceは不変、派生連鎖の親不一致はstale。座標や来歴をB07まで決めずにmesh/skin/keyを作ることはしない。

serialize/hash/decodeはIDB transaction外で準備し、IDBのroot revision更新と参照更新は同じreadwrite transactionでcompare-and-swapする。古いsaveの遅延成功でrootを巻き戻さない。大きいblobのstagingが完了する前にrootを指さない。失敗で孤立したstagingのGCは、live/recovery/trash/実行中jobの参照を確認し、元projectを削除しない。

GCの生存集合にはUndo/Redo、backup/export/read snapshotのpinも含む。mark時の参照一覧だけで後から削除せず、deleteと同じIDB readwrite transaction内で参照とgeneration/epochを再検証する。concurrent commit/import/restoreによる再参照があれば削除しない。pin取得も参照整合を確認するtransactionで行い、正常終了/取消に解放する。期限だけでlive tabのpinを失効させない。crash後pin整理はwriter fencingとroot/history参照の再照合後に限る。

多重tabの排他は、DB内のfencing tokenとexpected revisionを正しさの根拠にする。BroadcastChannelやWeb Locksは補助にできるが、片方が使えないだけでデータが上書きされる設計にしない。lease期限や端末時計だけで正当なwriterを判断せず、各commitでtokenを照合する。stale writerの未保存stateは別IDの救出backupへ保持する。

手動save/autosaveはrevision単位で直列化する。800ms debounceを初期案として現行2Dと比較するが、値の保証ではない。dirty表示はeditorRevisionとpersistedRevisionから導出し、UIへ成功が届いた順だけでは決めない。保存不能時の完全backup経路は編集受付前に取得済みにする。ゲーム用GLB encoderは後からlazyでもよい。

### DEC-03 編集モデルとmesh操作

**推奨:** 安定IDを持つscene graphと、頂点/面/corner属性を分けた編集meshを正本とする。描画用indexed BufferGeometryへ変換するadapterを設け、GPUのvertex indexを編集IDやbone bindingの恒久IDにしない。edgeはface接続から決定的に識別し、face選択/押出しのための隣接関係を保持する。

初版のtopology操作はvertex移動、選択faceの押出し、face削除。plane等の開いた面を許容する。自己交差/non-manifoldを一律クラッシュさせず、演算上必要な前提に違反する操作を拒否する。押出しの新側面UVは操作時の既定展開、capは元UV保持、新側面materialは元faceのmaterialを既定としpreview可能。normal再計算の範囲を定義する。これは具体化提案であり、S02で継ぎ目/鏡映/複数materialを検証する。

bind後のtopology変更は初版では直接適用しない。元skin/clipを保った派生コピーを明示unbindし、そのコピー上で編集する。勝手なweight補完やclip参照の付替えを避ける。rig済みmeshのrest shape変更も、影響が未検証なら拒否する。MUST操作を減らすのではなく、造形→bindの経路で完走させる。

commandはvalidate→候補生成→domain検査→一回commitの順とし、drag中はpreview state、確定で一command、pointercancelで元へ戻す。undoには変更差分とimmutable binary参照を記録し、大型sourceを毎回複製しない。

### DEC-04 rigとweight

**推奨:** 基本完成はローカル手動smooth skinを中心にし、bone hierarchy、rest pose、inverse bind、頂点ごとのjoint/weightを持つ。影響数はglTF基本profileで最大4を初期案とするが、任意入力を黙って切り捨てない。超える入力はloss表示と明示変換または非対応を示す。

最小のbindは利用者がjointを選んで領域/頂点へ割当し、数値編集・正規化・未割当検出を行えるようにする。humanoidの少数自作templateと手動fitを用意する。全vertexが一boneだけのrigid追従をsmooth skin完成としない。複数jointが混合寄与する連続meshでS03を検証する。

自動weight、IK、retargetはSHOULD。後述B11での個別採用まで必須経路へ混ぜない。自動weight候補に外部AIや重みを使わず、採用する場合も品質・license・計算量・cancelを別評価する。manual経路が必要なのは自動処理の失敗を修正できるようにするためである。

### DEC-05 端末と数値予算

**推奨:** 同じ制作機能を、PCのgizmo、tabletのtouch、phoneの選択list/数値入力で到達可能にする。スマートフォンのMUSTをviewerへ縮小しない。性能tierは入力上限と描画品質の違いで、編集データのsilent削減ではない。

実機型番/OS/browserのリストは利用可能な証拠からB00で確定する。現在物理端末の測定結果はない。利用者のPCや有料環境を新規の前提にしない。アクセスできる検証手段がなければ該当証拠をblockedにし、端末合格や最終完成を宣言しない。

数値は§7の**初期測定用提案**を使い、S01〜S06とB09の実測で確定する。予算の値を変更したら理由・fixture・比較結果を記録し、失敗をpassにするためだけに緩めない。release前には全PERF-IDに確定値または明確な非対応条件が必要。

### DEC-06 import/export profile

**推奨:** `cas3d-basic-gltf2` 初版は、GLB2、triangle primitives、indexed/non-indexed geometry、POSITION/NORMAL/TEXCOORD_0、PBR基本factor・PNG/JPEG texture、node TRS、skin最大4影響、object/bone TRSのSTEP/LINEAR keyを編集対応とする。primitive生成はこの範囲へ収まる。2Dの独自意味を混ぜない。

TANGENT等の表示属性、複数UV、morph、CUBICSPLINE、圧縮、material extensionの各項目は、取込・原本保持・編集・表示・exportを別表で固定する。初版で未対応なrequired extensionは安全拒否、未知optionalは原本保全しloss previewの上で対応subsetを選択できる。coreの未対応機能もextension名がないことを理由に見逃さない。raw JSONをGLTFLoaderへ渡す前にprofile検査とURI封鎖を行う。

公式r186のGLTFLoaderは未知required extensionをwarningだけにする経路とskin weightの自動正規化を持つ。SkinnedMeshは全zero weightを一boneへ補正する。したがってlibrary load成功をvalidatorにしない。loader前にraw accessor範囲とweightsの有限/非負/合計/影響数、required extension、URIを検査し、不正値を変更前に報告する。正規化が必要な有効値は利用者が確認できる可逆commandへ分離する。[固定loader](https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/examples/jsm/loaders/GLTFLoader.js)、[固定skin実装](https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/src/objects/SkinnedMesh.js) を根拠とする。

profileの未対応項目は、JOINTS_1/WEIGHTS_1、morph、CUBICSPLINE、圧縮、instancing、未知material拡張を初期read-only/source-onlyとし、変換が採用されるまで編集正本へ無断変換しない。UV transformを編集対応とする場合はKHR_texture_transformを個別採用して往復検査し、未採用ならtransformを持つ入力をlossなしと表示しない。重複key時刻は拒否し、置換を明示した時だけ既存keyを置き換える。空clipはprojectに保存可能だが空の不正glTF animationを出さない。

WebP原本はbackupに保持し、基本GLBはPNG/JPEGへ変換。alphaが必要な画像はPNG。全buffer/textureをGLB内へ含め、原本path/networkなしのconsumer再生を必須とする。clip loopや独自duration/game dataはversioned sidecarへ持ち、GLB標準機能と偽らない。

exportはrevision固定sceneから決定的な順序で作り、最終GLB bytesのhashとnode/joint/clip mappingをsidecarへ結び付ける。exporterによるindex並べ替え後にmappingを照合する。stable IDをextras等に入れる方式と明示map方式をS04で比較する。nameだけのbindingは不可。未対応のlossは出力前に示す。

mappingの推奨は、bounded namespaced stable IDをnode/clip extrasへ入れ、最終GLBを再parseしてstable ID→最終indexを作り、そのGLB hashと共にsidecarへ書く方式。重複ID・欠落target・予期しないpivot nodeは失敗とする。初期pivotはapp所有の明示parent nodeで表現し、renderer固有pivotへ依存しない。編集durationが最終keyより長い場合はsidecar/consumerのhold契約で保持し、GLB単体にduration保証をしない。必要な場合の終端key生成は派生変換として明示する。

GLTFExporterは既定でonlyVisible=true、animations=[]であり、未解決trackをwarnしてskipし得る。独立export graphからhelperを明示除外し、binary=true、trs=true、onlyVisible=false、対象clip一覧を明示する。export前後のnode/skin/channel/target数と対応を照合し、必須channelの欠落は失敗。userData/extrasはbounded JSONを先に検証する。maxTextureSizeをsilent optimizerにしない。[固定exporter](https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/examples/jsm/exporters/GLTFExporter.js) の挙動を採用検査に含める。

同exporterのparseAsyncは公開optionにAbortSignal/progressがなく、asyncだけで応答性/取消可能性を保証できない。worker内のexport専用graph再構築+image encoding+terminationをS04で検証する。OffscreenCanvasの経路がsourceにあってもSafari成立証拠にはしない。worker方式が成立しなければ、cancel可能なincremental encoder等の代替を採用審査し、MUST取消を無言で弱めない。

### DEC-07 独立consumer

**推奨:** 制作rendererをThree.jsとする場合、GLBの意味検査には独立Khronos validator、実consumer比較にはBabylon.jsの固定候補を用いる。実行時に両rendererを製品へ同梱しない。tests専用の隔離consumerとして準備する。Babylonの候補版は既存調査の9.28.0を出発点にlicense/source/hashを再確認する。

read-only照合済みのBabylon候補は `@babylonjs/core` / `@babylonjs/loaders` / `@babylonjs/serializers` / peerの `babylonjs-gltf2interface` をすべて9.28.0、上流commit `0520900e8d7afcb7b7923bb9bad913e49b6cf919`。[Apache-2.0 LICENSE](https://github.com/BabylonJS/Babylon.js/blob/0520900e8d7afcb7b7923bb9bad913e49b6cf919/license.md) と [NOTICE](https://github.com/BabylonJS/Babylon.js/blob/0520900e8d7afcb7b7923bb9bad913e49b6cf919/packages/public/@babylonjs/core/NOTICE.md) の同梱条件を確認する。consumerだけならserializer不要。decode関連NOTICEを確認したことと、decoderを本体へ採用することを区別する。npm配布物照合は採用前gateとして残る。

独立validatorのpackage版と配布条件は採用前に固定し、未確認のツールをダウンロードして実行しない。Threeだけの往復も回帰には使うが独立interop証明の代わりにしない。Unity/Godot/Blenderはまずnotes-only、固定版を実行できた対象だけverifiedへ進める。

### DEC-08 URLと2D移行

**推奨:** 配信base配下のトップ、`2d/`、`3d/` を別HTML entryとするmulti-page build。topはrendererをimportしない。3D linkはuser activationとnoopener、新規browsing context。rootの旧homeから2Dへの明確なリンクと既存project一覧の到達性を保つ。

2DのDBは同originのままなのでpath変更だけでmigrationしない。guide/ と h3/ は既存経路を維持。旧rootでproject IDを含む深いlinkが実在するかB00で監査し、実在した形式だけ移行fixtureを作る。未確認の旧URLを作り話にしない。same-tab fallbackは要件で未採用の例外であり実装しない。

この計画PRで確認した現行入口は `src/main.tsx`→`App.tsx` のuseStateによるhome/editor切替で、取得した入口にはquery/hashからprojectIdを復元するrouterはない。未知の全ファイルに存在しないと断定せず、この確認範囲を記録する。`tools/pages/browser.e2e.ts` とREADMEの実在経路に対するF11の移行fixtureを次のように固定する。

| 現行/新規URL（baseは `/chameleonassetstudio/`） | 期待結果 |
| --- | --- |
| base root と `index.html` | 新hub。既存2D projectへの明示入口。rootの旧保存dataはそのまま |
| `guide/`、`guide/features/` | 既存ガイドの到達性を維持。2D操作リンクが正しいentryへ向く |
| `h3/`、`h3/publication.json` | 既存open/closed・24時間窓を維持。3D起動のため勝手に開かない |
| 新 `2d/`、`3d/` | direct/reloadで対応entryのみ起動。3Dは通常hubからnewtab |
| rootの未知query/hash | project自動選択と見なさずhubを安全表示。任意queryを外部URLやfileへ変換しない |
| 未確認の旧project deep link | 調査で実在を発見した場合だけfixture追加し同等性をレビュー。架空の移行保証はしない |

development base `/` とproduction baseの両方で同じ相対URL契約を検査する。old root bookmarkがhubに変わることをrelease noteに書き、利用者の保存データがなくなったように見えない表示を持つ。

### DEC-09 背景停止と休止

**推奨:** hiddenでanimation/render loopを停止し、未確定dragは取消、saveは実行可能なら継続、import/rig/optimizeはcheckpoint停止またはcancel。exportはsnapshot上で継続可能だがfreeze中の完了保証なし。処理別契約は要件§4.2に従う。

初期の自動GPU破棄は採用せず、手動「表示を休止」を提供する。autosave成功revisionと現在編集が一致し、復元に必要なsourceが保持された時だけGPU・bitmap等を解放できる。保存失敗では唯一の編集内容を破棄しない。背景時間だけを根拠にdataを消さない。実測後に自動休止を追加する場合は設定と復帰peakを別判断する。

resource ownerはrenderer instance / project / jobに分かれ、ref countを必要なshared texture等だけに用いる。jobの結果はprojectId/revision/jobId/tokenを照合してcommitし、不採用結果は解放。context復帰はcanonical snapshotから作り直す。BFCache復帰で二重listener/loopを作らない。

### DEC-10 ハーネスと作業検査

Studioの採用pinは未確認のまま保持する。[ハーネスPR41 merge `50229ded69378ed6392453e73856482eb78b7354`](https://github.com/chameleonjp-lab/chameleonjp-browser-game-harness/commit/50229ded69378ed6392453e73856482eb78b7354) の `core.execution` / `domains/testing.md` / `references/test-batching.md` を、今回依頼されたbatch検査の参考として必要範囲で確認した。**ハーネス全体の自動upgradeや他作品のpin流用はしない。**

Studio既存R01と整合する運用は、編集中の関連検査、工程末/提出/最終候補の必要な全検査、docs-only分類の維持、未知影響は広い検査、高リスク入力/保存契約を時間理由で延期しないことである。具体のCI変更は本PRに入れずB02で必要な場合だけ設計する。

## 5. 限定技術検証の契約

次は**未実行**であり、G00/G02を満たしてから実施する。既存安全停止操作を探らずに同じ処理を別名で繰り返す検証ではない。各検証前に操作・入力・依存・通信・変更先を確認する。

| ID | 入力と操作 | 期待する証拠 | 採否を変える条件 |
| --- | --- | --- | --- |
| S01 renderer/lifecycle | 自作小GLB、texture、skin/clipを固定。React mount/unmount、swap、loss/restore、独立entry | 対象版/fixture hash、画像観察、resource count、network、TypeScript、復帰 | GPU leak、2Dへのimport混入、Safari復帰不可ならadapter/候補再検討 |
| S02 mesh | 開plane、UV seam、mirror、複数material。vertex/face編集→Undo→GLB | 編集ID/属性維持、正負fixture、normalとUV画像 | 安定topology参照が成立しないならrepresentation修正。MUST縮小しない |
| S03 skin | 連続mesh+2〜3joint、混合weight、nonuniform親。bind→pose→rebind/Undo→backup→export | numeric skin検査、独立consumer画像/pose、再編集 | inverse bind/scale誤り、weight loss、mobile入力不能なら工程設計修正 |
| S04 export/mapping/cancel | rename/reorder/prune、複数clip/anchor/collider。GLB Aとsidecar B、worker再構築・画像encoding・取消 | validator、最終hash/mapping、channel照合、取消と解放 | mapping/取消/worker画像処理が不成立ならexport方式再審査 |
| S05 storage/rescue | source+geometry+skin+clips。quota/abort、同tabA/B、二tab、offline前初回backup | persisted revision、dirty状態、空環境完全復元、原本hash | 保存なしで救出不能、CAS破壊ならB01を完成にしない |
| S06 device/workflow | 同一sceneでPC/tablet/phoneの制作→save→GLB、背景/OS中断 | 型番/版、操作録画、入力応答、peak、復旧限界 | 予算超過は入力/描画tier調整を検討。機能縮小は要件変更 |

未実行の数値欄を0/推定で埋めない。許可された読み取りだけで技術候補を絞ることはできるが、S01〜06の結果を代替しない。

## 6. 実装work package

全工程で、要件ID、設計判断、入力fixture、検査command、対象SHA/tree、証拠、残項目を更新する。完了条件を満たすまで同目的の修正を続けるが、下記gateを越える無断操作はしない。

### B00 基準と採用条件を固定する

- 成果: 実装対象main、G00/G02、依存候補、現2D回帰基準、対象端末、risk台帳を固定する。
- 前提: G01/G02と実行境界を確認。図PR前は本工程のコード部分を開始しない。
- 作業: main/AGENTS/既存open PR確認、2D fixtureと配信URL一覧、DEC-01/02/06/07の採用表、S01〜06の実行許可範囲。旧未完codeを採用するなら差分・根拠・対象制限を別確認する。
- 対象: package/lock/必要な型情報、3D contract、license evidence、既存2D testsの読み取り。dependency導入は採用判断後のみ。
- 検査: T00 baseline、T12 license/security。未知失敗を基準passにしない。
- 完了: 不明な安全停止の範囲が実装を許容することを確認し、採用決定/未採用が記録される。検証用fixtureの権利が明確。
- 戻し方: 採用前の候補を本体へ入れない。採用後に不成立なら作業branch内の依存追加を戻し、2Dのlock/配信へ影響を残さない。

### B01 データ正本と救出可能な保存を通す

- 成果: 空3D projectと最小shape dataを新規/編集/save/backup/復元できる。rendererなしでもデータを救出できる。
- 依存: B00、DEC-02/03、S05。
- 作業: schema0.1、安定ID、DEC-02の座標/単位/TRS/時間/来歴/rights契約、bounded validator、revision/CAS、stagingとhash、autosave、完全backup encoder、復旧/trash/ID衝突/migration拒否。UI state/GPUを保存正本に混ぜない。
- 必要API: create/open/readSnapshot/commit(expectedRevision,token)/exportBackup/importStaged/restoreCopy。返値にcommitted revisionとvalidation reportを持つ。
- fixture/test: F01/F08/F09/F10、T01/T02/T03。cold→編集→offline→初回backupを必須にする。
- 完了: AC-05/06/13の保存部分。座標/来歴のschema・validator・fixtureが同時成立。A保存→B編集→A成功でB dirty、B後A再試行でroot不変、空環境再編集、quota後正常保存不変。Undoのみ参照/backup中GC/mark後再参照を保護しpin解放後だけ回収。
- 戻し方: 新DBを消して戻すことを利用者に要求しない。旧schemaを読み取り可能に保つか拒否+backup救出。採用前data migrationで2Dへ触れない。

### B02 トップと独立entryを完成させる

- 成果: トップから2Dまたは3Dへ迷わず進み、3Dは新tab。2Dで3D runtimeが取得されない。
- 依存: B01、DEC-08。3D editorは保存/救出入口を持つ軽量shellから始める。
- 作業: multi-page build、base path、entry別error boundary/build info、no prefetch、noopener相当、repeat activation、direct reload、旧root→2D発見、guide/H3保持。
- 対象候補: `src/main.tsx` / app entry、`vite.config.ts`、HTML entry、Pages assemble/tests。正確な新pathは第三PRの関係図に従う。
- test: F11、T04/T11、2D全回帰。build manifest、cold network、workers、modulepreloadを照合。新pathがCI分類から漏れないfixture。
- 完了: AC-01/10/11入口部分。new tab失敗の再操作/URL案内、openerなし、未保存2D不変。3D未実装機能は準備中表示。
- 戻し方: route変更をbranchで戻し旧root導線を回復。保存DB・2D形式は移行不要。Pagesへの実deployは別承認。

### B03 viewportと安全な取込の縦経路

- 成果: boundedな基本GLB/画像をstagingで受け、実描画・選択・camera・停止/復帰できる。
- 依存: B01/B02、DEC-01/06/09、S01。
- 作業: WebGL2 feature detect、renderer adapter/resource owner、reference-counted resource、guarded loader、URI allowlist封鎖、job token、cancel、context loss、no GPU救出。thumbnail/preview PNGも追加し、overlay含有の選択・canvas読出し失敗を説明。shader等任意コードは実行しない。
- test: F02/F06/F07/F11、T03/T04/T05/T06/T12。geometry/texture/canvas/worker/URL/listener countと実画像、失敗後正本不変。
- 完了: model表示だけでなく、import cancellation、swapping、hidden/freeze復帰、保存済みsourceから再構築が成立。2Dのnetwork/保存を巻き込まない。
- 戻し方: renderer失敗時は軽量shell+backupへ退避。decoderの失敗を無条件CDN fetchで回避しない。candidate原本を保持。

### B04 空から造形し材質を仕上げる

- 成果: FLOW-01/03の静止制作部分を空projectから完成できる。
- 依存: B01/B03、DEC-03、S02。
- 作業: box/plane/sphere/cylinder/cone、パラメータ→editable mesh変換、vertex/edge/face選択・移動、face押出し/削除、group/clone/mirror/pivot、材質factor/texture/UV、baseColor派生編集、Undo/Redo。
- UI: PC gizmoだけでなくphoneのobject/vertex/face list・数値入力を同工程で実装。touchcancel/IME/lock/選択整合を含む。
- test: F01/F02/F03/F12、T01/T05/T07。UV seam・flat/smooth・鏡映・開面・bind済み拒否。material共有を事前表示。
- 完了: AC-02。独立backupで再編集し、形状/材質の変更を数値と画像で確認。GLB本出力はB07でclosureし、B04だけで全製品完成としない。
- 戻し方: command境界でUndo、非可逆primitive変換は派生copy。新vertex属性生成が不成立なら操作をcommitしない。

### B05 smooth skinを実際に作る

- 成果: 骨なしの対応meshへjointを作り、手動weightを修正し、poseで変形できる。
- 依存: B04、DEC-04、S03。
- 作業: joint hierarchy/rest/bind/pose mode、少数humanoid template、manual fit、skin attributes、weight正規化/未割当、rebind、依存参照管理。rigid parentは別操作。
- test: F04/F12、T01/T05/T07/T08。連続meshに2joint以上の混合寄与、複数mesh/複数skin、nonuniform親、mirror/zero-length、rebind/undo、保存後再編集。
- 完了: RIG-01〜06、AC-03のrig部分。数字を表示するだけ・rigidだけは不合格。phoneでもlist/数値で同じmeaningに到達。
- 戻し方: bind前snapshot/派生を保持。失敗してmeshだけ更新しない。骨削除によるclip/anchor orphanは拒否または明示変換。

### B06 keyとclipを制作する

- 成果: object/bone TRSを時刻で編集し、複数clip、STEP/LINEAR、loop方針を保存できる。
- 依存: B05、DEC-04/06。
- 作業: timeline/key list、add/move/delete/duplicate、duration/loop、scrub/play、auto-key表示、preview pose分離、clip切替、background stop。
- test: F04/F05/F12、T01/T05/T07/T08。空/単一/重複key、duration外、quaternion ±、loop seam、非key対象、Undo→branch。
- 完了: ANIM-01〜07、AC-03制作部分。利用者が作ったkeyで動き、backup再開でkeyが編集可能。exportのclip再生方針はsidecar contractで扱う。
- 戻し方: clip command/派生で戻る。scrubを勝手にkeyとして保存しない。対応不能補間を黙って線形へ変換しない。

### B07 ゲーム情報と実ファイル出力を閉じる

- 成果: primitive/mesh/material/skin/keyの変更をGLB実バイトにし、game metadata/backupと取り違えず出力できる。
- 依存: B01〜06、DEC-06、S04。
- 作業: unit/forward/origin、anchor/bone binding、box/sphere/capsule、snapshot export、PNG/JPEG変換、GLB自己完結、manifest/hash/mapping、sidecar loop、ZIP、loss report、progress/cancel。
- test: F01〜F06/F07/F10、T03/T08/T09。Aモデル+Bsidecar、rename/prune、export中編集、初回encoder失敗、texture alpha/色/向き、二重transform。
- 完了: AC-02/03/04の実出力。metadata-onlyや原本GLBのコピーで済ませない。backupと配布GLBの意味の差がUIで分かる。
- 戻し方: 出力は正本を変更しない。不正candidateは破棄し、原本/編集projectを保持。旧ZIPと同名形式にしない。

### B08 独立consumerと検品を統合する

- 成果: 作った資産が採用runtimeで正しく動き、問題箇所から編集へ戻せる。
- 依存: B07、DEC-07。
- 作業: independent validator/consumer、known-value pose/geometry/material、sidecar adapter、statistics、warning→対象、stale検品、engine labels、import notes。VRMを非編集source-onlyにする場合もboundedな埋込利用条件と利用者申告の矛盾を保存/表示し、権利の自動上書きをしない。
- test: F01〜F06、T08/T09/T12。Threeの往復だけでなく別consumer、glTF対応subset、sourcehash不変。対応対象版とlimitsを固定。
- 完了: FLOW-01〜04、AC-02/03/04/08、EXP-08。各verified表示に同版の証拠。notes-onlyをverifiedにしない。
- 戻し方: 不合格targetをverifiedから外すだけで必須Web受渡しを免除しない。出力不具合はB07へ戻し、同じ実ファイルを再検査する。

### B09 実機操作と資源予算を確定する

- 成果: PC/iPad/iPhone/Androidの採用端末でMUST操作、background/OS中断、save/backup、性能上限を確定する。
- 依存: B03以降の累積結果、B08、S06。
- 作業: tier入力上限、DPR/影品質、decoded size見積り、undo/export peak、manual休止、再構築、初回offline救出、多重tab/同origin quota、accessibility。
- test: F01/F04/F08/F09/F11/F12/F13、T06/T07/T10。物理端末とheadlessを区別。通常/上限直前/超過を試す。
- 完了: AC-05/06/07/09/12/13、全PERFとUXのMUST。予算未確定または実機blockedならこの工程は完了にしない。
- 戻し方: cache/描画品質を下げる操作と成果物変更を分離。元データを削るfallback禁止。MUSTの入力経路が成立しない場合は設計修正し再測定。

### B10 提供品質と完了判定

- 成果: 更新/rollback/offline/診断/ガイドを含み、利用者が作成・再開・受渡しを続けられる。
- 依存: B01〜09、採用したB11、G05。
- 作業: build-info、chunk404、更新案内、旧/newproject対応、safe diagnostics、license notices、release note、初心者guide、制限表、必要文書/図の追従。
- test: F08/F10/F11/F13、T00〜12の適用集合。最終headで既存2Dと3Dの全gate、AC-01〜15を照合。
- 完了: 全MUSTと採用SHOULDに証拠。未実施/known-fail/公開未承認を分離。独立reviewの重大指摘なし、人間のmerge/公開判断へ渡す。
- 戻し方: 旧appへ戻しても新版schemaを無断downgradeしない。旧版で読めないprojectはbackup救出。公開済みdataを消すrollbackはしない。

### B11 採用するSHOULDを追加する

- 対象候補: glTF bundle/圧縮、UV/texture paint、auto-weight/IK、motion template/retarget、optimizer/LOD、named snapshot、engine notesの実行検証など。
- 依存: 基本経路の対応工程と個別DEC。各候補に、価値、license、resource、失敗/取消、保持/損失、検査を記載して採否を決める。
- 初期判断: 本書ではSHOULDを一括採用しない。すべて対応表で `deferred / proposed / adopted / verified` を管理。FUTUREは実装対象外。
- 完了: 採用した項目だけ対応要件と同じ水準で検証。見送った機能はUI/guideに表示せず、未実装を明記。基本MUSTの代替として採用しない。
- 戻し方: 個別featureを外してもnative projectの既知データを破壊しない。unsupported属性は原本保持/救出し、silent dropしない。

## 7. 性能の初期測定条件

以下は実測前の工程設計値であり、対応保証や最終hard limitではない。B00で測定機種、B03/B09で結果を記録し、上限を確定する。すべての値にはfixtureと測定方式をセットにする。

| 項目 | 初期案 | 確定方法 / 超過時 |
| --- | --- | --- |
| 初回domain分離 | 未選択domainのrenderer/loader/worker fetch 0、init 0 | build graph+network。共通React等の小sharedchunkは内容を説明 |
| input応答 | 小fixtureのselection/数値commitのp95を100ms以内の目標で測定 | 60秒以上/100操作以上の標本でpercentile。cold/warm初回は各5回以上のmedian/worstを別集計し、5標本をp95と呼ばない |
| animation frame | 小fixtureのactive再生でp95 frame間隔33.3ms以内を初期目標 | 60秒以上、実DPR/熱状態/前景で計測。worstと長stallを併記。描画品質だけの調整と区別 |
| progress/cancel | 進捗通知1秒以内、取消から正本不変状態への遷移2秒以内を初期目標 | worker termination時もstaging/URL解放。freeze時間を含めない |
| lifecycle反復 | 同fixtureを20回交換/開閉しlive owner数がbaselineへ戻る | engine内部cacheは区別し数/上限を説明。GPU byteを推測でpassにしない |
| phone small fixture | 10k triangles、256 nodes、32 joints、2 clips、1024² RGBA texture1枚を出発点 | これは利用上限ではなく最低制作flow測定。限界fixtureを別に増加 |
| desktop medium fixture | 100k triangles、512 nodes、64 joints、8 clips、1024² texture4枚を出発点 | 複数tab/export/undoのpeakまで測定。大きさだけで品質を保証しない |
| memory | source+decoded+geometry+undo+candidate+exportの推定内訳と観測可能値を併記 | browser共通のGPU/free memory値は仮定しない。予算未確定ならrelease不可 |
| autosave | 800ms debounceを初期案、連続編集中も最大未保存窓を別測定 | UIにpersisted revision/time。不足時はbackup rescue。終了callbackだけに依存しない |

hard limitの確定項目: compressed file bytes、expanded archive bytes、entry数/ratio、JSON depth/node数、buffer/accessor countとbyte範囲、triangles/vertices、texture dimension/pixel合計、joints/weights、clip/key count、Undo byte予算、export見積りpeak。値を一つのversioned profileに集約し、UI/validator/worker/export/testが同じ値を使う。上限の直前・ちょうど・超過の三点をfixture化する。

`compact-evaluation-0` の測定開始用上限案を以下に固定する。利用者への対応保証ではなく、無制限の入力を評価環境へ入れないための仮境界である。複数上限の同時到達を安全と見なさず、combined-peak予測が超える場合は一項目内でも拒否する。release profileはS01/S05/S06後の別版として採用する。

| 項目 | 仮上限 | 追加条件 |
| --- | --- | --- |
| 単一GLB | 32 MiB | header検査前に全decodeしない |
| project ZIP | 圧縮64 MiB / 展開128 MiB / 4096 entries / ratio100 | entry単位と合計を両検査。圧縮率だけで許可しない |
| JSON | 8 MiB / depth64 / object+array要素100,000 | manifest/metadataに別の小上限を適用、prototype予約key拒否 |
| scene | nodes1,000 / depth64 / buffers64 / accessors4,096 | byte offset/stride/countの積算overflowと実範囲を検査 |
| geometry | vertices100,000 / triangles100,000 | 編集後増加も含む。shared sourceと実コピーを区別 |
| textures | 1画像辺2,048 / unique decode合計8,000,000 pixels | mip/format/派生/temporary copyのpeakを別加算 |
| skin | 1skin64 joints / 1vertex4 influences | 複数skin合計/参照も検査。黙って切詰めない |
| animation | 16 clips / 合計50,000 keys | keyのcomponentsとoutput byteを別計算 |
| Undo | 追加payload32 MiB | source/唯一の編集は上限で削除しない。history整理前に説明 |
| import/export追加copy | 予測追加128 MiBを初期の拒否境界 | free RAMの測定値ではない。workerとtabごとの複製を加算し、低tierへ引き下げ可 |

どの上限変更もprofile版と理由を持つ。推定GPU memoryはtexture/format/mipとbufferの内訳を示す。`performance.memory`やcross-origin isolationが必要な測定APIを全browser共通前提にしない。測れない値はunknownと記録し、0として合格させない。

測定結果は数値だけでなく、失敗・警告・背景/復帰・保存成否・2D影響も保存する。端末ごとに許容入力tierを変えても同じMUST操作が実行できる最小fixtureを維持する。対応機能の縮小が必要なら利用者へ要件変更として示す。

## 8. fixtureと検査パッケージ

### 8.1 fixture台帳

すべて自作または再配布条件を確認済みの素材を使用し、バイトhash、生成条件、期待値の独立根拠、ライセンスを記録する。以下は作るfixtureの仕様で、実体が作成済みとはしない。

| ID | 内容 | 主な否定/境界 |
| --- | --- | --- |
| F01 | 宝箱/道具/建物、基本primitive・mesh編集 | 空、locked、duplicate、mirror、誤った選択 |
| F02 | UV checker、色/alpha、携帯向き、shared material | 欠落texture、巨大pixel、色空間/alpha誤り |
| F03 | 開plane、UV seam、複数material、nonuniform親 | out-of-range index、縮退、non-manifold、bind済みtopology |
| F04 | 連続skin mesh、混合2〜3joint、manual weight、複数mesh/複数skin | inverse bind誤り、未割当、負weight、rebind後参照、skinを取り違えた否定例 |
| F05 | 複数TRS clips STEP/LINEAR、loop sidecar | 空/単一/重複key、±quaternion、duration/clip切替 |
| F06 | anchors/colliders/clip mapping付きGLB | rename/reorder/prune、A GLB+B metadata |
| F07 | 制限内の不正入力セット | header/length、外部URI、path traversal、展開制限、未知required、prototype key |
| F08 | snapshot/source/texture/rig/key完備project | quota、transaction abort、staging中断、missing blob/hash、Undoのみ参照/backup中GC/mark後再参照/pin解放後回収 |
| F09 | 二tabと同tabA/B save順序 | stale writer、expired lease、clock変動、遅延応答、ID衝突 |
| F10 | schema旧/現/未来、backup/配布形式 | migration失敗、誤domain、孤立参照、networkなし復元 |
| F11 | top/2d/3d/guide/h3とrevision | cacheなし、古HTML/newchunk、404、popup拒否、BFCache |
| F12 | touch/keyboard/IMEと画面幅 | pointercancel、OS中断、入力中shortcut、orientation、focus帰還 |
| F13 | small/medium/limit直前/超過scene | 2tab合計、undo/export peak、context loss、offline rescue |

### 8.2 検査パッケージ

| ID | 対象 / method | 完了証拠 |
| --- | --- | --- |
| T00 | 現行2D regressions、旧/現 .casproj、ZIP/Web/PixiJS/Phaser | 現候補と基準、実output hash、既存test結果 |
| T01 | model/commands/geometry/rig/timeのunit/property検査 | 不変条件・正負fixture・Undo等価・数値誤差 |
| T02 | IDB snapshot/CAS/quota/backup integration | durable revision/dirty、空環境復元、sourcehash |
| T03 | bounded import/export、URI拒否、decoder境界 | 失敗対象/段階、通信0、正本不変、取消後解放 |
| T04 | route/build graph/cold network/new tab | domain非混入、openerなし、direct reload、配信base |
| T05 | renderer/skin/material/animation/lifecycle | 実画面観察、state照合、resource owner数、loss/restore |
| T06 | 性能/メモリ/背景/休止 | raw値、環境、fixturehash、限界と未観測、反復結果 |
| T07 | mobile/a11y/IME/numeric UI | 実操作、focus/SR代替、pointercancel、全MUST到達 |
| T08 | backup/GLB/sidecar semantics round-trip | フィールド等価、原本byte一致、許容数値誤差、loss一覧 |
| T09 | 独立validatorとconsumer | fixture+GLB+metadata hash、対象版、pose/time/material結果 |
| T10 | 物理PC/iPad/iPhone/Android flows | 型番/OS/browser、録画/画像観察、保存/OS中断結果 |
| T11 | service更新/rollback/offline/diagnostics | revision対応、404回復、backup、privacy payload |
| T12 | security/license/文書trace | input threat cases、LICENSE/NOTICE、参照/ID/coverage検査 |

### 8.3 数値と色の比較契約

以下を計画上の初期採用提案として固定する。これは実測済み精度ではない。要件変更や表現型変更で閾値を変えるなら、失敗前後の根拠・fixture・影響をレビューし、同じ失敗を隠すため緩めない。

| 対象 | 比較条件 / 初期許容差 | fixture |
| --- | --- | --- |
| 原本・ID・参照・schema版 | source bytes SHA-256完全一致。ID/参照/個数/enumは完全一致 | F01〜F10 |
| geometry / local・world位置 | 正規化meter座標、各成分 `abs(a-b) <= 1e-6 + 1e-5*max(abs(a),abs(b))`。index/topologyは期待する編集後構造と一致 | F01/F03/F04 |
| scale / material factor | 有限値、各成分絶対差1e-6。意図しないnonuniform/負scale変換なし | F02/F03/F04 |
| quaternion / bone pose | 正規化後 `q` と `-q` を等価、最短回転角差1e-4 rad以下。jointごとのworld位置は上の位置基準 | F04/F05 |
| weights / inverse bind | weights各1e-6以内、合計1との差1e-5以内。inverse bind成分は位置と同じabs+relative基準。影響joint IDは完全一致 | F04 |
| key時刻 / duration契約 | seconds絶対差1e-6。key時刻はstrict increasing。durationはproject/sidecar完全保持、bareGLBとの違いを区別 | F05 |
| animation比較時刻 | 各key、隣接keyの中点、開始/末尾、loop直前と直後1e-4秒。STEPは境界両側。clip切替で非key属性のbase poseも比較 | F04/F05/F06 |
| lossless画像 / alpha | 向き補正済みのRGBA8にdecodeし全pixel一致。派生PNGは生成前canonical pixelを基準。原本JPEG再encodeは基本経路で避ける | F02 |
| 色・画面の数値比較 | 固定camera/light/exposure/tone設定、sRGB出力、同解像度、非圧縮fixture。平面checker内側の事前固定maskでchannel差p95<=3/255、max<=10/255、alpha差<=1/255 | F02/F04 |
| 画面品質の観察 | 上記mask外の輪郭・shadow・透過・変形は別画像レビュー。数値maskの合格で破綻を無視しない。別engineの照明差も隠さず記録 | F01〜F06 |

期待値は製品exporter自身から自動生成して正解にしない。小さな既知座標/変形を独立計算し、公式format仕様・手作りfixtureと照合する。非finiteは許容差比較前に失敗。極端な単位や大きさはprofile境界fixtureで別に検査する。

## 9. 検査をbatchでまとめる運用

1. Bxxの中の一つの機能・原因修正をbatchとし、対象path、直接/推移依存、risk、関連test、終了条件を記録する。
2. 編集中は関連unit/画面を回し、同じ全体runを小変更ごとに繰り返さない。保存schema、untrusted asset decode、入力所有、securityの異常系は時間条件で後回しにしない。
3. 同じbatchの全体passから30分以内でも、それだけで再実行を延期しない。累積diff、toolchain/lock/build/test/environment、関連現SHAのpass、未解消失敗、終了境界を照合する。必要なら既存検査台帳へ記録し、別帳票を乱立しない。
4. Bxx終了、提出、最終候補、merge/release判断では必要な全検査を現SHAで行う。古いpassや依存cacheを現候補合格にしない。
5. ローカルのまとまった変更を一度pushして自動CI発火を減らすが、協業/backupを犠牲にしない。必須check名・branch protection・公開gateを緩めない。

Studioの現行commandを正とする。コード/設定変更は `npm run lint`、`npm run format:check`、`npm run build`、`npm run test`、`npm run test:ci-scope`。browser影響では `npm run e2e`、`npm run e2e:webkit`、CI上の `npm run e2e:quality` を含む。H3/Pages影響は現行分類と正式出荷条件に従い必要な計測/公開・閉鎖経路を検査する。新しい3D unit/e2eは既存globに入るか検証し、入らない新pathを無検査にしない。

本計画PRはMarkdownのみなので、文書ID/参照/表/要件coverageと既存docs-only CI分類を検査する。コード検査を行っていないことを明記する。計画変更が後続の検査内容に影響しても、現在の製品runtimeを実行したという証拠にはしない。

## 10. 完了と失敗の処置

### 10.1 各工程の証拠レコード

必要項目: 要件ID、Bxx/DEC、fixture ID/hash、test ID/command、対象commit/treeとdirty有無、環境fingerprint、開始/終了、expected/actual、status、log/画像/出力hash、limitations、既知失敗、再検査理由。

statusは pass / fail / not_run / blocked / not_applicable。後三者をpass件数に入れない。Actionsの14日artifactだけを恒久証拠にせず、sourcecommit/fixturehash/outputhash/結果/再現条件をrepoへ残す。私的素材・認証情報・端末の不要な識別子は記録しない。

### 10.2 最終の受入

- 要件の全MUST、採用SHOULD、AC-01〜15、FLOW-01〜06に実証がある。
- 少なくとも一つは空から作成しmeshを変更、smooth skinの手動weight、複数key/clipを作り、backupから再編集、GLB/sidecarを独立consumerで動かす。
- top/2Dのcold networkに3D不要runtimeがなく、両tabの合計資源/保存不足/背景/復帰を検証し未保存内容のsilent lossがない。
- 旧/現2D保存形式、旧ZIP、Web/PixiJS/Phaser、Asset0.2.0等の独立versionを維持する。
- 端末別の数値予算・対応範囲・不具合・未観測を記録し、実機未検証を合格にしない。
- 配信更新/rollback/診断/権利/ガイドが揃い、独立レビューの重大指摘が解消している。
- merge・公開は別判断。完成報告に実装済み、検証済み、未実施、公開状態を分ける。

### 10.3 失敗の扱い

仕様と違う結果はfixtureと証拠を残し、局所原因→関連検査→必要な全検査へ戻る。環境不足はblocked、未実行はnot_run、対象外は理由付きnot_applicableとする。古い2D承認や文書mergeで相殺しない。

保存/参照/原本破損、未保存消失、悪性入力の実行、2Dへの巻込はrelease blocker。性能未達は測定方法を確認した上で設計/入力tier/描画品質を検討する。要件の機能や安全条件を黙って縮小しない。限定検証が否定された場合、同じ検証を名前や環境を変えて回避せず、正確な停止点を報告する。

## 11. 要件対応と残る採用判断

[169要件の対応表](THREE_D_PLAN_TRACEABILITY_2026-10-03.md) を本書の一部とする。各要件はprimary Bxx、依存、DEC、fixture、test、acceptance、状態、戻し方へ対応する。追加の本文要件（smooth skin、network不要backup、topology/binding、完全性、OPSなど）は各工程の完了条件へ含めた。

| 元OPEN | 本計画の回答 | 採用前の残り |
| --- | --- | --- |
| OPEN-01 | DEC-01 Three固定候補とadapter境界 | license/配布物/型の正確な版、S01、選定判断 |
| OPEN-02 | DEC-02 専用ZIP/schema/DB/CAS | schemaレビュー、S05、migration/救出確認、採用判断 |
| OPEN-03 | DEC-03 mesh正本とtopology境界 | S02、UV/normal生成のfixture、MUST操作保持 |
| OPEN-04 | DEC-04 manual skin先行、SHOULD別採否 | S03、影響数profileの実測/consumer確認 |
| OPEN-05 | DEC-05と§7の測定案 | 物理対象端末とraw結果、確定budget、S06 |
| OPEN-06 | DEC-06 basic glTF profile | importer/exporter保持表の詳細、S04/validator |
| OPEN-07 | DEC-07独立consumer候補 | 正確な版・license・実行結果、verified条件 |
| OPEN-08 | DEC-08 base配下multi-page | 旧URL実在監査、Pages/H3経路検査 |
| OPEN-09 | DEC-09 hidden停止+手動休止 | 保存成功条件と復帰peak、S01/S05/S06 |
| OPEN-10 | DEC-10参考pin分離 | Studio採用記録の確認。未確認を採用済みとしない |

計画段階で選択肢とgateを明確にしたことは、runtime成立の実証ではない。G00により実行できない検証をこのPRで成功扱いしない。計画受理後も、採用条件が未達の部分はその範囲だけ止める。

## 12. 改訂と参照

- PR #294: 要件のmerge事実と基準文書。要件本文のhash `35ad24a16c07786e4b94e3e02c20f9fea82ffde5717cad77d7714e81b48e921d`。
- [既存開発検査](R01_DEVELOPMENT_WORKFLOW.md)、[旧ライブラリ部分評価](future/3d/reports/3D_LIB_EVALUATION.md)。
- [glTF2公式仕様](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html): 入出力profileの基準。
- [Three.js r186 LICENSE](https://github.com/mrdoob/three.js/blob/r186/LICENSE): 採用候補の一次ライセンス。API/配布物の固定資料は採用記録へ追記する。
- [batch検査参考](https://github.com/chameleonjp-lab/chameleonjp-browser-game-harness/blob/50229ded69378ed6392453e73856482eb78b7354/references/test-batching.md): 2026-10-03確認。Studioの全ハーネス採用版を更新するものではない。

0.1.0: 要件merge後の計画案。コード・図成果物・dependency変更なし。
