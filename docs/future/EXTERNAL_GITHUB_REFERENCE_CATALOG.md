# Chameleon Asset Studio 外部 GitHub 参考資料カタログ

最終更新日: 2026-07-25  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: 外部実装・機能・仕様の調査記録  
状態: reference only / implementation not approved  
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/IMPLEMENTATION_PLAN.md`  
関連文書: `docs/future/2D_COMPLETION_ROADMAP.md`, `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`, `docs/future/3d/README.md`

---

## 1. 目的

この文書は、Chameleon Asset Studio（以下、本書では `CAS`）へ将来活かせる外部 GitHub リポジトリを、会話の中だけに残して忘れないための索引である。

外部プロジェクトのコードをそのまま採用する一覧ではない。次の判断材料を残す。

- どの GitHub リポジトリを参照するか。
- 2D と 3D のどちらに関係するか。
- 何が CAS に役立つか。
- どの段階で読み直すか。
- そのまま使えない理由と、作り直せば役立つ部分は何か。

本書の追加は、外部ライブラリ、外部サービス、生成モデル、3D 実装の採用を承認しない。2D Pro Gate を人間が承認するまでは、3D のライブラリ評価、依存関係追加、試作、画面、保存形式の実装を開始しない。

## 2. AI が使う評価規則

### 2.1 有用性の3段階

| 評価 | 機械可読名 | 意味 | 参照する時期 |
|---|---|---|---|
| A | `HIGH` | CAS の中心機能または品質基準へ直接役立つ。該当機能の設計開始時に必ず読む。 | work package の設計前 |
| B | `MEDIUM` | 特定機能、画面、形式、処理の比較に役立つ。該当範囲へ入った時に読む。 | 候補比較時 |
| C | `CONDITIONAL` | 現状のままでは採用しない。古い、重い、用途違い、ライセンス制約などがあるが、考え方や一部実装は参考になる。 | 行き詰まり時または代替調査時 |

評価は「コードを採用してよい度合い」ではなく、「CAS の設計に役立つ度合い」である。A でも、ライセンス、商用利用、ブラウザ対応、端末負荷、モデル重み、外部 API の条件を確認するまではコードへ入れない。

### 2.2 採用前に必ず再確認する項目

AI は本書だけで採用を確定してはいけない。採用を検討する Pull Request で、対象 commit または release を固定し、次を公式の `LICENSE`、モデルカード、利用規約、README で再確認する。

1. コードと同梱素材のライセンス。
2. モデル重み、学習済みデータ、生成物の利用条件。
3. 商用利用、再配布、公開 Web サービス、地域、売上に関する制限。
4. ブラウザ、iPhone、iPad、Node.js、GPU、メモリ、ファイル形式の条件。
5. 元データを保持できるか、処理前後を比較できるか、失敗時に正本を壊さないか。

## 3. 2D 参考資料

### 3.1 A / HIGH

| ID | GitHub | 有用な点 | CAS での参照先 | 境界・注意 |
|---|---|---|---|---|
| `2D-EXT-001` | [image-cockpit-for-codex-workflows](https://github.com/dreiachse-cyber/image-cockpit-for-codex-workflows) / [v0.1.8](https://github.com/dreiachse-cyber/image-cockpit-for-codex-workflows/releases/tag/v0.1.8) | 生成、部分修正、アニメーション生成を3画面に分け、共通プレビュー、履歴、ローカル受け渡しを一続きに見せる。CAS が不足している画面の完成度を比べる基準になる。 | 2D 制作ホーム、生成結果の比較、外部 AI への安全な受け渡し、アニメーション生成画面 | ローカル PC、npm、Codex コマンド前提。CAS へ直接移植しない。リポジトリの MIT は生成画像の権利を保証しない。 |
| `2D-EXT-002` | [PixiEditor/PixiEditor](https://github.com/PixiEditor/PixiEditor) | ラスタ画像、ベクター、アニメーションを一つの制作環境で扱う画面構成、ツール切り替え、拡張方式が参考になる。 | 2D 編集画面、ツールパネル、ラスタとベクターの共存 | デスクトップ中心で技術構成も CAS と異なる。LGPL を含むため、コード利用は別途確認する。 |
| `2D-EXT-003` | [MewPurPur/GodSVG](https://github.com/MewPurPur/GodSVG) | 画面操作と SVG コードを同じ正本へ反映し、余計な情報を増やさず、整理された SVG を出す考え方が有用。 | SVG 図形編集、安全な SVG 出力、画面とソースの同期 | 旧 URL `MichaelMCE/GodSVG` は無効。CAS の SVG 安全検査契約を弱めない。 |
| `2D-EXT-004` | [Orama-Interactive/Pixelorama](https://github.com/Orama-Interactive/Pixelorama) | パレット、フレーム、レイヤー、タイル、オニオンスキンを横断するピクセルアート制作体験が参考になる。 | ピクセル編集、スプライト、タイル、アニメーション | デスクトップ機能をそのままスマホへ詰め込まない。必要な操作だけを画面単位に分ける。 |
| `2D-EXT-005` | [piskelapp/piskel](https://github.com/piskelapp/piskel) | ブラウザでのスプライト編集、フレームプレビュー、スプライトシート出力の流れが参考になる。 | ブラウザ用ピクセル編集、フレーム確認、sheet 出力 | 更新状況と依存関係を再確認し、形式の意味を CAS 側で定義する。 |
| `2D-EXT-006` | [aseprite/aseprite](https://github.com/aseprite/aseprite) | スプライト、タイムライン、タグ、タイルマップ、書き出しの品質基準として強い。 | 2D Pro の操作品質、アニメーション、タイル、書き出し | ソース公開だが一般的な MIT ではない。コードを流用せず、製品比較と仕様の参考に限定する。 |
| `2D-EXT-007` | [mapeditor/tiled](https://github.com/mapeditor/tiled) | tileset、tile layer、object layer、property、JSON/TMX の関係が、ゲーム用タイルデータの基準になる。 | tileset、atlas、当たり判定、対象別書き出し、import notes | Tiled 完全互換を名乗らない。対象バージョンを固定して実ファイルで検証する。 |
| `2D-EXT-008` | [deepnight/ldtk](https://github.com/deepnight/ldtk) | レベル、タイル、entity、field、enum、外部 JSON の関係と、制作画面からゲーム用データへ渡す設計が参考になる。 | tile / level / entity データ、型付き属性、対象別 preset | LDtk のプロジェクト形式を CAS の正本にしない。書き出し候補として分離する。 |
| `2D-EXT-009` | [amethyst/distill](https://github.com/amethyst/distill) | 安定した ID、依存関係、変更検出、キャッシュ、import 用 metadata という考え方が、原本と派生物の追跡に役立つ。 | Project / Asset / Variant、派生物、再生成、provenance | Rust 製の古い資産パイプラインを依存にしない。設計だけを参照する。3D 側でも共通参照する。 |

### 3.2 B / MEDIUM

| ID | GitHub | 有用な点 | CAS での参照先 | 境界・注意 |
|---|---|---|---|---|
| `2D-EXT-010` | [KDE/krita](https://github.com/KDE/krita) | ブラシ、選択、マスク、レイヤー、アニメーションの成熟した操作を比較できる。 | 高度なラスタ編集の品質基準 | 巨大なデスクトップアプリであり、直接組み込まない。 |
| `2D-EXT-011` | [GNOME/gimp](https://github.com/GNOME/gimp) | 選択、色調整、フィルター、レイヤー、非破壊編集の比較に使える。 | 画像修正、選択範囲、処理履歴 | GPL 系コードを CAS へ混ぜない。操作と仕様の比較に限定する。 |
| `2D-EXT-012` | [inkscape/inkscape](https://github.com/inkscape/inkscape) | path、node、boolean、stroke、gradient、SVG 出力の成熟した挙動を確認できる。 | ベクター編集、SVG 互換性 | 大規模デスクトップ実装。GodSVG と合わせて仕様を比較する。 |
| `2D-EXT-013` | [LibreSprite/LibreSprite](https://github.com/LibreSprite/LibreSprite) | Aseprite 系のスプライト編集、パレット、アニメーションの公開実装を比較できる。 | ピクセル編集とタイムライン | ライセンスと由来を確認してからコード利用を判断する。 |
| `2D-EXT-014` | [mitchcurtis/slate](https://github.com/mitchcurtis/slate) | 小さなピクセル、スプライト、タイル制作画面を理解しやすい。 | 軽量ピクセル編集、tile UX | `slate/slate` は別の IRC クライアント。参照先を取り違えない。 |
| `2D-EXT-015` | [rgab1508/PixelCraft](https://github.com/rgab1508/PixelCraft) | ブラウザとスマホに近いピクセル編集の配置や操作を比較できる。 | iPhone 向けピクセル編集 | 小規模実装なので、保存・復旧・安全性は CAS の契約を使う。 |
| `2D-EXT-016` | [Mateusz-Nejman/Pixed](https://github.com/Mateusz-Nejman/Pixed) | タッチを意識したピクセル編集 UI の参考になる。 | スマホの描画、パレット、拡大操作 | 現在の対応端末とライセンスを再確認する。 |
| `2D-EXT-017` | [lotcarnage/dot-e-editor](https://github.com/lotcarnage/dot-e-editor) | 単一 HTML、オフライン、インデックスカラーパレット、軽量保存の考え方が CAS と相性がよい。 | オフライン編集、パレット、軽量な作業画面 | 明確なライセンスを確認できていない。コードを使わず設計だけを参照する。 |
| `2D-EXT-018` | [AnimeEffectsDevs/AnimeEffects](https://github.com/AnimeEffectsDevs/AnimeEffects) | 画像パーツを骨とメッシュ変形で動かす流れが参考になる。 | 2D リグ、メッシュ変形、bake 前の編集 | CAS の既存 rig、frame、bake の意味を変えない。 |
| `2D-EXT-019` | [opentoonz/opentoonz](https://github.com/opentoonz/opentoonz) | exposure sheet、レベル、動画素材の管理を比較できる。 | 長い 2D アニメーションの考え方 | 総合アニメーションソフトを再現しない。 |
| `2D-EXT-020` | [synfig/synfig](https://github.com/synfig/synfig) | vector tween、keyframe、parameter animation の仕様比較に役立つ。 | 補間アニメーションの将来調査 | 現在の frame animation と混ぜず、別 work package にする。 |
| `2D-EXT-021` | [mbasaglia/glaxnimate](https://github.com/mbasaglia/glaxnimate) | vector animation と Lottie/SVG 系の入出力を調べる入口になる。 | ベクターアニメーション、外部形式 | 対象形式ごとに loss を検査し、黙って情報を落とさない。 |
| `2D-EXT-022` | [DragonBones/DragonBonesJS](https://github.com/DragonBones/DragonBonesJS) | 2D 骨格アニメーションの runtime data、slot、skin、animation の関係を比較できる。 | 将来の 2D rig 互換性調査 | 完全互換や直接書き出しを先に約束しない。 |
| `2D-EXT-023` | [rive-app/rive-runtime](https://github.com/rive-app/rive-runtime) | runtime、state、animation、asset 読み込みの境界を比較できる。 | Rive 向け import notes、将来の再生補助 | editor の内部形式と runtime のライセンス・機能を混同しない。 |
| `2D-EXT-024` | [Ogmo-Editor-3/OgmoEditor3-CE](https://github.com/Ogmo-Editor-3/OgmoEditor3-CE) | tile、decal、entity、grid metadata を JSON に分ける軽量なレベル編集が参考になる。 | 小規模ゲーム向け level / entity 出力 | 旧 URL `Ogmo-Editor-3/OgmoEditor3` は無効。 |
| `2D-EXT-025` | [codeforreal1/compressO](https://github.com/codeforreal1/compressO) | 画像と動画の一括圧縮、処理前後の確認、形式別設定、オフライン処理の画面が書き出し改善に役立つ。 | 2D 書き出し、容量削減、batch、比較表示 | AGPL-3.0 で、FFmpeg、pngquant など複数の外部 binary を使うデスクトップアプリ。コードを組み込まず、画面と処理手順を参照する。 |
| `2D-EXT-026` | [game-icons/icons](https://github.com/game-icons/icons) | SVG 素材と作者・利用条件を一緒に扱う必要性を示す。 | ライセンス情報付き素材取り込み、attribution 出力 | アイコンは CC-BY が中心で、個別条件を確認する。旧 URL `gam-icons/game-icons` は無効。 |

### 3.3 C / CONDITIONAL

| ID | GitHub | 手を加えれば役立つ点 | 現状の見送り理由 |
|---|---|---|---|
| `2D-EXT-027` | [pencil2d/pencil](https://github.com/pencil2d/pencil) | フレーム単位の手描きアニメーション操作を簡素化する参考になる。 | デスクトップ中心で CAS のゲーム用 metadata とは目的が異なる。 |
| `2D-EXT-028` | [maierfelix/poxi](https://github.com/maierfelix/poxi) | 小さなピクセル制作ツールの状態管理と描画処理を再調査する候補。 | 更新状況、現在の動作、ライセンスを採用前に確認する必要がある。 |
| `2D-EXT-029` | [gmattie/Data-Pixels](https://github.com/gmattie/Data-Pixels) | ピクセルデータを構造として扱う小規模実装を探す入口になる。 | CAS の完成機能へ直接つながる証拠がまだ弱い。 |
| `2D-EXT-030` | [cloudhead/rx](https://github.com/cloudhead/rx) | 軽量なピクセル編集の設計を比較する候補。 | 古さ、保守状況、ライセンス、ブラウザ適合を再調査する。 |
| `2D-EXT-031` | [lospec/pixel-editor](https://github.com/lospec/pixel-editor) | パレット中心の Web ピクセル編集を比較する候補。 | CAS の保存・復旧・animation 契約は別途必要。 |
| `2D-EXT-032` | [Kully/pixel-paint](https://github.com/Kully/pixel-paint) | 小さな Web 描画画面の実装を比較できる可能性がある。 | 機能、更新、ライセンスを再確認するまで参照候補に留める。 |
| `2D-EXT-033` | [pixa-pics/pixa-pics.github.io](https://github.com/pixa-pics/pixa-pics.github.io) | Web ピクセル編集の画面と公開方法を比較する候補。 | CAS の正本管理やゲーム用出力へそのまま使えない。 |
| `2D-EXT-034` | [jvalen/pixel-art-react](https://github.com/jvalen/pixel-art-react) | React 上で小さなピクセル表現を扱う部品を調査できる。 | 完成した制作環境ではなく、用途が限定的。 |
| `2D-EXT-035` | [jackschaedler/goya](https://github.com/jackschaedler/goya) | 過去状態をたどる編集履歴の考え方が参考になる。 | 2014 年頃の古い実装で、現在の依存として使わない。 |
| `2D-EXT-036` | [vsmode/pixel8](https://github.com/vsmode/pixel8) | 低解像度描画 primitive と typed array の扱いを再調査できる。 | エディタではなく古い描画ライブラリである。 |
| `2D-EXT-037` | [Tezumie/p5play-Tile-Map-Editor](https://github.com/Tezumie/p5play-Tile-Map-Editor) | PNG と p5play 用 tile 文字列を往復する画面は、変換内容を見せる UI の参考になる。 | CC BY-NC 4.0 のため、商用利用を想定する CAS へコードを入れない。 |
| `2D-EXT-038` | [mxmarchal/pixel-llm](https://github.com/mxmarchal/pixel-llm) | AI の構造化ピクセル出力を検証し、不正出力を拒否する仕組みの反面教師になる。 | 実験段階。ブラウザの localStorage に API key を保存する例は採用禁止。端末内モデルも重い。 |
| `2D-EXT-039` | [HotpotDesign/Game-Assets-And-Resources](https://github.com/HotpotDesign/Game-Assets-And-Resources) | アセット探索と、外部素材カタログで使う分類項目を考える入口になる。 | リンク集であり、個別素材の最新性や利用条件を保証しない。自動取り込み元にしない。 |
| `2D-EXT-040` | [Boner2D](https://github.com/playemgames/Boner2D) | sprite bone animation の制作手順を比較する候補。 | Unity add-on であり CAS のブラウザ実装とは距離がある。 |

## 4. 3D 参考資料

### 4.1 A / HIGH

| ID | GitHub | 有用な点 | CAS での参照先 | 境界・注意 |
|---|---|---|---|---|
| `3D-EXT-001` | [img2threejs/img2threejs](https://github.com/img2threejs/img2threejs) | 画像の適性確認、詳細一覧、構造化 spec、段階別生成、参照画像と render の比較、品質 gate、socket・collider を含む実行用 hierarchy が有用。 | 画像からコード生成型 3D、視覚比較、品質記録、animation-ready 構造 | 出力は主に TypeScript / Three.js factory で、通常の GLB 生成器とは別系統。旧 `hoainho/img2threejs` は移転先へ転送される。Apache-2.0。 |
| `3D-EXT-002` | [lightningpixel/modly](https://github.com/lightningpixel/modly) | 画像→3D を node workflow、model extension、run 状態、エラー、CLI、自動化契約、smooth・decimate、GLB export に分けている。外部生成器を差し替える構造が特に有用。 | 外部 3D 生成 provider、workflow、進捗・取消・再開、agent API | PC と GPU のデスクトップ処理。CAS 本体へモデルを入れず、将来の外部 connector の参考にする。MIT でも各 extension と model weight は別確認。 |
| `3D-EXT-003` | [KhronosGroup/glTF-Validator](https://github.com/KhronosGroup/glTF-Validator) | GLB / glTF が仕様に合うかを、理由と場所を示して検査できる。 | `Import → Inspect`、書き出し前検査、CI、inspection report | 3D Pro Gate 後の最初の検査候補。CAS 独自のゲーム用途検査は別に追加する。 |
| `3D-EXT-004` | [donmccurdy/glTF-Transform](https://github.com/donmccurdy/glTF-Transform) | glTF の読み込み、変更、整理、圧縮、texture 処理を組み合わせられる。 | 非破壊な派生 GLB、変換記録、最適化 pipeline | 旧 URL `atteneder/gltf-transform` は無効。採用前に browser / Node の分担と容量を実測する。 |
| `3D-EXT-005` | [zeux/meshoptimizer](https://github.com/zeux/meshoptimizer) | vertex / index 最適化、mesh simplification、LOD、mesh compression と `gltfpack` が、Web ゲーム用軽量化の中心候補になる。 | `Inspect → Optimize → Compare`、LOD、GLB 軽量化 | `CesiumGS/gltfpack` という別 repo は存在しない。元モデルを残し、差と見た目を確認してから派生物として保存する。 |
| `3D-EXT-006` | [scottstts/Threejs-Awesome-Graphics-Agent-Skills](https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills) | PBR、lighting、shader、post effect、procedural geometry、品質段階、固定視点 capture、診断画像を AI に具体的に渡す資料になる。 | 3D 表示品質、材質、照明、visual regression、AI 実装指示 | 3D Gate 後の参照資料。skills の導入自体を dependency 採用と混同しない。MIT。 |
| `3D-EXT-007` | [ryanfitzpatrickio/threejs-playground](https://github.com/ryanfitzpatrickio/threejs-playground) | World Map editor、Map Builder、terrain、vehicle、procedural world、品質 preset、streaming、性能対策を一つの実験場で比較できる。 | 3D preview の高度化、world / terrain、品質 preset、性能設計 | 完成ツールではなく巨大な試作群。直接移植せず、必要な scene と技法だけを切り出して読む。 |
| `3D-EXT-008` | [RodZill4/material-maker](https://github.com/RodZill4/material-maker) | node graph で procedural material と brush を作り、3D model へ paint する流れが PBR 制作の基準になる。 | PBR material graph、texture preview、3D paint の将来構想 | Godot 製デスクトップアプリ。MIT でも CAS へそのまま組み込まない。 |
| `3D-EXT-009` | [JannisX11/blockbench](https://github.com/JannisX11/blockbench) | low-poly / block / model、texture、animation、plugin、format 切り替えの制作体験が CAS の軽量 3D と相性がよい。 | 低ポリゴン編集、texture、簡易 animation、モバイルを含む UI 比較 | Blockbench の全機能を再現しない。形式と plugin の権利を採用前に確認する。 |
| `3D-EXT-010` | [lovisdotio/fal-texture-pbr-generator](https://github.com/lovisdotio/fal-texture-pbr-generator) | 画像または文章から BaseColor、Normal、Roughness、Metallic、Height を作り、3D preview と ZIP 出力へつなぐ画面が有用。 | 将来の PBR 生成 panel、map 一式の命名と比較 | fal.ai 外部 API 依存。API key を browser に保存せず、同意、料金、送信内容、失敗時の原本保持を設計する。コードの MIT と API / model 条件は別。 |
| `3D-EXT-011` | [VAST-AI-Research/SkinTokens](https://github.com/VAST-AI-Research/SkinTokens) | GLB mesh を骨と skin weight 付き GLB にする UniRig 後継候補。 | 外部自動 rig provider、rigged GLB の再検査 | ローカルには NVIDIA GPU と大きなメモリが必要。CAS では将来の外部処理候補にする。README の品質主張は独立検証する。 |
| `3D-EXT-012` | [microsoft/TRELLIS.2](https://github.com/microsoft/TRELLIS.2) | 高品質な画像→3Dと PBR GLB の将来候補として比較価値が高い。 | 高品質外部生成 provider | 高性能 GPU、依存、重み、入力・生成物の条件を採用時に再確認する。ブラウザへ直接入れない。 |
| `3D-EXT-013` | [Stability-AI/stable-fast-3d](https://github.com/Stability-AI/stable-fast-3d) | 画像から短時間で材質付き 3D を得る比較基準になる。 | 最初の外部 image-to-3D 実験、出力検品 | Stability AI 系のコード、重み、商用条件を別々に確認する。 |
| `3D-EXT-014` | [VAST-AI-Research/TripoSR](https://github.com/VAST-AI-Research/TripoSR) | 単一画像から 3D mesh を作る比較的単純な外部実験候補。 | 画像→3D の初期比較、失敗例収集 | 生成品質を保証せず、GLB / texture / scale / origin を CAS で再検査する。 |

### 4.2 B / MEDIUM

| ID | GitHub | 有用な点 | CAS での参照先 | 境界・注意 |
|---|---|---|---|---|
| `3D-EXT-015` | [blender/blender](https://github.com/blender/blender) | model、UV、rig、animation、material、export の成熟した品質基準。 | 3D 完成形の比較、Blender import notes | 巨大デスクトップアプリ。直接組み込まない。 |
| `3D-EXT-016` | [cnr-isti-vclab/meshlab](https://github.com/cnr-isti-vclab/meshlab) | mesh inspection、repair、simplification、normal、format 変換の比較基準。 | 3D 検品と修復 | desktop 処理をそのまま Web へ移さず、必要な検査だけを選ぶ。 |
| `3D-EXT-017` | [vengi-voxel/vengi](https://github.com/vengi-voxel/vengi) | voxel 編集、format 変換、mesh 化、engine 向け処理をまとめて比較できる。 | voxel mode、voxel→mesh、format 対応 | 3D の通常 mesh pipeline と voxel pipeline を分ける。 |
| `3D-EXT-018` | [guillaumechereau/goxel](https://github.com/guillaumechereau/goxel) | voxel editor の基本操作、layer、palette、mesh export が参考になる。 | 軽量 voxel 制作 | desktop UI をスマホへそのまま持ち込まない。 |
| `3D-EXT-019` | [ephtracy/ephtracy.github.io](https://github.com/ephtracy/ephtracy.github.io) | MagicaVoxel の操作・出力・palette を追う入口になる。 | voxel 品質比較、利用者が持ち込む形式の調査 | 主に配布サイト用 repo。実装コードの採用元として扱わない。 |
| `3D-EXT-020` | [Sprytile/Sprytile](https://github.com/Sprytile/Sprytile) | 2D tile を 3D 面へ貼り、低ポリゴン環境を作る考え方が 2D→3D の橋渡しになる。 | tile-based 3D、low-poly environment | Blender add-on なので外部手順書候補。 |
| `3D-EXT-021` | [BoundingBoxSoftware/Materialize](https://github.com/BoundingBoxSoftware/Materialize) | 1枚の画像から複数の material map を作る手順を比較できる。 | PBR map 作成、map 間の整合 | desktop 実装。更新状況とライセンスを再確認する。 |
| `3D-EXT-022` | [azagaya/Laigter](https://github.com/azagaya/Laigter) | 2D sprite から normal / specular 等を作り、照明 preview する流れが有用。 | 2D lighting map と将来 PBR の接点 | 2D 機能として導入する場合も、出力の意味と対象 engine を固定する。 |
| `3D-EXT-023` | [armory3d/armortools](https://github.com/armory3d/armortools) | texture paint、material、bake、GPU 処理の完成像を比較できる。 | 高度 PBR / texture paint | 重い desktop / GPU 実装。機能比較に限定する。 |
| `3D-EXT-024` | [Tencent-Hunyuan/Hunyuan3D-2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) | shape と texture を含む高品質 3D 生成候補。 | 高品質外部生成の比較 | ライセンスに地域条件がある。採用時点の公式条件を必ず再確認する。 |
| `3D-EXT-025` | [Tencent-Hunyuan/Hunyuan3D-Omni](https://github.com/Tencent-Hunyuan/Hunyuan3D-Omni) | 複数条件を使う生成や編集の将来比較に役立つ。 | 高度な外部生成 / 編集 provider | 重い GPU とモデル条件。標準依存にしない。 |
| `3D-EXT-026` | [microsoft/TRELLIS](https://github.com/microsoft/TRELLIS) | structured latent を使う 3D 生成の前世代比較と出力形式調査に役立つ。 | TRELLIS.2 との比較、研究 | TRELLIS.2 を先に比較し、旧版を無理に併用しない。 |
| `3D-EXT-027` | [openai/shap-e](https://github.com/openai/shap-e) | text / image から implicit 3D を作る研究の比較基準。 | 生成方式の歴史、品質・速度比較 | 現在の本命 provider ではない。出力を game-ready とみなさない。 |
| `3D-EXT-028` | [MrForExample/ComfyUI-3D-Pack](https://github.com/MrForExample/ComfyUI-3D-Pack) | 複数の 3D 生成・処理を node workflow でつなぐ adapter の考え方が参考になる。 | 外部 workflow 定義、provider 交換 | PC / ComfyUI / GPU 前提。CAS 本体には入れず外部実行候補。 |
| `3D-EXT-029` | [PozzettiAndrea/ComfyUI-TRELLIS2](https://github.com/PozzettiAndrea/ComfyUI-TRELLIS2) | TRELLIS.2 を node として扱い、image→3D と PBR 出力を workflow 化する例。 | 将来の外部 TRELLIS.2 adapter | 実験的な環境導入を含む。version を固定し、隔離した外部処理として扱う。 |
| `3D-EXT-030` | [FishWoWater/hunyuan_trellis_fast](https://github.com/FishWoWater/hunyuan_trellis_fast) | 複数の生成器を高速化・組み合わせる試みを比較できる。 | 生成速度の研究 | 依存、fork 差分、重み、再現性を確認するまで採用しない。 |
| `3D-EXT-031` | [VAST-AI-Research/HoloPart](https://github.com/VAST-AI-Research/HoloPart) | 3D model を完全な意味単位の parts へ分け、隠れた部分も補う方向性を追える。 | parts、分解、差し替え可能な 3D asset | 公開コード、model weight、license、出力形式を採用時に再確認する。 |
| `3D-EXT-032` | [ByteDance/Hi3DGen](https://github.com/ByteDance/Hi3DGen) | 高品質 image-to-3D の研究比較候補。 | 外部生成の品質比較 | 実行環境、weight、license、正式な出力形式を再確認する。 |
| `3D-EXT-033` | [makehumancommunity/makehuman](https://github.com/makehumancommunity/makehuman) | parametric human、body shape、clothing、rig への流れを比較できる。 | 人型 character preset | 汎用 asset editor とは別の専門領域。 |
| `3D-EXT-034` | [makehumancommunity/mpfb2](https://github.com/makehumancommunity/mpfb2) | MakeHuman と Blender の人型制作・rig 接続が参考になる。 | Blender handoff、人型 import notes | Blender add-on として扱う。 |
| `3D-EXT-035` | [animate1978/MB-Lab](https://github.com/animate1978/MB-Lab) | parametric character と rig の別実装を比較できる。 | 人型生成の比較 | asset と dataset の利用条件を確認する。 |
| `3D-EXT-036` | [freemocap/freemocap](https://github.com/freemocap/freemocap) | camera から skeleton motion を得て、外部形式へ渡す流れを比較できる。 | motion import、retarget の将来機能 | capture は外部処理。個人情報と動画送信の扱いも設計する。 |
| `3D-EXT-037` | [CMU-Perceptual-Computing-Lab/openpose](https://github.com/CMU-Perceptual-Computing-Lab/openpose) | body landmark と motion capture の基礎比較に使える。 | motion / pose input の研究 | ライセンスと商用条件を必ず確認する。browser へ直接入れない。 |
| `3D-EXT-038` | [openscad/openscad](https://github.com/openscad/openscad) | code で再現可能な形状を作る考え方が、parameter と履歴のある 3D 制作に役立つ。 | code-generated 3D、再現可能な primitive asset | CAD 全体を作らず、限定的な shape recipe を検討する。 |
| `3D-EXT-039` | [gumyr/build123d](https://github.com/gumyr/build123d) | Python で parametric solid を作る API 設計が参考になる。 | 外部 code-to-3D provider、recipe | Python backend 前提。CAS browser へ直接入れない。 |
| `3D-EXT-040` | [CadQuery/cadquery](https://github.com/CadQuery/cadquery) | 再現可能な parametric model と export の考え方を比較できる。 | code-to-3D、寸法付き hard-surface asset | Python / CAD kernel 前提。外部処理候補。 |
| `3D-EXT-041` | [lalomorales22/maxs-world](https://github.com/lalomorales22/maxs-world) | 画像を voxel build、standee、立体表現へ変え、同じ画面で preview、配置、移動、保存する体験が有用。touch 操作も比較できる。 | 画像→簡易3D、voxel / standee、spawn preview、world 配置 | PHP / SQLite / single-file sandbox で CAS とは構成が異なる。変換方式と体験だけを参照する。 |
| `3D-EXT-042` | [Robbyant/lingbot-map](https://github.com/Robbyant/lingbot-map) | 長い動画から連続的に空間を再構成し、位置ずれを抑える研究が world capture の参考になる。 | 将来の world / scene reconstruction | CUDA 前提の重い研究モデル。通常の単体 GLB asset pipeline と分ける。 |
| `3D-EXT-043` | [tudelft3d/3dfier](https://github.com/tudelft3d/3dfier) | 2D GIS と point cloud から city / terrain を 3D 化し、OBJ / CityGML / STL 等へ出す。 | city / terrain import の別 track | 通常のキャラクター・小物制作とは別機能。GIS 入力が必要。 |
| `3D-EXT-044` | [Project-PLATEAU/3D-City-Model-Generator](https://github.com/Project-PLATEAU/3D-City-Model-Generator) | 地物情報や画像から複数の詳細度で都市モデルを作る流れが参考になる。 | city model、level of detail、CityGML conversion | 高性能 GPU と専門データ前提。world pipeline として分離する。 |
| `3D-EXT-045` | [facebookresearch/sam-3d-objects](https://github.com/facebookresearch/sam-3d-objects) | 単一画像から物体の形状・texture・配置を再構成する別方式を追跡できる。 | Gaussian splat / scene object の別 track | 通常の GLB mesh と同じ扱いにしない。PLY / splat の検品・書き出し契約を別にする。 |
| `3D-EXT-046` | [facebookresearch/sam-3d-body](https://github.com/facebookresearch/sam-3d-body) | 単一画像から人体 mesh を復元する専門候補。 | 人体 character の外部 provider | 人体、写真、個人情報、利用条件を含む別 Gate が必要。 |
| `3D-EXT-047` | [donmccurdy/three-gltf-viewer](https://github.com/donmccurdy/three-gltf-viewer) | browser で GLB / glTF を素早く確認する表示項目と検証用 UI が参考になる。 | 3D preview、model drop、環境・animation 切替 | 制作・保存機能ではなく viewer の参考に限定する。 |
| `3D-EXT-048` | [CesiumGS/gltf-pipeline](https://github.com/CesiumGS/gltf-pipeline) | glTF 変換と圧縮の既存 pipeline を比較できる。 | Node 側変換の比較 | 新規採用では glTF-Transform と meshoptimizer を先に比較する。 |
| `3D-EXT-049` | [microsoft/glTF-Toolkit](https://github.com/microsoft/glTF-Toolkit) | glTF の処理・最適化を別実装と比較できる。 | optimizer の代替調査 | 更新状況と対応拡張を固定 commit で確認する。 |
| `3D-EXT-076` | [VAST-AI-Research/UniRig](https://github.com/VAST-AI-Research/UniRig) | skeleton 生成と skin weight を分けた自動 rig の構成を、後継候補と比較できる。 | 自動 rig の研究、SkinTokens との比較 | 新規評価では後継の SkinTokens を先に見る。UniRig を重複採用しない。 |
| `3D-EXT-077` | [Zylann/godot_voxel](https://github.com/Zylann/godot_voxel) | voxel terrain、level of detail、streaming、Godot 統合の実装を比較できる。 | voxel world の検品と engine handoff | 単体 voxel asset と無限 terrain を別機能として扱う。 |

### 4.3 C / CONDITIONAL

| ID | GitHub | 手を加えれば役立つ点 | 現状の見送り理由 |
|---|---|---|---|
| `3D-EXT-050` | [TMLG5801/Realtime-3D-Player](https://github.com/TMLG5801/Realtime-3D-Player) | depth map、2D 画像の奥行き preview、焦点と強度調整の UI は、画像から簡易立体表現を確認する参考になる。 | 3D mesh 制作ではなく、Windows / NVIDIA RTX 前提の realtime stereo player。 |
| `3D-EXT-051` | [NVlabs/PartPacker](https://github.com/NVlabs/PartPacker) | 単一画像から意味のある parts に分ける考え方は、差し替え可能な 3D asset に役立つ。 | 非商用制限があるため、商用利用を想定する CAS へ組み込まない。研究参考のみ。 |
| `3D-EXT-052` | [3DTopia/3DTopia](https://github.com/3DTopia/3DTopia) | 候補生成と refinement を分ける二段階処理を比較できる。 | 研究実装で環境が古く、現在の高品質候補より優先度が低い。 |
| `3D-EXT-053` | [ashawkey/stable-dreamfusion](https://github.com/ashawkey/stable-dreamfusion) | NeRF / diffusion 系 text-to-3D の歴史と失敗例を学べる。 | README 自身が作業途中と品質限界を示す古い研究実装。backend 候補にしない。 |
| `3D-EXT-054` | [Keshraf/forge](https://github.com/Keshraf/forge) | 画像生成、3D 生成、品質評価、費用のある cloud service を分離する構成が参考になる。 | 小規模な初期 project で、Google API と cloud GPU に強く依存する。 |
| `3D-EXT-055` | [ctate/3d-model-generator](https://github.com/ctate/3d-model-generator) | text / image から外部 API を呼び、3D 結果を受け取る最小画面を比較できる。 | Hyper3D Rodin API 依存。API 条件、費用、送信内容の設計が別途必要。 |
| `3D-EXT-056` | [MubarakHAlketbi/game-asset-mcp](https://github.com/MubarakHAlketbi/game-asset-mcp) | AI agent から 2D / 3D asset generation を呼ぶ tool contract の参考になる。 | 外部 model と Hugging Face の条件、出力品質、秘密情報の扱いを確認するまで接続しない。 |
| `3D-EXT-057` | [facebookresearch/3detr](https://github.com/facebookresearch/3detr) | 3D point cloud の object detection と scene understanding を学ぶ参考になる。 | 3D asset generator ではない。通常の CAS 制作機能へ直接使わない。 |
| `3D-EXT-058` | [facebookresearch/sam3](https://github.com/facebookresearch/sam3) | text / visual prompt による画像・動画の領域選択と追跡は、2D mask 作成へ転用できる可能性がある。 | SAM 3D ではない。大きな model と独自 license があり、CAS の 3D 生成候補として扱わない。 |
| `3D-EXT-059` | [Nor-s/Anim](https://github.com/Nor-s/Anim) | timeline、Mixamo rig、motion capture、glTF / FBX export の画面を比較できる。 | archived。新規依存にせず animation editor の参考に限定する。 |
| `3D-EXT-060` | [kimgooq/MoCap-Rigging](https://github.com/kimgooq/MoCap-Rigging) | MediaPipe landmark を Three.js bone rotation へ渡す最小例として読める。 | 小規模 demo で、明確な license を確認できない。コードを流用しない。 |
| `3D-EXT-061` | [sagieppel/Unsupervised-extraction-of-textures-and-PBR-materials-from-images](https://github.com/sagieppel/Unsupervised-extraction-of-textures-and-PBR-materials-from-images) | 画像から均一な texture 領域を抽出し、seamless 化と PBR map 推定をする batch 処理が参考になる。 | 研究用途で対話的 Web UI ではない。sample image の権利も別確認する。 |
| `3D-EXT-062` | [texturedesign/texturize](https://github.com/texturedesign/texturize) | 元 texture から拡張・variation を作る考え方が参考になる。 | AGPL-3.0、demo 素材に非商用条件があり、PBR 機能も限定的。組み込まない。 |
| `3D-EXT-063` | [woxels/Woxel](https://github.com/woxels/Woxel) | voxel editor の小さな実装を比較できる。 | Linux / SDL 系で CAS browser から遠い。Vengi、Goxel を先に見る。 |
| `3D-EXT-064` | [Perkovec/Vuxel](https://github.com/Perkovec/Vuxel) | voxel 制作の別 UI を比較する候補。 | 更新、license、format を再確認するまで保留。 |
| `3D-EXT-065` | [pulkitgarg784/Voksel](https://github.com/pulkitgarg784/Voksel) | low-poly model と level whitebox の簡易制作を比較できる。 | 試作向けで、CAS の保存・検品・export 契約が不足する。 |
| `3D-EXT-066` | [enkisoftware/voxel-models](https://github.com/enkisoftware/voxel-models) | 無償 voxel model を import / convert / attribution 付きで扱う fixture 候補になる。 | CC BY 4.0 の表示条件を満たす必要があり、製品同梱 fixture には個別判断が必要。 |
| `3D-EXT-067` | [Ansimuz/pixel-model-maker](https://github.com/Ansimuz/pixel-model-maker) | pixel asset を簡易 3D 化する流れを比較できる。 | 対応形式、更新、license を再調査するまで保留。 |
| `3D-EXT-068` | [dgud/wings](https://github.com/dgud/wings) | polygon model の基本操作を比較できる。 | desktop modeler 全体を CAS に持ち込む価値は低い。 |
| `3D-EXT-069` | [FreeCAD/FreeCAD](https://github.com/FreeCAD/FreeCAD) | 寸法、constraint、parametric history の考え方を学べる。 | 工業 CAD とゲーム asset editor では目的が異なる。限定的な recipe だけを参考にする。 |
| `3D-EXT-070` | [huxingyi/dust3d](https://github.com/huxingyi/dust3d) | sketch から low-poly mesh を作る操作を比較できる。 | desktop 実装で、更新状況と出力品質を再確認する。 |
| `3D-EXT-071` | [Bforartists/Bforartists](https://github.com/Bforartists/Bforartists) | Blender の UI を整理し直す考え方が、非専門家向け画面の比較になる。 | Blender fork 全体を採用しない。UI 比較のみ。 |
| `3D-EXT-072` | [xiangechen/chili3d](https://github.com/xiangechen/chili3d) | browser CAD の scene、command、property、file 操作を比較できる。 | ゲーム asset より CAD 寄り。採用前に browser 負荷と license を再確認する。 |
| `3D-EXT-073` | [zg3z/awesomebump](https://github.com/zg3z/awesomebump) | 画像から normal 等を作る古典的処理を比較できる。 | 旧 URL や fork が混在し、保守状況を再確認する。Material Maker 等を先に見る。 |
| `3D-EXT-075` | [godotengine/godot-blender-exporter](https://github.com/godotengine/godot-blender-exporter) | Blender→Godot の過去の変換上の注意を調べる資料になる。 | 現在の Godot import 手順と差がある可能性が高い。現行版の公式手順を優先する。 |

## 5. 外部ツール・ゲームエンジンを読む目的

次のリポジトリは CAS へ組み込む部品ではなく、CAS が書き出したファイルを実際に持ち込めるかを確認する対象である。評価は `C / CONDITIONAL` とする。

| GitHub | CAS で確認すること |
|---|---|
| [godotengine/godot](https://github.com/godotengine/godot) | PNG、atlas、GLB、animation、origin、collision、import notes の実ツール検証 |
| [4ian/GDevelop](https://github.com/4ian/GDevelop) | 非エンジニア向け 2D / 3D 配置と asset import の分かりやすさ |
| [defold/defold](https://github.com/defold/defold) | atlas、sprite、animation、resource naming の持ち込み条件 |
| [castle-engine/castle-engine](https://github.com/castle-engine/castle-engine) | glTF と game metadata の互換性比較 |
| [WickedEngine/WickedEngine](https://github.com/turanszkij/WickedEngine) | 高度な 3D rendering と asset inspection の比較 |
| [o3de/o3de](https://github.com/o3de/o3de) | 大規模 engine の asset pipeline と validation の比較 |
| [u3d-community/U3D](https://github.com/u3d-community/U3D) | 現在の project 状態を確認した上で、軽量 engine の import 比較 |
| [Miziziziziz/MizGodotTools](https://github.com/Miziziziziz/MizGodotTools) | Godot で使う 2D shadow、疑似 3D、VFX、IK の実例 |

`verified` と記録するには、対象バージョンを固定し、CAS の実ファイルをそのツールで読み込み、見た目、座標、animation、metadata、再現手順を証拠として保存する。

## 6. 追加機能案への変換表

### 6.1 2D

| 機能案 ID | 追加機能案 | 主な参照 ID | 実装前の条件 |
|---|---|---|---|
| `IDEA-2D-01` | 生成、修正、animation、履歴、比較を分けた「制作コックピット」 | `2D-EXT-001`, `2D-EXT-004`, `2D-EXT-005` | 既存の正本、派生物、自動保存、外部 AI 境界を変えない。 |
| `IDEA-2D-02` | スマホでも使える indexed palette / pixel editing mode | `2D-EXT-004`, `2D-EXT-014`〜`017` | iPhone の touch、拡大、Undo、保存、性能を実機確認する。 |
| `IDEA-2D-03` | SVG を画面操作と安全な source 表示で編集する vector mode | `2D-EXT-002`, `2D-EXT-003`, `2D-EXT-012` | active SVG を拒否する既存安全契約を維持する。 |
| `IDEA-2D-04` | tileset / level / entity を一緒に検品して対象別 JSON を出す | `2D-EXT-007`, `2D-EXT-008`, `2D-EXT-024` | CAS の正本と外部形式を分け、loss を理由付きで示す。 |
| `IDEA-2D-05` | 圧縮前後を比較し、容量・見た目・設定を記録する export optimizer | `2D-EXT-025` | 原本を残し、派生出力として生成し、品質低下を隠さない。 |
| `IDEA-2D-06` | 作者、license、attribution、生成元を素材と一緒に保存する | `2D-EXT-009`, `2D-EXT-026`, `2D-EXT-039` | ADR-0013 の provenance 境界と整合させる。 |
| `IDEA-2D-07` | 外部 2D animation 形式の read-only inspector と import notes | `2D-EXT-018`〜`023` | 完全互換を名乗らず、失う情報がある出力を黙って作らない。 |

### 6.2 3D

| 機能案 ID | 追加機能案 | 主な参照 ID | 実装前の条件 |
|---|---|---|---|
| `IDEA-3D-01` | `Import → Inspect → Optimize → Compare → Export` の非破壊 pipeline | `3D-EXT-003`〜`005`, `3D-EXT-016`, `3D-EXT-047`〜`049` | 2D Pro Gate 承認後。原本 GLB を上書きしない。 |
| `IDEA-3D-02` | model や API を差し替えられる外部 image-to-3D connector | `3D-EXT-002`, `3D-EXT-012`〜`014`, `3D-EXT-024`〜`032` | 外部送信の同意、費用、秘密情報、取消、失敗、license を provider ごとに分ける。 |
| `IDEA-3D-03` | spec、段階別 build、固定 view、比較画像、合否記録を持つ code-to-3D 制作 | `3D-EXT-001`, `3D-EXT-006`, `3D-EXT-038`〜`040` | TypeScript model と GLB model を別の成果物として定義する。 |
| `IDEA-3D-04` | PBR map 一式の作成、node recipe、3D preview、ZIP 出力 | `3D-EXT-008`, `3D-EXT-010`, `3D-EXT-021`〜`023`, `3D-EXT-061`〜`062` | map の意味、色空間、解像度、外部 API、生成物の権利を記録する。 |
| `IDEA-3D-05` | 検品済み GLB を外部へ送り、rigged GLB を戻して差分検査する | `3D-EXT-011`, `3D-EXT-033`〜`037`, `3D-EXT-059`〜`060` | skeleton、weight、animation、bone naming、再配布条件を再検査する。 |
| `IDEA-3D-06` | voxel / standee / simple puff を画像から作る軽量 3D mode | `3D-EXT-017`〜`020`, `3D-EXT-041`, `3D-EXT-063`〜`067` | 通常 mesh、voxel、2.5D standee の形式と検品を分ける。 |
| `IDEA-3D-07` | city / terrain / captured world を単体 asset とは別に扱う world mode | `3D-EXT-007`, `3D-EXT-042`〜`046` | GLB mesh、CityGML、point cloud、Gaussian splat を同じ形式として扱わない。 |

## 7. URL の訂正と、現時点で参照しないもの

AI は無効 URL や用途違いを候補として再登録しない。

| 共有された URL / 名称 | 正しい扱い |
|---|---|
| `https://github.com/slate/slate` | ピクセルエディタではなく IRC client。`https://github.com/mitchcurtis/slate` を使う。 |
| `https://github.com/PixieEditor/PixieEditor` | 無効。`https://github.com/PixiEditor/PixiEditor` を使う。 |
| `https://github.com/MichaelMCE/GodSVG` | 無効。`https://github.com/MewPurPur/GodSVG` を使う。 |
| `https://github.com/Ogmo-Editor-3/OgmoEditor3` | 無効。`https://github.com/Ogmo-Editor-3/OgmoEditor3-CE` を使う。 |
| `https://github.com/CesiumGS/gltfpack` | 独立 repo はない。`gltfpack` は `https://github.com/zeux/meshoptimizer` に含まれる。 |
| `https://github.com/atteneder/gltf-transform` | 無効。`https://github.com/donmccurdy/glTF-Transform` を使う。 |
| `https://github.com/gam-icons/game-icons` | 無効。`https://github.com/game-icons/icons` を使う。 |
| `https://github.com/TiledMapEditor/TiledMapEditor` | 有効な対象 repo を確認できない。Tiled は `https://github.com/mapeditor/tiled`。 |
| `https://github.com/smearfx/smearfx` | 有効な repo を確認できない。コード参照候補から外す。 |
| `https://github.com/PrettyPolyDev/PrettyPoly` | 有効な repo を確認できない。コード参照候補から外す。 |
| `https://github.com/UkoeHB/gamedev-free-assets` | repo URL は無効。出所を特定できるまで自動探索元にしない。 |
| `https://github.com/luxonauta/pixly` | 有効な repo を確認できない。コード参照候補から外す。 |
| `https://github.com/HoloPart` | repo URL ではない。`https://github.com/VAST-AI-Research/HoloPart` を使う。 |
| `https://github.com/JeffreyXiang/TRELLIS` | 現在は無効。`https://github.com/microsoft/TRELLIS` を使う。 |
| `https://github.com/CaramelFur/NormalPainter` | 有効な repo を確認できない。正式な移転先を特定できるまで参照候補から外す。 |
| `https://github.com/facebookresearch/sam3` | SAM 3D ではなく、画像・動画の segmentation / tracking。3D は `sam-3d-objects` と `sam-3d-body` を別に扱う。 |
| `https://github.com/facebookresearch/3detr` | 3D generation ではなく point cloud object detection。 |
| `https://github.com/nobu-h-o/PixelArt` | 学習用の小規模 demo で明確な license も確認できず、他候補を上回る独自価値を確認できないため、本表の機能候補には残さない。 |

非 GitHub の `sorceress.games`、共有された X 投稿、`pixelover.io`、GrafX2 の GitLab、Blender Projects の Rigify、LDtk integration docs は、本書の GitHub repo 評価には含めない。ただし競合比較、公式手順、外部連携調査では必要に応じて別途参照する。

## 8. 継続探索用リスト

次はコード採用候補ではなく、新しい候補を探す入口である。リストや Topic 自体の説明を根拠に採用せず、見つけた各 repo を本書の評価手順で個別確認する。

- [substain/tools-for-gamedev](https://github.com/substain/tools-for-gamedev)
- [calinou/awesome-gamedev](https://github.com/calinou/awesome-gamedev)
- [agmmnn/awesome-blender](https://github.com/agmmnn/awesome-blender)
- [DrSensor/awesome-opensource-voxel](https://github.com/DrSensor/awesome-opensource-voxel)
- [ellisonleao/magictools](https://github.com/ellisonleao/magictools)
- [stevinz/awesome-game-engine-dev](https://github.com/stevinz/awesome-game-engine-dev)
- [FronkonGames/Awesome-Gamedev](https://github.com/FronkonGames/Awesome-Gamedev)
- [teamgravitydev/gamedev-free-resources](https://github.com/teamgravitydev/gamedev-free-resources)
- [kavex/gamedev-resources](https://github.com/kavex/gamedev-resources)
- [devanshutak25/3d-resources](https://github.com/devanshutak25/3d-resources)
- [GitHub Pixel Art Tools collection](https://github.com/collections/pixel-art-tools)
- [GitHub Topics: game-assets](https://github.com/topics/game-assets)
- [GitHub Topics: image-to-3d](https://github.com/topics/image-to-3d)
- [GitHub Topics: voxel-editors](https://github.com/topics/voxel-editors)
- [GitHub Topics: 2d-animation](https://github.com/topics/2d-animation)
- [GitHub Topics: 3d-generation](https://github.com/topics/3d-generation)
- [GitHub Topics: pixel-art](https://github.com/topics/pixel-art)
- [GitHub Topics: pbr-materials](https://github.com/topics/pbr-materials)

## 9. AI への参照手順

外部機能に関係する設計、計画、実装を依頼された AI は、次の順で本書を使う。

1. 依頼が 2D か 3D かを分ける。3D は 2D Pro Gate の人間承認を最初に確認する。
2. `IDEA-*` から関係する追加機能案を探す。
3. 参照 ID の A を最初に読み、B で比較し、必要な場合だけ C を読む。
4. 公式 repo の最新 README、LICENSE、model card、利用規約を Web で再確認する。
5. 「参照」「外部 connector 候補」「dependency 候補」「採用」を分けて記録する。
6. 採用する場合は、固定 commit / release、license、商用条件、入力、出力、端末負荷、失敗時の扱い、代替候補を Pull Request に残す。

本書に「有用」と書かれていても、既存仕様、ADR、保存契約、書き出し契約、Gate より優先してはいけない。
