# 3D 要件仕様書のレビュー記録

対象: [2D 3D 分離と 3D 制作機能の要件](THREE_D_PRODUCT_REQUIREMENTS_2026-10-03.md)  
基準: main `ab3fb93a94911531122fbe085e46172d1afab43d`  
PR: [#294](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/294)  
日付: 2026-10-03 JST

## 範囲と証拠の扱い

この記録は要件の整合・網羅性・検査可能性に関するものであり、実装や性能の検証ではない。要件と最小入口リンクだけを扱い、実装計画、関係図成果物、コード、dependency、schema、DB、CI 設定は変更しない。

レビューは固定回数で終えない。指摘の修正と再確認を同じ PR に残す。役割別の自己点検と独立担当による全文読取を分け、存在しない専門家の実機検査・ライセンス判断を主張しない。

## 実施した視点

| 視点 | 方法 | 観察と処置 |
| --- | --- | --- |
| 制作体験 | 依頼・既存品質文書・代表 flow との照合 | 検品だけで完了する旧目標との差を明記。空からの制作と既存修正を別 flow にした |
| 造形・rig・animation | 独立担当の全文読取、glTF 標準照合 | smooth skin の抜け道、topology/UV/weight、loop/補間の境界を修正 |
| 保存・復旧・integrity | 独立担当の全文読取と異常順序の列挙 | 同一タブ save race、空環境 backup、ID 衝突、最終出力 mapping を補強 |
| mobile・accessibility | 独立担当の操作別照合 | 端末別 MUST 到達性、IME/中断/数値編集、hover 不要経路を追加 |
| runtime・GPU・memory | 状態/処理別自己点検、独立担当の横断再確認 | 非表示と解放を分離。処理別停止/継続、backup lazy-load の矛盾、共有 quota を修正 |
| format・interop | 独立担当の公式 glTF 照合 | GLB/project/sidecar 保持表、WebP変換、自己完結、誤った組合せ拒否を明記 |
| security・privacy・license | 境界の自己点検、独立担当の横断確認 | 無断 URI fetch、悪性 archive、診断素材送信、LICENSE/NOTICE/VRM申告の範囲を分離。依存採用の法的確認は未実施 |
| サービス提供 | 更新・offline・rollback の自己点検、独立担当の横断確認 | OPS-01〜12 と AC-13〜15。課金/SLA を新規要求にしない |
| test・release・読取 | 要件ID/受入/未確定の対応、表と参照先の検査 | 文書 CI と runtime 証拠を区別。実測予算は OPEN、後続の必須 gate とした |

## 指摘と処置

P1 は要件の解釈が制作完了やデータ保全を破る重大論点、P2 は具体化不足を表す。以下は文書上の処置であり、コード合格を意味しない。

| ID | 視点 / 程度 | 問題 | 処置と確認先 |
| --- | --- | --- | --- |
| RV-01 | rig / P1 | rigid 割当だけで skin 必須を満たせる | RIG-03 を smooth skin 新規 bind 必須に変更。複数 joint 混合 weight の fixture を §8 に追加 |
| RV-02 | format / P1 | GLB に loop・独自 metadata・編集履歴を保証するように読める | ANIM-06、§9、§19.3 で GLB key と project/sidecar 再生方針を分離 |
| RV-03 | 保存 / P1 | 古い save 完了で新しい編集が saved になる可能性 | §12 に A保存→B編集→A成功、B成功後のA応答を追加 |
| RV-04 | 復旧 / P1 | 新 context だけでは backup の独立性を証明できない | SAVE-03 と §12 で元storage/path/networkなしの復元、ID衝突の明示処理を追加 |
| RV-05 | mobile / P1 | iPhone再開中心と各機能MUSTの範囲が不統一 | §15.3 の操作×端末表に全MUSTの到達経路を提案。縮小は要件変更とした |
| RV-06 | 造形 / P1 | topology操作後のUV/normal/skinが抽象的 | §6.2 に操作×未bind/bind済み境界、成功/拒否fixtureを追加 |
| RV-07 | texture / P2 | WebP入力と標準GLB出力の間の変換が未定義 | §13でPNG/JPEG変換、原本保持、向き・色・alpha検査を追加 |
| RV-08 | animation / P2 | STEP/LINEARを説明するだけで未対応でも通る | ANIM-03で提供必須、§9に空/単一/重複key等の境界と誤差測定を追加 |
| RV-09 | hierarchy / P2 | reparent/pivotがどの時点のworld poseを保つか不明 | §6.2 でrest/全clipの保証、拒否/明示派生bakeを分離 |
| RV-10 | runtime / P2 | 背景時のsave/import/export処理が不明 | §4.2で処理別に停止・継続・取消と復帰条件を定義 |
| RV-11 | 検査 / P2 | 同一import/exportの相殺バグを見逃せる | §19.3で独立validator/consumer、既知数値fixtureを要求 |
| RV-12 | 入力 / P2 | IME/keyboard/OS中断で二重commandの余地 | §16に確定/取消・非数・範囲・file picker等を追加 |
| RV-13 | 方針 / P2 | 同じtab fallbackを既承認のように追加 | NAV-06を安全な別tab再試行/URL案内へ修正。同tab切替は未採用例外 |
| RV-14 | 仕様境界 / P2 | OPEN-03がMUST機能自体の縮小を許す | OPEN-03を実現方法と入力/属性詳細に限定。MAT-01も最低factor操作を列挙 |
| RV-15 | 文書 / P2 | 2行のMarkdown tableの列数が不一致 | EXP-09/UX-09を表定義に合わせ、全表を再検査 |
| RV-16 | offline復旧 / P1 | backup encoderもlazyだと初回offline時に救出不能 | LIFE-02/§12で編集受付前にnetwork不要の完全backup経路を確保、AC-13にcold→offline fixture |
| RV-17 | 参照整合 / P1 | 内部IDだけで最終GLBのnode/joint対応を保証できない | §13で最終GLB hash/revisionとmapping再検証。Aモデル+B sidecar拒否を要求 |
| RV-18 | 受渡し / P2 | GLB名だけでは外部resourceなしを保証できない | §13で自己完結GLBと空環境consumer検査を必須化 |
| RV-19 | storage / P2 | 2D/3Dの別DBでもquotaは共有し得る | §12に両方・trash/cacheを含む合計不足と救出検査を追加 |

## 未確定のまま残す技術判断

OPEN-01〜10 は要件漏れを隠す項目ではなく、採用前に根拠が必要な判断である。rendererの版、保存形式/DB、計算方式、glTF subset、対象実機/予算、engine版、配信path、休止条件、Studio採用ハーネス版を後続計画で具体化する。機能範囲を黙って削る権限ではない。

## 検証状況

- 文書の独立初回レビューと修正後の再確認を実施。再確認で見つかった追加指摘も同じPRへ反映。
- 独立最終再確認: 要件本文620行、SHA-256 `35ad24a16c07786e4b94e3e02c20f9fea82ffde5717cad77d7714e81b48e921d`。RV-01〜19 の対象修正を確認し、文書レビュー上の未解消重大指摘なし。全機能の実現性や実機合格を保証した結果ではない。
- 文書構造検査: 要件ID169件・重複0件。要件本文と本記録の表36個の列数整合、相対リンク13個のrepoパス存在を確認。URL存在と技術内容の合格は別である。
- コード、描画、性能、実機、外部engine、実dependency LICENSE採用は未検証。本PRでは実行・変更しない。
- 最終の変更ファイル一覧、表/ID/リンク検査、固定headのCI結果はPR本文へ記録する。
- Draftを維持し、要件受理・merge・後続計画開始は人間判断の境界を維持する。
