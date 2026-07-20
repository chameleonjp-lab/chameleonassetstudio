# 3D Decision Log and Open Items（3D の決定・推奨・未解決項目）

状態: **draft / human review required**
最終更新日: 2026-07-19
調査基準commit: `7018984ba9e6867c6fab12fb313308218a35c22b`
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
| 3D-DEC-VRM-01 | VRM 対応レベル（2026-07-20 改訂で追加） | V1/V2（検出・meta 表示・検査）を第二段階で採用。V3 描画は候補のまま | V0 素通しのみ / V3 まで実装 | interop 仕様 5.1 の比較 | 人間 | 3D-STAGE2 開始時 | V1/V2（依存追加なしで安全） |

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

## 6. 採用候補 / 不採用候補（ライブラリ・ツールの整理）

- 採用候補: Three.js（推奨）/ Babylon.js（代替）、glTF-Transform、meshoptimizer、Draco decoder、Basis Universal（KTX2）、@pixiv/three-vrm（`3D-OPEN-22` 採用時のみ）。いずれも GATE の承認後のみ。
- 不採用（理由つき）: react-three-fiber（依存追加を最小にする方針・adapter 自作で足りる）、PlayCanvas 等のエンジン系（エディタ非依存・bundle 要件に合わない）、FBX SDK 系（形式方針外。Mixamo 等の FBX は Blender 経由の手順書で受ける = `3D-OPEN-27`）、ブラウザ内生成 AI 実行（方針で禁止）。
- 研究追跡のみ: Step1X-3D / 3DTopia-XL / InstantMesh / OpenLRM / CRM / SkinTokens / TokenRig / Puppeteer / RigAnything / UniRig（追跡表 6.5）。
- 2026-07-20 改訂の関連文書: 主要ツール連携・VRM・VR・ボーン・テクスチャ編集・画像→3D の設計正本は `3D_INTEROP_VRM_VR_AND_CREATION_SPEC.md`。
