# 要件から配置・検査・証拠への対応

[索引へ](README.md)。上位の [169要件対応表](../../THREE_D_PLAN_TRACEABILITY_2026-10-03.md) と同じID・優先度・主担当を保持し、配置groupと図への接続を追加する。受入全文、DEC、Fxx/Txx、ACは上位表の同IDが正本であり省略しない。

## 対応の読み方

要件ID → 上位表のBxx/DEC/Fxx/Txx/AC → 下表のMgroup → [所有台帳の予定files/tests](ownership.md) → 対象SHAの証拠。P code/test/evidence pathは未作成。Mgroupは責務の集合であり各要件が全ファイルを必ず変更する指示ではない。具体diffと関連testsは工程開始時に絞る。

全工程の証拠予定先は `docs/evidence/3d/Bxx.md`（P）、fixture仕様/権利/hashは `src/core3d/fixtures/`（P）。同じファイルへ要件ID、対象SHA/tree、fixture hash、test command/run、expected/actual、状態、画像/出力hash、制限を残す。自動生成した一覧をpass証拠にしない。実行log保持期限後も再現条件を残す。

- B00: M00で採用根拠。B01: M01〜04で正本/救出。B02: M05と既存build/2D互換
- B03: M06/M07/M13/M15。B04: M08/M14。B05: M09/M14。B06: M10/M14
- B07: M11。B08: M12。B09: M13〜15と全制作UI。B10: M16と全MUST統合。G02: M17
- B11は上位表の接続工程に属するgroupを候補とし、SHOULD/FUTUREの採用前に新pathを実装しない

既存2D検査は `src/core/**/*.test.ts`、`e2e/casproj.spec.ts`、`e2e/export.spec.ts`、`e2e/generic-web.spec.ts`、`e2e/pixijs.spec.ts`、`e2e/phaser.spec.ts` 等（E）。実行対象はT00とR01で決め、列挙したファイルだけへ回帰を縮めない。

## 全要件配置索引

| 要件ID | 優先 | 主担当 / 採否（上位と一致） | 配置group | 主図 | fixture / test（上位と一致） |
| --- | --- | --- | --- | --- | --- |
| NAV-01 | MUST | B02 | M05 | [図](entries.md) | F11 / T04/T11 |
| NAV-02 | MUST | B02 | M05 | [図](entries.md) | F11 / T04/T11 |
| NAV-03 | MUST | B02 | M05 | [図](entries.md) | F11 / T04/T11 |
| NAV-04 | MUST | B02 | M05 | [図](entries.md) | F11 / T04/T11 |
| NAV-05 | MUST | B02 | M05 | [図](entries.md) | F11 / T04/T11 |
| NAV-06 | MUST | B02 | M05 | [図](entries.md) | F11 / T04/T11 |
| NAV-07 | MUST | B02 | M05 | [図](entries.md) | F11 / T04/T11 |
| NAV-08 | MUST | B02 | M05 | [図](entries.md) | F11 / T04/T11 |
| COMPAT-01 | MUST | B02 | M01/M04/M05/M11 | [図](entries.md) | F01/F08/F10/F11 / T00/T02/T04 |
| COMPAT-02 | MUST | B02 | M01/M04/M05/M11 | [図](entries.md) | F01/F08/F10/F11 / T00/T02/T04 |
| COMPAT-03 | MUST | B02 | M01/M04/M05/M11 | [図](entries.md) | F01/F08/F10/F11 / T00/T02/T04 |
| COMPAT-04 | MUST | B02 | M01/M04/M05/M11 | [図](entries.md) | F01/F08/F10/F11 / T00/T02/T04 |
| COMPAT-05 | MUST | B02 | M01/M04/M05/M11 | [図](entries.md) | F01/F08/F10/F11 / T00/T02/T04 |
| COMPAT-06 | MUST | B04 | M01/M04/M05/M07/M08/M11 | [図](entries.md) | F02 / T00/T08 |
| LIFE-01 | MUST | B03 | M04/M06/M13/M15 | [図](lifecycle.md) | F07/F08/F11/F13 / T02/T05/T06 |
| LIFE-02 | MUST | B03 | M04/M06/M13/M15 | [図](lifecycle.md) | F07/F08/F11/F13 / T02/T05/T06 |
| LIFE-03 | MUST | B03 | M04/M06/M13/M15 | [図](lifecycle.md) | F07/F08/F11/F13 / T02/T05/T06 |
| LIFE-04 | MUST | B03 | M04/M06/M13/M15 | [図](lifecycle.md) | F07/F08/F11/F13 / T02/T05/T06 |
| LIFE-05 | MUST | B03 | M04/M06/M13/M15 | [図](lifecycle.md) | F07/F08/F11/F13 / T02/T05/T06 |
| LIFE-06 | MUST | B03 | M04/M06/M13/M15 | [図](lifecycle.md) | F07/F08/F11/F13 / T02/T05/T06 |
| LIFE-07 | MUST | B03 | M04/M06/M13/M15 | [図](lifecycle.md) | F07/F08/F11/F13 / T02/T05/T06 |
| LIFE-08 | MUST | B09 | M04/M06/M13/M15 | [図](lifecycle.md) | F08/F13 / T02/T06/T10 |
| LIFE-09 | MUST | B09 | M04/M06/M13/M15 | [図](lifecycle.md) | F09/F13 / T02/T06/T10 |
| LIFE-10 | MUST | B03 | M04/M06/M13/M15 | [図](lifecycle.md) | F07/F08/F11/F13 / T02/T05/T06 |
| DATA-01 | MUST | B01 | M01/M03/M04 | [図](dataflow.md) | F03/F04/F08/F09/F10 / T01/T02/T08 |
| DATA-02 | MUST | B01 | M01/M03/M04 | [図](dataflow.md) | F03/F04/F08/F09/F10 / T01/T02/T08 |
| DATA-03 | MUST | B01 | M01/M03/M04 | [図](dataflow.md) | F03/F04/F08/F09/F10 / T01/T02/T08 |
| DATA-04 | MUST | B01 | M01/M03/M04 | [図](dataflow.md) | F03/F04/F08/F09/F10 / T01/T02/T08 |
| DATA-05 | MUST | B01 | M01/M03/M04 | [図](dataflow.md) | F03/F04/F08/F09/F10 / T01/T02/T08 |
| DATA-06 | MUST | B01 | M01/M03/M04 | [図](dataflow.md) | F03/F04/F08/F09/F10 / T01/T02/T08 |
| DATA-07 | MUST | B01 | M01/M03/M04 | [図](dataflow.md) | F03/F04/F08/F09/F10 / T01/T02/T08 |
| DATA-08 | MUST | B01 | M01/M03/M04 | [図](dataflow.md) | F03/F04/F08/F09/F10 / T01/T02/T08 |
| EDIT-01 | MUST | B04 | M01/M02/M03/M04/M05/M14 | [図](dataflow.md) | F01/F03/F08/F12 / T01/T02/T07 |
| EDIT-02 | MUST | B04 | M01/M02/M14 | [図](dataflow.md) | F01/F03/F08/F12 / T01/T02/T07 |
| EDIT-03 | MUST | B04 | M01/M02/M14 | [図](dataflow.md) | F01/F03/F08/F12 / T01/T02/T07 |
| EDIT-04 | MUST | B04 | M01/M02/M14 | [図](dataflow.md) | F01/F03/F08/F12 / T01/T02/T07 |
| EDIT-05 | MUST | B04 | M01/M02/M14 | [図](dataflow.md) | F01/F03/F08/F12 / T01/T02/T07 |
| EDIT-06 | MUST | B04 | M01/M02/M14 | [図](dataflow.md) | F01/F03/F08/F12 / T01/T02/T07 |
| EDIT-07 | MUST | B04 | M01/M02/M14 | [図](dataflow.md) | F01/F03/F08/F12 / T01/T02/T07 |
| EDIT-08 | SHOULD | B11（接続B04） | M01/M02/M14 | [図](dataflow.md) | F01/F03/F08/F12 / T01/T02/T07 |
| MODEL-01 | MUST | B04 | M01/M02/M08/M14 | [図](ownership.md) | F01/F03/F12 / T01/T05/T07/T08 |
| MODEL-02 | MUST | B04 | M01/M02/M08/M14 | [図](ownership.md) | F01/F03/F12 / T01/T05/T07/T08 |
| MODEL-03 | MUST | B04 | M01/M02/M08/M14 | [図](ownership.md) | F01/F03/F12 / T01/T05/T07/T08 |
| MODEL-04 | MUST | B04 | M01/M02/M08/M14 | [図](ownership.md) | F01/F03/F12 / T01/T05/T07/T08 |
| MODEL-05 | MUST | B04 | M01/M02/M08/M14 | [図](ownership.md) | F01/F03/F12 / T01/T05/T07/T08 |
| MODEL-06 | SHOULD | B11（接続B04） | M01/M02/M08/M14 | [図](ownership.md) | F01/F03/F12 / T01/T05/T07/T08 |
| MODEL-07 | SHOULD | B11（接続B04） | M01/M02/M08/M14 | [図](ownership.md) | F01/F03/F12 / T01/T05/T07/T08 |
| MODEL-08 | FUTURE | 対象外 | M01/M02/M08/M14 | [図](ownership.md) | 採用後定義 / 未採用 |
| MAT-01 | MUST | B04 | M01/M02/M08/M14 | [図](ownership.md) | F02/F03 / T01/T05/T08 |
| MAT-02 | MUST | B04 | M01/M02/M08/M14 | [図](ownership.md) | F02/F03 / T01/T05/T08 |
| MAT-03 | MUST | B04 | M01/M02/M08/M14 | [図](ownership.md) | F02/F03 / T01/T05/T08 |
| MAT-04 | MUST | B04 | M01/M02/M08/M14 | [図](ownership.md) | F02/F03 / T01/T05/T08 |
| MAT-05 | SHOULD | B11（接続B04） | M01/M02/M08/M14 | [図](ownership.md) | F02/F03 / T01/T05/T08 |
| MAT-06 | SHOULD | B11（接続B04） | M01/M02/M08/M14 | [図](ownership.md) | F02/F03 / T01/T05/T08 |
| MAT-07 | FUTURE | 対象外 | M01/M02/M08/M14 | [図](ownership.md) | 採用後定義 / 未採用 |
| VIEW-01 | MUST | B03 | M06/M13/M14 | [図](lifecycle.md) | F01/F02/F11/F12 / T04/T05/T07 |
| VIEW-02 | MUST | B03 | M06/M13/M14 | [図](lifecycle.md) | F01/F02/F11/F12 / T04/T05/T07 |
| VIEW-03 | MUST | B03 | M06/M13/M14 | [図](lifecycle.md) | F01/F02/F11/F12 / T04/T05/T07 |
| VIEW-04 | MUST | B04 | M06/M13/M14 | [図](lifecycle.md) | F01/F04/F12 / T05/T07 |
| VIEW-05 | MUST | B04 | M06/M13/M14 | [図](lifecycle.md) | F01/F12 / T07 |
| VIEW-06 | MUST | B03 | M06/M13/M14 | [図](lifecycle.md) | F01/F02/F11/F12 / T04/T05/T07 |
| VIEW-07 | SHOULD | B11（接続B03） | M06/M13/M14 | [図](lifecycle.md) | F01/F02/F11/F12 / T04/T05/T07 |
| VIEW-08 | FUTURE | 対象外 | M06/M13/M14 | [図](lifecycle.md) | 採用後定義 / 未採用 |
| RIG-01 | MUST | B05 | M01/M02/M09/M14 | [図](ownership.md) | F04/F12 / T01/T05/T07/T08 |
| RIG-02 | MUST | B05 | M01/M02/M09/M14 | [図](ownership.md) | F04/F12 / T01/T05/T07/T08 |
| RIG-03 | MUST | B05 | M01/M02/M09/M14 | [図](ownership.md) | F04/F12 / T01/T05/T07/T08 |
| RIG-04 | MUST | B05 | M01/M02/M09/M14 | [図](ownership.md) | F04/F12 / T01/T05/T07/T08 |
| RIG-05 | MUST | B05 | M01/M02/M09/M14 | [図](ownership.md) | F04/F12 / T01/T05/T07/T08 |
| RIG-06 | MUST | B05 | M01/M02/M09/M14 | [図](ownership.md) | F04/F12 / T01/T05/T07/T08 |
| RIG-07 | SHOULD | B11（接続B05） | M01/M02/M09/M14 | [図](ownership.md) | F04/F12 / T01/T05/T07/T08 |
| RIG-08 | SHOULD | B11（接続B05） | M01/M02/M09/M14 | [図](ownership.md) | F04/F12 / T01/T05/T07/T08 |
| RIG-09 | FUTURE | 対象外 | M01/M02/M09/M14 | [図](ownership.md) | 採用後定義 / 未採用 |
| ANIM-01 | MUST | B06 | M01/M02/M10/M14 | [図](ownership.md) | F04/F05/F12 / T01/T05/T07/T08 |
| ANIM-02 | MUST | B06 | M01/M02/M10/M14 | [図](ownership.md) | F04/F05/F12 / T01/T05/T07/T08 |
| ANIM-03 | MUST | B06 | M01/M02/M10/M14 | [図](ownership.md) | F04/F05/F12 / T01/T05/T07/T08 |
| ANIM-04 | MUST | B06 | M01/M02/M10/M14 | [図](ownership.md) | F04/F05/F12 / T01/T05/T07/T08 |
| ANIM-05 | MUST | B06 | M01/M02/M10/M14 | [図](ownership.md) | F04/F05/F12 / T01/T05/T07/T08 |
| ANIM-06 | MUST | B06 | M01/M02/M10/M14 | [図](ownership.md) | F04/F05/F12 / T01/T05/T07/T08 |
| ANIM-07 | MUST | B06 | M01/M02/M10/M14 | [図](ownership.md) | F04/F05/F12 / T01/T05/T07/T08 |
| ANIM-08 | SHOULD | B11（接続B06） | M01/M02/M10/M14 | [図](ownership.md) | F04/F05/F12 / T01/T05/T07/T08 |
| ANIM-09 | SHOULD | B11（接続B06） | M01/M02/M10/M14 | [図](ownership.md) | F04/F05/F12 / T01/T05/T07/T08 |
| ANIM-10 | SHOULD | B11（接続B06） | M01/M02/M10/M14 | [図](ownership.md) | F04/F05/F12 / T01/T05/T07/T08 |
| ANIM-11 | FUTURE | 対象外 | M01/M02/M10/M14 | [図](ownership.md) | 採用後定義 / 未採用 |
| GAME-01 | MUST | B07 | M01/M02/M11 | [図](dataflow.md) | F06 / T01/T08/T09 |
| GAME-02 | MUST | B07 | M01/M02/M11 | [図](dataflow.md) | F06 / T01/T08/T09 |
| GAME-03 | MUST | B07 | M01/M02/M11 | [図](dataflow.md) | F06 / T01/T08/T09 |
| GAME-04 | MUST | B07 | M01/M02/M11 | [図](dataflow.md) | F06 / T01/T08/T09 |
| GAME-05 | SHOULD | B11（接続B07） | M01/M02/M11 | [図](dataflow.md) | F06 / T01/T08/T09 |
| GAME-06 | FUTURE | 対象外 | M01/M02/M11 | [図](dataflow.md) | 採用後定義 / 未採用 |
| IMP-01 | MUST | B03 | M01/M07/M12/M15 | [図](dataflow.md) | F02/F07/F10 / T03/T12 |
| IMP-02 | MUST | B03 | M01/M07/M12/M15 | [図](dataflow.md) | F02/F07/F10 / T03/T12 |
| IMP-03 | MUST | B03 | M01/M07/M12/M15 | [図](dataflow.md) | F02/F07/F10 / T03/T12 |
| IMP-04 | MUST | B03 | M01/M07/M12/M15 | [図](dataflow.md) | F02/F07/F10 / T03/T12 |
| IMP-05 | MUST | B03 | M01/M07/M12/M15 | [図](dataflow.md) | F02/F07/F10 / T03/T12 |
| IMP-06 | MUST | B03 | M01/M07/M12/M15 | [図](dataflow.md) | F02/F07/F10 / T03/T12 |
| IMP-07 | MUST | B03 | M01/M07/M12/M15 | [図](dataflow.md) | F02/F07/F10 / T03/T12 |
| IMP-08 | MUST | B03 | M01/M07/M12/M13/M15 | [図](dataflow.md) | F02/F07/F10 / T03/T12 |
| SAVE-01 | MUST | B01 | M02/M03/M04 | [図](dataflow.md) | F08/F09/F10/F13 / T02/T06/T08 |
| SAVE-02 | MUST | B01 | M02/M03/M04 | [図](dataflow.md) | F08/F09/F10/F13 / T02/T06/T08 |
| SAVE-03 | MUST | B01 | M02/M03/M04 | [図](dataflow.md) | F08/F09/F10/F13 / T02/T06/T08 |
| SAVE-04 | MUST | B01 | M02/M03/M04 | [図](dataflow.md) | F08/F09/F10/F13 / T02/T06/T08 |
| SAVE-05 | MUST | B01 | M02/M03/M04 | [図](dataflow.md) | F08/F09/F10/F13 / T02/T06/T08 |
| SAVE-06 | MUST | B01 | M02/M03/M04 | [図](dataflow.md) | F08/F09/F10/F13 / T02/T06/T08 |
| SAVE-07 | MUST | B01 | M02/M03/M04 | [図](dataflow.md) | F08/F09/F10/F13 / T02/T06/T08 |
| SAVE-08 | MUST | B01 | M02/M03/M04 | [図](dataflow.md) | F08/F09/F10/F13 / T02/T06/T08 |
| SAVE-09 | MUST | B01 | M02/M03/M04 | [図](dataflow.md) | F08/F09/F10/F13 / T02/T06/T08 |
| SAVE-10 | SHOULD | B11（接続B01） | M02/M03/M04 | [図](dataflow.md) | F08/F09/F10/F13 / T02/T06/T08 |
| EXP-01 | MUST | B07 | M04/M11/M12 | [図](dataflow.md) | F01/F02/F04/F05/F06/F10 / T03/T08/T09 |
| EXP-02 | MUST | B07 | M04/M11/M12 | [図](dataflow.md) | F01/F02/F04/F05/F06/F10 / T03/T08/T09 |
| EXP-03 | MUST | B07 | M04/M11/M12 | [図](dataflow.md) | F01/F02/F04/F05/F06/F10 / T03/T08/T09 |
| EXP-04 | MUST | B07 | M04/M11/M12 | [図](dataflow.md) | F01/F02/F04/F05/F06/F10 / T03/T08/T09 |
| EXP-05 | MUST | B07 | M04/M11/M12 | [図](dataflow.md) | F01/F02/F04/F05/F06/F10 / T03/T08/T09 |
| EXP-06 | MUST | B07 | M04/M11/M12 | [図](dataflow.md) | F01/F02/F04/F05/F06/F10 / T03/T08/T09 |
| EXP-07 | MUST | B07 | M04/M11/M12 | [図](dataflow.md) | F01/F02/F04/F05/F06/F10 / T03/T08/T09 |
| EXP-08 | MUST | B08 | M04/M11/M12 | [図](dataflow.md) | F01/F04/F06 / T09 |
| EXP-09 | SHOULD | B11（接続B07） | M04/M11/M12 | [図](dataflow.md) | F01/F02/F04/F05/F06/F10 / T03/T08/T09 |
| EXP-10 | MUST | B07 | M04/M11/M12 | [図](dataflow.md) | F01/F02/F04/F05/F06/F10 / T03/T08/T09 |
| QA-01 | MUST | B08 | M12/M16 | [図](dataflow.md) | F03/F06/F07/F13 / T01/T06/T09 |
| QA-02 | MUST | B08 | M12/M14/M16 | [図](dataflow.md) | F03/F06/F07/F13 / T01/T06/T09 |
| QA-03 | SHOULD | B11（接続B08） | M12/M16 | [図](dataflow.md) | F03/F06/F07/F13 / T01/T06/T09 |
| QA-04 | MUST | B08 | M12/M16 | [図](dataflow.md) | F03/F06/F07/F13 / T01/T06/T09 |
| QA-05 | MUST | B08 | M12/M16 | [図](dataflow.md) | F03/F06/F07/F13 / T01/T06/T09 |
| PERF-01 | MUST | B09 | M06/M13/M15 | [図](lifecycle.md) | F11/F13 / T04/T06/T10 |
| PERF-02 | MUST | B09 | M06/M13/M15 | [図](lifecycle.md) | F11/F13 / T04/T06/T10 |
| PERF-03 | MUST | B09 | M06/M13/M15 | [図](lifecycle.md) | F11/F13 / T04/T06/T10 |
| PERF-04 | MUST | B09 | M06/M13/M15 | [図](lifecycle.md) | F11/F13 / T04/T06/T10 |
| PERF-05 | MUST | B09 | M06/M13/M15 | [図](lifecycle.md) | F11/F13 / T04/T06/T10 |
| PERF-06 | MUST | B09 | M06/M13/M15 | [図](lifecycle.md) | F11/F13 / T04/T06/T10 |
| PERF-07 | MUST | B09 | M06/M13/M15 | [図](lifecycle.md) | F11/F13 / T04/T06/T10 |
| PERF-08 | MUST | B01+B09 | M03/M06/M13/M15 | [図](lifecycle.md) | F11/F13 / T04/T06/T10 |
| UX-01 | MUST | B09 | M05/M14 | [図](lifecycle.md) | F01/F04/F11/F12 / T07/T10 |
| UX-02 | MUST | B09 | M05/M14 | [図](lifecycle.md) | F01/F04/F11/F12 / T07/T10 |
| UX-03 | MUST | B09 | M05/M14 | [図](lifecycle.md) | F01/F04/F11/F12 / T07/T10 |
| UX-04 | MUST | B09 | M05/M14 | [図](lifecycle.md) | F01/F04/F11/F12 / T07/T10 |
| UX-05 | MUST | B09 | M05/M14 | [図](lifecycle.md) | F01/F04/F11/F12 / T07/T10 |
| UX-06 | MUST | B09 | M05/M14 | [図](lifecycle.md) | F01/F04/F11/F12 / T07/T10 |
| UX-07 | MUST | B09 | M05/M14 | [図](lifecycle.md) | F01/F04/F11/F12 / T07/T10 |
| UX-08 | MUST | B09 | M05/M14 | [図](lifecycle.md) | F01/F04/F11/F12 / T07/T10 |
| UX-09 | SHOULD | B11（接続B09） | M05/M14 | [図](lifecycle.md) | F01/F04/F11/F12 / T07/T10 |
| SEC-01 | MUST | B03 | M00/M03/M07/M15/M16 | [図](dataflow.md) | F07/F08/F10 / T03/T12 |
| SEC-02 | MUST | B03 | M00/M03/M07/M15/M16 | [図](dataflow.md) | F07/F08/F10 / T03/T12 |
| SEC-03 | MUST | B03 | M00/M03/M07/M15/M16 | [図](dataflow.md) | F07/F08/F10 / T03/T12 |
| SEC-04 | MUST | B00 | M00/M03/M07/M15/M16 | [図](dataflow.md) | F07 / T12 |
| SEC-05 | MUST | B00 | M00/M03/M07/M15/M16 | [図](dataflow.md) | F01/F02/F04 / T12 |
| SEC-06 | MUST | B08 | M00/M03/M07/M15/M16 | [図](dataflow.md) | F07/F10 / T03/T08/T12 |
| SEC-07 | MUST | B10 | M00/M03/M07/M15/M16 | [図](dataflow.md) | F08/F11 / T11/T12 |
| SEC-08 | MUST | B03 | M00/M03/M07/M15/M16 | [図](dataflow.md) | F07/F08/F10 / T03/T12 |
| SEC-09 | MUST | B03 | M00/M03/M07/M15/M16 | [図](dataflow.md) | F07/F08/F10 / T03/T12 |
| DOC-01 | MUST | G02+B10 | M17 | [図](README.md) | F11 / T12 |
| DOC-02 | MUST | G02+B10 | M17 | [図](README.md) | F11 / T12 |
| DOC-03 | MUST | G02+B10 | M17 | [図](README.md) | F11 / T12 |
| DOC-04 | MUST | G02+B10 | M17 | [図](README.md) | F11 / T12 |
| DOC-05 | MUST | G02+B10 | M17 | [図](README.md) | F11 / T12 |
| DOC-06 | MUST | G02+B10 | M17 | [図](README.md) | F11 / T12 |
| DOC-07 | MUST | G02+B10 | M17 | [図](README.md) | F11 / T12 |
| DOC-08 | MUST | G02+B10 | M17 | [図](README.md) | F11 / T12 |
| DOC-09 | MUST | G02+B10 | M17 | [図](README.md) | F11 / T12 |
| OPS-01 | MUST | B10 | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |
| OPS-02 | MUST | B10 | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |
| OPS-03 | MUST | B10 | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |
| OPS-04 | MUST | B10 | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |
| OPS-05 | MUST | B10 | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |
| OPS-06 | MUST | B10 | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |
| OPS-07 | MUST | B10 | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |
| OPS-08 | MUST | B10 | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |
| OPS-09 | MUST | B10 | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |
| OPS-10 | MUST | B10 | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |
| OPS-11 | MUST | B10 | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |
| OPS-12 | SHOULD | B11（接続B10） | M00/M04/M05/M16 | [図](lifecycle.md) | F08/F10/F11/F13 / T11/T12 |

## 横断条件を閉じる

- background/freezeはLC-01/02とDF-02、B03/B06/B09、F09/F11/F13
- topologyとbindingはDF-01、M08/M09、B04/B05、F03/F04
- mixed smooth skin、rest/pose、複数skin、座標二重適用はDF-01/04、M01/M09/M11、F04/F06
- loop/duration/STEP境界はM10/M11/M12、DF-04、F05。数値許容は計画§8.3
- 同tab/多tab/GC/backupはDF-02/03、LC-01/02、M02〜04/M13、F08〜10
- 初回offline救出はEN-02、DF-03、LC-01/03、M04/M05、F08/F11
- 自己完結GLB、最終hash/index、独立consumerはDF-04、M11/M12、F02/F06
- phoneで全MUST到達、IME/中断はDF-01、LC-02、M14、F12/F13
- 更新/rollback/diagnostic privacyはLC-03、M16、F10/F11、T11/T12

FLOW-01〜06・AC-01〜15の最終閉鎖は上位表末尾と計画B10へ戻る。図があること、Mgroupを割り当てたこと、docs CI成功をruntime合格へ変換しない。

## B07 candidate evidence paths

GAME-01–04 connect to core3d/game, NativeGamePanel and Three game helpers. EXP-01–06 and the basic AC-02/03/04 file portion connect to core3d/import, core3d/export, adapters3d/gltf, NativeAssetIoPanel and native-asset-io-product.spec.ts. DATA/COMPAT migration evidence includes strict 0.1/0.2 parsing and independent 0.3 copies.

[S04 adoption](../../evidence/3d/S04_GLTF_ADOPTION.md) records the independent validator, format/codec policy and remaining browser gate. [B07 candidate](../../evidence/3d/B07_ASSET_IO.md) records ownership, recovery and test coverage. ANIM-06 independent runtime behavior is still B08; physical acceptance and final resource budgets remain B09/B10. Path existence and unit success do not update those gates to verified.

## B08 candidate: consumer and inspection

Renderer-free inspection is owned by core3d/inspection; the editor quality panel owns only temporary report/cancellation/navigation state. The shared asset worker owns bounded execution. tools/3d-consumer is a development-only independent Babylon entry excluded from app bundles. See [B08 evidence](../../evidence/3d/B08_CONSUMER_INSPECTION.md). Browser and physical acceptance remain separately recorded.
