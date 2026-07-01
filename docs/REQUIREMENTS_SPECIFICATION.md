# Chameleon Asset Studio 要件仕様書

最終更新日: 2026-07-02  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: 要件仕様書  
優先度: 実装計画書よりも上位の正本

---

## 1. 目的

Chameleon Asset Studio は、ブラウザゲームで使う 2D アセットを作成・編集し、ゲームに組み込めるデータとして書き出す Web ツールである。

このツールは、画像編集ソフトでも、総合ゲームエンジンでもない。画像、手描き、図形、パーツを取り込み、キャラクター、アイテム、背景、タイル、ギミック、エフェクトに必要なゲーム用情報を付けて、PNG / WebP / JSON / ZIP として出力する。

何も知らない実装者または AI は、この文書を正本として扱う。仕様が曖昧な場合は、推測で実装せず、未確定事項として文書に追記してから進める。

---

## 2. 一文定義

画像や図形を、ゲームで使えるキャラクター、アイテム、背景、アニメーション、当たり判定、アンカー付きデータへ変換するブラウザ用 2D アセット制作ツール。

---

## 3. 基本方針

1. 初期版は 2D アセット制作に集中する。
2. 初期版はブラウザ内で完結し、サーバー必須にしない。
3. PC、スマホ、iPad で開ける Web アプリにする。
4. スマホは全機能編集ではなく、軽編集、確認、テンプレート適用、書き出しを優先する。
5. UI よりも内部データ形式を優先する。
6. 書き出し先ごとの差は、エクスポータ層で吸収する。
7. WebGPU、3D、Unity 完全連携、Godot 完全連携、Spine 完全互換は初期範囲に入れない。
8. 元画像は保持し、可能な限り破壊的編集を避ける。

---

## 4. 対象ユーザー

主対象は、個人で 2D ブラウザゲームを作る人である。AI に実装を依頼しながら、小さなゲームを複数作る運用を想定する。素材の見た目だけでなく、ゲーム内で使う座標、判定、アニメーション、属性をまとめて管理できることを重視する。

副対象は、イラストは作れるがゲーム用データ化が苦手な人、Phaser / PixiJS / Canvas 2D で小さなゲームを作る人、AI 生成画像をゲーム用に整えたい人である。

初期版では、3D モデル制作者、Unity / Godot の完全自動生成を期待する人、Photoshop や Procreate の代替を求める人は主対象にしない。

---

## 5. 対応デバイス

| 区分 | 画面幅目安 | 主な用途 |
|---|---:|---|
| スマホ縦 | 375px 以上 | 確認、軽編集、色変更、書き出し |
| スマホ横 | 667px 以上 | 軽いキャンバス編集 |
| iPad / タブレット | 768px 以上 | 主要編集 |
| PC | 1024px 以上 | 全機能編集 |

PC では、左ツールバー、中央キャンバス、右プロパティ、下タイムラインを基本にする。iPad では、中央キャンバスを広く取り、左右パネルは折りたたみ可能にする。スマホでは、ホーム、編集、プロパティ、タイムライン、書き出しを画面単位で切り替える。

キャンバス操作とページ操作は分ける。キャンバス上のドラッグは編集に使い、パネル上のドラッグはスクロールに使う。アプリ全体へ雑に `touch-action: none` を指定してはいけない。

---

## 6. 技術方針

初期採用する技術は次の通り。

| 領域 | 採用 |
|---|---|
| 言語 | TypeScript |
| UI | React 系 UI |
| ビルド | Vite |
| 描画 | Canvas 2D + PixiJS |
| 入力 | Pointer Events |
| 保存 | IndexedDB + 必要に応じて OPFS |
| 書き出し | Blob URL + ZIP |
| 画像処理 | Canvas 2D / ImageBitmap / Web Worker |
| テスト | Vitest / Playwright |

WebGPU は将来の高度機能として扱う。初期版では必須にしない。WebGPU は高性能な描画や計算に有効だが、MDN では Limited availability とされているためである。参考: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API

PixiJS v8 は WebGL とオプションの WebGPU レンダラー、マウス・マルチタッチ、SVG 描画、フィルターを持つため、編集キャンバスに向く。参考: https://pixijs.com/8.x/guides/getting-started/intro

Phaser は 2D の Web ゲームフレームワークであり、JavaScript / TypeScript で使えるため、ゲーム側サンプルの第一候補にする。参考: https://docs.phaser.io/phaser/getting-started/what-is-phaser

完成データの保存先選択はブラウザ差があるため、基本は ZIP ダウンロードにする。`showSaveFilePicker()` は対応環境だけの追加機能とする。参考: https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker

---

## 7. MVP 範囲

MVP では、2D キャラクターアセット作成を最優先にする。

含める機能:

- 新規プロジェクト作成
- プロジェクト一覧
- 自動保存
- PNG / JPG / WebP 取り込み
- 画像プレビュー
- トリミング
- 単色背景の簡易透過
- 消しゴム
- 色相、彩度、明度変更
- パレット置換
- 輪郭線追加
- レイヤー管理
- パーツ管理
- 原点設定
- アンカー設定
- 矩形と円の当たり判定
- フレーム管理
- 簡易アニメーション作成
- アニメーションプレビュー
- PNG / WebP / JSON / ZIP 書き出し
- Canvas / PixiJS / Phaser 用サンプル HTML 生成
- `.casproj` の読み書き

MVP に含めない機能:

- 3D 編集
- ボーンアニメーション完全編集
- IK
- メッシュ変形
- Unity Prefab 書き出し
- Godot Scene 書き出し
- Spine 書き出し
- Rive 書き出し
- ユーザーアカウント
- クラウド同期
- 共同編集

---

## 8. 最終完成範囲

最終完成版では、次の 6 種類のアセットを扱う。

1. キャラクター
2. アイテム
3. 背景
4. タイル / 床 / 壁
5. ギミック / 障害物
6. エフェクト / UI アイコン

最終完成版では、次の出力に対応する。

- 汎用 PNG / WebP
- 汎用 JSON
- Sprite Sheet
- Texture Atlas JSON
- Canvas 2D 用読み込みコード
- PixiJS 用読み込みコード
- Phaser 用読み込みコード
- Godot 用インポート補助
- Unity 用インポート補助
- Rive / Spine の取り込み補助または参照補助

Rive / Spine は完全互換を名乗らない。まずは独自形式を正本とし、必要に応じて読み込み補助を追加する。

---

## 9. 用語定義

| 用語 | 意味 |
|---|---|
| プロジェクト | 1 つ以上のアセットをまとめる作業単位 |
| アセット | ゲームに組み込む 1 つの素材 |
| レイヤー | 表示順を持つ編集要素 |
| パーツ | 頭、胴体、腕、武器など、意味を持つ部位 |
| 原点 | ゲーム上に置くときの基準点。キャラクターでは足元中央を基本にする |
| アンカー | 手、弾発射位置、影、エフェクト位置などの参照座標 |
| 当たり判定 | 接触判定用の矩形または円 |
| フレーム | アニメーションの 1 枚の状態 |
| アニメーション | 複数フレームを順に再生する設定 |
| エクスポータ | 内部データをゲーム側形式へ変換する機能 |

---

## 10. 内部データ形式

内部形式は JSON を基本にする。画像は PNG / WebP / 元画像を別ファイルとして保持する。内部形式は UI や書き出し先に引っ張られて壊してはいけない。

プロジェクトは `.casproj` という ZIP 形式で保存できるようにする。

```txt
project.casproj
├─ project.json
├─ assets/
│  └─ asset_001/
│     ├─ asset.json
│     ├─ source/original.png
│     ├─ textures/main.png
│     ├─ textures/main.webp
│     └─ thumbnails/thumb.webp
├─ settings/export-presets.json
└─ README.md
```

`asset.json` は最低限、次を持つ。

```json
{
  "format": "chameleon-asset",
  "version": "0.1.0",
  "id": "asset_001",
  "assetType": "character",
  "name": "tomato_player",
  "displayName": "トマトプレイヤー",
  "canvasSize": { "width": 512, "height": 512 },
  "origin": { "x": 256, "y": 448 },
  "textures": [],
  "layers": [],
  "parts": [],
  "anchors": [],
  "colliders": [],
  "animations": [],
  "tags": ["player"],
  "gameAttributes": {},
  "createdAt": "2026-07-02T00:00:00.000Z",
  "updatedAt": "2026-07-02T00:00:00.000Z"
}
```

破壊的な形式変更をする場合は version を上げ、migrate 関数を必ず用意する。

---

## 11. 主要機能要件

### 11.1 プロジェクト管理

- 新規プロジェクトを作成できる。
- 保存済みプロジェクトを一覧表示できる。
- プロジェクトを開ける。
- プロジェクトを複製できる。
- プロジェクトを削除できる。
- 削除前には確認を出す。
- 主要操作後は自動保存する。
- 保存中、保存済み、保存失敗を表示する。

### 11.2 画像取り込み

- PNG / JPG / WebP を取り込める。
- 取り込んだ画像は元画像として保持する。
- 編集用画像は別に保持する。
- 透明 PNG の透明情報を維持する。
- 1 枚あたり最大 25MB、最大 4096 x 4096 を初期制限にする。
- スマホ編集プレビューでは長辺 2048 を上限にできる。
- 制限超過時は理由を表示する。

### 11.3 キャンバス編集

- 透明背景は市松模様で表示する。
- ズーム倍率を表示する。
- 25%、50%、100%、200%、fit に切り替えられる。
- パン操作ができる。
- レイヤーまたはパーツを選択できる。
- ドラッグ移動できる。
- 数値入力で位置、拡大率、回転を編集できる。
- Undo / Redo できる。

### 11.4 レイヤーとパーツ

- 画像レイヤー、図形レイヤー、ガイドレイヤーを追加できる。
- レイヤー名を変更できる。
- 表示 / 非表示を切り替えられる。
- ロックできる。
- 表示順を変更できる。
- 複数レイヤーをパーツにまとめられる。
- パーツ種別として head、body、arm_left、arm_right、leg_left、leg_right、weapon、eye、mouth、shadow、accessory、other を用意する。

### 11.5 画像編集

- 矩形トリミングができる。
- 指定色に近い背景を透明化できる。
- 手動消しゴムで透明化できる。
- HSL スライダーで色を変えられる。
- 指定色を別色へ置き換えられる。
- 外側輪郭線を追加できる。
- すべて Undo できる。

### 11.6 原点、アンカー、当たり判定

- 原点をキャンバス上と数値入力で設定できる。
- キャラクターの初期原点は下中央にする。
- アンカーを追加、移動、削除できる。
- アンカーには用途を設定できる。
- 標準アンカー候補は foot、center、head、hand_left、hand_right、weapon、projectile_spawn、damage_effect、shadow_center とする。
- 矩形と円の当たり判定を追加できる。
- 当たり判定には body、attack、pickup、sensor、custom の用途を設定できる。
- 判定だけを表示・非表示にできる。

### 11.7 アニメーション

- 現在状態をフレームとして追加できる。
- フレーム名を変更できる。
- フレーム順を入れ替えられる。
- フレームを複製、削除できる。
- animation 名、fps、loop、duration を設定できる。
- idle、walk、run、jump、fall、attack、damage、dead、win、lose を候補として出す。
- アニメーションを再生、停止、先頭へ戻すことができる。
- 原点と当たり判定を重ねてプレビューできる。

### 11.8 アイテム、背景、タイル、ギミック

MVP 後に拡張する。

- item は取得判定、rarity、tags、gameAttributes を持つ。
- background は複数レイヤー、parallaxSpeed、loopX、loopY を持つ。
- tile は tileSize、collisionType、visualType、tags を持つ。
- gimmick は画像、判定、tags、将来の動きプリセットを持つ。

### 11.9 書き出し

- `asset.json` を生成する。
- PNG / WebP を生成する。
- Sprite Sheet と Atlas JSON を生成する。
- ZIP を生成する。
- ZIP には `asset.json`、画像、atlas、Canvas / PixiJS / Phaser のサンプル HTML、README を含める。
- 書き出し前に schema 検証を行う。
- 書き出し失敗時は理由を表示する。

---

## 12. 非機能要件

### 12.1 性能

- PC と iPad では通常編集時 60fps を目標にする。
- スマホでは 30fps 未満が続かないようにする。
- 重い画像処理は Web Worker へ逃がす。
- 4096 x 4096 画像の処理では進捗表示を出す。
- Blob URL は不要になったら解放する。

### 12.2 信頼性

- 保存失敗で作業内容を消さない。
- 書き出し失敗でプロジェクトを壊さない。
- 読み込み失敗時は理由を表示する。
- 古い形式は migrate する。
- 未対応機能を含むデータは、消さずに読み込む。

### 12.3 プライバシーと安全性

- 初期版ではアカウントを作らない。
- 初期版ではクラウド同期をしない。
- 初期版ではローカル処理を基本にする。
- SVG を扱う場合は画像として読み込み、編集データ内で任意コードとして扱わない。
- 書き出し ZIP にはユーザーが選んだデータだけを含める。

### 12.4 アクセシビリティ

- 主要ボタンにはラベルを付ける。
- アイコンだけのボタンにも aria-label を付ける。
- キーボードでも主要操作ができる。
- 色だけで状態を判断させない。
- エラーは文章で表示する。

---

## 13. Undo / Redo

Undo / Redo は初期版から必須とする。

対象操作:

- レイヤー追加、削除、移動
- 色変更
- トリミング
- 消しゴム
- 原点変更
- アンカー追加、変更、削除
- 当たり判定追加、変更、削除
- フレーム追加、削除
- アニメーション設定変更

連続ブラシ操作は 1 操作としてまとめる。

---

## 14. データ検証

次の schema を用意する。

- `project.schema.json`
- `asset.schema.json`
- `animation.schema.json`
- `export.schema.json`

検証タイミング:

- プロジェクト読み込み時
- 自動保存前
- 書き出し前
- テスト時

不正データ時は、どの項目が不正か表示する。自動修復できる場合は修復内容をログに残す。

---

## 15. MVP 完了条件

MVP は、次を満たしたら完了とする。

1. 新規プロジェクトを作れる。
2. PNG を取り込める。
3. 画像をトリミングできる。
4. 背景を簡易透過できる。
5. レイヤーを扱える。
6. 色を変更できる。
7. 原点を設定できる。
8. アンカーを設定できる。
9. 矩形と円の当たり判定を設定できる。
10. フレームを作れる。
11. idle アニメーションを作れる。
12. アニメーションをプレビューできる。
13. JSON を書き出せる。
14. PNG / WebP を書き出せる。
15. ZIP を書き出せる。
16. ZIP に README とサンプル HTML が入る。
17. 再読み込みしても作業プロジェクトが残る。
18. スマホで軽編集と書き出しができる。
19. iPad で主要編集ができる。
20. PC で全機能が使える。

---

## 16. 最終完成条件

最終完成版は、次を満たしたら完了とする。

1. キャラクター、アイテム、背景、タイル、ギミック、エフェクトを作れる。
2. パーツ、アンカー、当たり判定、アニメーションを横断して扱える。
3. 内部データ形式が schema で検証される。
4. `.casproj` を読み書きできる。
5. 汎用 JSON / PNG / WebP / Sprite Sheet / Atlas を書き出せる。
6. Canvas / PixiJS / Phaser のサンプルコードを生成できる。
7. Godot / Unity のインポート補助ファイルを生成できる。
8. スマホ、iPad、PC の UI がそれぞれ破綻しない。
9. 大きな画像処理中に UI が完全停止しない。
10. AI 補助が失敗しても手動修正できる。
11. 既存プロジェクトを壊さずアップデートできる。
12. 仕様書、実装計画書、データ形式書が最新である。

---

## 17. 実装禁止事項

- WebGPU 必須の設計にしない。
- サーバー必須の設計にしない。
- 内部データ形式を UI 都合で壊さない。
- 仕様書にない大機能を勝手に追加しない。
- スマホ操作を最後に後付けしない。
- `touch-action: none` を全体に指定してスクロールを壊さない。
- 画像編集結果だけを保存し、元画像を破棄しない。
- Undo できない破壊的操作を増やさない。
- 既存プロジェクトを読めなくする変更を入れない。
- Unity / Godot / Spine / Rive の完全互換を初期版に含めない。
- 3D 対応を初期版に含めない。

---

## 18. 未確定事項の扱い

仕様に未確定事項が出た場合は、次の形式で追記する。

```md
### UQ-001: 論点名

- 現状:
- 影響:
- 仮決定:
- 最終決定条件:
```

実装者は、未確定事項を勝手に大きく実装しない。小さな仮実装が必要な場合は `experimental` または `prototype` として分離する。

---

## 19. 参考資料

- WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- PixiJS v8 Introduction: https://pixijs.com/8.x/guides/getting-started/intro
- Phaser Getting Started: https://docs.phaser.io/phaser/getting-started/what-is-phaser
- Origin private file system: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- showSaveFilePicker: https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker
- HTMLCanvasElement.toBlob: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
- Pointer events: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
