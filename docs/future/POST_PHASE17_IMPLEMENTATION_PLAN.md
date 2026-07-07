# Post Phase 17 Implementation Plan

最終更新日: 2026-07-05  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: Phase 17 後の実装計画  
上位文書: `docs/future/POST_PHASE17_REQUIREMENTS.md`, `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`

---

## 1. 目的

この文書は、Phase 17 完了後に Chameleon Asset Studio を段階的に拡張するための実装計画を定義する。

この計画は、商用 SaaS 化の計画ではない。まずは、ローカル中心の制作ツールとして、2D 制作体験、書き出し品質、3D 読み込み・検品・軽量化の土台を作る。

---

## 2. 実装の大原則

- Phase 1〜17 の既存機能を壊さない。
- 1 PR 1 目的で進める。
- 外部ライブラリは採用前にライセンスを確認する。
- 3D 生成 AI は初期実装に含めない。
- `claude-fable-5` が使えない場合は、設計判断を小さく分ける。
- 書き出し形式を変えるときは docs を先に更新する。
- Schema 変更時は必ず Unit test を追加する。
- UI 変更時は必要に応じて E2E を追加する。

---

## 3. 実装フェーズ一覧

| Phase | 名称 | 目的 |
|---:|---|---|
| 18 | Phase 17 後の整合確認 | docs / tests / README の整合を確認する |
| 19 | 2D 制作体験補強 | スナップ、反転、グリッド、判定編集を改善する |
| 20 | 書き出し品質改善 | Atlas padding、解像度、helper 選択などを整える |
| 21 | Effect 最小強化 | effect アセットを実用に近づける |
| 22 | 3D 調査フェーズ | glTF / GLB 関連ライブラリを評価する |
| 23 | 3D 読み込み・表示 | GLB / glTF を読み込んで表示する |
| 24 | 3D 検品 | ポリゴン数、テクスチャ、bounds などを表示する |
| 25 | 3D メタデータ | 原点、足元、アンカー、3D 判定を設定する |
| 26 | 3D 書き出し | GLB + metadata ZIP を書き出す |
| 27 | 3D 軽量化検討 | glTF-Transform / meshoptimizer の導入可否を判断する |
| 28 | 外部 3D 生成連携の設計 | TripoSR 等の外部連携仕様だけを定義する |

---

## 4. Phase 18: Phase 17 後の整合確認

### 目的

Phase 1〜17 で実装された内容と docs / tests / README の整合を確認する。

### 作業

- README の Phase 表示を確認する。
- `docs/REQUIREMENTS_SPECIFICATION.md` と実装の差分を確認する。
- `docs/DATA_FORMAT.md` と TypeScript 型を照合する。
- `docs/EXPORT_FORMATS.md` と export ZIP の実態を照合する。
- `docs/ENGINE_INTEGRATION.md` と Phase 16 実装を照合する。
- `docs/implementation/TEST_AND_RELEASE.md` とテスト実態を照合する。
- 未完了項目を `docs/future/OPEN_ITEMS.md` にまとめる。

### 完了条件

- docs と実装の明確な矛盾がない。
- 未完了項目が隠されていない。
- `npm run build` が成功する。
- `npm run test` が成功する。
- `npm run e2e` が成功する。

---

## 5. Phase 19: 2D 制作体験補強

### 目的

2D 制作ツールとして、実際に作業する時の操作負担を減らす。

### 19-A: グリッドとスナップ

作業:

- キャンバスにグリッド表示を追加する。
- grid size を 8 / 16 / 32 / custom から選べるようにする。
- レイヤー、原点、アンカー、判定の移動にスナップを適用できるようにする。
- スナップは ON / OFF できるようにする。

注意:

- 既存座標の意味を変えない。
- スナップは UI 操作の補助であり、データ形式の座標単位は px のままにする。

実装済み（Phase 19-A）:

- キャンバス下部のズームバー横に、グリッド表示 ON / OFF、スナップ ON / OFF、グリッドサイズ 8 / 16 / 32 / custom を追加した。
- custom grid size は 2〜256px の範囲に丸め、極端な値を避ける。
- レイヤーのドラッグ移動、原点ドラッグ、アンカードラッグ、レイヤー / 原点 / アンカー / 矩形判定 / 円判定の座標数値入力で、スナップ ON 時だけ座標を grid size に丸める。
- 既存データの読み込み時には座標を自動変更せず、ユーザー操作で座標を更新するときだけスナップを適用する。
- `asset.json` / `.casproj` / export ZIP / schema / version は変更しない。座標単位は引き続き px。

### 19-B: 左右反転

作業:

- 選択レイヤーの左右反転。
- パーツ単位の左右反転。
- フレームアニメーションの左右反転生成。
- 判定とアンカーの反転補助。

注意:

- 元データを破壊しない。
- 方針は決定済み（`docs/future/FLIP_DESIGN.md`）: 通常操作は `LayerTransform.scale.x` の符号反転（非破壊）を基本にする。右向き/左向きを別々に編集する「左右反転コピー」は別コマンドとして将来実装する。
- 通常の左右反転（transform 反映）は実装済み（`flipLayerHorizontal` / 「選択中レイヤー」パネルの「左右反転」ボタン / Unit・E2E）。
- 反転コピー（アセット全体→新規アセット生成）は実装済み（`flipCopyAsset` / 「アセット」欄の「左右反転コピーを作成」ボタン / Unit・E2E）。メタデータ反転・role 入れ替え・id 付け替え・画像 Blob 複製を含む。`asset.json` schema / version 変更なし。
- 残: リグ編集データ（`rigAnimations` / part `bindPose` / `rotationLimit`）の反転は未対応。焼き込み整合の検証を伴うため別 PR とし、`claude-opus-4-8` 設計レビューと人間確認を通してから着手する。

### 19-C: 判定編集強化

設計方針:

- 実装前に `docs/future/COLLIDER_EDITING_DESIGN.md` を読む。
- Phase 19-C の推奨スコープは、多角形判定を後続フェーズへ回し、既存 rect / circle の編集 UI と用途別表示を先に改善すること。
- 多角形判定を入れる場合は、schema / DATA_FORMAT / EXPORT_FORMATS / migration / helper 影響が大きいため、別の設計 PR、Opus 4.8 レビュー、人間確認を通してから実装する。
- Phase 19-C 実装 PR では、`asset.json` / `.casproj` / export ZIP / JSON Schema / TypeScript 型 / dependencies を変更しない。

作業:

- 多角形判定を追加するか検討する。
- まず docs / schema 設計から始める。
- すぐ実装しない場合は、rect / circle の編集 UI を改善する。
- 判定用途ごとの色と表示を整理する。
- 2026-07 の第2段階として、既存 rect / circle 判定のキャンバス上ドラッグ移動のみを実装済み。rect は x / y、circle は x / y だけを更新し、スナップ ON / OFF と Undo / Redo に乗せる。rect リサイズ、circle radius 変更、polygon collider は未実装のまま残す。

完了条件:

- UI 操作が速くなる。
- 既存 export が壊れない。
- E2E が通る。

---

## 6. Phase 20: 書き出し品質改善

### 目的

作った素材をゲームに入れる時の手直しを減らす。

### 20-A: Atlas padding / extrude

作業:

- Sprite Sheet の各セルに padding を追加できるか検討する。
- extrude が必要か検討する。
- `atlas.json` に padding 情報を入れるか判断する。

注意:

- 既存 atlas.json を壊さない。
- padding を入れる場合は version / docs / tests を更新する。

### 20-B: 解像度別出力

作業:

- 1x / 2x / 3x の画像出力を検討する。
- 最初は UI ではなく export 関数の option として設計する。
- helper / examples が scale をどう扱うか検討する。

### 20-C: helper 選択出力

作業:

- ZIP に常に全 helper を入れるか、選択式にするか検討する。
- 今回は export preset 管理 UI は作らない。
- 必要なら `includeHelpers: boolean` のような最小 option を検討する。

完了条件:

- export 仕様が docs と一致する。
- 既存 ZIP 利用者を壊さない。

---

## 7. Phase 21: Effect 最小強化

### 目的

effect アセットを、ゲーム側で意味を持つ素材として最低限使いやすくする。

### 作業

- `EffectSettings` を必要に応じて拡張する。
- duration と animation の整合チェックを追加する。
- blendMode の見た目をプレビューに反映できるか検討する。
- effect anchor の候補を追加する。
- effect 用 helper の記述を docs に追加する。

### 禁止

- 本格パーティクルシステムを入れない。
- WebGPU / GLSL 必須にしない。
- 既存 animation を壊さない。

### 完了条件

- effect アセットが、hit / explosion / aura / trail などとして最低限整理できる。
- 書き出し JSON に意味が残る。
- docs が更新されている。

---

## 8. Phase 22: 3D 調査フェーズ

### 目的

3D 対応で使う候補ライブラリを実装前に評価する。

### 作業

- `docs/future/LIBRARY_EVALUATION_LOG.md` を作る。
- glTF-Transform を評価する。
- meshoptimizer / gltfpack を評価する。
- Three.js / Babylon.js のどちらを表示に使うか比較する。
- GLB 読み込みをブラウザで行う場合の bundle size を確認する。
- ライセンスを確認する。

### 完了条件

- 採用候補と不採用候補が分かれている。
- ライセンス確認状況が書かれている。
- まだ dependencies に入れていない候補が分かる。

---

## 9. Phase 23: 3D 読み込み・表示

### 目的

GLB / glTF を読み込んでプレビューできるようにする。

### 作業

- 3D Mode の入口 UI を追加する。
- GLB ファイルを選択できるようにする。
- 3D preview canvas を追加する。
- モデルを表示する。
- カメラ操作を追加する。
- 読み込み失敗時に理由を表示する。

### 注意

- 既存 2D editor と混ぜすぎない。
- 3D Mode は lazy load を検討する。
- 3D のために 2D bundle を重くしすぎない。

### 完了条件

- GLB を読み込める。
- 表示できる。
- 既存 2D E2E が壊れない。

---

## 10. Phase 24: 3D 検品

### 目的

3D モデルがゲーム用に重すぎないか、問題がないかを確認する。

### 作業

- vertexCount / triangleCount を表示する。
- materialCount を表示する。
- textureCount と最大 texture size を表示する。
- animationCount を表示する。
- bounds を表示する。
- fileSizeBytes を表示する。
- mobile / web / desktop の品質警告プリセットを作る。

### 完了条件

- モデルの重さが分かる。
- 問題が警告として表示される。
- 検品結果を JSON に保存できる。

---

## 11. Phase 25: 3D メタデータ

### 目的

3D モデルにゲーム用情報を付ける。

### 作業

- originMode を設定できるようにする。
- feet / center / custom を選べるようにする。
- ThreeDAnchor を追加できるようにする。
- ThreeDCollider の box / sphere を追加できるようにする。
- 3D metadata を保存する。

### 注意

- mesh collider は初期対象外。
- capsule は後続でもよい。
- エンジン依存の当たり判定にしない。

### 完了条件

- 3D アンカーを付けられる。
- 3D 判定を付けられる。
- metadata に保存される。

---

## 12. Phase 26: 3D 書き出し

### 目的

3D モデルとメタデータをゲーム側へ渡せる形で書き出す。

### 作業

- 3D asset metadata JSON を作る。
- GLB と metadata を ZIP に入れる。
- inspection report を入れる。
- README を生成する。
- Three.js / Babylon / Godot / Unity の取り込み説明を必要最小限で入れる。

### 完了条件

- GLB + metadata ZIP を書き出せる。
- docs と ZIP 構成が一致する。
- Unit test がある。

---

## 13. Phase 27: 3D 軽量化検討

### 目的

Web ゲーム向けに 3D モデルを軽くする。

### 作業

- glTF-Transform の導入可否を最終判断する。
- meshoptimizer / gltfpack の導入可否を判断する。
- まずは CLI / Node 側処理にするか、ブラウザ処理にするかを比較する。
- 元 GLB と optimized GLB を分ける。
- 最適化前後の差分レポートを作る。

### 注意

- 自動で見た目を壊す処理をしない。
- 元ファイルを保持する。
- ライセンス確認前に導入しない。

### 完了条件

- どの軽量化処理を採用するか判断できる。
- 実装する場合は最小機能から始められる。

---

## 14. Phase 28: 外部 3D 生成連携の設計

### 目的

TripoSR などの画像から 3D 生成する外部処理を、Chameleon とどう接続するか設計する。

### 作業

- external generator adapter のインターフェースを定義する。
- 入力画像の扱いを決める。
- 出力 GLB / OBJ / glTF の扱いを決める。
- 生成処理は標準依存にしない。
- 生成結果を Chameleon の 3D 検品へ流す。
- 候補ごとにライセンス確認欄を作る。

### 完了条件

- TripoSR などを直接実装しなくても、接続方法が分かる。
- 生成 AI を本体に混ぜずに済む。
- 採用前チェックリストがある。

---

## 15. PR 運用

各 Phase は 1 つの PR にまとめず、スライスする。

例:

- `docs: evaluate gltf libraries`
- `feat: add glb import shell`
- `feat: show 3d asset stats`
- `feat: add 3d anchors metadata`
- `docs: define external 3d generator adapter`

CI が落ちている PR は ready にしない。

---

## 16. 完了判定

この計画は、次を満たしたときに各 Phase 完了とする。

- 実装がある。
- Unit test がある。
- UI がある場合は E2E がある。
- docs がある。
- README と実態が一致する。
- CI が成功する。

---

## 17. 注意点

この計画は、すべてを一気に作るためのものではない。

まずは Phase 18 で整合を取り、その後に 2D 制作体験を少しずつ良くする。3D 対応は、生成 AI ではなく GLB / glTF の読み込みと検品から始める。

`claude-fable-5` が使えない場合は、1 Phase をさらに小さな PR に分ける。

#### Phase 19-C 実装済み範囲（2026-07）

- main から作り直した新規スコープとして、判定の表示・選択・凡例・GameDataPanel と Canvas の選択同期までを実装した。
- body / attack / pickup / sensor / custom の用途色を凡例・一覧スワッチ・キャンバス表示で対応付け、sensor は破線と縞スワッチで色以外でも区別できるようにした。
- 当たり判定一覧の選択ボタンは `判定「${collider.name}」を選択` の aria-label を持ち、表示切替ボタンの `判定「${collider.name}」の表示を切り替え` と accessible name が衝突しない。
- 選択状態は UI state のみで、asset.json / .casproj / export ZIP / schema / version には含めない。
- canvas drag、rect resize、circle radius のキャンバス操作、polygon collider、frame-specific collider、3D collider は今回の範囲外として残す。
