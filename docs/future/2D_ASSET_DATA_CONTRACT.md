# Chameleon Asset Studio 2D Asset Data Contract

最終更新日: 2026-07-10
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
文書種別: 2D 完成形の保存・座標・互換性契約
状態: accepted（将来設計。docs-only）
上位文書: `2D_COMPLETE_PRODUCT_SPEC.md`
関連文書: `docs/DATA_FORMAT.md`, `docs/EXPORT_FORMATS.md`, `docs/future/FLIP_DESIGN.md`, `docs/future/COLLIDER_EDITING_DESIGN.md`, `2D_EXPORT_COMPATIBILITY_MATRIX.md`

---

> **現状:** 現在の正本は `docs/DATA_FORMAT.md`、`src/core/model/`、`src/core/schema/` であり、`asset.json` / `.casproj` の version は `0.1.0` である。
> **本書の役割:** 2D 完成形で必要になるデータの意味と、形式変更前に必ず決める契約を定義する。本文だけで現在の型、schema、ZIP 構成、migration を変更してはいけない。

## 1. 目的

素材を作り直したり、書き出し先を増やしたりしても、ゲーム用情報が失われないようにする。

この文書は、次を一貫して扱うための契約である。

- 元画像や外部素材を残すこと。
- 再編集する内容と、プレビューや書き出し物を分けること。
- 原点、アンカー、判定、動きが、トリミングや atlas 化の後も正しい位置を指すこと。
- 色違い、左右向き、装備違いなどの派生を追えること。
- Unity、Godot、RPG Maker、ブラウザ向けなどの個別事情を、共通データの意味を壊さずに扱うこと。

## 2. 基本原則

1. **編集元を正本にする**
   `.casproj` とその中の編集可能なデータが正本である。PNG、WebP、atlas、JSON、ZIP はそこから作る派生物である。
2. **元データを消さない**
   入力画像、外部制作ファイル、AI 出力は、許可なく上書き・破棄しない。
3. **意味を先に決める**
   座標、原点、フレーム、判定、反転、切り抜きの意味を、UI や出力先ごとに変えない。
4. **出力先の都合を共通データへ持ち込まない**
   Unity、Godot、RPG Maker など固有の設定は、共通の素材情報と分ける。
5. **古いデータを読めるようにする**
   形式変更時は version、migration、fixture、読み込み・書き出し確認を必須にする。
6. **UI 一時状態を保存しない**
   選択中のレイヤー、ズーム、開いているパネル、ドラッグ途中の状態は、正本や書き出しへ混ぜない。

## 3. 将来のデータの層

完成形で扱う情報は、次の5層に分ける。これは概念上の分離であり、現在のファイル配置をただちに変更する意味ではない。

| 層 | 内容 | 変更・破棄の扱い |
|---|---|---|
| 元データ | 取り込んだ画像、連番、外部制作ファイル、生成画像。取得元・利用条件の記録を含められる。 | 不変として保持する。明示的な削除以外で上書きしない。 |
| 編集元 | レイヤー、パーツ、図形、色、フレーム、ゲーム用情報、派生関係。 | ユーザー操作と Undo / Redo の対象。 |
| 派生プレビュー | サムネイル、端末向け縮小表示、一時的な合成画像、解析結果。 | 再生成できる。正本ではない。 |
| 配布物 | PNG、WebP、sprite sheet、atlas、対象別 JSON、README、ZIP。 | 常に編集元から再生成する。 |
| 検査記録 | 出力先、対象バージョン、警告、画像ハッシュ、確認結果。 | 再現性のため残す。秘密情報を含めない。 |

ブラウザの IndexedDB は、作業を続けるためのローカルコピーであって、唯一のバックアップではない。export ZIP だけから完全な編集元を戻せる前提にもせず、再編集用の可搬保存は `.casproj` とする。

## 4. 概念上の構造

```txt
Project
├─ Asset Family（同じ敵・同じタイル群などの親）
│  ├─ Asset Variant（通常、色違い、左右向き、装備違いなど）
│  │  ├─ sources             元データ
│  │  ├─ editable            レイヤー、パーツ、図形、動き
│  │  ├─ game data           原点、アンカー、判定、属性、イベント
│  │  ├─ derived             preview / cache / analysis
│  │  └─ export records      preset と検査記録
```

`Asset Family` と `Asset Variant` は、現在の `Project` / `Asset` 型には存在しない将来概念である。追加する場合は、次を明示した別 PR を作る。

- 現在の単独 `Asset` をどの Family / Variant と解釈するか。
- 元を直したときに派生へ自動反映する範囲と、手動調整を保護する範囲。
- 複製、左右反転コピー、色違い作成との関係。
- `.casproj` の配置、schema、migration、export への影響。

## 5. 現在の形式との互換性

現行 `0.1.0` の意味を守る。

| 現在の要素 | 維持する意味 | 将来拡張時の注意 |
|---|---|---|
| `Asset.canvasSize` | アセットの基準キャンバスの幅・高さ。単位は px。 | trim 後の画像サイズで置き換えない。 |
| `Asset.origin` | ゲーム上に置く基準点。キャンバス座標。 | 出力先 pivot への変換は adapter 側で行う。 |
| `Asset.anchors` | 手、足元、弾発射位置などの参照点。キャンバス座標。 | trim / atlas 後も元の意味を保つ。 |
| `Asset.colliders` | 現在は rect / circle のゲーム用形状。 | `visible` をゲーム内有効・無効の意味へ変えない。 |
| `Frame.layerStates` | レイヤーの見た目をフレームごとに上書きする。 | 位置・判定・イベントを追加する場合は上書き規則を先に決める。 |
| `Animation` | `fps`、`loop`、`frameIds` を持つ再生列。 | 可変時間やイベントを加える場合、fps だけの既存データを壊さない。 |
| `.casproj` | `project.json`、assets、画像 Blob、export settings を含む ZIP。 | フォルダ変更や別ファイル化は version / migration が必要。 |

### 5.1 ID、名前、参照

- `id` は機械用の安定した識別子であり、表示名の変更で変えない。
- `name` / `displayName` は人間向けである。外部出力のファイル名やキーにそのまま使うとは限らない。
- layer、part、texture、frame、animation、anchor、collider の参照は名前でなく ID を使う。
- 外部出力で名前が重複する、使用できない文字がある、対象 engine の長さ制限を超える場合は、出力側で一意キーを作り、対応表を manifest に残す。元の `name` を無断で変えない。
- プロジェクトの複製、左右反転コピー、`.casproj` 読み込みで ID を付け替える場合は、参照、Blob key、出力対象を一貫して更新する。

現在の atlas は frame 名を出力にも使うため、同名 frame、空名、対象別に使えない文字を将来の意味検証で検出する。

## 6. 座標と変換の契約

### 6.1 基準座標

共通のアセット座標は、現在どおり次に固定する。

- キャンバス左上を `(0, 0)` とする。
- 右方向を `x+`、下方向を `y+` とする。
- 単位は px、回転は度とする。
- `origin`、`anchor`、`collider`、フレーム内の位置情報は、特記しない限りアセット座標を使う。

書き出し先が Y 軸方向や pivot の表現を変える場合も、共通データを変えない。対象別 adapter が変換式と結果を README / sidecar に残す。

### 6.2 レイヤーとパーツ

- 現在の `LayerTransform.position` は、テクスチャ左上のアセット座標である。
- 現在の `scale` と `rotation` は、テクスチャ中心を基準に適用する。
- パーツの pivot は、親子関係や簡易リグの基準であり、`origin` の代わりではない。
- パーツの親子・bind pose・焼き込み結果を拡張する場合、見た目の行列計算と書き出しデータの計算を同じ fixture で確認する。

### 6.3 トリミングと atlas

透明余白を取り除く処理は、ファイルを小さくするための出力上の操作である。共通のアセット座標を変えてはいけない。

将来、trim を有効にする出力は少なくとも次を記録する。

- trim 前の元フレームサイズ。
- 切り出した矩形の位置とサイズ。
- atlas 内に置いた位置とサイズ。
- 元の `origin`、anchors、colliders を出力先で復元するための変換情報。

初期の検証済み preset では、atlas 内の画像回転を既定で使わない。回転を許可する場合は、対象 engine ごとの対応、anchor / collider 変換、debug 表示、fixture を設計してから有効にする。

### 6.4 左右反転

現在の `FLIP_DESIGN.md` を維持する。

- レイヤー単体の通常反転は、レイヤー中心で `scale.x` の符号を反転する非破壊操作である。
- アセット全体の左右反転コピーは、`asset.origin.x` を反転軸にして、anchors、colliders、frames、左右 role を反転する。
- 点の反転は `newX = axisX - (oldX - axisX)` とする。
- 矩形の反転は、右端を反転して新しい左端を求める。円の反転は中心 `x` を反転する。

リグ編集データ、polygon の頂点順、frame 別上書きが加わる場合は、別の設計レビューと人間確認が必要である。

### 6.5 丸めと解像度

- grid / snap は操作補助であり、座標の単位を変更しない。
- 既存データを開いただけで座標を丸めない。
- 1x / 2x / 3x 出力は、共通データの座標を変更せず、出力 adapter の scale として扱う。
- 浮動小数を扱う場合、保存、表示、出力の丸め規則を target ごとに明記する。

## 7. 派生素材の契約

派生素材は、元素材から安全に作り直せる関係として扱う。

| 派生例 | 保存すべき関係 | 手動調整の扱い |
|---|---|---|
| 左右向き | 元、反転軸、左右 role の入れ替え規則。 | 元へ反映するか、独立した反転コピーにするかを明示する。 |
| 色違い | 元、色・パレット変更、対象レイヤー。 | 個別に塗った箇所を自動上書きしない。 |
| 装備違い | 共有部分、差し替えパーツ、anchors。 | 共有部分と専用部分を分ける。 |
| 解像度違い | 元画像、出力 scale、補間方式。 | 低解像度用の手修正は別 variant にする。 |
| アニメーション差分 | 共有フレーム、追加フレーム、イベント。 | 元の時間・判定を無断で継承しない。 |

「元を変えたらすべて自動更新」にはしない。更新対象、手動調整の保護、再生成の前後比較を表示し、ユーザーが選ぶ。

## 8. アニメーションとイベントの契約

### 8.1 基本

- 現在の `Frame` と `Animation` は維持する。
- 追加するアニメーション情報は、アセット共通、animation 単位、frame 単位のどこに属するかを明記する。
- `idle`、`walk`、`attack` のような名前は候補であり、内部で特別なゲームロジックを実行しない。
- 反転、複製、焼き込みで、フレーム順、loop、時間、anchor、判定の意味が変わらないことを確認する。

### 8.2 可変時間とイベント

> この項目は `docs/adr/0008-motion-time-semantics.md`、`docs/adr/0009-animation-event-boundary.md`、`docs/adr/0011-motion-forward-compatibility.md` で決定済み（境界確定のみ、実装は別 PR）。

将来、可変フレーム時間やイベントを追加する場合は、次を守る。

- 時間の正本を ms にするか、fps と frame 数から導くかを明文化する。
- 既存の `fps` ベース animation を自動で別の意味へ移さない。
- イベントは `attack_start`、`projectile_spawn`、`footstep` などの名前付きデータに留め、任意コードを保存・実行しない。
- event payload は JSON として安全に検証できる値だけにする。秘密情報、URL 自動読み込み、JavaScript 文字列を実行しない。

### 8.3 状態と骨

Spine、Rive、Live2D の専用形式を直接再現するのではなく、Chameleon の共通編集元として次を段階的に扱う。

- パーツ親子、pivot、回転・拡縮、簡易リグ、フレームへの焼き込み。
- 部品差し替え、表情、色違い。
- 状態の候補と遷移条件を、必要になった時に共通データとして設計する。

逆関節、メッシュ変形、物理揺れ、専用ランタイム出力は、対象別のライセンス・バージョン・検証を済ませるまで追加しない。

## 9. 当たり判定の契約

### 9.1 現在の形

現在の `rect` と `circle` は、アセット座標上の簡易形状として維持する。`purpose` は `body` / `attack` / `pickup` / `sensor` / `custom`、`visible` は編集・debug 表示の意味である。

### 9.2 将来の拡張順

> この項目は `docs/adr/0010-collider-override-and-polygon-boundary.md`、`docs/adr/0011-motion-forward-compatibility.md` で決定済み（frame 単位上書きのみ許可、animation 単位は不採用。境界確定のみ、実装は別 PR）。

1. アセット共通の rect / circle を正しく編集・反転・書き出しできるようにする。
2. フレーム別または animation 別の上書き規則を設計する。
3. 必要なら polygon を追加する。
4. 対象 engine ごとに raw data、debug draw、実際の collider 変換のどこまで提供するかを検証する。

フレーム別判定の推奨は、アセット共通判定を基準にして、animation または frame が必要な項目だけを上書きする方式である。上書きには、位置・サイズ・有効状態・目的・追加 / 削除のどこまで許すかを先に決める。

### 9.3 polygon を追加する条件

> この項目は `docs/adr/0010-collider-override-and-polygon-boundary.md` で決定済み（unsupported を維持。採用条件は変更なし）。

polygon は次を決めた別 PR 以外では追加しない。

- 点をアセット座標の絶対値にするか、相対値にするか。
- 最小点数、自己交差、凸 / 凹、頂点順の規則。
- 左右反転後の頂点順。
- JSON Schema、migration、helpers、export、target adapter、E2E の変更。
- 現在の rect / circle と古い `.casproj` の互換性。

## 10. 対象別情報と拡張領域

共通の `gameAttributes` に、出力先ごとの情報を無制限に混ぜない。将来追加する target 固有情報は、出力設定または名前空間付きの拡張領域へ隔離する。

例:

```txt
extensions
├─ chameleon
├─ phaser
├─ pixijs
├─ unity
├─ godot
└─ rpgmaker-mz
```

これは保存形式の例であり、現在の `asset.json` に `extensions` を追加する指示ではない。追加時は、許可する値、version、unknown data の保持、秘密情報禁止、対象外の client での無視規則を設計する。

## 11. 入力の来歴・安全性

- 元データのファイル名、形式、ハッシュ、取得元、利用条件、作成日を任意で記録できるようにする。
- AI 利用時は、送信先、モデル名、生成日時、承認状態を必要最小限で記録する。プロンプトや画像を外部へ送った事実を隠さない。
- API key、アクセストークン、個人情報、外部サービスの秘密設定を保存しない。
- SVG、atlas JSON、ZIP、画像は不正入力として検査する。任意コード実行、外部 URL の自動読込、zip bomb、巨大画像、パス外参照を許可しない。

## 12. 検証の段階

将来のデータ機能は、JSON Schema を通るだけでは完了にしない。

| 段階 | 例 | 失敗時の扱い |
|---|---|---|
| 構造検証 | 必須フィールド、型、値域。 | 保存・書き出しを止める。 |
| 意味検証 | ID 重複、参照切れ、親子循環、Blob 欠落、名前衝突。 | 原則として修復を求め、何が不足するか示す。 |
| 出力検証 | target version、画像寸法、atlas 制約、未対応データ。 | preset ごとに警告または書き出しを止める。 |

少なくとも、image layer が実在する texture を参照すること、part / frame / animation の参照が切れていないこと、part 親子に循環がないこと、`.casproj` の必要 Blob が揃うこと、出力用の一意名を生成できることを検査対象にする。

## 13. 形式変更と migration の gate

次のいずれかに触れる場合は、docs-only の次に別の設計 / migration PR を作り、Opus 4.8 の設計レビューと人間確認を通す。

- `asset.json` / `project.json` / export settings の version。
- `.casproj` のフォルダ構成、Blob key、画像の置き場所。
- 座標系、origin、anchor、collider、frame、animation、rig の意味。
- `AssetType`、Collider union、Frame / Animation の構造。
- export ZIP の既存ファイル、atlas の座標情報、helper API。
- 派生素材、履歴、検査記録の保存方式。

その PR の完了条件は次の通りである。

1. 旧データを fixture として読み込める。
2. migration 後に保存し直しても意味が変わらない。
3. 旧・新データで export の重要情報が保たれる。
4. 壊れた入力、途中失敗、容量不足、未知の将来 version を安全に扱える。
5. `docs/DATA_FORMAT.md`、`docs/EXPORT_FORMATS.md`、対象別 matrix、tests が同時に更新される。
