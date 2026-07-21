# Chameleon Asset Studio 2D Export Compatibility Matrix

最終更新日: 2026-07-21
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
文書種別: 2D 入出力・対象別書き出し・検証基準
状態: accepted（設計と確認基準。docs-only）
上位文書: `2D_COMPLETE_PRODUCT_SPEC.md`
関連文書: `2D_ASSET_DATA_CONTRACT.md`, `docs/EXPORT_FORMATS.md`, `docs/ENGINE_INTEGRATION.md`, `docs/future/ASSET_CREATION_AND_EXPORT_STRATEGY.md`

---

> **現状:** mainはPNG / JPEG / WebP、連番、手動格子 sprite sheet、Tileset、Chameleon独自atlasの限定再取り込み、PNG / WebP / Chameleon 独自 atlas / JSON / ZIP の書き出し、Canvas 2D / PixiJS / Phaser の sample・helper、Godot / Unity の取り込み説明を持つ。SVG / GIF source保存のAsset 0.2.0基盤はADR-0019 / PR #135でmainへ反映済み。SVG / GIF / APNGの新規Asset製品入口は1A + 2A + 3A / ADR-0020に従うSlice E製品PRで実装中であり、merge前はmain実装済みと数えない。
> **重要:** 現行 `atlas.json` は Chameleon 独自形式であり、Phaser、PixiJS、Tiled、Unity、Godot の標準形式そのものではない。外部ツールで実行確認するまで `verified` と表示してはいけない。

## 1. 目的

「対応」という言葉を曖昧にしない。

Chameleon が扱う各ファイル形式と対象ツールについて、次を分けて記録する。

- 何を読み込めるか。
- どこまで再編集できるか。
- 何を出力できるか。
- その出力をどの対象・対象バージョンで確認したか。
- 何を保証しないか。

最初から直接 plugin や API 連携を作る必要はない。画像、データ、README、取り込み説明、検査結果をまとめて出し、手動で安全に持ち込めることを優先する。

## 2. 互換性ラベル

| ラベル | 意味 | 表示・実装上の扱い |
|---|---|---|
| `native-editable` | Chameleon の正本として保存・再編集できる。 | `.casproj` と Chameleon の編集データ。 |
| `editable-import` | 重要なレイヤー・フレーム・属性を取り込み、Chameleon 内で再編集できる。 | 対応項目と失われる項目を明示する。 |
| `rasterized-import` | 画像または連番へ変換して取り込む。元形式の編集構造は保たれない。 | 元ファイルを保持する。 |
| `reference-only` | 元ファイルを保存・参照するが、内部構造は編集しない。 | 対応済みと誤解させない。 |
| `generic` | 汎用ファイルを出すだけ。対象ツールでの読込確認は未実施。 | 互換を保証しない。 |
| `import-notes` | 人が持ち込む手順を出す。 | 手順と制限を同梱する。 |
| `candidate` | 出力候補。対象別の手動確認前。 | UI に実験中と表示する。 |
| `verified` | 対象ツール、対象バージョン、fixture、手順、期待結果を記録し、読み込みを確認済み。 | 記録がない限り使わない。 |
| `unsupported` | 現在の対象外。 | 読み込みや出力を装ってはいけない。 |

## 3. `verified` の必要条件

対象別 preset、または Generic Web の出力プロファイルを `verified` と呼ぶには、次をリポジトリ内に残す。

1. 対象ツール名、対象バージョン、検証日、OS / ブラウザ。
2. 何の素材種別を確認したか（例: sprite sheet の敵キャラクター、tile、RPG Maker MZ の歩行キャラ）。
3. 入力 `.casproj` と期待する出力ファイルの fixture。
4. 取り込み手順と、対象ツール側で行う最小限の操作。
5. origin / pivot、animation、collider、trim、scale、名前の期待結果。
6. 自動確認できる範囲と、人手確認した範囲。
7. 既知の制限、未対応データ、再検証が必要になる条件。

Generic Web は対象ツール名ではないため、`generic-web-v1` のような出力プロファイル名、確認したブラウザとそのバージョン、確認項目を記録する。これがない汎用出力は `generic` のままであり、`verified` ではない。

検証済みの対象は、対象ツールの新しい大きな版で挙動が変わる可能性がある。`verified` は永続的な宣伝文句ではなく、対象バージョンに紐付いた記録である。

## 4. 入力形式の方針

### 4.1 形式ごとの扱い

| 形式・入力 | 2D 完成形での扱い | 現在の状態 | 注意 |
|---|---|---|---|
| `.casproj` | `native-editable`。プロジェクトを再開、複製、移行できる。 | 実装済み。 | version / migration を守る。 |
| PNG / JPEG / WebP | `editable-import`。元を残し、編集用画像・サムネイルを作る。 | 実装済み。 | JPEG に透明はない。 |
| SVG | `rasterized-import`（ADR-0016 決定 1。ベクター保持の `editable-import` は将来の別 ADR）。 | ADR-0019 / PR #135でAsset 0.2.0のsource MIME・署名・verbatim保存基盤を実装済み。ADR-0020の新規Asset入口・厳格構造検査・PNG rasterizeをSlice E製品PRで実装中。 | 原本をsanitizeせず、script、event、埋め込みHTML、DOCTYPE、外部href / src、base URL、外部CSS / URLを拒否する。vector構造は編集できない。 |
| 連番、GIF、APNG | フレーム列として取り込み、animation を作る（GIF / APNG は ADR-0016 決定 2 の `rasterized-import`）。 | 同寸法の連番と手動格子sheetはSlice Cで実装済み。GIF source MIME / 署名とAPNGのPNG canonical表現はADR-0019 / PR #135で実装済み。ADR-0020のbounded検査・最大16frame・全frame decode / fallback・時間 / loop写像をSlice E製品PRで実装中。 | 動画編集の代替にはしない。API / MIME非対応環境は先頭frame + 8fps + loss warning。可変時間と有限repeat回数は保持せず、有限repeatはloop無効。 |
| sprite sheet + JSON | フレーム、名前、順番、切り抜き情報を確認しながら取り込む。 | 手動格子指定はSlice Cで実装済み。JSONはADR-0018によりexactな`atlas.json + spritesheet.png`、`chameleon-atlas/0.1.0`のcanonical subsetだけをSlice Dで実装済み。 | Chameleon自形式でも元Assetの完全復元ではなく意味上roundtrip。Phaser / Aseprite / Tiled等の外部JSON、旧版・future version、不整合JSONは理由付き拒否する。 |
| tileset / atlas bundle | タイル寸法、衝突、属性を確認して取り込む。 | Tileset独立モードとChameleon自形式atlasの意味上roundtripをSlice D / closeout PR #133で実装・補修済み（ADR-0018）。 | Tilesetは最大16cell、各cellをlayer + frame化し、Asset全体のcollision設定を使う。colliderは自動生成しない。AtlasはPNG原本を保持するがraw JSONは保持せず、hash等のprovenanceとloss表示を残す。タイル地図そのものの全編集は約束しない。 |
| Aseprite、PSD、OpenRaster、Krita など | `unsupported`（ADR-0016 決定 3 / 4。理由付き明示拒否 + PNG / JSON 経由の手順案内）。 | ADR-0016で分類確定。ADR-0020の形式別理由とPNG / WebP / 手動格子Sheet経由の代替表示をSlice E製品PRで実装中。OpenRasterは`editable-import`昇格の最有力候補として再検討条件に記録。 | 専用原本のreference保存や、全レイヤー・全効果・専用機能の保持は行わない。 |
| Spine / Rive / Live2D の専用形式 | 将来、原本参照や画像・atlas・焼き込みフレームの補助を別設計で検討する。 | `unsupported`。 | 現在は専用原本の保存・参照を実装していない。専用形式の完全編集・再出力を名乗らない。 |

### 4.2 取り込みの共通要件

- 元ファイルを保持し、変換後の編集用データと分ける。ADR-0018のChameleon Atlas JSONだけは限定例外としてraw bytesを保持せず、原本hash等をprovenanceへ残してloss表示する。
- 対応しないレイヤー、メタデータ、アニメーション、効果を取り込み前に表示する。
- 壊れた画像、巨大画像、zip bomb、パス外参照、悪意ある SVG / JSON を拒否または隔離する。
- 形式名だけで対応を表現しない。「レイヤーを保つ」「画像としてのみ取り込む」など、扱いを表示する。

## 5. 基準となる汎用出力

完成形の基準出力は、特定 engine へ依存しない Chameleon package とする。

| 出力 | 目的 | 必須情報 |
|---|---|---|
| PNG | もっとも持ち込みやすい見た目の画像。 | 透明、サイズ、命名。 |
| WebP | Web 向けの軽量画像。 | 対応しない対象には PNG を使う。 |
| 連番 PNG | フレームを個別に使う対象向け。 | 順番、時間、名前。 |
| sprite sheet + generic manifest | アニメーション・タイル用。 | frame rect、source size、trim、origin、anchors、colliders、animations。 |
| atlas PNG + Chameleon manifest | Chameleon のゲーム用情報を保つ。 | padding、extrude、scale、multi-page の情報。 |
| tile package | tileset と属性を持ち込む。 | tileSize、collision、visual type、必要な map 情報。 |
| `asset.json` / 将来の manifest | Chameleon の共通データ。 | format / version、座標、警告、対象固有の拡張。 |
| README / import notes | 人が取り込むための説明。 | 対象、対象バージョン、座標、既知の制限。 |
| verification record | 再現可能な検証の証拠。 | preset ID、生成日時、ファイル一覧、警告、ハッシュ。 |

現在の export ZIP のディレクトリ構成を、本書だけで変更してはいけない。padding、trim、multi-page、manifest の追加は、`2D_ASSET_DATA_CONTRACT.md` の gate を通す別 PR とする。

## 6. 対象別の優先順位と境界

### 6.1 2D 完成の優先対象

| 優先 | 対象 | 完成形で出すもの | `verified` の最小確認 | 直接生成しないもの |
|---:|---|---|---|---|
| P0 | Generic Web / Canvas 2D | PNG / WebP、generic manifest、最小 HTML、debug 表示。 | origin、anchor、rect / circle、animation がブラウザで一致する。 | 特定フレームワークのプロジェクト全体。 |
| P0 | PixiJS | texture / atlas 用画像、対象形式の JSON、animation / metadata、loader snippet。 | 対象 PixiJS 版で spritesheet を読み、origin と animation が一致する。 | PixiJS アプリの自動生成。 |
| P0 | Phaser | sprite sheet / atlas、animation / metadata、loader snippet、必要な Tiled JSON。 | 対象 Phaser 版で読み込み、frame / animation / tile 制約が一致する。 | Scene 全体の自動生成。 |
| P1 | Unity 2D | PNG / sheet、slice / pivot / collider 用 sidecar、import notes。 | 対象 Unity 版で sprite slice、pivot、animation、必要な collider を手動または固定の helper で再現できる。 | `.meta`、Prefab、Animator Controller の無検証生成。 |
| P1 | Godot 2D | PNG / sheet、animation / collider sidecar、import notes。 | 対象 Godot 版で SpriteFrames / AnimatedSprite2D、必要な判定を再現できる。 | `.tscn`、Resource の無検証生成。 |
| P1 | RPG Maker MZ | 歩行キャラ、face、icon、tileset、side-view battler など型別 PNG と説明。 | 対象素材種別ごとに、寸法、並び、ファイル名、配置先を確認する。 | バージョン未指定の「RPG Maker 対応」、プロジェクト改変。 |
| P2 | RPG Maker MV | MZ と別 preset で扱う。 | MV の対象素材種別で独立して確認する。 | MZ と同じ規則だという仮定。 |
| P2 | Tiled | tileset PNG、タイル属性、必要なら対象版固定の JSON / TSX。 | tile size、collision / property、読み込みが一致する。 | 全 autotile / terrain 形式の一括保証。 |
| P2 | Construct 3 / GameMaker / GDevelop | 連番 PNG、sprite strip、順番 manifest、import notes。 | 対象ごとに最小プロジェクトへ取り込める。 | 各プロジェクトの内部ファイル編集。 |
| P2 | Blender（2D 側） | texture PNG / WebP、alpha・色空間などの material notes。 | 画像をテクスチャとして読める。 | `.blend` 作成、Blender addon。 |
| 対象外 | Spine / Rive / Live2D | 将来採用する場合だけ、原本参照や画像 / atlas / 焼き込みフレームの補助を別設計で検討する。 | native format を検証対象にしない。 | 専用形式の完全な読み書き・ランタイム互換。 |

### 6.2 現在の実装状況

| 対象 | 現在提供するもの | 現在のラベル | まだ言えないこと |
|---|---|---|---|
| Generic | PNG / WebP / `asset.json` / Chameleon atlas / ZIP。 | `generic` | 他ツールが Chameleon atlas をそのまま読めること。 |
| Canvas 2D | sample HTML と helper。 | `candidate`（外部実行確認前）。 | 実ゲーム全般での互換性、`verified`。 |
| PixiJS v8 | sample HTML と helper。 | `candidate`（外部実行確認前）。 | PixiJS 標準 atlas JSON としての完全互換、`verified`。 |
| Phaser 4 | sample HTML と helper。 | `candidate`（外部実行確認前）。 | Phaser 標準 atlas / Aseprite JSON としての完全互換、`verified`。 |
| Unity | ZIP 内の取り込みガイド。 | `import-notes` | 手動・自動を問わない verified preset。 |
| Godot 4 | ZIP 内の取り込みガイド。 | `import-notes` | 手動・自動を問わない verified preset。 |
| RPG Maker / Tiled / Construct / Blender | 将来方針のみ。 | `unsupported` | 出力・取り込み・検証済み対応。 |
| Spine / Rive / Live2D | 関係説明のみ。 | `unsupported` | 形式変換や互換。 |

## 7. 形式・対象ごとの調査の根拠

実装前に対象の公式資料を確認し、対象バージョンを文書へ固定する。

- [Aseprite: Sprite Sheet](https://www.aseprite.org/docs/sprite-sheet/) — frame / tag を PNG + JSON へ出す基準。
- [TexturePacker](https://www.codeandweb.com/texturepacker) — trim、padding、重複除去、複数 sheet の検討材料。
- [Tiled: Introduction](https://doc.mapeditor.org/en/stable/manual/introduction/) — tileset、layer、object、collision、property の範囲。
- [Unity: Sprite texture type](https://docs.unity3d.com/6000.4/Documentation/Manual/texture-type-sprite.html) — slice、pivot、physics shape が画像だけではない根拠。
- [Godot: 2D sprite animation](https://docs.godotengine.org/en/stable/tutorials/2d/2d_sprite_animation.html) — sheet から frame を扱う基準。
- [RPG Maker MZ: character image](https://rpgmakerofficial.com/product/MZ_help-en/01_11_01.html) — 型別の配置・命名を分ける根拠。
- [RPG Maker MV: Asset Standards](https://rpgmakerofficial.com/product/MV_Help/page/01_11_01.html) — MZ と別 preset・別検証が必要な根拠。
- [PixiJS: Spritesheet](https://pixijs.download/v8.12.0/docs/assets.Spritesheet.html) — texture、frame、source size、animation を持つ JSON の検討材料。
- [Phaser: Loader](https://docs.phaser.io/phaser/concepts/loader) — image、atlas、spritesheet、JSON、Tiled JSON の読み込み範囲。
- [Spine versioning](https://esotericsoftware.com/spine-versioning) と [Rive format](https://rive.app/docs/runtimes/advanced-topic/format) — 専用形式の完全互換を軽く約束しない根拠。

この一覧は採用済み dependency の一覧ではない。実装でライブラリや変換器を使う場合は、その採用 PR で評価記録を新規作成し、ライセンス、商用利用、ブラウザ対応、bundle size を確認する。

## 8. 対象別 preset の実装順

1. 共通の座標、trim、padding、scale、manifest の契約を決める。
2. Generic Web / Canvas 2D を fixture で完成させる。
3. PixiJS と Phaser を、対象形式・対象バージョンを固定して検証する。
4. Unity 2D、Godot 2D、RPG Maker MZ を、一つずつ手動 import から `verified` にする。
5. Tiled、Construct 3、GameMaker、GDevelop、Blender texture を必要性に応じて増やす。
6. direct plugin / addon は、手動取り込みで共通データを安全に再現できない場合だけ検討する。

この順番を飛ばして、engine ごとの個別 JSON やプロジェクト形式を増やしてはいけない。origin、trim、flip、frame 別判定の意味が固まる前に出力を増やすと、対象ごとに互換性が壊れる。

## 9. 実装・更新時の gate

次の変更は、対象ごとに別 PR とし、docs、fixture、検証結果を同時に更新する。

- 新しい入力形式の parser / converter。
- 新しい export preset、atlas 形式、tile 形式。
- Unity / Godot / RPG Maker 向け helper、plugin、addon。
- trim、padding、extrude、multi-page、atlas rotation、scale の仕様。
- target 固有の data extension。

既存の export ZIP、`asset.json`、`.casproj`、helper API を変える場合は、`2D_ASSET_DATA_CONTRACT.md` の migration gate に従う。docs-only の今回の変更は、これらを実装しない。
