# 実装計画詳細: Phase 14〜17

最終更新日: 2026-07-02

この文書は、MVP 後の拡張から v1.0.0 品質化までを定義する。

---

## Phase 14: 背景、アイテム、タイル、ギミック

目的は、キャラクター以外のゲーム素材にも対応することである。

### アイテム

作業:

- `item` asset type を追加する。
- 取得判定を持てるようにする。
- rarity を設定できるようにする。
- tags を設定できるようにする。
- gameAttributes を自由に追加できるようにする。
- アイテム用テンプレートを作る。

標準属性候補:

- score
- hp
- attack
- defense
- speed
- duration
- effectType
- rarity

完了条件:

- アイテム画像を作れる。
- 取得判定を設定できる。
- 属性を設定できる。
- JSON に出る。
- 書き出し ZIP に含まれる。

### 背景

作業:

- `background` asset type を追加する。
- 背景レイヤーを複数持てるようにする。
- parallaxSpeed を設定できるようにする。
- loopX / loopY を設定できるようにする。
- far / mid / near / foreground の役割を設定できるようにする。
- 背景プレビューを作る。

完了条件:

- 背景を複数レイヤーで作れる。
- 遠景、中景、近景を分けられる。
- パララックス速度を設定できる。
- ループ背景として書き出せる。

### タイル

作業:

- `tile` asset type を追加する。
- tileSize を設定できるようにする。
- collisionType を設定できるようにする。
- visualType を設定できるようにする。
- tile 用の Atlas 出力を作る。

完了条件:

- 床、壁、穴、一方通行床などの素材を作れる。
- 衝突タイプを設定できる。
- ゲーム側で読み込める JSON に出せる。

### ギミック

作業:

- `gimmick` asset type を追加する。
- 画像、判定、tags を持てるようにする。
- movementPreset の入口を作る。
- hazard / platform / obstacle / pickup_emitter などのタグ候補を用意する。

完了条件:

- 動く床、障害物、回転物、爆発物などの素材データを作れる。
- 判定とタグを設定できる。
- 後の動きプリセットに接続できる構造になっている。

---

## Phase 15: 高度編集

目的は、素材をより短時間で動かせるようにすることである。ただし、Spine や Rive の完全代替を目指さない。

### 簡易リグ

作業:

- パーツの親子関係を作る。
- bind pose を作る。
- localPosition を作る。
- localRotation を作る。
- rotationLimit を作る。
- keyframe transform を作る。
- フレームアニメーションへ焼き込みできるようにする。

完了条件:

- 頭、腕、足、武器などをパーツ単位で動かせる。
- パーツの親子関係が保存される。
- 簡易リグからフレームアニメーションへ変換できる。

### モーションテンプレート

作業:

- idle sway を作る。
- walk bounce を作る。
- jump squash を作る。
- attack swing を作る。
- damage shake を作る。
- dead collapse を作る。

完了条件:

- 標準パーツ種別を使ってテンプレートを適用できる。
- テンプレート適用後に手動調整できる。
- テンプレート結果を保存できる。

### 補助機能

将来の補助機能として、背景除去補助、パーツ候補検出、色候補、アニメーション候補を追加する。ただし、補助結果を正解として固定しない。必ずユーザーが修正できる状態にする。

---

## Phase 16: エンジン連携

目的は、Chameleon Asset Studio で作ったデータを、主要なゲーム制作環境へ渡しやすくすることである。

### Canvas 2D

作業:

- vanilla Canvas loader を作る。
- sprite draw helper を作る。
- frame animation helper を作る。
- collider debug draw を作る。
- 1 ファイル HTML サンプルを生成する。

完了条件:

- 外部ライブラリなしで画像を表示できる。
- アニメーションを再生できる。
- 原点と当たり判定の扱いが分かる。

### PixiJS

作業:

- Pixi asset loader code を生成する。
- AnimatedSprite sample を生成する。
- anchor / origin helper を生成する。
- collider overlay helper を生成する。

完了条件:

- PixiJS v8 で画像が表示される。
- フレームアニメーションを再生できる。
- 原点、アンカー、当たり判定を参照できる。

### Phaser

作業:

- Phaser preload code を生成する。
- Phaser create code を生成する。
- animation generation を作る。
- collider data reader を作る。
- example scene を生成する。

完了条件:

- Phaser で画像が表示される。
- アニメーションを再生できる。
- 当たり判定データを読める。

### Godot / Unity

初期方針:

- 完全な Godot Scene 生成はしない。
- 完全な Unity Prefab 生成はしない。
- まず PNG / JSON / 読み込み説明を生成する。
- 次に import helper script を検討する。

完了条件:

- Godot と Unity へ渡すためのファイル構成と説明が出る。
- 完全対応と誤解される表現をしない。

### Rive / Spine

初期方針:

- 完全互換を名乗らない。
- まずは取り込み補助または参照補助から始める。
- 独自形式との差を docs に書く。

完了条件:

- Rive / Spine との関係が説明されている。
- 独自形式が正本であることが明確になっている。

---

## Phase 17: v1.0.0 品質化

目的は、長く使える制作基盤として安定させることである。

作業:

- 大画像のメモリ使用量を測る。
- Web Worker 化できる処理を移す。
- 画像キャッシュを整理する。
- Blob URL の解放漏れを防ぐ。
- レイヤー数が多い場合の描画を最適化する。
- スマホで重い処理を制限する。
- 主要ブラウザで確認する。
- 仕様書、データ形式、書き出し形式、テスト計画を更新する。

v1.0.0 までに揃える文書:

- `docs/REQUIREMENTS_SPECIFICATION.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/DATA_FORMAT.md`
- `docs/EXPORT_FORMATS.md`
- `docs/USER_GUIDE.md`
- `docs/TEST_PLAN.md`
- `docs/RELEASE_CHECKLIST.md`

完了条件:

- 4096 x 4096 の画像を安全に扱える。
- 画像処理中に進捗が出る。
- 連続編集でメモリが増え続けない。
- モバイルで完全停止しない。
- iPhone Safari、iPad Safari、Chrome、Edge、Firefox、Android Chrome で主要画面を確認する。
- 既存プロジェクトを壊さずアップデートできる。
- 別の実装者が docs だけで引き継げる。

---

## v1.0.0 の最終判定

Chameleon Asset Studio の完成は、見た目の画面ができた時ではない。

完成とは、次の状態である。

- ゲーム用アセットを作れる。
- ゲーム用メタデータを付けられる。
- 保存して再開できる。
- 書き出してゲームへ組み込める。
- PC、スマホ、iPad で破綻しない。
- データ形式が文書化されている。
- テストで壊れていないことを確認できる。
- 別の実装者が引き継いでも迷わない。
