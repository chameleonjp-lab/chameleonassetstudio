# Chameleon Asset Studio テスト計画書

最終更新日: 2026-07-04
対象バージョン: 0.1.0
詳細な対象一覧の正本: `docs/implementation/TEST_AND_RELEASE.md`

---

## 1. テストの層と実行コマンド

| 層 | コマンド | 内容 |
| --- | --- | --- |
| 型 + ビルド | `npm run build` | tsc --noEmit + vite build |
| Unit（Vitest） | `npm run test` | 純関数・schema・storage・rig・export 生成の検証 |
| E2E（Playwright） | `npm run e2e` | 実ブラウザ（Chromium）でのユーザーフロー検証 |
| Lint / Format | `npm run lint` / `npm run format:check` | ESLint / Prettier |

CI（GitHub Actions）は PR ごとに build-and-test（build / lint / format:check / unit）と e2e を実行する。ローカル e2e は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` の指定が必要な環境がある。

## 2. Unit テストの主な対象

- データ形式: JSON Schema 検証（型別設定、image レイヤーの textureId 必須を含む）、migrate、サンプルデータの妥当性
- storage: IndexedDB CRUD、自動保存キュー、`.casproj` 往復（画像ファイル欠落の書き出し拒否 / 読み込み許容を含む）
- 画像: 取り込み検証（4096 x 4096 境界の受理 / 超過拒否）、画像操作、`decodeImageSource` フォールバック
- リグ: 行列合成・補間・rotationLimit・焼き込み・循環耐性、モーションテンプレート
- 書き出し: atlas 配置と tile 同梱条件、examples / helpers / エンジンガイドの生成内容

## 3. E2E テストの主な対象

プロジェクト管理、取り込み、キャンバス編集、画像編集、レイヤー / パーツ、原点・アンカー・判定、フレーム / アニメーション、書き出し（PNG / WebP / JSON / ZIP の中身検証、Blob 欠落時の失敗表示）、`.casproj` ラウンドトリップ、サンプル表示、型別設定、リグ焼き込み、モバイル（縦 / 横 / iPad / タップ対象 / 入力ズーム防止）。

## 4. 実機ブラウザ確認（未実施・リリース前に必要）

自動テストは Chromium のみ。v1.0.0 判定前に次の実機確認を行う（`docs/RELEASE_CHECKLIST.md`）。

- [ ] iPhone Safari / [ ] iPad Safari / [ ] Chrome / [ ] Edge / [ ] Firefox / [ ] Android Chrome
- 確認観点: 主要画面の表示、取り込み → 編集 → 書き出し一連、WebP 書き出しの可否表示、ダウンロード動作（Blob URL）、タッチ操作

## 5. 性能・メモリ（未実施・リリース前に必要）

- [ ] 4096 x 4096 画像の取り込み〜編集〜書き出しのメモリ使用量計測（実機）
- [ ] 連続編集（画像操作を繰り返す）でメモリが増え続けないことの確認
- [ ] レイヤー数が多い（20+）場合の描画フレームレート確認
