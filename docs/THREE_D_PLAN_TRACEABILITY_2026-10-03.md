# 3D要件と実装計画の対応表

対象: [実装計画](THREE_D_IMPLEMENTATION_PLAN_2026-10-03.md) / [上位要件](THREE_D_PRODUCT_REQUIREMENTS_2026-10-03.md)  
状態: 計画上の割当。実装・検査は未実施。169要件IDを一度ずつ列挙する。PERF-01〜08は上位§15.1の「すべてMUST」を継承する。

## 表の契約

- IDの機能・異常系・受入文は上位要件の同IDを正本とし、この表のAC参照だけへ狭めない
- 主担当Bxxの前提/依存/具体作業/完了/戻し方は計画§6。DEC番号は§4、Fxx/Txxは§8へつながる
- MUSTの状態はpending。SHOULDは基本工程との接続先を示した上でB11の個別採否待ち。FUTUREはdeferredで実装しない
- 製品実装・限定runtime検証はG00/G01/G02を満たしてから行う。限定評価はG03a確認後にG03bとして実行し、その結果でG03c製品採用へ進む。primary工程後もB10の最終head統合検査が必要
- DOCの図/索引作成はG01後の文書作業として行い、その受理がG02。G00未解決中も許容されたread-only監査・文書作成は可能で、runtime実行の許可とは分ける
- rollbackは各Bxxの非破壊方針を適用。G02の文書変更は図/indexを同時修正し、コードや採用版を無断変更しない
- DOCは第三PRのG02で関係図/索引を作り、B10まで実装追従を維持。今回の計画PRでは図成果物を先行作成しない
- 作業者は各行に実装SHA/検査run/証拠/結果を追記する。初期pendingをpassへ機械置換しない

| 要件ID | 優先 | 主担当 / 採否 | 設計DEC | fixture | 検査 | 受入シナリオ | 初期状態 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NAV-01 | MUST | B02 | 08 | F11 | T04/T11 | AC-01/10 | pending |
| NAV-02 | MUST | B02 | 08 | F11 | T04/T11 | AC-01/10 | pending |
| NAV-03 | MUST | B02 | 08 | F11 | T04/T11 | AC-01/10 | pending |
| NAV-04 | MUST | B02 | 08 | F11 | T04/T11 | AC-01/10 | pending |
| NAV-05 | MUST | B02 | 08 | F11 | T04/T11 | AC-01/10 | pending |
| NAV-06 | MUST | B02 | 08 | F11 | T04/T11 | AC-01/10 | pending |
| NAV-07 | MUST | B02 | 08 | F11 | T04/T11 | AC-01/10 | pending |
| NAV-08 | MUST | B02 | 08 | F11 | T04/T11 | AC-01/10 | pending |
| COMPAT-01 | MUST | B02 | 02/08 | F01/F08/F10/F11 | T00/T02/T04 | AC-10 | pending |
| COMPAT-02 | MUST | B02 | 02/08 | F01/F08/F10/F11 | T00/T02/T04 | AC-10 | pending |
| COMPAT-03 | MUST | B02 | 02/08 | F01/F08/F10/F11 | T00/T02/T04 | AC-10 | pending |
| COMPAT-04 | MUST | B02 | 02/08 | F01/F08/F10/F11 | T00/T02/T04 | AC-10 | pending |
| COMPAT-05 | MUST | B02 | 02/08 | F01/F08/F10/F11 | T00/T02/T04 | AC-10 | pending |
| COMPAT-06 | MUST | B04 | 03/06 | F02 | T00/T08 | AC-04/10 | pending |
| LIFE-01 | MUST | B03 | 01/09 | F07/F08/F11/F13 | T02/T05/T06 | AC-07/13 | pending |
| LIFE-02 | MUST | B03 | 01/09 | F07/F08/F11/F13 | T02/T05/T06 | AC-07/13 | pending |
| LIFE-03 | MUST | B03 | 01/09 | F07/F08/F11/F13 | T02/T05/T06 | AC-07/13 | pending |
| LIFE-04 | MUST | B03 | 01/09 | F07/F08/F11/F13 | T02/T05/T06 | AC-07/13 | pending |
| LIFE-05 | MUST | B03 | 01/09 | F07/F08/F11/F13 | T02/T05/T06 | AC-07/13 | pending |
| LIFE-06 | MUST | B03 | 01/09 | F07/F08/F11/F13 | T02/T05/T06 | AC-07/13 | pending |
| LIFE-07 | MUST | B03 | 01/09 | F07/F08/F11/F13 | T02/T05/T06 | AC-07/13 | pending |
| LIFE-08 | MUST | B09 | 09 | F08/F13 | T02/T06/T10 | AC-07/09 | pending |
| LIFE-09 | MUST | B09 | 02/09 | F09/F13 | T02/T06/T10 | AC-06/07 | pending |
| LIFE-10 | MUST | B03 | 01/09 | F07/F08/F11/F13 | T02/T05/T06 | AC-07/13 | pending |
| DATA-01 | MUST | B01 | 02/03 | F03/F04/F08/F09/F10 | T01/T02/T08 | AC-02/03/05/06 | pending |
| DATA-02 | MUST | B01 | 02/03 | F03/F04/F08/F09/F10 | T01/T02/T08 | AC-02/03/05/06 | pending |
| DATA-03 | MUST | B01 | 02/03 | F03/F04/F08/F09/F10 | T01/T02/T08 | AC-02/03/05/06 | pending |
| DATA-04 | MUST | B01 | 02/03 | F03/F04/F08/F09/F10 | T01/T02/T08 | AC-02/03/05/06 | pending |
| DATA-05 | MUST | B01 | 02/03 | F03/F04/F08/F09/F10 | T01/T02/T08 | AC-02/03/05/06 | pending |
| DATA-06 | MUST | B01 | 02/03 | F03/F04/F08/F09/F10 | T01/T02/T08 | AC-02/03/05/06 | pending |
| DATA-07 | MUST | B01 | 02/03 | F03/F04/F08/F09/F10 | T01/T02/T08 | AC-02/03/05/06 | pending |
| DATA-08 | MUST | B01 | 02/03 | F03/F04/F08/F09/F10 | T01/T02/T08 | AC-02/03/05/06 | pending |
| EDIT-01 | MUST | B04 | 02/03 | F01/F03/F08/F12 | T01/T02/T07 | AC-02/03/09 | pending |
| EDIT-02 | MUST | B04 | 02/03 | F01/F03/F08/F12 | T01/T02/T07 | AC-02/03/09 | pending |
| EDIT-03 | MUST | B04 | 02/03 | F01/F03/F08/F12 | T01/T02/T07 | AC-02/03/09 | pending |
| EDIT-04 | MUST | B04 | 02/03 | F01/F03/F08/F12 | T01/T02/T07 | AC-02/03/09 | pending |
| EDIT-05 | MUST | B04 | 02/03 | F01/F03/F08/F12 | T01/T02/T07 | AC-02/03/09 | pending |
| EDIT-06 | MUST | B04 | 02/03 | F01/F03/F08/F12 | T01/T02/T07 | AC-02/03/09 | pending |
| EDIT-07 | MUST | B04 | 02/03 | F01/F03/F08/F12 | T01/T02/T07 | AC-02/03/09 | pending |
| EDIT-08 | SHOULD | B11（接続B04） | 02/03 | F01/F03/F08/F12 | T01/T02/T07 | AC-02/03/09 | 個別採否待ち |
| MODEL-01 | MUST | B04 | 03 | F01/F03/F12 | T01/T05/T07/T08 | AC-02 | pending |
| MODEL-02 | MUST | B04 | 03 | F01/F03/F12 | T01/T05/T07/T08 | AC-02 | pending |
| MODEL-03 | MUST | B04 | 03 | F01/F03/F12 | T01/T05/T07/T08 | AC-02 | pending |
| MODEL-04 | MUST | B04 | 03 | F01/F03/F12 | T01/T05/T07/T08 | AC-02 | pending |
| MODEL-05 | MUST | B04 | 03 | F01/F03/F12 | T01/T05/T07/T08 | AC-02 | pending |
| MODEL-06 | SHOULD | B11（接続B04） | 03 | F01/F03/F12 | T01/T05/T07/T08 | AC-02 | 個別採否待ち |
| MODEL-07 | SHOULD | B11（接続B04） | 03 | F01/F03/F12 | T01/T05/T07/T08 | AC-02 | 個別採否待ち |
| MODEL-08 | FUTURE | 対象外 | 別要件変更 | 採用後定義 | 未採用 | 基本完成の対象外 | deferred |
| MAT-01 | MUST | B04 | 03/06 | F02/F03 | T01/T05/T08 | AC-02/04 | pending |
| MAT-02 | MUST | B04 | 03/06 | F02/F03 | T01/T05/T08 | AC-02/04 | pending |
| MAT-03 | MUST | B04 | 03/06 | F02/F03 | T01/T05/T08 | AC-02/04 | pending |
| MAT-04 | MUST | B04 | 03/06 | F02/F03 | T01/T05/T08 | AC-02/04 | pending |
| MAT-05 | SHOULD | B11（接続B04） | 03/06 | F02/F03 | T01/T05/T08 | AC-02/04 | 個別採否待ち |
| MAT-06 | SHOULD | B11（接続B04） | 03/06 | F02/F03 | T01/T05/T08 | AC-02/04 | 個別採否待ち |
| MAT-07 | FUTURE | 対象外 | 別要件変更 | 採用後定義 | 未採用 | 基本完成の対象外 | deferred |
| VIEW-01 | MUST | B03 | 01/09 | F01/F02/F11/F12 | T04/T05/T07 | AC-01/02/09 | pending |
| VIEW-02 | MUST | B03 | 01/09 | F01/F02/F11/F12 | T04/T05/T07 | AC-01/02/09 | pending |
| VIEW-03 | MUST | B03 | 01/09 | F01/F02/F11/F12 | T04/T05/T07 | AC-01/02/09 | pending |
| VIEW-04 | MUST | B04 | 03/04 | F01/F04/F12 | T05/T07 | AC-02/03/09 | pending |
| VIEW-05 | MUST | B04 | 03/05 | F01/F12 | T07 | AC-02/09 | pending |
| VIEW-06 | MUST | B03 | 01/09 | F01/F02/F11/F12 | T04/T05/T07 | AC-01/02/09 | pending |
| VIEW-07 | SHOULD | B11（接続B03） | 01/09 | F01/F02/F11/F12 | T04/T05/T07 | AC-01/02/09 | 個別採否待ち |
| VIEW-08 | FUTURE | 対象外 | 別要件変更 | 採用後定義 | 未採用 | 基本完成の対象外 | deferred |
| RIG-01 | MUST | B05 | 03/04 | F04/F12 | T01/T05/T07/T08 | AC-03 | pending |
| RIG-02 | MUST | B05 | 03/04 | F04/F12 | T01/T05/T07/T08 | AC-03 | pending |
| RIG-03 | MUST | B05 | 03/04 | F04/F12 | T01/T05/T07/T08 | AC-03 | pending |
| RIG-04 | MUST | B05 | 03/04 | F04/F12 | T01/T05/T07/T08 | AC-03 | pending |
| RIG-05 | MUST | B05 | 03/04 | F04/F12 | T01/T05/T07/T08 | AC-03 | pending |
| RIG-06 | MUST | B05 | 03/04 | F04/F12 | T01/T05/T07/T08 | AC-03 | pending |
| RIG-07 | SHOULD | B11（接続B05） | 03/04 | F04/F12 | T01/T05/T07/T08 | AC-03 | 個別採否待ち |
| RIG-08 | SHOULD | B11（接続B05） | 03/04 | F04/F12 | T01/T05/T07/T08 | AC-03 | 個別採否待ち |
| RIG-09 | FUTURE | 対象外 | 別要件変更 | 採用後定義 | 未採用 | 基本完成の対象外 | deferred |
| ANIM-01 | MUST | B06 | 04/06 | F04/F05/F12 | T01/T05/T07/T08 | AC-03/07 | pending |
| ANIM-02 | MUST | B06 | 04/06 | F04/F05/F12 | T01/T05/T07/T08 | AC-03/07 | pending |
| ANIM-03 | MUST | B06 | 04/06 | F04/F05/F12 | T01/T05/T07/T08 | AC-03/07 | pending |
| ANIM-04 | MUST | B06 | 04/06 | F04/F05/F12 | T01/T05/T07/T08 | AC-03/07 | pending |
| ANIM-05 | MUST | B06 | 04/06 | F04/F05/F12 | T01/T05/T07/T08 | AC-03/07 | pending |
| ANIM-06 | MUST | B06 | 04/06 | F04/F05/F12 | T01/T05/T07/T08 | AC-03/07 | pending |
| ANIM-07 | MUST | B06 | 04/06 | F04/F05/F12 | T01/T05/T07/T08 | AC-03/07 | pending |
| ANIM-08 | SHOULD | B11（接続B06） | 04/06 | F04/F05/F12 | T01/T05/T07/T08 | AC-03/07 | 個別採否待ち |
| ANIM-09 | SHOULD | B11（接続B06） | 04/06 | F04/F05/F12 | T01/T05/T07/T08 | AC-03/07 | 個別採否待ち |
| ANIM-10 | SHOULD | B11（接続B06） | 04/06 | F04/F05/F12 | T01/T05/T07/T08 | AC-03/07 | 個別採否待ち |
| ANIM-11 | FUTURE | 対象外 | 別要件変更 | 採用後定義 | 未採用 | 基本完成の対象外 | deferred |
| GAME-01 | MUST | B07 | 02/06 | F06 | T01/T08/T09 | AC-03/04 | pending |
| GAME-02 | MUST | B07 | 02/06 | F06 | T01/T08/T09 | AC-03/04 | pending |
| GAME-03 | MUST | B07 | 02/06 | F06 | T01/T08/T09 | AC-03/04 | pending |
| GAME-04 | MUST | B07 | 02/06 | F06 | T01/T08/T09 | AC-03/04 | pending |
| GAME-05 | SHOULD | B11（接続B07） | 02/06 | F06 | T01/T08/T09 | AC-03/04 | 個別採否待ち |
| GAME-06 | FUTURE | 対象外 | 別要件変更 | 採用後定義 | 未採用 | 基本完成の対象外 | deferred |
| IMP-01 | MUST | B03 | 01/06 | F02/F07/F10 | T03/T12 | AC-04/08 | pending |
| IMP-02 | MUST | B03 | 01/06 | F02/F07/F10 | T03/T12 | AC-04/08 | pending |
| IMP-03 | MUST | B03 | 01/06 | F02/F07/F10 | T03/T12 | AC-04/08 | pending |
| IMP-04 | MUST | B03 | 01/06 | F02/F07/F10 | T03/T12 | AC-04/08 | pending |
| IMP-05 | MUST | B03 | 01/06 | F02/F07/F10 | T03/T12 | AC-04/08 | pending |
| IMP-06 | MUST | B03 | 01/06 | F02/F07/F10 | T03/T12 | AC-04/08 | pending |
| IMP-07 | MUST | B03 | 01/06 | F02/F07/F10 | T03/T12 | AC-04/08 | pending |
| IMP-08 | MUST | B03 | 01/06 | F02/F07/F10 | T03/T12 | AC-04/08 | pending |
| SAVE-01 | MUST | B01 | 02/09 | F08/F09/F10/F13 | T02/T06/T08 | AC-05/06/13 | pending |
| SAVE-02 | MUST | B01 | 02/09 | F08/F09/F10/F13 | T02/T06/T08 | AC-05/06/13 | pending |
| SAVE-03 | MUST | B01 | 02/09 | F08/F09/F10/F13 | T02/T06/T08 | AC-05/06/13 | pending |
| SAVE-04 | MUST | B01 | 02/09 | F08/F09/F10/F13 | T02/T06/T08 | AC-05/06/13 | pending |
| SAVE-05 | MUST | B01 | 02/09 | F08/F09/F10/F13 | T02/T06/T08 | AC-05/06/13 | pending |
| SAVE-06 | MUST | B01 | 02/09 | F08/F09/F10/F13 | T02/T06/T08 | AC-05/06/13 | pending |
| SAVE-07 | MUST | B01 | 02/09 | F08/F09/F10/F13 | T02/T06/T08 | AC-05/06/13 | pending |
| SAVE-08 | MUST | B01 | 02/09 | F08/F09/F10/F13 | T02/T06/T08 | AC-05/06/13 | pending |
| SAVE-09 | MUST | B01 | 02/09 | F08/F09/F10/F13 | T02/T06/T08 | AC-05/06/13 | pending |
| SAVE-10 | SHOULD | B11（接続B01） | 02/09 | F08/F09/F10/F13 | T02/T06/T08 | AC-05/06/13 | 個別採否待ち |
| EXP-01 | MUST | B07 | 06/07 | F01/F02/F04/F05/F06/F10 | T03/T08/T09 | AC-02/03/04/08 | pending |
| EXP-02 | MUST | B07 | 06/07 | F01/F02/F04/F05/F06/F10 | T03/T08/T09 | AC-02/03/04/08 | pending |
| EXP-03 | MUST | B07 | 06/07 | F01/F02/F04/F05/F06/F10 | T03/T08/T09 | AC-02/03/04/08 | pending |
| EXP-04 | MUST | B07 | 06/07 | F01/F02/F04/F05/F06/F10 | T03/T08/T09 | AC-02/03/04/08 | pending |
| EXP-05 | MUST | B07 | 06/07 | F01/F02/F04/F05/F06/F10 | T03/T08/T09 | AC-02/03/04/08 | pending |
| EXP-06 | MUST | B07 | 06/07 | F01/F02/F04/F05/F06/F10 | T03/T08/T09 | AC-02/03/04/08 | pending |
| EXP-07 | MUST | B07 | 06/07 | F01/F02/F04/F05/F06/F10 | T03/T08/T09 | AC-02/03/04/08 | pending |
| EXP-08 | MUST | B08 | 07 | F01/F04/F06 | T09 | AC-02/03/04 | pending |
| EXP-09 | SHOULD | B11（接続B07） | 06/07 | F01/F02/F04/F05/F06/F10 | T03/T08/T09 | AC-02/03/04/08 | 個別採否待ち |
| EXP-10 | MUST | B07 | 06/07 | F01/F02/F04/F05/F06/F10 | T03/T08/T09 | AC-02/03/04/08 | pending |
| QA-01 | MUST | B08 | 05/06 | F03/F06/F07/F13 | T01/T06/T09 | AC-04/08/12 | pending |
| QA-02 | MUST | B08 | 05/06 | F03/F06/F07/F13 | T01/T06/T09 | AC-04/08/12 | pending |
| QA-03 | SHOULD | B11（接続B08） | 05/06 | F03/F06/F07/F13 | T01/T06/T09 | AC-04/08/12 | 個別採否待ち |
| QA-04 | MUST | B08 | 05/06 | F03/F06/F07/F13 | T01/T06/T09 | AC-04/08/12 | pending |
| QA-05 | MUST | B08 | 05/06 | F03/F06/F07/F13 | T01/T06/T09 | AC-04/08/12 | pending |
| PERF-01 | MUST | B09 | 05/09 | F11/F13 | T04/T06/T10 | AC-01/07/09 | pending |
| PERF-02 | MUST | B09 | 05/09 | F11/F13 | T04/T06/T10 | AC-01/07/09 | pending |
| PERF-03 | MUST | B09 | 05/09 | F11/F13 | T04/T06/T10 | AC-01/07/09 | pending |
| PERF-04 | MUST | B09 | 05/09 | F11/F13 | T04/T06/T10 | AC-01/07/09 | pending |
| PERF-05 | MUST | B09 | 05/09 | F11/F13 | T04/T06/T10 | AC-01/07/09 | pending |
| PERF-06 | MUST | B09 | 05/09 | F11/F13 | T04/T06/T10 | AC-01/07/09 | pending |
| PERF-07 | MUST | B09 | 05/09 | F11/F13 | T04/T06/T10 | AC-01/07/09 | pending |
| PERF-08 | MUST | B01+B09 | 05/09 | F11/F13 | T04/T06/T10 | AC-01/07/09 | pending |
| UX-01 | MUST | B09 | 05/08/09 | F01/F04/F11/F12 | T07/T10 | AC-09/12 | pending |
| UX-02 | MUST | B09 | 05/08/09 | F01/F04/F11/F12 | T07/T10 | AC-09/12 | pending |
| UX-03 | MUST | B09 | 05/08/09 | F01/F04/F11/F12 | T07/T10 | AC-09/12 | pending |
| UX-04 | MUST | B09 | 05/08/09 | F01/F04/F11/F12 | T07/T10 | AC-09/12 | pending |
| UX-05 | MUST | B09 | 05/08/09 | F01/F04/F11/F12 | T07/T10 | AC-09/12 | pending |
| UX-06 | MUST | B09 | 05/08/09 | F01/F04/F11/F12 | T07/T10 | AC-09/12 | pending |
| UX-07 | MUST | B09 | 05/08/09 | F01/F04/F11/F12 | T07/T10 | AC-09/12 | pending |
| UX-08 | MUST | B09 | 05/08/09 | F01/F04/F11/F12 | T07/T10 | AC-09/12 | pending |
| UX-09 | SHOULD | B11（接続B09） | 05/08/09 | F01/F04/F11/F12 | T07/T10 | AC-09/12 | 個別採否待ち |
| SEC-01 | MUST | B03 | 01/02/06 | F07/F08/F10 | T03/T12 | AC-08/15 | pending |
| SEC-02 | MUST | B03 | 01/02/06 | F07/F08/F10 | T03/T12 | AC-08/15 | pending |
| SEC-03 | MUST | B03 | 01/02/06 | F07/F08/F10 | T03/T12 | AC-08/15 | pending |
| SEC-04 | MUST | B00 | 01/07 | F07 | T12 | AC-08 | pending |
| SEC-05 | MUST | B00 | 01/02 | F01/F02/F04 | T12 | AC-12 | pending |
| SEC-06 | MUST | B08 | 02/06 | F07/F10 | T03/T08/T12 | AC-04/08 | pending |
| SEC-07 | MUST | B10 | 02/10 | F08/F11 | T11/T12 | AC-15 | pending |
| SEC-08 | MUST | B03 | 01/02/06 | F07/F08/F10 | T03/T12 | AC-08/15 | pending |
| SEC-09 | MUST | B03 | 01/02/06 | F07/F08/F10 | T03/T12 | AC-08/15 | pending |
| DOC-01 | MUST | G02+B10 | 10 | F11 | T12 | AC-11 | pending |
| DOC-02 | MUST | G02+B10 | 10 | F11 | T12 | AC-11 | pending |
| DOC-03 | MUST | G02+B10 | 10 | F11 | T12 | AC-11 | pending |
| DOC-04 | MUST | G02+B10 | 10 | F11 | T12 | AC-11 | pending |
| DOC-05 | MUST | G02+B10 | 10 | F11 | T12 | AC-11 | pending |
| DOC-06 | MUST | G02+B10 | 10 | F11 | T12 | AC-11 | pending |
| DOC-07 | MUST | G02+B10 | 10 | F11 | T12 | AC-11 | pending |
| DOC-08 | MUST | G02+B10 | 10 | F11 | T12 | AC-11 | pending |
| DOC-09 | MUST | G02+B10 | 10 | F11 | T12 | AC-11 | pending |
| OPS-01 | MUST | B10 | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | pending |
| OPS-02 | MUST | B10 | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | pending |
| OPS-03 | MUST | B10 | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | pending |
| OPS-04 | MUST | B10 | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | pending |
| OPS-05 | MUST | B10 | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | pending |
| OPS-06 | MUST | B10 | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | pending |
| OPS-07 | MUST | B10 | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | pending |
| OPS-08 | MUST | B10 | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | pending |
| OPS-09 | MUST | B10 | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | pending |
| OPS-10 | MUST | B10 | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | pending |
| OPS-11 | MUST | B10 | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | pending |
| OPS-12 | SHOULD | B11（接続B10） | 02/08/09/10 | F08/F10/F11/F13 | T11/T12 | AC-13/14/15 | 個別採否待ち |

## 横断条件の追跡

| 本文の追加契約 | 担当 | 検査/証拠 |
| --- | --- | --- |
| 要件§4.2処理別background・freeze | B03/B06/B09 | F09/F11/F13、T05/T06/T10 |
| §6.2topology属性とbind済み拒否 | B04/B05 | F03/F04、T01/T08 |
| §8.2rest/pose・複数skin・二重transform | B01/B05/B07 | F04/F06、T01/T08/T09 |
| §9loop・duration・補間境界 | B06/B07/B08 | F05、T01/T08/T09 |
| §12同tab/多tabrace・独立backup・sharedquota | B01/B09 | F08/F09/F10/F13、T02/T06/T10 |
| §12初回offlineでもnetwork不要の完全救出 | B01/B10 | F08/F11、T02/T11、AC-13 |
| §13画像変換・自己完結・最終GLB mapping | B07/B08 | F02/F06、T08/T09 |
| §15.3操作×端末MUST、§16IME/interrupt | B04〜B06/B09 | F12/F13、T07/T10 |
| §19.3独立validator・同値/誤差/色条件 | B07/B08 | 計画§8.3、T08/T09 |
| §19.4更新/rollback/diagnostics/rights | B10 | F08/F10/F11、T11/T12、AC-13〜15 |
| §19.5役割別レビューと重大指摘解消 | 全工程/B10 | 指摘台帳、対象hash、修正/再確認 |

## flowを工程末まで閉じる

| flow | 初回成立を目指す工程 | 最終証拠 |
| --- | --- | --- |
| FLOW-01 道具・開閉 | B04制作、B06動作、B07出力、B08consumer | T08/T09、空からの制作記録 |
| FLOW-02 動くskinキャラクター | B05skin、B06key、B07出力、B08consumer | 混合weight・利用者作成key・独立backup・別consumer |
| FLOW-03 環境パーツ | B04制作、B07game情報/出力 | 寸法/材質/anchor/collider |
| FLOW-04 外部修正 | B03取込、B04〜B07変更、B08比較 | source hash不変、変更後実バイト |
| FLOW-05 2D/3D使い分け | B02入口、B03寿命、B09同時tab | T00/T04/T06、未保存保全 |
| FLOW-06 mobile再開 | B01backup、B04〜B06入力、B09実機 | 全MUST到達と失敗/復帰、単なるviewer不可 |
