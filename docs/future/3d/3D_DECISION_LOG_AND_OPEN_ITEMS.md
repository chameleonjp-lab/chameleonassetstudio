# 3D Decision Log and Open Items（3D の決定・推奨・未解決項目）

状態: **draft / human review required**
最終更新日: 2026-07-20（第2改訂: リグ/モーション関連の決定・open 項目と、**7 章 整合リスク台帳（3D-RISK-01〜12）**を追加）
調査基準commit: `7018984ba9e6867c6fab12fb313308218a35c22b`（初版）/ `3dd4dd4`（第2改訂）
上位文書: `README.md`（本ディレクトリ）。全体の決定記録の正本は `../DECISION_LOG.md`（accepted になった項目はそちらへ登録する）

> この文書の「推奨」は計画者（今回の調査・設計）の推奨であり、**人間承認までは決定ではない**。

---

## 1. 決定済み（既存の accepted 決定。本計画で変更しない）

| ID | 内容 | 出典 |
|---|---|---|
| ADR-2026-07-07-004 | 2D と 3D は同じテイストの別画面 | `../DECISION_LOG.md` |
| ADR-2026-07-07-005 | リポジトリ当面同一・分離条件明文化 | 同上 |
| ADR-2026-07-10-007 | 2D Pro Gate 人間承認まで 3D 実装・library 評価・dependency 追加を開始しない | 同上 |

## 2. 今回の推奨（人間確認待ちの決定候補）

各項目は「判断期限となる Gate」までに決める。決まらない場合は「安全な既定値」で進める（既定値は常に**後から変更しやすい側**に倒してある）。

| ID | 判断対象 | 推奨案 | 主な代替案 | 利点 / 欠点の要点 | 判断者 | 期限 Gate | 決まらない場合の安全既定 |
|---|---|---|---|---|---|---|---|
| 3D-DEC-LIB-01 | 描画ライブラリ | Three.js（実測で確定） | Babylon.js | Three: bundle を絞りやすい・実績 / addon 管理が手動。Babylon: 一体型で機能豊富 / bundle 大きめ（実測要） | 人間（GATE-02 の実測後） | 3D-GATE-04 の前 | 決まるまで Stage1 に着手しない（既定なし。これだけは実測必須） |
| 3D-DEC-FORMAT-01 | プロジェクト形式 | `.cas3dproj` 新設（案B） | 既存拡張(A) / 共通container(C) / sidecarのみ(D) | 契約 12 章の比較表 | 人間 | 3D-GATE-03 | 案 B（2D 無変更で最も安全） |
| 3D-DEC-STORAGE-01 | 保存 DB | 別 DB `chameleon-asset-studio-3d` | 既存 DB v3 拡張 | 契約 11 章 | 人間 | 3D-GATE-03 | 別 DB（2D 無変更） |
| 3D-DEC-EXTGEN-01 | 外部生成の接続範囲 | 第四段階は adapter 仕様 + 手動持ち込み完成まで。実接続は個別承認 | ローカル接続まで実装 / API 接続まで実装 | 実接続は外部仕様・規約依存が大きい | 人間 | 3D-STAGE4 開始時 | 仕様 + 手動のみ（実接続なし） |
| 3D-DEC-VRM-01 | VRM 対応レベル（2026-07-20 改訂で追加） | V1/V2（検出・meta 表示・検査）を第二段階で採用。V3 描画は候補のまま | V0 素通しのみ / V3 まで実装 | interop 仕様 5.1 の比較 | 人間 | 3D-STAGE2 開始時 | V1/V2（依存追加なしで安全) |
| 3D-DEC-RIG-01 | リグ作成の採用レベル（2026-07-20 **第2改訂**で追加） | humanoid テンプレート骨格フィット + envelope 自動ウェイト + モーションテンプレ/retarget を第三段階で採用（`3D-STAGE3-13〜16`）。**旧方針「リグ付けは外部の仕事」の明示的変更**（理由: 画像→3D 生成物は静的で、外部丸投げでは主要動線が完結しない） | 従来どおり外部のみ / 頂点ペイントまで実装 | interop 仕様 4 章。完全なリグ作成・本格アニメ制作は引き続き非目標 | 人間 | 3D-STAGE3 開始時 | 採用（テンプレ + 自動ウェイトの限定形） |

## 3. Gate 後の実測待ち

| 項目 | 実測する Gate / WP | 中身 |
|---|---|---|
| 描画ライブラリの bundle・Safari・context loss・dispose | 3D-GATE-02 | 性能仕様 4 章の「実測が必要な項目」 |
| 2D bundle 基準値・対象端末 | 3D-GATE-05 | 性能仕様 1・3 章 |
| 読み込み上限・警告しきい値の確定 | 3D-STAGE2-06 | 入出力仕様 3〜4 章の全「暫定」値 |
| Safari の大容量 IndexedDB Blob 挙動 | 3D-GATE-05〜STAGE1-03 | 分割格納の要否（3D-OPEN-03） |
| CI（Playwright）での WebGL 動作 | 3D-STAGE1-11 | viewer E2E の job 構成 |
| OffscreenCanvas + WebGL（Safari） | 任意（採用検討時） | 3D-OPEN-06 |

## 4. ライセンス・外部情報待ち

| 項目 | 状態 | 対応 |
|---|---|---|
| three / babylon / gltf-transform / meshoptimizer / draco / basis_universal の**ライセンス種別** | 一次確認済み（2026-07-19。性能仕様 8 章） | 版固定時に再確認（GATE-04） |
| 各候補の現在の安定版・配布物構成・NOTICE 詳細 | 未確認 | GATE-04 / Stage3 開始時 |
| gltfpack 同梱 encoder・KTX-Software の詳細 | 未確認 | Stage3 開始時 |
| 生成 AI 候補のコードライセンス | **一部確認済み（2026-07-20）**: TripoSR = MIT、TRELLIS = MIT（いずれも公式リポジトリ LICENSE）。Stable Fast 3D / SPAR3D は未確認。Hunyuan3D は取得試行が 404 で未確認 | interop 仕様 8.3 に現状表。接続候補になった時点で再確認 |
| 生成 AI 候補の**モデル重み**・商用・地域条件 | 未確認（コードと重みでライセンスが異なり得る） | 3D-DEC-EXTGEN-01 で接続候補になった時点で個別確認 |
| @pixiv/three-vrm | **確認済み（2026-07-20）**: MIT（公式リポジトリ LICENSE） | 採用は `3D-OPEN-22` 承認時のみ |
| Khronos glTF-Sample-Assets の個別モデルライセンス | 未確認 | GATE-06（採用するモデル単位） |
| 過去 PR / issue 内にのみ存在する 3D 案の有無 | 未確認（リポジトリ内文書・コードで代替調査） | 必要なら GATE-01 で GitHub 履歴を確認 |

## 5. open 項目（機能・設計の未決定）

| ID | 内容 | 既定（決めない場合） | 判断時期 |
|---|---|---|---|
| 3D-OPEN-03 | 大容量 GLB の IndexedDB 分割格納 | 分割しない（上限警告で運用） | STAGE1-03 実測後 |
| 3D-OPEN-05 | 焼き込み（bake）書き出しの提供 | 提供しない（metadata 同梱のみ） | STAGE2 開始時 |
| 3D-OPEN-06 | OffscreenCanvas + Worker レンダリング | 不採用 | 必要時 |
| 3D-OPEN-07 | `core3d` ディレクトリ名 | `src/core3d/` | STAGE1-01 |
| 3D-OPEN-08 | 圧縮 GLB 読み込みの第二段階前倒し | 第三段階のまま | STAGE2 開始時 |
| 3D-OPEN-09 | WebGL1 フォールバック | 非対応（エラー表示 + 非表示閲覧） | GATE-02 実測後 |
| 3D-OPEN-10 | AI 生成代表 fixture の入手元 | 自作 or 利用者生成物（再配布しない） | GATE-06 |
| 3D-OPEN-12 | カメラ初期位置の保存 | 保存しない | STAGE1-07 |
| 3D-OPEN-13 | `.cas3dproj` 読み込み時の ID 再採番 | 2D と同じ常時再採番 | STAGE1-09 |
| 3D-OPEN-14 | 材質の簡易編集（factor 調整・texture 差し替え） | **2026-07-20 改訂で再定義**: texture 差し替え/編集は `3D-STAGE3-12` として採用済み。残る factor 調整のみが open（既定: 実装しない） | STAGE3 開始時 |
| 3D-OPEN-15 | node / animation クリップの名称整理・不要要素の削除編集 | 実装しない（派生生成の整理系で代替） | STAGE3 開始時 |
| 3D-OPEN-16 | 背景・照明プリセット | 既定照明 1 種のみ | STAGE2 以降 |
| 3D-OPEN-17 | 検品しきい値の利用者カスタム | 3 プリセット固定 | STAGE3 以降 |
| 3D-OPEN-18 | turntable 連番画像 / 動画書き出し | 実装しない | STAGE2-09 後 |
| 3D-OPEN-19 | エンジン向け座標系のバイト列自動変換 | 行わない（import notes と数値補助のみ） | STAGE3-09 |
| 3D-OPEN-20 | OBJ + MTL 入力 | 非対応 | STAGE4 開始時 |
| 3D-OPEN-21 | primitive 作成・複数 variant 等の限定的作成機能 | 実装しない（検品・整備に集中。ただしテクスチャ編集と humanoid 対応付けは 2026-07-20 改訂で採用済み = `3D-STAGE3-11/-12`） | STAGE4 後の次期計画 |
| 3D-OPEN-22 | VRM V3 描画（spring bone / expression 反映 preview。three-vrm 依存） | 実装しない（通常 glTF 表示で完成） | STAGE2-GATE で初回判断、STAGE4 開始時に最終判断 |
| 3D-OPEN-23 | WebXR preview（VR での実寸確認） | 実装しない（`3D-STAGE4-09` は承認時のみ） | STAGE2-GATE で初回判断、STAGE4 開始時に最終判断 |
| 3D-OPEN-24 | 外部ツールでリグ付け後の「同一アセット revision 再取り込み」 | 行わない（新規アセットとして取り込む） | STAGE3 以降 |
| 3D-OPEN-25 | humanoid 自動推定の合格基準（推定精度・対象命名規則の範囲） | 推定は候補提示のみ・確定は常に手動（基準未確定でも安全） | STAGE3 開始時 |
| 3D-OPEN-26 | テクスチャ編集の対象 map 拡大（normal / metallic-roughness 等） | baseColor のみ | STAGE3-GATE 以降 |
| 3D-OPEN-27 | Mixamo 経由の supply notes の扱い（利用規約の説明範囲） | 手順書のみ提供し、Mixamo 規約の確認は利用者責任と明記 | STAGE2-08 実装時 |
| 3D-OPEN-28 | 非人型（四足・任意チェーン）カスタム骨格テンプレート | 対象外（humanoid のみ） | STAGE3-GATE 以降 |
| 3D-OPEN-29 | 頂点単位のウェイトペイント | 実装しない（ボーン単位の影響半径調整まで。品質が必要なら外部ツール） | STAGE3-14 実測後 |
| 3D-OPEN-30 | キーフレーム編集（M3） | 実装しない（テンプレ + retarget で不足する場合に再検討） | STAGE3-GATE 以降 |
| 3D-OPEN-31 | モーションデータ（クリップ集）の同梱 | 同梱しない（手続き生成のみ。同梱するなら CC0 等の個別ライセンス確認必須） | STAGE3-15 実装時 |

## 6. 採用候補 / 不採用候補（ライブラリ・ツールの整理）

- 採用候補: Three.js（推奨）/ Babylon.js（代替）、glTF-Transform、meshoptimizer、Draco decoder、Basis Universal（KTX2）、@pixiv/three-vrm（`3D-OPEN-22` 採用時のみ）。いずれも GATE の承認後のみ。
- 不採用（理由つき）: react-three-fiber（依存追加を最小にする方針・adapter 自作で足りる）、PlayCanvas 等のエンジン系（エディタ非依存・bundle 要件に合わない）、FBX SDK 系（形式方針外。Mixamo 等の FBX は Blender 経由の手順書で受ける = `3D-OPEN-27`）、ブラウザ内生成 AI 実行（方針で禁止）。
- 研究追跡のみ: Step1X-3D / 3DTopia-XL / InstantMesh / OpenLRM / CRM / SkinTokens / TokenRig / Puppeteer / RigAnything / UniRig（追跡表 6.5）。
- 2026-07-20 改訂の関連文書: 主要ツール連携・VRM・VR・ボーン・モーション・テクスチャ編集・画像→3D の設計正本は `3D_INTEROP_VRM_VR_AND_CREATION_SPEC.md`。

## 7. 整合リスク台帳（3D-RISK-01〜12。2026-07-20 第2改訂で新設）

複数文書・複数 work package にまたがって**齟齬が起きやすい箇所**の台帳。各文書の該当箇所には「⚠️ 整合注意（`3D-RISK-xx`）」の印を置いてある。実装・レビュー時は該当項目を必ず読み合わせる。**この台帳が防止規則の正本**であり、個別文書と食い違ったらこの台帳を優先し、食い違い自体を修正 PR にする。

| ID | リスク（何がずれるか） | 起きる場面 | 防止規則（正） | 主な該当箇所 |
|---|---|---|---|---|
| 3D-RISK-01 | **表示変換と焼き込み変換の二重適用**。settings（unitScale / rotationOffset）が viewer 表示・rigged 生成・motion 焼き込み・焼き込み書き出しの複数箇所で掛かり、モデルが 2 回回る / 2 回拡大される | STAGE1-07、STAGE2-08（bake）、STAGE3-14/-15/-16 | 変換の適用は「derived 生成時に一度だけ・recipe に記録」。viewer は常に「保存値 + 表示変換」で描く。クリップへ settings を含めない | 契約 13.5・15 章不変条件 6 / interop 4.6 |
| 3D-RISK-02 | **node index の基準バイト列のずれ**。nodeRef / humanoidMap の index を、source と rigged derived で取り違えて誤った node に anchor が付く | STAGE2-07、STAGE3-11/-14、export、retarget | `nodeBinding`（契約 7.3）を唯一の宣言点にする。バイト列 hash 照合に失敗したら「未解決」表示（黙って誤バインドしない）。rigged 生成時の再バインドは専用テスト必須 | 契約 6・7.3 章 / plan STAGE3-14 / interop 4.5 |
| 3D-RISK-03 | **しきい値・上限値の多重定義**。preset しきい値や読み込み上限の「暫定値」が複数文書に書かれ、実装が別々の値を参照する | STAGE1-04、STAGE2-06 | 実装は定数モジュール 1 か所のみ。文書の数値は「例・暫定」であり、確定後は定数と `3D-STAGE2-06` の確定報告が正 | 入出力仕様 3〜4 章 / 性能仕様 1〜2 章 |
| 3D-RISK-04 | **2D 純関数への逆依存**。3D が再利用する `src/core/images` の関数を 2D 都合で変更し、3D のテクスチャ編集が静かに壊れる（逆も然り） | STAGE3-12 以降の 2D 側変更全部 | 再利用する関数の一覧を「互換 API リスト」として STAGE3-12 の PR で文書化。2D 側変更 PR でも 3D unit / E2E が CI 全件で走る（既存 CI で担保）。変更が必要なら core3d 側へコピー | アーキテクチャ 3 章 / interop 7.2 |
| 3D-RISK-05 | **利用条件の二重管理**。VRM meta の転記と利用者申告 `license.declared` が食い違う | STAGE2-11、export | declared（利用者申告）が正。VRM meta は参考転記で、矛盾時は警告表示のみ（自動上書きしない） | 契約 10 章 / interop 5.2 |
| 3D-RISK-06 | **2D と 3D のモーションテンプレート混同**。同じ語彙（idle / walk…）だが実装・データ構造は完全に別物。流用・共通化を試みて双方を壊す | STAGE3-15 | 語彙定数のみ共有可。実装・型・テストは 3D 専用に新設。PR レビュー観点に明記 | interop 4.6 / plan STAGE3-15 |
| 3D-RISK-07 | **derived 連鎖の親子関係の崩れ**。source→rigged→motion→optimized と連鎖した時、recipe が source しか指せず再現・古さ判定が壊れる。連鎖途中の削除で子が孤児化 | STAGE3-08/-14〜-16 | recipe は `parentRef` + `parentSha256`（直接の親）を持つ。子を持つ derived の削除はブロックまたは子ごと明示削除。「古い派生」判定は親 hash 比較 | 契約 8 章 |
| 3D-RISK-08 | **重処理の実行場所の不統一**。自動ウェイト・retarget・最適化が main thread に置かれ UI が固まる / Worker 規約（進捗・中断）に乗らない実装が混ざる | STAGE3 全般 | 秒単位の処理はすべて `3D-STAGE3-10` の Worker 共通基盤に乗せる（進捗 1 秒以内・中断 2 秒以内）。例外を作る場合は WP に明記 | アーキテクチャ 8 章 / plan STAGE3-10 |
| 3D-RISK-09 | **保存空間と表示空間の取り違え**。Z-up 補正（rotationOffset）中のギズモ操作で、骨格端点や anchor を「見えている空間」の値で保存してしまう | STAGE1-07/-08、STAGE3-13 | 保存は常に model space（契約 13.3）。ギズモ→保存値の変換は viewer adapter の 1 か所で行い、round-trip unit テスト（表示変換を変えても保存値不変）を必須にする | 契約 13 章 / interop 4.3 |
| 3D-RISK-10 | **additive 変更の積み上げによる契約の劣化**。humanoidMap / nodeBinding / rigDraft… と optional field が 0.1.0 のまま増え続け、migration リハーサル（STAGE4-06）まで版管理が試されない | STAGE2〜3 の契約追記全部 | 各 additive 追加時に schema・samples・validate テストを同時更新（既存規則）。**STAGE3-GATE で「0.2.0 への version up リハーサル前倒しの要否」を毎回判断**する項目を追加 | 契約 14 章 / plan 各 GATE |
| 3D-RISK-11 | **エンジン別 skin 制約の見落とし**。頂点あたり影響数（一般に 4）・joint 数上限・ボーン名規約がエンジンごとに異なり、書き出しは成功するがエンジンで壊れる | STAGE3-14、STAGE4-03、export | 自動ウェイトは最大 4 影響を既定。joint 数は preset 検査（`3D-CHK-BONE-003` 系）+ export 前検査 + import notes の 3 か所で同じ定数を参照 | interop 4.4 / 入出力仕様 8.6 / plan STAGE4-03 |
| 3D-RISK-12 | **動線順序の前提崩れ**。Setup（feet / forward / unit）未確定のまま骨格フィットやモーションを実行し、自動配置・接地・retarget がすべて狂う | STAGE3-13 以降 | Setup 完了を骨格フィットの開始条件として UI でブロック（案内つき）。E2E は「Setup 未完了 → ブロック表示」を正常系として持つ | interop 4.3 / plan STAGE3-13 |

運用規則:

- 新しい整合リスクを見つけたら、この台帳へ追番で登録してから、該当文書に ⚠️ 印を置く（台帳に無い ⚠️ を作らない）。
- 各 STAGE GATE のレビューで、その段階に関係する RISK 項目の「防止規則が実装・テストに反映されているか」を確認項目に含める。
