# 受入台帳の現HEAD照合 — 2026-10-13

## 範囲

- 対象HEAD: `bbfd3f82e10bd910f85f59dd9e595b2cab4e2191`（Draft PR #390 head、PR #389の下流）
- 対象: [受入状況台帳](ACCEPTANCE_STATUS_2026-10-10.md)のCOMPAT-06、EDIT-02、EDIT-04、VIEW-02、IMP-01
- 実行: local production previewのPlaywright、`chromium` と `webkit-critical`。remote CIは監視していない。

## 結果

| 要件 | 製品E2E | Chromium | WebKit-critical |
| --- | --- | --- | --- |
| EDIT-02 | `object deletion previews linked dependencies and preserves originals through cancel and Undo/Redo` | pass | pass |
| EDIT-04 | `hierarchy clone confirms dependencies, invalidates stale selection and preserves source bytes across Undo/Redo and copy restore` | pass | pass |
| EDIT-04 | `hierarchy clone refuses a skinned part without its joints and preserves the complete project` | pass | pass |
| IMP-01 | `successful unsaved import previews cancel on close, Escape, file replacement and canonical changes` | pass | pass |
| IMP-01 | `keyboard-only import preview, GameData edit and export after fixture upload`（未保存preview→明示確認→新copy保存） | pass | pass |
| COMPAT-06 | `COMPAT-06 explicitly copies a real 2D PNG export into 3D without automatic synchronization` | pass | pass |
| VIEW-02 | `ground is an independent view-only helper and never enters canonical backup or GLB geometry` | pass | pass |

3回の実行で**合計14/14 pass、skip 0、flaky 0**。最初の5ケースは10/10、IMP-01のkeyboard-only成功経路は2/2、EDIT-04のskin依存拒否は2/2。

## 台帳の読み替え

このheadには、上記5要件について台帳の旧残文言が示す欠落（一般object削除、階層clone、保存前import preview/apply、実2D PNG handoff、VIEW-02 ground表示）は残っていない。各行の実装状況を `implemented-candidate` に更新したが、検査状態は `partial` のままとする。これは製品E2Eの対象範囲を反映するもので、全受入完了を意味しない。

## 未確認境界

- ファイル入力にはPlaywrightのfixture注入を使用し、OSのネイティブfile picker操作自体は検査していない。
- 対象は自動化されたChromium/WebKit製品previewであり、実端末、assistive technology、OS/process interruption、実storage quota/eviction、deployment環境の受入は含まない。
- テスト結果はこのローカルHEADとfixtureに対するもの。リモートCIの状態や、別headでの結果へ一般化しない。
