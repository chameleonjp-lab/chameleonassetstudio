# 3D Test / Evidence / Release Spec（テスト・証拠・リリース判定）

状態: **draft / human review required**
最終更新日: 2026-07-19
調査基準commit: `7018984ba9e6867c6fab12fb313308218a35c22b`
上位文書: `README.md`（本ディレクトリ）
関連文書: `3D_FOUR_STAGE_IMPLEMENTATION_PLAN.md`, `3D_PERFORMANCE_DEVICE_SECURITY_LICENSE_SPEC.md`

> **この文書は 3D 実装開始の承認ではない。** fixture の取得・作成も `3D-GATE-06` までリポジトリへ追加しない。

---

## 1. テスト階層

既存基盤（Vitest + fake-indexeddb、Playwright、fixture ベース契約テスト）の方式を 3D に適用する。

| 層 | 対象 | 実行 | 備考 |
|---|---|---|---|
| 型テスト | `core3d/model` の型整合（tsc --noEmit） | CI 毎回 | 既存 build に含まれる |
| Schema テスト | asset3d ほか各 schema × samples の検証 | CI 毎回 | 2D `validate.test.ts` と同方式 |
| migration テスト | 3D 版 migrateDocument の系（旧版 fixture → 現行） | CI 毎回 | version を上げた時に fixture 追加必須 |
| parser テスト | GLB header / chunk / 上限 / 破損検出（純関数） | CI 毎回 | 破損 fixture 使用 |
| validation / inspect テスト | 検査項目ごとの実測値・警告生成（純関数） | CI 毎回 | しきい値は preset fixture で固定 |
| storage テスト | db3d の CRUD / トランザクション / quota エラー | CI 毎回 | fake-indexeddb |
| recovery テスト | trash3d / snapshots3d / quarantine3d / 中断 | CI 毎回 | |
| import / export / round-trip テスト | `.cas3dproj` と export ZIP の往復、hash 一致 | CI 毎回 | |
| renderer テスト | adapter 契約（mount/load/dispose/screenshot）のモック + 実ブラウザ | E2E 枠 | |
| visual regression | 代表 fixture の screenshot 比較（許容差分つき） | E2E 枠 | Playwright の screenshot 比較を利用 |
| E2E | 取り込み→検品→設定→保存→再読込→書き出しの動線 | CI（e2e job） | role / accessible name / DOM / IndexedDB 読み取りで安定化。canvas 座標依存は最小限（既存方針） |
| performance テスト | 予算表（`3D_PERFORMANCE…SPEC.md` 1–2 章）の実測 | 定期 + Gate | 結果は baseline 報告として docs へ |
| memory / context loss テスト | dispose 後残留、context loss 復帰 | E2E + 手動 | context loss は `WEBGL_lose_context` 拡張で再現 |
| security / corrupted / oversized テスト | 3 章の敵対的 fixture | CI 毎回（純関数部分） | |
| accessibility テスト | フォーカス順・aria・キーボード動線 | E2E + 手動 | |
| 2D regression | 既存 2D unit + E2E 全件 + bundle 非汚染 assert | CI 毎回 | 3D PR でも常に実行 |
| device test / engine import fixture | 実機・実エンジンでの確認 | 手動（証拠形式は 5 章） | |

## 2. E2E の書き方（3D 固有の注意）

- 3D viewer の描画結果そのものではなく、**一覧・数値・DOM 状態**を assert の主軸にする（例: stats 表の三角形数、警告一覧の checkId、anchor 一覧の座標値）。
- viewer の確認は screenshot 比較（visual regression）に分離し、通常 E2E と混ぜない。
- WebGL が使えない CI 環境への備え: Playwright の Chromium は SwiftShader で WebGL 動作可能だが、初回実装時に実際に確認し、不可なら viewer テストを別 job に分離する（`3D-STAGE1-11` の確認項目）。
- IndexedDB の直接読み取り assert は 2D の既存手法（`storage.spec.ts`）を踏襲。

## 3. fixture 一覧（計画）

原則自作（スクリプト生成）。第三者素材はモデル単位でライセンス確認・記録（`3D-GATE-06`）。

| fixture | 目的 | 出所（予定） | 段階 |
|---|---|---|---|
| minimal.glb（三角形 1 枚） | parser / 表示 / round-trip の最小系 | 自作（生成スクリプト） | Stage1 |
| box-textured.glb（texture 埋め込み） | texture 統計・表示 | 自作 | Stage1 |
| character-anim.glb（skin + animation 2 本） | animation / skin 検出・再生 | 自作（Blender で作成し CC0 宣言）または Khronos sample（個別確認） | Stage1 検出 / Stage2 再生 |
| multi-material.glb / multi-mesh.glb / multi-scene.gltf | 一覧・scene graph | 自作 | Stage2 |
| external-texture.gltf + bin + png | bundle 読み込み・相対 URI | 自作 | Stage2 |
| morph-target.glb | morph 検出 | 自作 | Stage2 |
| alpha-blend.glb / double-sided.glb | 材質検査 | 自作 | Stage2 |
| big-texture.glb（4096px） | texture 警告・メモリ | 自作 | Stage2 |
| offset-origin.glb（原点が大きくずれた） | 原点検査・feet 設定 | 自作 | Stage1 |
| z-up.glb（Z-up を想定した回転） | 軸補正の確認 | 自作 | Stage1 |
| unusual-bounds.glb（極大/極小） | bounds 警告 | 自作 | Stage2 |
| meshopt.glb / draco.glb / ktx2.glb | 圧縮読み込み | 自作（gltfpack / gltf-transform で生成） | Stage3 |
| corrupt-header.glb / corrupt-chunk.glb / truncated.glb | 破損検出・隔離 | 自作（バイト改変スクリプト） | Stage1 |
| missing-buffer.gltf / missing-texture.gltf / external-url.gltf | 欠落・不正 URI | 自作 | Stage2 |
| oversized.glb（上限超）/ json-bomb.glb（過大 JSON）/ zip-bomb.zip | 資源枯渇防御 | 自作（CI では縮小版 + 上限値を注入して再現） | Stage1〜2 |
| ai-generated 代表例 | AI 生成物の傾向（重い texture・原点ズレ等）の検品確認 | 利用者自身の生成物または CC0 確認済み素材（**未確定**。`3D-OPEN-10`） | Stage2 |
| vrm-0x.vrm / vrm-10.vrm（2026-07-20 改訂で追加） | VRM 検出・meta 読取・humanoid 検査（meta に商用不可を設定した版も用意） | 自作（生成スクリプトで glTF に VRM 拡張 JSON を付与） | Stage2 |
| humanoid-named.glb（Mixamo 系命名）/ humanoid-unnamed.glb | humanoid 自動推定の成功系・不成功系 | 自作 | Stage3 |
| dirty-texture.glb（背景ゴミ入り baseColor） | テクスチャ編集ブリッジの round-trip | 自作 | Stage3 |

fixture 台帳の必須記録項目: 目的 / 出所 / ライセンス / 再配布可否 / 期待結果（stats・警告 ID）/ 検査値 / 使用するテスト / 更新規則（生成スクリプトの場所）。台帳は `e2e/fixtures-3d/README.md`（予定）に置く。

## 4. 性能・端末・エンジンの証拠形式

自動テストで確認できないものは、次の形式の手動証拠を `docs/future/3d/reports/`（実装開始後に新設）へ残す。

- **性能報告**: 測定日 / commit / 端末・OS・ブラウザ版 / fixture / 測定項目と値 / 予算との差 / 測定手順（再現可能に）。`../PERFORMANCE_BUDGET.md` の書式を踏襲。
- **実機確認報告**: 端末 / 実施した動線（チェックリスト形式）/ 結果 / スクリーンショット or 動画の有無 / 気づいた問題。
- **エンジン取り込み証拠**（verified 判定用): エンジン名と版 / 取り込んだ export ZIP の manifest hash / 手順 / 表示・スケール・向き・animation の確認結果 / スクリーンショット。この証拠が無い対象を verified と表示しない。
- **WebXR 確認証拠**（`3D-STAGE4-09` 採用時のみ）: 使用 HMD・ブラウザ / 実寸確認の結果 / セッション終了後の解放確認。自動化しない（手動証拠のみ）。

## 5. review と CI

- PR は draft で作成 → CI 成功 → Opus 4.8 review-only → BLOCKER / MUST 解消 → 人間 merge（既存 Hybrid Roadmap Mode を踏襲）。
- 3D PR の CI 必須条件: lint / format:check / build / unit 全件 / E2E（2D 全件 + 3D 追加分）。md のみの PR は既存 CI 分類どおり build をスキップしてよい。
- Opus レビューの 3D 標準観点: 2D 契約への非干渉、source 不変条件、座標系の一貫性、安全検証の抜け、dispose 漏れ、テスト gap。

## 6. release checklist への統合と Definition of Done

- 3D の各段階終了 Gate の要件は `3D_FOUR_STAGE_IMPLEMENTATION_PLAN.md` の各段階に定義する。
- 最終（第四段階）完了時に `docs/RELEASE_CHECKLIST.md` へ 3D 節を追加する（それまで既存 checklist は変更しない）。
- 3D 機能全体の Definition of Done は `3D_COMPLETE_PRODUCT_SPEC.md` 8 章の完成条件 + 本文書の全テスト層の継続成功 + 証拠一式の存在とする。
