# テスト計画とリリース条件

最終更新日: 2026-07-02

この文書は、Chameleon Asset Studio の品質確認とリリース判断を定義する。

---

## 1. テスト方針

このツールは、見た目が表示されるだけでは合格にしない。

合格には、次の 4 点が必要である。

1. データが正しい。
2. 保存して再読み込みできる。
3. 書き出したデータをゲーム側で読める。
4. PC、スマホ、iPad で操作が破綻しない。

---

## 2. Unit test

対象:

- JSON Schema 検証
- migrate 関数
- Project model
- Asset model
- Layer 操作
- Part 操作
- Anchor 操作
- Collider 操作
- Animation 操作
- Export JSON 生成
- 色変換
- トリミング計算

完了条件:

- 正しい asset JSON が検証を通る。
- 必須項目が欠けた asset JSON は検証で落ちる。
- 古い version の asset が migrate できる。
- 原点、アンカー、当たり判定、アニメーションが JSON に反映される。
- `npm run test` が通る。

---

## 3. Integration test

対象:

- project create -> save -> reload
- image import -> save -> reload
- edit -> undo -> redo
- asset -> export ZIP
- `.casproj` import -> edit -> export

完了条件:

- 新規プロジェクトを作り、再読み込み後に一覧へ出る。
- 画像を取り込み、再読み込み後も表示できる。
- レイヤー移動を Undo / Redo できる。
- 原点、アンカー、当たり判定を保存できる。
- ZIP に必要ファイルが入る。

---

## 4. E2E test

最低限、次の通し操作を確認する。

1. 新規プロジェクトを作る。
2. PNG を取り込む。
3. レイヤー名を変更する。
4. 原点を設定する。
5. 矩形当たり判定を追加する。
6. idle アニメーションを作る。
7. ZIP を書き出す。
8. 再読み込み後にプロジェクトを開く。

完了条件:

- 途中でエラー画面にならない。
- ZIP が生成される。
- ZIP に `asset.json` と画像が含まれる。
- 再読み込み後に画像とメタデータが残る。

---

## 5. 手動テスト

確認端末:

- iPhone Safari
- iPad Safari
- PC Chrome
- PC Safari
- PC Firefox
- Android Chrome

確認項目:

- ホーム画面が崩れない。
- 新規プロジェクトを作れる。
- 保存済みプロジェクトを開ける。
- 画像を取り込める。
- キャンバス操作ができる。
- パネルスクロールができる。
- 数値入力できる。
- Undo / Redo が効く。
- 書き出しできる。
- 横スクロールが出ない。

---

## 6. 性能確認

初期目標:

- PC と iPad では通常編集時 60fps を目標にする。
- スマホでは 30fps 未満が続かないようにする。
- 4096 x 4096 画像の処理中は進捗表示を出す。
- 大きい画像処理で UI が完全停止しない。

確認項目:

- 画像取り込み時間
- トリミング時間
- 背景透過時間
- 色変更時間
- ZIP 生成時間
- 連続操作後のメモリ増加
- Blob URL の解放漏れ

---

## 7. リリース計画

| バージョン | 内容 |
|---|---|
| v0.1.0 | MVP。キャラクター作成、画像編集、原点、アンカー、判定、アニメーション、書き出し |
| v0.2.0 | 制作体験改善。スマホ UI、iPad UI、Undo / Redo、輪郭線、フレーム編集 |
| v0.3.0 | 背景・アイテム。item、background、parallax、pickup collider、tile basic |
| v0.4.0 | ギミック・テンプレート。gimmick、motion preset、tile collision |
| v0.5.0 | 簡易リグ。part hierarchy、keyframe transform、simple rig、motion bake |
| v0.6.0 | エンジン連携強化。Phaser、PixiJS、Canvas、Godot guide、Unity guide |
| v1.0.0 | 安定版。`.casproj`、schema、export、主要端末、移行保証、ドキュメント完備 |

---

## 8. v0.1.0 リリース条件

- 新規プロジェクトを作れる。
- PNG / JPG / WebP を取り込める。
- 画像をトリミングできる。
- 背景を簡易透過できる。
- レイヤーを扱える。
- 色を変更できる。
- 原点を設定できる。
- アンカーを設定できる。
- 矩形と円の当たり判定を設定できる。
- idle アニメーションを作れる。
- JSON、PNG、WebP、ZIP を書き出せる。
- 再読み込みしても作業プロジェクトが残る。
- スマホ、iPad、PC で主要操作ができる。
- Unit test と E2E test が通る。

---

## 9. v1.0.0 リリース条件

- キャラクター、アイテム、背景、タイル、ギミック、エフェクトを作れる。
- 内部データ形式が schema で検証される。
- `.casproj` を読み書きできる。
- 汎用 JSON / PNG / WebP / Sprite Sheet / Atlas を書き出せる。
- Canvas / PixiJS / Phaser のサンプルコードを生成できる。
- Godot / Unity へのインポート補助を生成できる。
- スマホ、iPad、PC の UI がそれぞれ破綻しない。
- 大きな画像処理中に UI が完全停止しない。
- 既存プロジェクトを壊さずアップデートできる。
- docs が最新になっている。
