# Chameleon Asset Studio リリースチェックリスト

最終更新日: 2026-07-04
対象: v1.0.0 判定
上位文書: `docs/implementation/TEST_AND_RELEASE.md` / `docs/implementation/PHASES_14_17.md`（Phase 17）

**現状: v1.0.0 未達。** 実装（Phase 0〜16 + 15.5）と自動テストは完了しているが、実機確認と性能計測が未実施のため、v1.0.0 完了とは判定しない。

---

## 1. 実装・自動テスト（完了）

- [x] Phase 0〜16 + 15.5 が main にマージ済み
- [x] `npm run build` / `npm run lint` / `npm run format:check` が成功する
- [x] Unit テスト（195 件）が成功する
- [x] E2E テスト（54 件、Chromium）が成功する
- [x] 4096 x 4096 の受理と超過拒否がテストされている
- [x] 画像処理中に進捗が表示される（Web Worker 実行）
- [x] Blob URL の解放が管理されている（decodeImageSource の close 一元化 / downloadBlob の遅延 revoke）
- [x] 画像 Blob 欠落が書き出し・`.casproj` 書き出しで検出される
- [x] 既存プロジェクトを壊さない形式拡張のみ（version 0.1.0 のまま、migrate 入口あり）

## 2. 文書（完了）

- [x] `docs/REQUIREMENTS_SPECIFICATION.md`
- [x] `docs/IMPLEMENTATION_PLAN.md`（+ `docs/implementation/`）
- [x] `docs/DATA_FORMAT.md`
- [x] `docs/EXPORT_FORMATS.md`
- [x] `docs/ENGINE_INTEGRATION.md`
- [x] `docs/USER_GUIDE.md`
- [x] `docs/TEST_PLAN.md`
- [x] `docs/RELEASE_CHECKLIST.md`（本書）

## 3. 実機確認（未実施 — v1.0.0 の必須条件）

主要画面（ホーム / 編集 / 書き出し）と、取り込み → 編集 → 書き出しの一連を各実機で確認する。

- [ ] iPhone Safari
- [ ] iPad Safari
- [ ] Chrome（PC）
- [ ] Edge（PC）
- [ ] Firefox（PC）
- [ ] Android Chrome

## 4. 性能・メモリ計測（未実施 — v1.0.0 の必須条件）

- [ ] 4096 x 4096 画像の取り込み〜編集〜書き出しが実機でクラッシュしない
- [ ] 連続編集でメモリが増え続けない（開発者ツールで確認）
- [ ] レイヤー多数（20+）でも編集可能なフレームレートを保つ
- [ ] スマホ実機で重い処理中も UI が完全停止しない

## 5. 既知の残課題（v1.0.0 を妨げないが記録する）

- `.casproj` 読み込み時の欠落画像の警告表示（現在は黙って許容。`docs/DATA_FORMAT.md` 参照）
- importImage / Web Worker 系の `createImageBitmap` 直接呼び出しのフォールバック化
- effect アセット種別の専用 UI（現在は共通機能のみ）
- Godot / Unity の import helper script（設計メモ: `docs/ENGINE_INTEGRATION.md` 4 章）

## 6. リリース手順（3・4 完了後）

1. 本書 3・4 のチェックをすべて埋める（結果と確認日を追記する）
2. `package.json` の version を `1.0.0` に上げ、README の実装状況を更新する
3. `npm run build` の成果物（`dist/`）で最終動作確認する
4. git タグ `v1.0.0` を作成し、リリースノート（主な機能・既知の制限）を添える
