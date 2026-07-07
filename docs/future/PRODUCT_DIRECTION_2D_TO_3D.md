# Product Direction: 2D Completion to 3D Expansion

最終更新日: 2026-07-07  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: 2D 完成から 3D 展開へのプロダクト方針  
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/future/POST_PHASE17_REQUIREMENTS.md`, `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`, `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`  
関連文書: `docs/future/ASSET_CREATION_AND_EXPORT_STRATEGY.md`, `docs/future/DECISION_LOG.md`

---

> **現状:** この文書は将来方針を定義する docs であり、実装済み機能一覧ではない。この PR ではアプリ本体、schema、`.casproj`、export ZIP、dependencies、GitHub Actions は変更しない。

## 1. 目的

この文書は、Chameleon Asset Studio の今後の進め方を、2D 完成、3D 展開、画面分離、リポジトリ分離判断の観点で整理する。

基本方針は次の通りである。

1. まず 2D ブラウザゲーム用アセット制作ツールとして完成度を上げる。
2. 2D で、作成、編集、修正、検品、書き出しの品質基準を作る。
3. 3D は、2D 完成後に同じ思想と見た目を持つ別画面として追加する。
4. 2D と 3D は同じ編集画面に混ぜない。
5. リポジトリは当面同じままにし、分離条件を満たした時に検討する。

---

## 2. 2D を先に完成させる理由

Chameleon Asset Studio の現在の正本は、初期版を 2D アセット制作に集中させる方針である。3D、WebGPU 必須化、Unity / Godot 完全連携、Spine / Rive 完全互換は初期範囲ではない。

2D を先に完成させる理由は次の通りである。

- データ形式、保存、読み込み、書き出しの品質基準を先に作れる。
- 原点、アンカー、当たり判定、アニメーション、export preset の考え方を固められる。
- UI の見た目、操作感、レビュー基準を先に決められる。
- 2D の実ゲーム組み込みで価値を確認できる。
- 3D の実装時に、0 から UI / docs / CI / export 方針を作らずに済む。

2D 完成前に 3D を広げると、既存の 2D `asset.json`、`.casproj`、export ZIP、E2E が壊れる危険が高い。そのため、3D は 2D の品質を落とさない条件で始める。

---

## 3. 2D Studio の役割

2D Studio は、画像編集ソフトではない。総合ゲームエンジンでもない。

2D Studio の役割は、2D ゲーム素材を作成し、ゲームに組み込める状態へ整えることである。

扱うもの:

- character。
- item。
- background。
- tile / tileset。
- gimmick。
- effect。
- ui / icon。

主な機能:

- 空キャンバス、テンプレート、画像、図形、パーツ、既存アセットから作る。
- 画像を取り込み、必要な範囲で編集・修正する。
- レイヤー、パーツ、フレームを整理する。
- 原点、アンカー、当たり判定を付ける。
- フレームアニメーションや簡易リグ焼き込みを扱う。
- `.casproj` で再編集できるようにする。
- PNG / WebP / Sprite Sheet / Atlas / JSON / ZIP を出す。
- Canvas / PixiJS / Phaser / Unity / Godot / RPG Maker / Blender 向けには、まず import notes と file preset を出す。

---

## 4. 3D Asset Preparation の役割

3D Asset Preparation は、3D モデリングソフトではない。3D 生成 AI でもない。

3D Asset Preparation の役割は、外部で作られた 3D モデルを読み込み、ゲーム用素材として整えることである。

扱うもの:

- GLB。
- glTF + bin + textures。
- 後続候補として OBJ + MTL + textures。
- 3D metadata。
- inspection report。
- GLB + metadata ZIP。

主な機能:

- 3D ファイルを読み込む。
- モデルを表示する。
- ファイルサイズ、ポリゴン数、マテリアル数、テクスチャ数、bounds を確認する。
- 原点、足元、向き、スケールを確認・設定する。
- 3D アンカーと 3D 当たり判定を付ける。
- 必要に応じて軽量化候補を提示する。
- GLB、metadata、report、README、import notes を出す。

最初から画像から 3D を生成する機能を内蔵しない。画像から 3D 生成する処理は、将来の外部処理として扱う。

---

## 5. 画面方針

2D と 3D は、同じ Home / Project Dashboard から入れるようにしてよい。ただし、編集画面は分ける。

推奨構成:

```txt
Chameleon Asset Studio
├─ Home / Project Dashboard
├─ 2D Studio
│  ├─ Create / Import
│  ├─ Canvas
│  ├─ Layers / Parts
│  ├─ Game Data
│  ├─ Animation
│  ├─ Validate
│  └─ Export
└─ 3D Asset Preparation
   ├─ Import
   ├─ Inspect
   ├─ Setup
   ├─ Game Data
   ├─ Optimize
   └─ Export
```

同じにしてよいもの:

- 画面の雰囲気。
- ボタン、パネル、入力欄の基本ルール。
- Project Dashboard。
- export preset の考え方。
- validation / inspection の考え方。
- README / import notes の考え方。
- Codex + Opus 4.8 レビュー運用。

同じにしてはいけないもの:

- 2D の pixel 座標と 3D の unit / axis / bounds。
- 2D の layer / frame と 3D の node / mesh / material。
- 2D アニメーションと 3D animation clip。
- 2D 当たり判定と 3D collider。
- 2D 初期表示 bundle と 3D の重い描画依存。

---

## 6. 2D から 3D へ転用できるもの

2D で作ったすべてを 3D に流用できるわけではない。転用できるものとできないものを分ける。

### 6.1 転用できるもの

- Project Dashboard。
- 保存、読み込み、再編集の考え方。
- 元データを保持し、破壊的に上書きしない方針。
- metadata を UI と export から独立させる考え方。
- schema 検証。
- export ZIP に README と import notes を入れる方針。
- 作成物を外部ツールへ直接連携ではなく、まずファイルで渡す方針。
- review、CI、docs-first の運用。
- UI の言葉遣いと見た目の統一感。

### 6.2 転用できないもの

- 2D の `Layer` を 3D の mesh と同一視すること。
- 2D の `Frame` を 3D animation clip と同一視すること。
- pixel 単位を meter / centimeter へ自動変換すること。
- 2D の origin を 3D の pivot / feet / bounds center と同じ意味にすること。
- 2D の rect / circle collider を 3D の box / sphere / capsule と同じ型に押し込むこと。

---

## 7. リポジトリ方針

当面は 1 リポジトリで管理する。今すぐ `2D repo` と `3D repo` へ分けない。

理由:

- 2D 完成が最優先である。
- docs、CI、レビュー運用を増やすと管理が重くなる。
- 3D はまだ調査と設計の段階である。
- 画面や export 方針を 2D から学ぶ必要がある。
- 分離を急ぐと、共通の UI / validation / export 方針が分断される。

分離を検討する条件:

| 条件 | 判断 |
|---|---|
| 3D dependencies が 2D bundle size を悪化させる | 3D lazy load、内部 package 分離、別 repo を検討する |
| 3D CI が重くなる | workflow 分離、package 分離、別 repo を検討する |
| Python / GPU / 外部処理が必要になる | 3D external processor として別 repo を検討する |
| 2D と 3D の release cadence が分かれる | 別 repo または monorepo package 分離を検討する |
| ライセンス確認やモデル重み管理が必要になる | 3D 側を明確に隔離する |
| セキュリティ境界が必要になる | 別 process / 別 repo / 別 deploy を検討する |

---

## 8. 3D 開始前の gate

3D の実装へ進む前に、次を満たす。

- 2D の主要 export が壊れていない。
- `.casproj` の読み書きが安定している。
- `asset.json` の version / migrate 方針が崩れていない。
- 2D の E2E を弱くしていない。
- `docs/future/LIBRARY_EVALUATION_LOG.md` または同等の評価表で 3D ライブラリのライセンスを確認している。
- GLB / glTF の読み込みに使う library の bundle size と license を確認している。
- 3D Mode が 2D bundle を不必要に重くしない設計になっている。
- Opus 4.8 レビューまたは人間確認を通している。

---

## 9. 品質目標

「月額 800 ドル級」という表現は、現時点では価格の約束ではない。品質基準として扱う。

2D で先に目指す品質:

- 1 つの素材を作る時、原点、アンカー、当たり判定、アニメーション、書き出しまで迷わない。
- `.casproj` を開き直しても作業を再開できる。
- export ZIP を見れば、何をゲーム側へ入れればよいか分かる。
- Canvas / PixiJS / Phaser ではサンプルで確認できる。
- Unity / Godot / RPG Maker / Blender では、まず import notes に従って手動で持ち込める。
- エラーや制限が文章で分かる。
- 既存データを壊さない。
- AI 補助や外部ツールが失敗しても、手動で修正できる。

3D で後から目指す品質:

- GLB / glTF を読み込み、重さと問題点を確認できる。
- 原点、足元、向き、bounds、スケールを調整できる。
- 3D アンカーと 3D 当たり判定を付けられる。
- metadata と inspection report を出せる。
- 外部生成 3D の結果を、そのまま信じずに検品できる。

---

## 10. 禁止事項

- 2D 完成前に 3D を広げすぎない。
- 2D と 3D を同じ編集画面へ無理に統合しない。
- 3D 都合で 2D の `asset.json`、`.casproj`、export ZIP を壊さない。
- 3D 生成 AI を初期依存に入れない。
- 重い 3D dependencies を 2D 初期表示 bundle へ混ぜない。
- Unity / Godot / RPG Maker / Blender の完全対応を未検証で名乗らない。
- repo 分離を目的化しない。
- repo を分けないことを理由に、境界を曖昧にしない。

---

## 11. 実装者向け結論

Claude Code、Codex、Opus 4.8 は、次の前提で作業する。

1. 今は 2D 完成が優先である。
2. Chameleon は画像取り込み専用ツールではない。
3. 作成、編集、修正、検品、書き出しまでを扱う。
4. 外部ツールへは、まず直接連携ではなくファイル出力で渡す。
5. 3D は同じテイストの別画面として後から追加する。
6. 3D 実装は生成 AI ではなく、GLB / glTF の読み込みと検品から始める。
7. repo は当面 1 つのままにし、条件を満たした時だけ分離を検討する。
