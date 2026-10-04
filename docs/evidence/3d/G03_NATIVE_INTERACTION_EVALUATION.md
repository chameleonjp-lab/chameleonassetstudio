# G03 native選択・変形の限定評価

状態: 隔離した候補実装を検査中。製品画面への接続・gizmo採用・実機合格を示さない。
基準code: `f455595dc3f18dc17cac8c7deb4060d53b7cd57a` のnative制作/組立基盤。
対象: [B04 / EDIT-02/03/05 / VIEW-04/05](../../THREE_D_IMPLEMENTATION_PLAN_2026-10-03.md#b04-空から造形し材質を仕上げる)。

## G03a 配布物と範囲

依存追加・version変更は行わない。既存の固定Three配布物からRaycasterとTransformControlsの編集動作だけを評価する。

| 配布物 | 固定値 |
| --- | --- |
| three | 0.186.1、https://registry.npmjs.org/three/-/three-0.186.1.tgz |
| npm integrity | sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA== |
| @types/three | 0.186.0、https://registry.npmjs.org/@types/three/-/three-0.186.0.tgz、既存lockのまま |
| types integrity | sha512-mxYSBpDC+D0pLfSP6sW4WZTcT+nrtmZcimMqnVmy36Hte3XpeYSrvgg4TRdaM1GemGog1AWzI5qL2VoIfMXbJQ== |
| license | MIT、2010–2026 three.js authors。既存noticeを維持 |
| LICENSE SHA-256 | 8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc |
| TransformControls.js SHA-256 | 151befe25bb0d68626f9a6b033625b7b0cf6848e39ba71623b7bed8e3df565d6 |
| Raycaster.js SHA-256 | 2dd39d5742ee7aa5e54f4c83bd6b34d59f281f2c467e1dc0ce5122b89905f6d0 |

TransformControlsの直接importは `three` のみ。同梱sourceを仕様確認の正本とし、[公式TransformControls](https://threejs.org/docs/pages/TransformControls.html) と [Raycaster](https://threejs.org/docs/pages/Raycaster.html) は補助参照とする。GLB/decoder/外部modelは対象外。

## 確認済みの統合課題

- 同梱TransformControlsはworld指定でもscale操作をlocalへ固定する。world拡縮をそのまま製品対応と呼ばない
- pointercancelの処理がなく、resetはobjectChangeを発生させるがdraggingを終えない。cancelの正否は独自transactionが所有する
- 現製品はauthoring/assembly/inspectionの選択が分かれ、portにはpick/edit eventがない。選択同期は別途明示的なcontractが必要
- history previewはrevisionを増やさず、現panelは同revisionのsetProjectを省略する。強制setProjectはgraph/controlsを再構築するため、per-frame previewには使わない
- PNGと休止の既存判定はrevisionのみ。未確定previewの画像を確定済みとして出さないsnapshot barrierが必要

## 限定G03bの受入条件

自己作成した小さいnative box/group、有限TRSだけで評価する。新規外部入力形式は扱わない。

1. canonical IDによるpick/selection。canvasのCSS矩形からrayを作り、helperや非表示祖先を除外する
2. generation/token、project/revision、固定target/pivot/start値を持つbegin/update/commit/cancel。previewは正本・保存・Undoを更新しない
3. pointerと数値deltaで同じsnap/評価を使う。commit一回、cancel/no-opはrevisionと履歴を増やさない。最後のinvalid入力から古いpreviewをcommitしない
4. helper proxyのworld/local frameを明示。world deltaを親の逆行列でlocalへ戻し、保存TRSで表せないshearは原子的に拒否する。proxyで任意shearを解消したとは扱わない
5. gizmoとOrbitの入力所有、Escape/明示取消/pointercancel/lost capture/第二pointer/対象変更/背景/凍結/pagehide/context loss/破棄で取消。遅いmouseUpやreset由来eventを抑止する
6. previewのsnapshot混入を防止し、read-onlyや既知の競合でcommitしない。確定済み未保存作品は既存backup経路へ保持する
7. helper geometry/material、listener、capture、frameを所有し、反復終了後にbaselineへ戻る。両投影、375px、keyboard/数値代替を検査する
8. Node検査・型・buildと、許可されたCIの実browser検査を区別して記録。実機/iPhone GPU予算は別gate

評価専用の `tools/3d-edit-evaluation/` と `e2e/native-transform-evaluation.spec.ts` に閉じ込める。製品entryからimportせず、配信layoutへ追加しない。browser証拠は通常CIで取得し、Nodeの模擬event検査と実browserの結果を区別する。

## G03c 製品採用の条件

限定評価の実結果、欠落機能、bundle差分、資源寿命、保存/取消の証拠を確認してから、shared selection・renderer port・session transactionへ接続する。native保存schema 0.1.0は維持する。候補codeが存在するだけで、EDIT/VIEWのMUSTやB04全体を完了扱いしない。

最終headと実browser結果はPRのcheck/runへ結び付ける。未実行の項目は下記の通り残す。

## 要件との対応と判定範囲

| 要件 / 計画 | この評価で確認する境界 | 製品側に残る条件 |
| --- | --- | --- |
| EDIT-02、B04、T01/T07 | canonical object pick、複数選択、祖先/子孫lock拒否、scene/listの選択表示 | 製品各panelのshared selection、表示/lockの正本方針、削除の統合 |
| EDIT-03、B04、T01/T05/T07 | local/world proxy、translate/rotate/scale、pointerと数値の同じsnap、shear拒否 | renderer portとsession transactionへの接続、実機操作、全target対応 |
| EDIT-05、B04、T01/T02/T07 | preview非正本、一回commit、cancel/no-op無履歴、遅延event抑止 | 製品sessionのrevision/fencing、autosave、復旧/backupの実経路 |
| VIEW-04/05、B04、T05/T07 | mode/対象/dirty表示、数値/keyboard代替、375px操作 | product UIの操作到達性、export/復旧の統合、physical touch検査 |
| LIFE/PERF、B03/B09、T06/T10 | helper/listener/capture/frameの所有と反復解除 | GPU/heapの実測予算、背景継続/破棄復元、iPhone実機 |

fixtureは小さいnative box/groupのみ。S02のmesh/UV/normal/GLB全受入やAC-02をこの評価だけで完了にしない。saveはin-memory snapshotの検査であり、耐久保存の証拠ではない。suspendは入力/renderの一時停止であり、製品GPU解放の合格ではない。

## CIの配置

既存workflowへ隔離buildと両browserの早期検査を追加する。通常の全体検査と製品production検査は維持する。PNGは小さい専用artifactへ分け、失敗時も得られた診断を保持する。権限・secret・外部送信先は追加しない。

`tools/3d-edit-evaluation/`だけの変更でもbrowser検査対象になるclassifier回帰検査を追加した。製品配信の対象にはしない。build出力とreportは生成物としてignoreする。

## レビューで閉じる不具合

数理・入力所有・保存境界・lifecycleの独立レビューと、UI/CI接続側のレビューを行った。次の再現例はcandidate段階で見つかり、対象回帰検査を用意した。修正後の検査結果は同じcandidateの記録と照合する。

| ID | 再現した問題 | 修正と回帰境界 |
| --- | --- | --- |
| INT-01 | X=1e9から0.5動かしても相対許容誤差がno-op扱い | 意図した中立deltaと実数値の変更を分け、小移動を履歴へ保持。精度以下の移動は拒否 |
| INT-02 | scale=1e-8の列で絶対誤差floorが相対的に大きいshearを隠す | 列ごとの正規化直交性と、正規化quaternionからのround-tripで検査 |
| INT-03 | 小さいが可逆なparentを絶対determinant閾値で拒否 | 特異/非有限inverseと可逆性を区別し、小parent下の有限操作を確認 |
| INT-04 | [π,π,π]等の同等identity回転が新履歴になる | 同等identityの中立判定と、微小な意図的回転の保持を分ける |
| INT-05 | 最終pointer位置がdrag平面に当たらないと古いcandidateを確定 | 最終sampleの更新成立を確認し、不成立なら候補を無効化 |
| INT-06 | cameraが第一touchを所有中に第二touchがgizmoを取得 | pointer所有を先に判定。実OrbitControlsとの第二touch・取消・再開を検査 |
| INT-07 | 通常pickのpointercancel後に遅いupで選択が変わる | 保留中pickのIDも取消対象とし、遅延upを無効化 |
| INT-08 | 選択やmode変更でlock checkboxが別nodeのlockを移す/解除する | active IDに表示を同期し、lock操作だけが当該IDを追加/除去。その他の設定はlock集合を保持 |
| INT-09 | 背景/停止中のpointerがOrbitへ入りcamera gestureが残る | blocked inputを消費し、重なる停止理由の間Orbitを停止、最後の解除時に元状態へ戻す |

stock addon由来の遅いmouseUp、resetのobjectChange、Y回転のEuler branch/一周超過、PNG/save/suspendの正本境界も回帰対象とする。これらはnative操作評価であり、外部ファイルの安全性検証ではない。

## この提出候補の検査

2026-10-04 UTC、レビュー修正後のcandidateについて次を確認した。

- focused Node: 3 files / 125 tests（transaction 69、picking 28、実TransformControls/OrbitControls controller 28）成功。独立レビュー側も同じ125件を再実行し、INT-01〜09の修正を確認した
- 対象eslint、全体 `tsc --noEmit`、対象Prettier、`git diff --check`: 成功
- 隔離Vite build: 18 modules、JS 615.31 kB / gzip 156.95 kB。既定500 kB warningあり。これはcandidate全体のbuild値で、製品への増分や端末budgetの合格値ではない
- CI classifier: 7 tests成功。両browserのtest discovery: 26 cases。discoveryはbrowser実行ではない
- browser実行・画像・最終head全体CI: 提出後のcheck結果で確認する。ローカル実browser合格、physical iPhone、実touch複数指、実GPU/heap測定の証拠はない

G03cは保留。評価entryの製品import、保存schema、正本の選択/lock contract、autosave、2D entryは変更していない。rollbackは隔離entry・関連検査/CI/indexの差分を戻す範囲に閉じ、作品dataのmigrationは伴わない。
