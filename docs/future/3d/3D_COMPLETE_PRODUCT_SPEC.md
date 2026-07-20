# 3D Complete Product Spec（3D 機能の完成形仕様）

状態: **draft / human review required**
最終更新日: 2026-07-19
調査基準commit: `7018984ba9e6867c6fab12fb313308218a35c22b`
上位文書: `README.md`（本ディレクトリ）, `../PRODUCT_DIRECTION_2D_TO_3D.md`（背景）
関連文書: `3D_FOUR_STAGE_IMPLEMENTATION_PLAN.md`（実現手順）

> **この文書は 3D 実装開始の承認ではない。** 完成形の定義であり、着手は 2D Pro Gate の人間承認と `3D_FOUR_STAGE_IMPLEMENTATION_PLAN.md` の開始前 Gate 通過が前提である。

---

## 1. 一言でいうと

Chameleon Asset Studio の 3D 機能は、**「外部で作られた 3D モデルを、ゲームに組み込める素材へ整える検品・整備場」**である。

3D モデルを作るツール（Blender のようなモデリングソフト）ではない。3D モデルを生成する AI でもない。AI や外部ツールが作った GLB / glTF を読み込み、重さと問題点を検品し、原点・向き・大きさ・アンカー・当たり判定というゲーム用情報を付け、説明書付きの ZIP として書き出す。

これは旧 3D 要件（`../THREE_D_ASSET_PREPARATION_REQUIREMENTS.md` 15 章)の「3D 対応の最初の価値は、生成ではなく検品と軽量化である」という結論を完成形まで貫いたものである。

## 2. 対象利用者

- 2D Studio と同じ、個人〜少人数のブラウザゲーム制作者（当面は作者自身の内製利用。`../README.md` 1 章の方針を踏襲）。
- 3D の専門知識（座標系・PBR・圧縮形式）が無くても、警告文と修正手段の提示によって作業を完了できることを品質目標にする。

## 3. 利用者の作業全体（完成形で成立する一続きの体験）

1. Home で 3D プロジェクトを作る（または `.cas3dproj` を開く）。
2. GLB / glTF（AI 生成物・購入素材・自作）を取り込む。壊れたファイルは隔離され、理由が分かる。
3. Inspect で重さ（サイズ・三角形・texture）と問題点（警告一覧）を、対象ゲームのプリセット（mobile / web / desktop）基準で確認する。
4. Setup で単位・向き・原点・足元を確認し、必要なら補正する（元モデルは書き換えない）。
5. Scene / Materials / Animation で中身（node・材質・クリップ）を確認し、animation を再生して確かめる。
6. Game Data で anchor（手・足元・発射位置など）と collider（box / sphere / capsule）を付ける。
7. 必要なら Optimize で軽量化した派生モデルを作り、Compare で見た目・サイズ・animation 保持を比較して選ぶ。
8. Export で ZIP（モデル + metadata + 検査報告 + README + import notes + manifest/hash）を書き出す。
9. Three.js / Babylon.js には verified の手順とサンプルで、Godot / Unity には import notes で持ち込む。
10. `.cas3dproj` を保存すれば、別の日・別の端末でも作業を再開できる。

## 4. 扱うアセット（完成形）

| 種類 | 例 | 対応 |
|---|---|---|
| 静止モデル | 小物、建物、地形パーツ | 完全対応 |
| animation 付きキャラクター | skin + クリップ複数 | 完全対応（再生確認・保持確認込み） |
| 複数 material / 外部 texture の glTF | PBR 素材 | 完全対応 |
| 圧縮済みモデル | Meshopt / Draco / KTX2 | 読み込み対応 + 書き出し（第三段階の範囲） |
| AI 生成モデル | TripoSR 等の出力 | 手動持ち込みで完全対応（検品が主価値）。自動連携は外部 adapter 経由（10 章） |
| 壊れた・過大なモデル | 破損 GLB、巨大ファイル | 安全に拒否・隔離・説明 |
| assetType3d 区分 | character / prop / environment / other | metadata として分類 |

## 5. 扱わないもの（非目標）

以下は完成形に**含めない**。「無いから未完成」とは判定しない。

- 総合モデリング（sculpt / retopology / UV 編集 / texture painting / rig 作成 / アニメーション制作）
- ブラウザ内での 3D 生成 AI 実行（Python / GPU / モデル重みの同梱）
- WebGPU 必須化
- クラウド保存・アカウント・課金・共同編集
- ゲームエンジンとの本番水準の双方向同期
- FBX / Blender ファイルの直接読み込み
- mesh collider の生成

限定的な作成・修正機能（primitive 追加、node 整理、material 簡易調整、texture 差し替え、不要要素の削除、variant 作成など）は「対象外」ではなく「第二段階以降の追加検討」（`3D_DECISION_LOG_AND_OPEN_ITEMS.md` の open 項目）とし、採用しなくても完成と判定できる。

## 6. 最終的な画面

`3D_UI_UX_SPEC.md` 2 章の 13 画面（Home 拡張 + 3D Project 作成 + Import / Inspect / Setup / Scene / Materials / Animation / Game Data / Optimize / Compare / Export / Project Settings）。PC / iPad / iPhone すべてで、閲覧・検品・数値設定・書き出しが完了できる。

## 7. 最終的な入出力

- 入力: GLB、glTF + bin + textures（bundle）、`.cas3dproj`
- 出力: 3D アセット ZIP（source / 任意で derived / asset3d.json / inspection-report.json / export-manifest.json / README / engines import notes）、`.cas3dproj`、thumbnail
- エンジン対応表示: Three.js / Babylon.js = verified（実行検証済み）、Godot / Unity = import notes only から開始し、証拠が揃った対象だけ verified へ昇格

## 8. 完成条件（Definition of Done の骨子）

以下がすべて満たされた時、3D 機能を「完成」と呼ぶ。詳細な証拠形式は `3D_TEST_EVIDENCE_AND_RELEASE_SPEC.md`。

1. 3 章の一続きの体験が、PC / iPad / iPhone の対象端末で実際に完了できる（実機確認報告あり）。
2. 4 章の全アセット種類について fixture と自動テストがあり、CI で継続成功している。
3. 破損・過大・不正入力の防御が security fixture で検証されている。
4. 保存・復旧（autosave / trash / snapshot / quarantine / 旧版 migration / rollback）がテストと手動証拠で確認されている。
5. export ZIP の再読み込み・hash 検証・（可能な操作の）決定的出力が round-trip テストで確認されている。
6. 性能予算が確定し、対象端末での実測が予算内である（性能報告あり）。
7. アクセシビリティ（キーボード完結・SR 代替情報・motion reduction・色以外の状態表示）が確認されている。
8. verified 表示の全対象にエンジン取り込み証拠がある。
9. 依存関係とライセンスの記録（NOTICE 含む）が揃い、fixture 台帳に利用条件不明の素材が無い。
10. 2D の全テスト・bundle 非汚染 assert が成功し続けている。
11. 利用者向けガイド（USER_GUIDE への 3D 節）と実装者向けガイド（docs/future/3d 一式の整合）が更新され、RELEASE_CHECKLIST に 3D 節がある。
12. Opus 4.8 の BLOCKER / MUST が残っていない。人間が完成を明示承認している。

## 9. 品質目標（2D と対になる表現）

- 1 つのモデルを整える時、検品 → 原点 → アンカー → 判定 → 書き出しまで迷わない。
- `.cas3dproj` を開き直しても作業を再開できる。
- export ZIP を見れば、何をゲーム側へ入れればよいか分かる。
- 警告は「何が・なぜ・ゲームでどうなる・どう直す」まで言える。
- 外部生成 3D の結果を、そのまま信じずに検品できる。
- エラーや制限が文章で分かる。既存データを壊さない。

## 10. 外部 3D 生成との関係（完成形での位置づけ）

- 3D 検品・設定・書き出し機能は、外部生成連携が無くても**単独で完成**している（これが完成判定の前提）。
- 手動持ち込みは常に可能。共通 adapter 仕様（第四段階で設計)により、ローカル外部処理や外部 API と接続する場合も、送信の明示承認・送信記録・失敗時のデータ保全を必須とする（`3D_PERFORMANCE_DEVICE_SECURITY_LICENSE_SPEC.md` 10 章）。
- どの生成 provider とも、ライセンス・利用規約・商用条件の確認記録なしに接続を出荷しない。
