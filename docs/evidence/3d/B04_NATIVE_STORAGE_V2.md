# B04 native保存0.2.0と6属性

## 目的と境界

batch ID: B04-STORAGE-V2-20261005。承認済みの発光色・透過mode/cutoff・両面・node表示/編集lockを、UI→command→history→保存→backup→独立復元→Three表示へ通す。旧作品を残したコピー編集が終了条件。B04全体・3D製品全体の完成を意味しない。

整列PR #308をbaseとする。2Dの`asset.json`/`.casproj`/DB/JSON Schema、Web/PixiJS/Phaser出力、GLB、依存packageは変更しない。旧要件/証拠の0.1.0不変記録は当時の履歴として保持し、この承認済み変更に読み替えない。

直接対象は`src/core3d/{model,commands,storage,backup}`、`src/adapters3d/three`、`src/features/editor3d`、native product E2E、ユーザーガイド。本変更は新しい外部サービス・送信・課金・自動削除を導入しない。

## versionと保存の契約

- 編集正本は`chameleon-project-3d` schemaVersion `0.2.0`。0.1.0を受け入れる専用`validateLegacyProject`は新6項目を含む未知fieldを拒否する。未知/future versionを無断変換しない
- v2で許可する追加fieldはmaterial `emissiveColor`（linear RGB 0〜1）、`alphaMode`（OPAQUE/MASK/BLEND/LEGACY_AUTO）、`alphaCutoff`（0〜1）、`doubleSided`（boolean）、node `visible`/`locked`（boolean）。他の既存参照・finite・階層・source/skin/clip検証は維持する
- v2で追加field省略時はemissive `[0,0,0]`、alpha `LEGACY_AUTO`、cutoff `0.5`、doubleSided `false`、visible `true`、locked `false`。既存の内部fixtureやplain正本を扱うための明示契約で、旧parserの許容範囲拡大ではない。新規のbox/primitive/materialは明示defaultsを書き、alphaはOPAQUEを初期値とする
- 旧作品のcopyは全6項目を明示し、alphaを必ずLEGACY_AUTOにする。既存のA/画像alpha判定、single-sided、非発光を維持する。原本mesh/UV/normal/skin/clip/source/blobはコピー時に変形・再encodeしない
- 新DB名は`chameleon-asset-studio-3d-v2`、DB versionは1。旧`chameleon-asset-studio-3d` v1はreadonly readerのみ。新writerが旧名を指定して開く操作も拒否する
- 旧DBなしのopenはupgrade transactionをabortして空DBを作らない。存在する旧DBのroot/snapshot/全blobを一つのreadonly transactionで取得し、正本とblobのhashを検証する。旧lease/pin/metaを一切書き換えず、移行markerも旧DBへ書かない
- 新ID root/snapshot/全blob/旧形式ZIP/lease/metaを単一write transactionで保存する。途中失敗、quota、commit前cancel、既存ID競合はtransaction全体をrollbackする。stagingを使わないので半端なコピーを残さない。保存完了後のcancelは完成済みcopyを削除しない
- 旧形式の完全ZIPは新store `legacyBackups`へhash付きで保持し、ダウンロード時も検証する。旧ファイルimportでは受け取ったZIP bytesをそのまま保持する。旧DBからはその時点の一貫snapshotを0.1.0 ZIPへencodeする
- 通常0.2.0 backupは現作品の6属性と必要blobを保存し、旧0.1.0 ZIPやUndo履歴を同梱しない。別端末で旧形式控えを必要とする場合は専用ボタンから別途保管する。0.2.0のbackupだけで旧版へ戻せるとは主張しない
- 旧DBの履歴・pin・trashも原本側に残す。新copyは選んだcurrent snapshotの復元控えを持つのであり、旧DB全storeのexportではない。自動GC/移行後削除は追加しない

## command・表示

`setNodeFlags`と材質変更はcandidate検証後に一回のhistory commit。失敗時はrevision/Undo/元正本不変。lockは祖先から継承し、node/mesh/material/texture/組立commandとhistory最終guardで、共有資源・子を動かす親操作を防ぐ。自身のunlockのみ許可し、unlockと他の変更を一つのcommandで通さない。Undo/Redoはlock自体を戻せる。

Threeはemissive/side/opacity/transparent/alphaTestへ写す。LEGACY_AUTOは従来の自動alpha判定を維持し、MASKのしきい値はmaterial alphaTest、OPAQUEはalphaを無視する。BLENDの一般的な透明面sort制約は残る。visibleはscene graphへ設定し、既存pickerはhitと全祖先のvisibleを確認する。選択枠・gizmo・fit/focusもhiddenを除外する。hidden/lockedも制作一覧から選んで戻せる。context復旧では正本から同じ属性を再構築する。

## 検査batch

高risk: 新旧schema分岐、原本保持、原子的copy、quota/abort、多tabのwriter/CAS、共有資源と祖先lock、表示/入力との整合。時間を理由に異常系を延期しない。

関連集合: core3d全test、Three adapter全test、editor3d session/transaction全test。追加境界は`projectVersion.test.ts`、`legacyMigration.test.ts`、`nodeFlags.test.ts`、backup/renderer/picking、および`native-editing-product.spec.ts`末尾の2例。

- legacy: 不在DB、旧全store不変、旧writer/pin保持、strict field/future version/hash/欠損拒否、store別quota、途中abort→再試行、ID競合、exact旧archive保持
- 六属性: 有限値/型/値域境界、Undo/Redo、保存readback、独立DB復元→unlock/再編集
- render/input: 4alpha mode＋texture alpha、emissive/side、祖先visibility、pick再構築、hidden選択枠/gizmo、context復旧
- browser候補: 375px UI→6属性→Undo/Redo→lock拒否→reload→別context復元→再編集、旧copy確認/取消→quota→retry→旧復元ZIP download→原本不変

全体集合: lint、format:check、build、test、test:ci-scope、Chromium全件、WebKit重要経路、production quality。core3dは2D/H3 runtimeへ流入しないためH3計測/Pages公開は対象外（buildの既存H3出力は実行）。物理PC/iOS/Androidは自動テストと分けて未検証。

実測ログ、検査tree/差分、environment fingerprint、開始終了時刻、最終PR SHAのCIはPR本文へ記録する。同batchの全体pass baselineは開始時点に存在せず、過去greenを転用しない。途中testで旧version期待値を修正し、新規primitiveの明示flag/alpha modeをfixtureに反映した。既存期待の緩和やskipは行わない。最終候補への判定はその候補の検査結果だけで行う。

実装時のクラウドbrowser/localhost制約は過去に確認されているが、今回の実行結果を別記する。browserが起動できなければblockedであり、PNG目視・実機・browser受入の成功を主張しない。
