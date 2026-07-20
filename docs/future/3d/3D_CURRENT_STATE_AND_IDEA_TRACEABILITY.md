# 3D Current State and Idea Traceability（現状と既存 3D 案の追跡表）

状態: **draft / human review required**
最終更新日: 2026-07-21（補足: Three.js Object Sculptor を参照資料として追記）
調査基準commit: `7018984ba9e6867c6fab12fb313308218a35c22b`（ブランチ `claude/chameleon-3d-four-stage-plan-yjpqlt`。origin/main と同一コミット）
調査日: 2026-07-19（リポジトリ内全文検索 + 主要文書精読。作業開始時の Git 状態: working tree clean・未commit変更なし）
補足調査日: 2026-07-21（Three.js Object Sculptor の README / LICENSE / upstream commit を確認。既存の実装禁止 Gate は変更しない）
上位文書: `README.md`（本ディレクトリ）

> この文書は「今なにが実装されていて、3D について過去に何が計画され、それらを新しい四段階計画でどう扱うか」を 1 か所で追跡する。**どの案も理由なしに消していない。**

---

## 1. 情報の信頼順位（本計画全体で使う区分）

| 区分 | 根拠 | 例 |
|---|---|---|
| 1. 現在の実装事実 | コード・型・schema・テスト・設定 | 2 章 |
| 2. 現在有効な決定 | accepted の仕様書・ロードマップ・決定記録 | 3 章 |
| 3. 過去の計画 | 「旧計画」「凍結」「背景」と明記された文書 | 4 章 |
| 4. 新しい提案 | 今回の調査から追加する案 | 6 章の「新規」行 |
| 5. 未確認事項 | 根拠を確認できなかったもの | 8 章 |

## 2. 現在の実装事実（調査結果の要約）

2026-07-19 のコード調査（担当 A 報告）より。詳細は `3D_ARCHITECTURE_AND_BOUNDARIES.md` 2 章。

- **src 内に 3D 関連のコード・型・route・feature flag は存在しない**（検索語 3D / glTF / GLB / Three / Babylon / mesh / asset3d / cas3dproj 等で確認）。3D は完全に未実装であり、「未実装の入口」も無い。
- 2D は Phase 0〜17 + 2D-1a/1b + 2D-2/2D-3 の一部まで実装済み。データ契約（asset.json / project.json / `.casproj` / export ZIP / atlas.json いずれも 0.1.0）、IndexedDB v2（6 store）、migration 機構（現在は空配列）、安全読み込み（magic number・上限・quarantine）、Undo/Redo（History）、AutosaveQueue、Worker 2 本、unit 61+ / E2E 28 ファイル、CI（md のみ変更は build スキップ）が存在する。
- 3D が再利用できる基盤と分離すべき領域は `3D_ARCHITECTURE_AND_BOUNDARIES.md` 3 章に整理した。

## 3. 現在有効な決定（3D に関係するもの）

| 決定 | 出典 | 内容 | 新計画での扱い |
|---|---|---|---|
| ADR-2026-07-07-004 | `../DECISION_LOG.md` | 2D と 3D は同じテイストの別画面。3D は生成 AI ではなく GLB/glTF 読み込みから | **維持**。アーキテクチャ・UI 文書の前提 |
| ADR-2026-07-07-005 | `../DECISION_LOG.md` | リポジトリは当面同一。分離条件を明文化 | **維持**。`3D_ARCHITECTURE_AND_BOUNDARIES.md` 12 章に再掲 |
| ADR-2026-07-10-007 | `../DECISION_LOG.md` | 2D Pro Gate 人間承認まで 3D 実装・library 評価・dependency 追加を開始しない。旧 Phase 22〜28 は gate 後に `3D-0`〜`3D-6` として再開 | **維持**。本計画は文書作成のみで、この決定を変更しない |
| 2D Pro Gate の定義 | `../2D_COMPLETION_ROADMAP.md` 8 章 | 代表制作・検証済み preset・実機・互換性・品質証跡 + 人間の 3D 開始承認 | **維持**。四段階計画の開始前 Gate の第 1 条件 |
| 3D 再開位置 `3D-0`〜`3D-6` | `../2D_COMPLETION_ROADMAP.md` 9 章 | 旧 Phase 22〜28 の再開名称 | **維持・詳細化**。5 章の対応表で新 work package へ展開 |
| 1 PR 1 目的、draft PR → CI → Opus → 人間 merge | `CLAUDE.md` / `../2D_COMPLETION_ROADMAP.md` 6 章 | 開発運用 | **維持**。全 work package に適用 |
| 3D 入出力方針（GLB/glTF 中心、Generic 3D preset） | `../ASSET_CREATION_AND_EXPORT_STRATEGY.md` | 現行有効の作成・書き出し戦略 | **維持**。入出力仕様の前提 |

## 4. 過去の計画（旧計画・凍結。削除しない）

| 文書 | 状態表記 | 内容 | 新計画での扱い |
|---|---|---|---|
| `../THREE_D_ASSET_PREPARATION_REQUIREMENTS.md` | 旧計画（2026-07-10 注記あり） | 3D Asset Preparation Mode の要件全体 | **土台として採用・詳細化**（6 章で項目別に追跡） |
| `../POST_PHASE17_IMPLEMENTATION_PLAN.md` Phase 22〜28 | 旧計画・凍結 | 3D の 7 段階実装計画 | **新四段階へ再編**（5 章） |
| `../POST_PHASE17_REQUIREMENTS.md` 3D 節 | 旧計画 | 3D Mode の入口要件 | 要件は新仕様文書群へ吸収 |
| `../PRODUCT_DIRECTION_2D_TO_3D.md` | 背景・旧方針（正本はロードマップ + ADR） | 2D→3D の全体方針 | 方針は 3 章の accepted 決定経由で維持 |

## 5. `3D-0`〜`3D-6`（旧 Phase 22〜28）と新四段階の対応

新 work package の全定義は `3D_FOUR_STAGE_IMPLEMENTATION_PLAN.md`。

| 旧段階 | 旧 Phase | 旧内容 | 新計画での対応先 |
|---|---:|---|---|
| `3D-0` | 22 | library・ライセンス・bundle・2D 境界の調査 | **開始前 Gate 全体**（`3D-GATE-01`〜`3D-GATE-06`）。特に GATE-02（描画ライブラリ実測比較）、GATE-03（形式・境界 ADR）、GATE-04（dependency 承認） |
| `3D-1` | 23 | GLB / glTF の読み込みと別画面の表示 | 第一段階 `3D-STAGE1-01`（route/lazy load）、`-02`（データ契約）、`-03`（保存層）、`-04`（GLB 安全読み込み）、`-05`（viewer）。glTF bundle は第二段階 `3D-STAGE2-01` |
| `3D-2` | 24 | サイズ・polygon・texture・bounds の検品 | 第一段階 `3D-STAGE1-06`（最小検品）+ 第二段階 `3D-STAGE2-04/05/06`（詳細検品・プリセット） |
| `3D-3` | 25 | 原点・足元・anchor・collider の metadata | 第一段階 `3D-STAGE1-07`（Setup）・`-08`（Game Data）+ 第二段階 `3D-STAGE2-07`（capsule・node 追従） |
| `3D-4` | 26 | GLB / metadata / report の書き出し | 第一段階 `3D-STAGE1-09`（`.cas3dproj`）・`-10`（export ZIP）+ 第二段階 `3D-STAGE2-08`（import notes）+ 第三段階 `3D-STAGE3-08`（決定的出力） |
| `3D-5` | 27 | 軽量化の採用可否 | 第三段階 `3D-STAGE3-01`〜`-10` 全体 |
| `3D-6` | 28 | 外部 3D 生成との接続設計 | 第四段階 `3D-STAGE4-01`（adapter 仕様）・`-02`（接続実装判断） |

- 旧 7 段階に無く新計画で追加した領域: 開始前 Gate の明文化、保存・復旧（trash/snapshot/quarantine）の 3D 適用、安全読み込みの敵対的入力対策、アクセシビリティ、visual regression、エンジン verified 証拠、決定的出力、iPhone/iPad の操作設計。これらは 2D 側で確立された品質基準（2D-1b / 2D-6 相当）を 3D に対称適用する「新しい提案」である。

## 6. 既存 3D 案の完全追跡表

出典略記: REQ = `../THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`、DIR = `../PRODUCT_DIRECTION_2D_TO_3D.md`、PLAN = `../POST_PHASE17_IMPLEMENTATION_PLAN.md`、STRAT = `../ASSET_CREATION_AND_EXPORT_STRATEGY.md`、ROAD = `../2D_COMPLETION_ROADMAP.md`、OPEN = `../OPEN_ITEMS.md`。

扱い区分: **採用**（そのまま）/ **修正採用**（内容を変えて）/ **延期**（後の段階へ）/ **外部**（外部機能として扱う）/ **調査**（調査だけ行う）/ **対象外**（明確に除外）/ **重複**（他案と統合）/ **確認待ち**（ライセンス・技術確認待ち）。

### 6.1 入力・形式

| # | 案 | 出典 | 扱い | 対応先 / 理由 |
|---:|---|---|---|---|
| 1 | GLB 入力（必須候補） | REQ 3.1 | 採用 | Stage1。第一入力形式 |
| 2 | glTF + bin + textures 入力（必須候補） | REQ 3.1 | 採用（延期） | Stage2-01。外部 URI の安全設計を伴うため第二段階 |
| 3 | OBJ + MTL 入力（後続候補） | REQ 3.1 | 延期（対象外寄り） | 第四段階で再判断（`3D-OPEN-20`）。glTF へ集約する方針のため |
| 4 | FBX / Blender file は対象外 | REQ 3.1 | 採用（対象外の維持） | 完成形の非目標（`3D_COMPLETE_PRODUCT_SPEC.md` 5 章） |
| 5 | 出力 GLB / glTF / JSON sidecar / ZIP | REQ 3.2 | 採用 | Stage1 の export ZIP 構造へ具体化 |

### 6.2 metadata・ゲーム用情報

| # | 案 | 出典 | 扱い | 対応先 / 理由 |
|---:|---|---|---|---|
| 6 | `ThreeDAssetSettings`（unit/upAxis/forwardAxis/originMode/scale/bounds/stats） | REQ 4 | 修正採用 | `3D_ASSET_DATA_CONTRACT.md` 6 章。source/derived/provenance/license/unknown data を追加し、`qualityWarnings: string[]` は構造化した inspection report へ変更。**旧 `unit` の候補値 `'pixel_like'` は削除**（2D の pixel 座標と 3D の unit を同一視しない原則 [`../PRODUCT_DIRECTION_2D_TO_3D.md` 6.2] に反し、3D で pixel を単位とする意味が定義できないため。`unit` は `meter` / `centimeter` / `unknown` の 3 値とし、非標準スケールは `unitScale` で表す） |
| 7 | `ThreeDAnchor`（role 語彙付き） | REQ 4.1 | 修正採用 | 契約 7.1。space / nodeRef を追加（node 追従は Stage2） |
| 8 | `ThreeDCollider`（box/sphere/capsule） | REQ 4.2 | 修正採用 | 契約 7.2。box/sphere は Stage1、capsule は Stage2 |
| 9 | mesh collider は作らない | REQ 4.2 | 採用 | 完成形でも非目標 |
| 10 | 原点=足元中央の考え方（2D origin の 3D 版） | REQ 5 / DIR 6.2 | 修正採用 | 契約 13.3。「同一視しない」原則を守り、metadata 上の定義として再設計 |

### 6.3 検品・プリセット

| # | 案 | 出典 | 扱い | 対応先 / 理由 |
|---:|---|---|---|---|
| 11 | 検品必須項目（サイズ/頂点/三角形/material/texture/最大 texture/animation/bounds/pivot） | REQ 5 | 採用 | Stage1 検査項目 3D-CHK-*（入出力仕様 4.3） |
| 12 | スケルトン有無（後続） | REQ 5 | 採用（延期どおり） | Stage2 3D-CHK-SKIN-001 |
| 13 | 警告例 8 種（大きすぎ・原点ズレ等） | REQ 5.1 | 修正採用 | 構造化警告（checkId/severity/実測/推奨/理由/影響/修正）へ拡張 |
| 14 | mobile / web / desktop の 3 プリセット・しきい値固定しすぎない | REQ 5.1 | 採用 | Stage2-06。暫定値 + Gate 後実測で確定 |

### 6.4 軽量化

| # | 案 | 出典 | 扱い | 対応先 / 理由 |
|---:|---|---|---|---|
| 15 | 不要データ削除・ノード整理・マテリアル統合検討・テクスチャ確認 | REQ 6 | 採用 | Stage3-03 以降 |
| 16 | Meshopt / Draco / KTX2 の候補表示 | REQ 6 | 採用 | Stage3-02（読み込み）/-04/-05（書き出し） |
| 17 | 自動で破壊的最適化しない・元ファイル保持・前後差表示・プレビュー必須 | REQ 6 | 採用 | Stage3 の不変原則 + Compare 画面 |
| 18 | glTF-Transform（すぐ調査する候補） | REQ 7.1 / OPEN | 採用（確認済み開始） | Stage3-01。ライセンス MIT を 2026-07-19 一次確認。版・bundle 実測は Gate 後 |
| 19 | meshoptimizer / gltfpack | REQ 7.1 / OPEN | 採用（確認待ち一部） | Stage3。meshoptimizer MIT 確認済み。gltfpack 同梱物の構成は未確認（8 章） |
| 19b | 軽量化の実行場所（旧 Phase 27 の CLI/Node vs ブラウザ比較） | PLAN 27 | 修正採用 | **ブラウザの Worker 内に確定**（`3D_ARCHITECTURE_AND_BOUNDARIES.md` 8 章・Stage3-01）。完全ローカル動作・オフライン動作・Python/外部処理を持たない方針のため、CLI/Node 実行は採らない（重い外部処理は第四段階の外部 adapter 経由に限定） |
| 19c | 「重い再メッシュ / mesh simplification は外部処理」 | REQ 2.3 | 修正採用（境界を再定義） | mesh simplification は **ブラウザ Worker 内**（Stage3-06）へ移す。ただし preview 必須・自動適用禁止・元モデル保持を条件とする。REQ 2.3 が外部処理に分類した「重い再メッシュ（トポロジ再構築）」自体は引き続き対象外（外部処理）で、simplification（三角形削減）とは区別する |

### 6.5 外部生成・骨入れ（AI 候補）

| # | 案 | 出典 | 扱い | 対応先 / 理由 |
|---:|---|---|---|---|
| 20 | TripoSR（最初の外部実験） | REQ 7.1 / OPEN / PLAN 28 | 外部・確認待ち（前進） | Stage4-01/02 の adapter 対象候補。**コード MIT を 2026-07-20 一次確認**。重み・商用条件は未確認 |
| 21 | Stable Fast 3D | REQ 7.2 | 外部・確認待ち | 同上。Stability AI 系ライセンス・売上制限の確認必須（未確認） |
| 22 | SPAR3D | REQ 7.2 | 外部・確認待ち | 同上 |
| 23 | TRELLIS / TRELLIS.2 | REQ 7.2 | 外部・確認待ち（前進・研究） | 高 GPU 前提。**コード MIT を 2026-07-20 一次確認**。重み・依存は未確認 |
| 24 | Hunyuan3D 系 | REQ 7.2 / OPEN | 外部・確認待ち（研究） | 地域条件の確認必須 |
| 25 | Step1X-3D / 3DTopia-XL / InstantMesh / OpenLRM / CRM | REQ 7.2 | 調査（研究追跡のみ） | 本体・adapter とも接続計画に入れない。動向記録のみ |
| 26 | RigAnything / UniRig（自動骨入れ） | REQ 7.3 | 外部・確認待ち（後期）**+ 方針一部変更（第2改訂）** | AI 自動骨入れは引き続き外部候補。ただし「rig 作成はツール内でしない」という旧方針は 2026-07-20 第2改訂で変更し、**テンプレート骨格 + envelope 自動ウェイトの限定形をツール内に採用**（`3D-DEC-RIG-01` / `3D-STAGE3-13/-14`。理由: 画像→3D 生成物は静的で、外部丸投げでは主要動線が完結しない） |
| 27 | SkinTokens / TokenRig | REQ 7.3 | 調査（追跡のみ） | 実装しない |
| 28 | Puppeteer（動画→動き） | REQ 7.3 | 調査（追跡のみ） | 同上 |
| 29 | 生成 AI をブラウザ本体へ入れない・重みを標準依存にしない | REQ 9 / PLAN 28 | 採用 | 完成形の非目標として固定 |
| 30 | 外部生成の想定フロー（画像→外部→GLB→検品→書き出し） | REQ 9 | 採用 | Stage4-01 の adapter 仕様の骨格 |

### 6.6 画面・UI

| # | 案 | 出典 | 扱い | 対応先 / 理由 |
|---:|---|---|---|---|
| 31 | 初期 5 画面（Import/Inspect/Setup/Game Data/Export） | REQ 10 / DIR 5 | 採用 | Stage1 の画面構成そのもの |
| 32 | Optimize 画面 | DIR 5 | 採用（延期どおり） | Stage3 |
| 33 | 2D と同じ Home・別編集画面・同じテイスト | DIR 5 / ADR-004 | 採用 | UI 仕様 1 章 |
| 34 | 本格モデリング UI を作らない | REQ 10 | 採用 | 非目標 |

### 6.7 書き出し・エンジン連携

| # | 案 | 出典 | 扱い | 対応先 / 理由 |
|---:|---|---|---|---|
| 35 | export ZIP 候補構造（model/metadata/reports/engines/README） | REQ 11 | 修正採用 | 入出力仕様 8.1。manifest / hash / 決定的出力を追加 |
| 36 | optimized model は初期必須にしない | REQ 11 | 採用 | Stage1 は source のみ |
| 37 | engine README 4 種（threejs/babylon/godot/unity） | REQ 11 | 修正採用 | Stage2-08。verified / import notes only の区分を導入し、未検証対象を verified と書かない |
| 38 | Generic 3D preset | STRAT | 採用 | export preset の初期形 |
| 39 | Unity/Godot 完全対応を名乗らない | REQ 14 / DIR 10 | 採用 | 表示区分 8.6 で構造化 |

### 6.8 非機能・境界

| # | 案 | 出典 | 扱い | 対応先 / 理由 |
|---:|---|---|---|---|
| 40 | 読み込み中 UI を固めない・進捗・失敗理由・元ファイル保持 | REQ 12 | 採用 | Worker 化 + UI 状態規則 |
| 41 | 3D を lazy load・2D bundle を増やさない | REQ 12 / DIR 10 | 採用 | アーキテクチャ 6 章（機械的 assert 付きに強化） |
| 42 | WebGPU 必須化しない | REQ 14 / ROAD | 採用 | 性能仕様 3 章 |
| 43 | 2D の asset.json / E2E を壊さない | REQ 14 / ROAD 9 | 採用 | 不変条件 + 防衛線（アーキテクチャ 13 章） |
| 44 | 初期完了条件 11 項目（GLB 読める〜ライセンス未確認 AI を含まない） | REQ 13 | 修正採用 | Stage1 終了 Gate の受け入れ条件へ吸収・具体化 |
| 45 | リポジトリ分離条件 6 項目 | DIR 7 / ADR-005 | 採用 | アーキテクチャ 12 章 |
| 46 | Three.js vs Babylon.js の比較（旧 Phase 22） | PLAN 22 / OPEN | 採用 | GATE-02。実測項目を明文化 |
| 47 | 2D Pro Gate 後に 3D-0 から再開 | ROAD 9 / ADR-007 | 採用 | 本計画の開始前 Gate 第 1 条件 |

### 6.9 今回の新しい提案（区分 4）

| # | 案 | 扱い | 対応先 |
|---:|---|---|---|
| N1 | `.cas3dproj` 形式の新設（4 案比較の上で） | 推奨（人間承認待ち） | 契約 12 章 / `3D-DEC-FORMAT-01` |
| N2 | 別 IndexedDB `chameleon-asset-studio-3d` | 推奨（人間承認待ち） | 契約 11 章 / `3D-DEC-STORAGE-01` |
| N3 | renderer adapter interface | 採用（計画） | アーキテクチャ 7 章 |
| N4 | 構造化検品（checkId / 検査バージョン / preset） | 採用（計画） | 入出力仕様 4 章 |
| N5 | export manifest / sha256 / 決定的出力 | 採用（計画） | 入出力仕様 8.3/8.5 |
| N6 | provenance / license 記録 | 採用（計画） | 契約 9/10 章 |
| N7 | 敵対的入力 fixture（破損・過大・zip bomb 等） | 採用（計画） | テスト仕様 3 章 |
| N8 | 2D bundle 非汚染の機械的 assert（ESLint + E2E） | 採用（計画） | アーキテクチャ 13 章 |
| N9 | viewer 非依存の一覧・数値によるアクセシビリティ | 採用（計画） | UI 仕様 1/6 章 |
| N10 | 限定的な作成・修正機能（primitive / 簡易 material 調整等）の第二段階以降検討 | 未決定（open） | `3D-OPEN-14` ほか |

2026-07-20 改訂で追加した新提案（設計正本は `3D_INTEROP_VRM_VR_AND_CREATION_SPEC.md`）:

| # | 案 | 扱い | 対応先 |
|---:|---|---|---|
| N11 | 他ツールとの差分分析（Blender / エンジン / VRoid / gltf.report 等とのすみ分け表） | 採用（計画） | interop 仕様 2 章 |
| N12 | VRM 対応（V1/V2 = 検出・meta 利用条件表示・humanoid 検査。V3 描画は候補） | 採用（V1/V2）+ 候補（V3） | `3D-STAGE2-11` / `3D-DEC-VRM-01` / `3D-OPEN-22` |
| N13 | vr 検品プリセットと WebXR preview | 採用（preset）+ 条件付き（preview） | `3D-STAGE2-06` / `3D-STAGE4-09` / `3D-OPEN-23` |
| N14 | skeleton 検査拡張（B1）と humanoid ボーン対応付け（B2/B3、`humanoidMap`） | 採用 | `3D-STAGE2-11` / `3D-STAGE3-11` |
| N15 | テクスチャ編集ブリッジ（2D 編集資産の再利用、baseColor 限定、derived 書き戻し） | 採用 | `3D-STAGE3-12`（旧 `3D-OPEN-14` の再定義） |
| N16 | Blender / Unreal import notes + Mixamo supply notes | 採用 | `3D-STAGE2-08` 拡大 / `3D-OPEN-27` |
| N17 | 外部生成 adapter のプロトコル詳細と 2D→3D ブリッジ（2D 画像を生成入力に） | 採用（設計） | `3D-STAGE4-01/-02` / interop 仕様 8 章 |
| N18 | 外部リグ付け後の revision 再取り込み | 未決定（open。既定: 新規アセット扱い） | `3D-OPEN-24` |

2026-07-20 **第2改訂**で追加した新提案（静的モデル→動くゲーム素材の動線）:

| # | 案 | 扱い | 対応先 |
|---:|---|---|---|
| N19 | humanoid テンプレート骨格のフィット（R2。旧「リグ作成は外部」方針の明示的変更） | 採用 | `3D-STAGE3-13` / `3D-DEC-RIG-01` |
| N20 | envelope 自動ウェイト + rigged derived 生成（R3/R4。nodeBinding 再バインド規則つき） | 採用 | `3D-STAGE3-14` / 契約 7.3 |
| N21 | 3D モーションテンプレート（M1。2D テンプレの思想の 3D 版・実装は別） | 採用 | `3D-STAGE3-15` |
| N22 | humanoid モーション retarget（M2） | 採用 | `3D-STAGE3-16` |
| N23 | 生成モデル特有の幾何・UV・テクスチャ検査（非多様体・重複頂点・UV 重なり・頂点カラーのみ） | 採用 | `3D-CHK-GEO-003/-004`・`UV-003`・`TEX-004` |
| N24 | 端から端までの標準動線の明文化（画像→動くキャラクター）と 2D 前処理ガイド | 採用 | interop 仕様 8.0〜8.1 / 完成条件 1 |
| N25 | 整合リスク台帳（3D-RISK-01〜12）と ⚠️ 印の運用 | 採用 | `3D_DECISION_LOG_AND_OPEN_ITEMS.md` 7 章 |
| N26 | Three.js Object Sculptor（画像から code-only Three.js model + `ObjectSculptSpec` を作る Codex plugin）を外部生成設計の参照資料へ追加 | **参照採用（実装未承認）** | `3D-STAGE4-01` / interop 仕様 8.4。spec-first、階層・pivot / socket、visual evidence が Chameleon と近い。標準出力は GLB ではないため外部隔離変換を必須とし、Chameleon 本体で生成コードを実行しない |

## 7. 文書間の矛盾

調査の結論: **実質的な矛盾は無い**（担当 B 報告。gate 条件・凍結扱い・生成 AI 境界は全文書で一貫）。ただし次の 2 点を「表現の揺れ」として記録する。

| 項目 | 内容 | 優先 | 対応 |
|---|---|---|---|
| 揺れ 1 | REQ 3.1 は OBJ を「後続候補」とするが、STRAT は 3D 入力を GLB/glTF 中心と記載 | STRAT（現行有効）を優先 | 本計画では OBJ を延期扱いにし、`3D-OPEN-20` で再判断。旧文書は修正しない（履歴） |
| 揺れ 2 | REQ 4 の `scale: number` と REQ 5 の「pivot / origin 必須」は、glTF に単一の pivot 概念が無い点が未定義 | 新契約 13 章の定義を優先 | 実装時は新契約を正とする。旧文書は修正しない |
| 揺れ 3 | ROAD 9 章「2D の操作画面を 3D 都合で変更しない」と、本計画が Home 画面へ 3D 入口・サムネイルを追加する点（`3D-STAGE1-01/-09`・`3D-STAGE2-09`）が表面上衝突 | ADR-2026-07-07-004（同じ Home / Project Dashboard を共有してよい）を優先 | ROAD 9 章の「操作画面」は 2D の**編集画面**を指すと解釈する（編集画面は完全分離を維持）。Home は 2D/3D 共通の入口領域であり、追加は入口ボタンとサムネイル表示に限定。この 2D 接点 PR は 2D E2E 全件 + bundle 非汚染 assert を必須にする（アーキテクチャ 13 章） |

## 8. 未確認事項（区分 5）

- 外部ライブラリの現在の安定版バージョン・gltfpack 同梱物・KTX-Software ライセンス詳細・three.js examples 配布単位（`3D_PERFORMANCE_DEVICE_SECURITY_LICENSE_SPEC.md` 8 章）。
- 生成 AI 候補（TripoSR 等 6.5 の全候補）の重みライセンス・商用条件・地域制限（今回は外部確認を行っていない）。
- Three.js Object Sculptor の upstream 更新追従、Three.js code → GLB の見た目・階層・animation / material 変換精度、iPhone 級性能、Codex / vision reviewer と入出力の権利条件（詳細は interop 仕様 8.4）。
- 過去の Pull Request・issue・commit message の全文検索（GitHub API 側の調査は今回実施していない。リポジトリ内文書・コードの全文検索で代替した。過去 PR にのみ存在し文書に残っていない 3D 案があれば本表から漏れている可能性がある）。
- Safari の IndexedDB 大容量 Blob・OffscreenCanvas + WebGL の実挙動（Gate 後実測）。
- CI（Playwright Chromium）での WebGL 動作（`3D-STAGE1-11` で確認）。
