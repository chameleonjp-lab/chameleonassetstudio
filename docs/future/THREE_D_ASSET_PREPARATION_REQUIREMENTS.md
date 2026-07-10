# 3D Asset Preparation Mode Requirements

最終更新日: 2026-07-10
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
文書種別: 将来の 3D Asset Preparation Mode 要件
3D再開条件の正本: `2D_COMPLETION_ROADMAP.md` の 2D Pro Gate
旧計画・関連文書: `docs/REQUIREMENTS_SPECIFICATION.md`, `POST_PHASE17_REQUIREMENTS.md`

---

> **状態（2026-07-10）:** 本文書は 3D の将来要件を残す旧計画である。`2D_COMPLETION_ROADMAP.md` の 2D Pro Gate を人間が承認するまで、本文書を根拠に 3D の library 評価、dependency 追加、実装を開始してはいけない。承認後に `3D-0` から見直す。

## 1. 目的

この文書は、Chameleon Asset Studio に将来追加する可能性がある「3D Asset Preparation Mode」の要件を定義する。

このモードは、3D 生成 AI そのものを最初から内蔵するものではない。まず、外部で作られた GLB / glTF / OBJ などの 3D モデルを読み込み、ゲーム制作に使いやすい状態へ整えることを目的にする。

言い換えると、このモードの価値は「3D を生成すること」ではなく、「生成された 3D や既存 3D をゲームで使える素材へ整えること」である。

---

## 2. 基本方針

### 2.1 初期は 2D 方針を壊さない

Chameleon Asset Studio の本体は、初期版では 2D ブラウザゲーム用アセット制作に集中している。3D 対応は、この 2D 機能を壊さない形で追加する。

3D 機能を追加するために、既存の `Asset`、`Layer`、`Frame`、`Animation` の意味を変えてはいけない。

### 2.2 3D 生成 AI を先に入れない

最初に実装する 3D 機能は、画像から 3D を作る AI ではない。

最初に作るべきものは次である。

1. 3D ファイルを読み込む。
2. 3D モデルを表示する。
3. 3D モデルを検品する。
4. 3D モデルを軽量化する。
5. ゲーム用メタデータを付ける。
6. 書き出す。

画像から 3D 生成する処理は、その後に外部処理として検討する。

### 2.3 ブラウザ本体と外部処理を分ける

ブラウザで実行するもの:

- GLB / glTF の軽い読み込み
- 3D プレビュー
- メタデータ編集
- 検品結果の表示
- 書き出し設定

外部処理にするもの:

- Python GPU 依存の 3D 生成
- 重い再メッシュ
- 重いテクスチャ生成
- 自動骨入れ
- 高品質材質生成

---

## 3. 対象ファイル形式

### 3.1 初期入力

初期対応の候補は次とする。

| 形式 | 初期対応 | 理由 |
|---|---|---|
| GLB | 必須候補 | 単一ファイルで扱いやすい |
| glTF + bin + textures | 必須候補 | Web / 3D エンジンで標準的 |
| OBJ + MTL + textures | 後続候補 | 古いが多くの生成モデルが出力できる |
| FBX | 初期対象外 | ブラウザ・ライセンス・仕様面で重い |
| Blender file | 初期対象外 | ブラウザ直接処理に向かない |

### 3.2 初期出力

| 形式 | 方針 |
|---|---|
| GLB | 第一出力候補 |
| glTF | 開発者向けの候補 |
| JSON sidecar | Chameleon 独自メタデータ用 |
| ZIP | GLB / glTF / textures / metadata / README をまとめる |

---

## 4. 3D アセットで管理するメタデータ

初期 3D メタデータは、2D の `origin`、`anchors`、`colliders` に相当する情報を持つ。

候補:

```ts
interface ThreeDAssetSettings {
  unit: 'meter' | 'centimeter' | 'pixel_like' | 'unknown';
  upAxis: 'Y' | 'Z' | 'unknown';
  forwardAxis: 'Z' | '-Z' | 'X' | '-X' | 'unknown';
  originMode: 'center' | 'feet' | 'custom';
  scale: number;
  bounds: {
    width: number;
    height: number;
    depth: number;
  };
  stats: {
    vertexCount: number;
    triangleCount: number;
    materialCount: number;
    textureCount: number;
    animationCount: number;
    fileSizeBytes: number;
  };
  anchors: ThreeDAnchor[];
  colliders: ThreeDCollider[];
  qualityWarnings: string[];
}
```

### 4.1 3D アンカー

3D アンカーは、武器、手、足元、弾発射位置、カメラ注視点などに使う。

```ts
interface ThreeDAnchor {
  id: string;
  name: string;
  role:
    | 'root'
    | 'feet'
    | 'head'
    | 'hand_left'
    | 'hand_right'
    | 'weapon'
    | 'projectile_spawn'
    | 'camera_focus'
    | 'custom';
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
}
```

### 4.2 3D 当たり判定

初期は簡単な判定だけにする。

```ts
interface ThreeDCollider {
  id: string;
  name: string;
  purpose: 'body' | 'attack' | 'pickup' | 'sensor' | 'custom';
  shape: 'box' | 'sphere' | 'capsule';
  position: { x: number; y: number; z: number };
  size?: { x: number; y: number; z: number };
  radius?: number;
  height?: number;
}
```

初期では mesh collider を作らない。重くなりやすく、エンジン差も大きいためである。

---

## 5. 3D 検品要件

3D モデルを読み込んだら、次を表示する。

| 項目 | 必須 | 説明 |
|---|---|---|
| ファイルサイズ | 必須 | Web ゲーム読み込みへの影響を見る |
| 頂点数 | 必須 | 重さの目安 |
| 三角形数 | 必須 | 描画負荷の目安 |
| マテリアル数 | 必須 | draw call や管理の目安 |
| テクスチャ枚数 | 必須 | メモリ使用量の目安 |
| テクスチャ最大サイズ | 必須 | スマホ負荷の目安 |
| アニメーション数 | 必須 | 動けるモデルかを確認 |
| スケルトン有無 | 後続 | 骨入れ済みか確認 |
| bounds | 必須 | サイズと中心ズレを見る |
| pivot / origin | 必須 | 足元や中心点を確認 |

### 5.1 警告例

- ファイルサイズが大きすぎます。
- 三角形数が多すぎます。
- 4096px を超えるテクスチャがあります。
- 原点が足元ではありません。
- bounds の中心が大きくずれています。
- アニメーションがありません。
- 材質数が多すぎます。
- 未使用ノードが多い可能性があります。

しきい値は最初から固定しすぎない。まず `mobile`, `web`, `desktop` の 3 プリセットを用意する。

---

## 6. 軽量化要件

初期の軽量化は、glTF / GLB の最適化を中心にする。

候補:

- 不要データ削除
- ノード整理
- マテリアル統合の検討
- テクスチャサイズ確認
- テクスチャ圧縮の候補提示
- Meshopt / Draco / KTX2 などの候補表示

注意:

- 初期では自動で強い破壊的最適化をしない。
- 元ファイルを保持する。
- 最適化前後の差を表示する。
- 見た目が変わる処理は、必ずプレビューしてから適用する。

---

## 7. 外部候補の扱い

別件レポートで挙げられた候補は、次のように扱う。

### 7.1 すぐ調査する候補

| 候補 | 役割 | 採用前の必須確認 |
|---|---|---|
| glTF-Transform | GLB / glTF の読み込み、編集、最適化 | ライセンス、ブラウザ対応、Node 対応、bundle size |
| meshoptimizer / gltfpack | 軽量化 | ライセンス、WASM 版の扱い、出力互換性 |
| TripoSR | 画像から 3D 生成の最初の外部実験 | ライセンス、モデル重み、GPU 要件、出力形式 |
| Stable Fast 3D | GLB / 材質付き生成候補 | Stability AI 系ライセンス、商用条件、売上制限 |
| SPAR3D | 点群編集を含む生成候補 | ライセンス、商用条件、GPU 要件 |

### 7.2 将来の高品質生成候補

| 候補 | 位置づけ | 注意 |
|---|---|---|
| TRELLIS | 高品質 3D 生成候補 | 依存ライセンス、GPU 要件 |
| TRELLIS.2 | 高品質 PBR GLB 候補 | 高性能 GPU 前提、依存確認 |
| Hunyuan3D 系 | 高品質形状・テクスチャ候補 | ライセンス、地域条件、GPU メモリ |
| Step1X-3D | 形状・テクスチャ分離の参考 | 重い。まず研究候補 |
| 3DTopia-XL | PBR 3D 候補 | まず研究候補 |
| InstantMesh / OpenLRM / CRM | 比較・研究候補 | 本体統合は後回し |

### 7.3 骨入れ・動き候補

| 候補 | 位置づけ | 注意 |
|---|---|---|
| RigAnything | 自動骨入れ候補 | 後期機能。入力形式と出力形式の確認 |
| UniRig | 自動骨入れ研究候補 | 公開状況とライセンス確認 |
| SkinTokens / TokenRig | 先端研究追跡 | 今すぐ実装しない |
| Puppeteer | 動画から動きを付ける候補 | 後期機能。出力形式確認 |

---

## 8. ライセンス確認ルール

外部候補は、採用前に必ず次を確認する。

- コードのライセンス
- モデル重みのライセンス
- 事前学習データに関する制限
- 商用利用条件
- 売上制限
- 地域制限
- 再配布条件
- SaaS 提供時の条件
- API 利用時の条件

README の説明だけで判断しない。必ず LICENSE ファイル、モデルカード、公式利用規約、重み配布ページを確認する。

ライセンス確認が終わっていない候補は、dependencies に追加してはいけない。

---

## 9. 3D 生成 AI 連携の原則

画像から 3D を作る処理は、初期では外部処理として扱う。

想定フロー:

1. Chameleon で画像を用意する。
2. 外部 3D 生成処理へ渡す。
3. GLB / glTF / OBJ を受け取る。
4. Chameleon で読み込む。
5. 検品する。
6. 軽量化する。
7. 中心点、足元、アンカー、判定を付ける。
8. 3D アセット ZIP として書き出す。

禁止:

- Python GPU モデルをブラウザに直接入れようとしない。
- 生成モデルを標準依存にしない。
- ライセンス未確認のモデルを組み込まない。
- 生成結果の品質を保証するような表現をしない。

---

## 10. 初期 UI 要件

3D Mode の初期 UI は、次の 5 画面に分ける。

1. Import
   - GLB / glTF / OBJ を読み込む。
2. Inspect
   - サイズ、ポリゴン数、テクスチャ、マテリアル、bounds を表示する。
3. Setup
   - 向き、原点、足元、スケールを設定する。
4. Game Data
   - 3D アンカーと 3D 当たり判定を設定する。
5. Export
   - GLB / metadata / README / engine guide を書き出す。

最初から本格的なモデリング UI を作らない。

---

## 11. 書き出し要件

3D アセット書き出し ZIP の候補構造:

```txt
3d-asset-export.zip
├─ model/
│  ├─ model.glb
│  └─ model.optimized.glb
├─ metadata/
│  └─ asset3d.json
├─ reports/
│  └─ inspection-report.json
├─ engines/
│  ├─ README-threejs.md
│  ├─ README-babylon.md
│  ├─ README-godot.md
│  └─ README-unity.md
└─ README.md
```

初期では、optimized model は必須にしない。最適化機能が無い場合は `model.glb` のみでよい。

---

## 12. 非機能要件

- 大きな 3D ファイル読み込み中は UI を固めない。
- 進捗を表示する。
- 読み込み失敗時は理由を表示する。
- 元ファイルを保持する。
- 最適化は破壊的に上書きしない。
- 3D 関連は、2D 機能の bundle size を不必要に増やさない。
- 可能なら 3D Mode を lazy load する。

---

## 13. 初期完了条件

3D Asset Preparation Mode の最初の完了条件は次である。

- GLB を読み込める。
- 3D モデルを表示できる。
- ファイルサイズ、三角形数、テクスチャ数を表示できる。
- bounds を表示できる。
- 原点 / 足元基準を設定できる。
- 3D アンカーを追加できる。
- box / sphere の 3D 当たり判定を追加できる。
- metadata JSON を書き出せる。
- GLB と metadata を ZIP で書き出せる。
- docs に制限が明記されている。
- ライセンス未確認の外部生成 AI は含まれていない。

---

## 14. 実装禁止事項

- 3D 生成 AI を初期依存に入れない。
- Hunyuan3D や TRELLIS などの重いモデルをブラウザ実行しようとしない。
- 未確認ライセンスの重みを使わない。
- 2D の `asset.json` を 3D のために破壊しない。
- 3D Mode 実装中に既存 2D E2E を弱くしない。
- Unity / Godot 完全対応と誤解される docs を書かない。
- 3D 対応を理由に WebGPU 必須にしない。

---

## 15. 最終判断

3D 対応の最初の価値は、生成ではなく検品と軽量化である。

Chameleon Asset Studio は、AI 生成 3D モデルの出力先ではなく、AI 生成 3D モデルをゲーム素材として整える場所になるべきである。
