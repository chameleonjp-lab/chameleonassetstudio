# Asset Creation and Export Strategy

最終更新日: 2026-07-07  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
文書種別: アセット作成・編集・修正・検品・書き出し方針  
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/future/POST_PHASE17_REQUIREMENTS.md`, `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`, `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md`  
関連文書: `docs/future/PRODUCT_DIRECTION_2D_TO_3D.md`, `docs/future/DECISION_LOG.md`

---

> **現状:** この文書は将来方針を定義する docs であり、実装済み機能一覧ではない。この PR ではアプリ本体、schema、`.casproj`、export ZIP、dependencies、GitHub Actions は変更しない。

## 1. 目的

この文書は、Chameleon Asset Studio を「画像から変換するだけのツール」と誤解しないために、アセット作成から外部ツールへ持ち込める書き出しまでの方針を定義する。

Chameleon Asset Studio の長期的な役割は、次の通りである。

> 画像、空キャンバス、テンプレート、図形、パーツ、既存素材、将来の 3D ファイルを元に、ゲーム用アセットを作成・編集・修正・検品し、主要なゲーム制作ツールへ持ち込めるファイル一式として書き出す制作ツール。

この方針では、画像取り込みは入口の 1 つにすぎない。新規作成、既存素材の修正、テンプレートからの作成、外部ツール向け書き出しも同じ重要度で扱う。

---

## 2. 変更経緯

### 2.1 以前の見え方

既存 docs では、Chameleon Asset Studio は主に「ブラウザゲームで使う 2D アセットを作成・編集・ゲーム用データ化する Web ツール」と説明されている。これは正しいが、実装者が浅く読むと「画像を取り込んで JSON に変換するツール」と誤解する可能性がある。

### 2.2 今回の判断

今後の品質目標を上げるには、画像取り込みだけでは足りない。ブラウザゲーム以外の主要なゲーム開発環境でも使うには、次を明確にする。

- 空キャンバス、テンプレート、図形、パーツ、既存アセットからも作成できる方向に広げる。
- 編集だけでなく、修正、検品、再編集、書き出しまでを一連の制作フローとして扱う。
- Unity、Godot、RPG Maker、Blender などとの直接連携を急がず、まず持ち込み可能なファイルと import notes を出す。
- 「完全対応」という言葉は、検証前に使わない。
- 2D 完成を優先し、3D は別画面として後から広げる。

### 2.3 この文書が残す決定

この文書は、上記の判断を Claude Code、Codex、Opus 4.8、人間レビューの間で共有するための正本である。実装者は、この文書を理由に既存 Phase 1〜17 の完了条件を勝手に広げてはいけない。実装へ進む場合は、`docs/IMPLEMENTATION_PLAN.md` または `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md` を更新してから行う。

---

## 3. 既存 docs から引き継ぐ要件

この文書は、既存 docs を置き換えない。次の要件を引き継いだうえで、作成方法と書き出し方針を広げる。

| 既存文書 | 引き継ぐ内容 |
|---|---|
| `README.md` | Chameleon は 2D アセットを作成・編集・ゲーム用データ化する Web ツールである |
| `docs/REQUIREMENTS_SPECIFICATION.md` | 初期版は 2D に集中し、サーバー必須、WebGPU 必須、3D、完全エンジン連携は初期範囲に入れない |
| `docs/REQUIREMENTS_SPECIFICATION.md` | `.casproj`、`asset.json`、PNG / WebP / JSON / ZIP、Sprite Sheet、Atlas、Canvas / PixiJS / Phaser examples を扱う |
| `docs/REQUIREMENTS_SPECIFICATION.md` | 最終完成では Godot / Unity のインポート補助ファイルを生成する |
| `docs/future/POST_PHASE17_REQUIREMENTS.md` | 2D 制作体験、判定編集、アニメーション制作、背景、タイル、ギミック、effect、書き出し品質を伸ばす |
| `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md` | Phase 19〜21 は 2D 制作体験、書き出し品質、effect を優先し、3D は Phase 22 以降に調査から始める |
| `docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md` | 3D は生成 AI から始めず、GLB / glTF の読み込み、表示、検品、軽量化、メタデータ、書き出しから始める |
| `docs/future/FABLELESS_DEVELOPMENT_GUIDE.md` | Codex が通常の主実装、Opus 4.8 が設計レビュー、判断が割れる場合は人間確認に戻す |
| `REVIEW.md` | Opus 4.8 は format / lint より、互換性破壊、設計破壊、docs 矛盾を重視する |

この表にある内容は、実装時に削ってはいけない最低ラインである。

---

## 4. 用語

### 4.1 アセット

この文書でいうアセットは、単なる画像ファイルではない。ゲームに組み込むための素材一式である。

2D アセットの例:

- 見た目の画像。
- レイヤー、パーツ、フレーム。
- 原点、アンカー、当たり判定。
- アニメーション設定。
- タグ、属性、ゲーム側で読むメタデータ。
- 書き出し用画像、JSON、README、サンプル、import notes。

3D アセットの例:

- GLB / glTF / OBJ などのモデルファイル。
- bounds、向き、スケール、足元基準。
- 3D アンカー、3D 当たり判定。
- 検品レポート。
- metadata JSON。
- engine import notes。

### 4.2 作成

作成とは、画像を取り込むことだけではない。空の状態から作る、テンプレートを使う、既存素材を直す、複数素材をまとめる、sprite sheet や tileset を整理し直すことも含む。

### 4.3 外部ツール連携

外部ツール連携には、次の段階がある。

| 段階 | 意味 |
|---|---|
| import notes | 人間が外部ツールへ持ち込むための説明を出す |
| file preset | 外部ツールに持ち込みやすい画像、JSON、ZIP 構成を出す |
| verified preset | 手動インポートで確認済みの出力プリセット |
| plugin / addon | Unity package、Godot plugin、Blender addon などを作る |
| direct API integration | 外部ツールやクラウドへ直接接続する |

初期方針では、`import notes` と `file preset` を優先する。`plugin / addon` と `direct API integration` は後回しにする。

---

## 5. 作成方法の方針

Chameleon Asset Studio は、次の入口を扱える方向に広げる。

| 作成方法 | 目的 | 初期扱い |
|---|---|---|
| 空キャンバスから作る | UI アイコン、簡単な図形素材、仮素材を作る | 2D 後続候補 |
| テンプレートから作る | キャラ、アイテム、タイル、effect などをすぐ始める | 2D 後続候補 |
| 画像を取り込む | 既存画像や AI 生成画像をゲーム用に整える | 既存 MVP 中心 |
| 図形・パーツを組み合わせる | 判定、ガイド、簡易素材、UI パーツを作る | 既存の図形レイヤーを拡張 |
| 既存アセットを複製・修正する | 色違い、向き違い、調整版を作る | Phase 19 以降で強化 |
| sprite sheet / tileset を取り込む | 既存素材を再整理する | 後続候補 |
| `.casproj` を開いて再編集する | 作業を継続する | 既存重要機能 |
| GLB / glTF を読み込む | 3D 素材を検品して整える | Phase 22 以降 |

実装者は、「作成 = 画像取り込み」と決めつけてはいけない。

---

## 6. 機能分類

今後の計画では、機能を次の分類で整理する。

| 区分 | 内容 |
|---|---|
| Create | 空キャンバス、テンプレート、図形、パーツ、複製から作る |
| Import | PNG / JPG / WebP、将来の SVG、sprite sheet、tileset、GLB / glTF などを取り込む |
| Edit | 移動、拡大縮小、回転、トリミング、透過、色変更、反転、整列、スナップ、グリッド |
| Repair | 欠けた画像、透明、サイズ、命名、フレーム、判定、アンカーの不整合を直す |
| Game Data | 原点、アンカー、当たり判定、タグ、属性、アニメーション、3D metadata を付ける |
| Validate / Inspect | schema、画像サイズ、ファイルサイズ、命名、bounds、ポリゴン数などを確認する |
| Export | 汎用形式、engine preset、import notes、README、ZIP を出す |
| Reopen / Migrate | `.casproj` を再読み込みし、古い形式を安全に扱う |

この分類は、2D と 3D の両方に使う。ただし、2D と 3D の編集画面は同じにしない。

---

## 7. 2D で作成可能にするアセット種別

最終的な 2D Studio では、次を扱う。

| 種別 | 主な作成方法 | 主なゲーム用情報 | 主な出力 |
|---|---|---|---|
| character | 画像、テンプレート、パーツ、複製 | 原点、アンカー、当たり判定、アニメーション、parts | PNG / WebP / Sprite Sheet / Atlas / JSON / ZIP |
| item | 画像、空キャンバス、図形、色違い | pickup 判定、rarity、tags、gameAttributes | PNG / WebP / JSON / ZIP |
| background | 画像、複数レイヤー、ループ確認 | parallaxSpeed、loopX、loopY、layers | PNG / WebP / metadata / ZIP |
| tile / tileset | grid slicing、空キャンバス、既存 tileset | tileSize、collisionType、visualType、tile metadata | tileset PNG / atlas / JSON / ZIP |
| gimmick | 画像、テンプレート、判定付き素材 | movementPreset、sensor、collider、tags | PNG / JSON / engine notes / ZIP |
| effect | フレーム、透明画像、blend 情報 | duration、fps、anchor、blendMode | Sprite Sheet / animation JSON / ZIP |
| ui / icon | 空キャンバス、図形、画像修正 | state、size、usage、tags | PNG / WebP / optional JSON / ZIP |

`assetType` や schema を変更する場合は、別 PR で docs、schema、migrate、tests を先に設計する。この文書だけを根拠に schema を変えてはいけない。

---

## 8. 入力ファイル方針

### 8.1 2D 入力

| 種類 | 方針 |
|---|---|
| PNG | 最優先。透明を維持する |
| JPG / JPEG | 取り込み対象。透明はない前提で扱う |
| WebP | 取り込み対象。透明対応を維持する |
| SVG | 将来候補。任意コードとして扱わず、画像として読み込む |
| Sprite Sheet | 後続候補。フレーム分割や命名補助を検討する |
| Texture Atlas JSON | 後続候補。形式差が大きいため検証後に扱う |
| Tileset PNG | 後続候補。grid slicing と tile metadata を検討する |
| `.casproj` | Chameleon の再編集用正本として扱う |

### 8.2 3D 入力

| 種類 | 方針 |
|---|---|
| GLB | 3D 初期入力の第一候補 |
| glTF + bin + textures | 3D 初期入力候補 |
| OBJ + MTL + textures | 後続候補 |
| FBX | 初期対象外。仕様、ライセンス、ブラウザ処理が重い |
| `.blend` | 初期対象外。Blender で扱い、Chameleon は export された GLB / glTF を読む |

---

## 9. 出力ファイル方針

### 9.1 2D 出力

| ファイル | 目的 | 初期扱い |
|---|---|---|
| PNG | 最も広く持ち込みやすい画像 | 必須 |
| WebP | Web 向け軽量画像 | 必須 |
| Sprite Sheet PNG | アニメーションやタイルで使う | 必須 |
| Texture Atlas PNG + JSON | Phaser / PixiJS などで使う | 必須 |
| `asset.json` | Chameleon のゲーム用メタデータ | 必須 |
| `animations.json` | 必要に応じたアニメーション分離 | 後続候補 |
| `colliders.json` | 必要に応じた判定分離 | 後続候補 |
| `README.md` | 書き出し物の説明 | 必須 |
| engine import notes | 外部ツールに持ち込む説明 | Phase 16 以降 |
| `.casproj` | 再編集用プロジェクト | 必須 |
| export ZIP | 画像、JSON、README、notes をまとめる | 必須 |

### 9.2 3D 出力

| ファイル | 目的 | 初期扱い |
|---|---|---|
| GLB | 3D モデル本体 | Phase 26 候補 |
| glTF + textures | 開発者向け候補 | 後続候補 |
| `asset3d.json` | 3D metadata | Phase 25/26 候補 |
| inspection report JSON | ファイルサイズ、ポリゴン数、bounds など | Phase 24/26 候補 |
| engine import notes | Three.js / Babylon / Godot / Unity 向け説明 | Phase 26 候補 |
| 3D export ZIP | GLB、metadata、report、README をまとめる | Phase 26 候補 |

---

## 10. Export Preset 方針

外部ツール向けには、最初から完全連携を作らない。まず、`Export Preset` と `import notes` を作る。

| Preset | 最初に出すもの | してはいけない主張 |
|---|---|---|
| Generic Web Game | PNG / WebP / asset.json / README | すべてのゲームエンジンでそのまま動くとは言わない |
| Canvas 2D | sample HTML / loader snippet | 本格 engine 連携とは言わない |
| PixiJS | texture / atlas / sample loader | PixiJS 全機能対応とは言わない |
| Phaser | sprite sheet / atlas / sample HTML | Phaser プロジェクト自動生成とは言わない |
| Unity 2D | PNG / Sprite Sheet / import-notes.md | Unity Prefab 完全生成とは言わない |
| Godot 2D | PNG / Sprite Sheet / import-notes.md | Godot Scene 完全生成とは言わない |
| RPG Maker | version-specific PNG candidate / import-notes.md | バージョン未確認で RPG Maker 対応とは言わない |
| Blender Texture Prep | PNG / WebP / material-notes.md | `.blend` 生成や Blender addon とは言わない |
| Generic 3D | GLB / metadata / report / README | 3D 生成 AI 内蔵とは言わない |
| Unity / Godot 3D | GLB / metadata / import-notes.md | Animator、Prefab、Scene の完全生成とは言わない |

---

## 11. 外部ツール別の扱い

### 11.1 Unity

初期の Unity 連携は、Unity に持ち込める画像、Sprite Sheet、metadata、import notes を出すことに留める。

やること:

- PNG / Sprite Sheet を出す。
- 必要なら atlas / metadata を出す。
- Unity へ手動で import する手順を書く。
- 原点、ピクセル単位、アニメーションの扱いで注意点を書く。

やらないこと:

- Unity package を初期実装に含めない。
- Prefab 完全生成を名乗らない。
- Animator Controller 生成を初期実装に含めない。
- Unity のバージョン別挙動を未検証で断定しない。

### 11.2 Godot

初期の Godot 連携は、画像、Sprite Sheet、metadata、import notes を出すことに留める。

やること:

- PNG / WebP / Sprite Sheet を出す。
- Godot へ手動で import する手順を書く。
- 座標、原点、pixel art 設定、filter 設定の注意を書く。

やらないこと:

- Godot Scene 完全生成を初期実装に含めない。
- Godot plugin を初期実装に含めない。
- Godot のバージョン差を未検証で吸収しようとしない。

### 11.3 RPG Maker

RPG Maker はバージョンごとに素材規則が違う可能性があるため、特に慎重に扱う。

やること:

- RPG Maker 向けは version-specific preset として扱う。
- MV / MZ など対象バージョンを明記する。
- 画像サイズ、並び、ファイル名、配置先を確認してから出す。
- 最初は import-notes.md と PNG candidate に留める。

やらないこと:

- バージョン未指定で「RPG Maker 対応」と言わない。
- プロジェクトファイルを直接書き換えない。
- 未検証の規則でキャラチップ、顔画像、アイコン、タイルセットを生成しない。

### 11.4 Blender

Blender は主に 3D または texture preparation の外部ツールとして扱う。

やること:

- 2D 側では texture / material 用画像を出す。
- 3D 側では Blender から export された GLB / glTF を読む方針にする。
- Blender へ渡す場合は、画像、GLB、metadata、material-notes.md を出す。

やらないこと:

- `.blend` 生成を初期実装に含めない。
- Blender addon を初期実装に含めない。
- Python スクリプト実行をブラウザ本体に混ぜない。

---

## 12. 互換性表現のルール

実装者は、外部ツール向け機能に次のラベルを使う。

| ラベル | 意味 |
|---|---|
| `generic` | 汎用ファイルとして出すだけ |
| `import-notes` | 手動持ち込み手順を説明している |
| `candidate` | 出力候補。まだ手動検証前 |
| `verified` | 対象バージョンで手動持ち込みを確認済み |
| `experimental` | 実験中。仕様変更の可能性がある |
| `unsupported` | 対象外 |

`verified` を付けるには、対象ツール名、バージョン、検証日、検証手順、サンプルファイルを docs に残す。

---

## 13. 2D と 3D の関係

2D と 3D は同じ画面に混ぜない。同じ製品思想、同じ見た目、同じ Home / Project Dashboard を共有してよいが、編集画面は分ける。

共通にしてよいもの:

- Project Dashboard。
- export preset の考え方。
- validation / inspection の考え方。
- README / import notes の考え方。
- Codex + Opus 4.8 レビュー運用。
- デザインのトーン、言葉遣い、ボタンやパネルの基本ルール。

混ぜてはいけないもの:

- 2D の `Layer`、`Frame`、`Animation` の意味を 3D 都合で変える。
- 3D の `bounds`、`unit`、`upAxis`、`forwardAxis` を 2D の pixel 座標へ無理に押し込む。
- 3D preview の重い依存を 2D 初期表示 bundle に入れる。
- 3D 生成 AI を 2D 制作体験に混ぜる。

詳細は `docs/future/PRODUCT_DIRECTION_2D_TO_3D.md` を正本とする。

---

## 14. リポジトリ方針

当面は 1 リポジトリで管理する。今すぐ 2D と 3D のリポジトリを分けない。

分離を検討する条件:

- 3D dependencies が 2D bundle size に明確な悪影響を出す。
- CI が大きく遅くなる。
- 3D 側に Node / Python / GPU / 外部処理が必要になる。
- 2D と 3D の release cadence が分かれる。
- 3D 側のライセンス確認や外部モデル管理が重くなる。
- 3D 側のセキュリティ境界を分ける必要が出る。

分離する場合でも、まずは同一リポジトリ内で feature boundary を作る。突然別リポジトリへ移して、docs、CI、レビュー運用を分断してはいけない。

---

## 15. 実装順の提案

この文書は、公式 Phase 番号を直接変更しない。実装順を変える場合は、別 PR で `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md` を更新する。

推奨される検討順:

1. 2D の既存 Phase 19〜21 を完了させる。
2. 作成方法を増やす前に、`Create / Import / Edit / Repair / Game Data / Validate / Export` の分類で docs を整理する。
3. 新規作成とテンプレートを、小さい PR で設計する。
4. Export Preset の最小仕様を決める。
5. Unity / Godot / RPG Maker / Blender は、まず import-notes から始める。
6. verified preset を名乗る前に、手動 import 検証を行う。
7. 3D は Phase 22 以降に、ライブラリ評価から始める。

---

## 16. Claude Code / Codex 向け注意

実装者は、次を守る。

- この文書を理由に、既存 MVP や v1.0.0 の完了条件を勝手に変更しない。
- 作成方法を増やす場合は、先に docs と UI scope を決める。
- 書き出し形式を増やす場合は、既存 export ZIP を壊さない。
- 外部ツール名を出す場合は、`candidate` / `import-notes` / `verified` を分ける。
- `Unity 完全対応`、`Godot 完全対応`、`RPG Maker 対応`、`Blender 連携` のような強い表現を、未検証で使わない。
- `asset.json`、`.casproj`、export ZIP、座標系、原点、アンカー、当たり判定、リグ、アニメーションに触れる場合は、Opus 4.8 レビューまたは人間確認へ戻す。
- dependencies を追加しない docs 変更 PR では、外部ライブラリ名を採用済みのように書かない。

---

## 17. 禁止事項

- 画像取り込み専用ツールとして設計を狭めない。
- 主要ゲーム開発ツールへの直接連携を、初期段階で必須にしない。
- 未検証の外部ツール互換を名乗らない。
- Unity / Godot / RPG Maker / Blender のプロジェクトファイルを、仕様確認なしに生成しない。
- 3D 都合で 2D の `asset.json`、`.casproj`、export ZIP を壊さない。
- 作成可能ファイルを増やすために、再編集性と Undo / Redo を犠牲にしない。
- 外部ツール向け出力を理由に、元画像や元 GLB を破棄しない。

---

## 18. 未確定事項

次は今後の調査対象であり、この文書では確定しない。

| ID | 論点 |
|---|---|
| UQ-ACE-001 | Unity 2D 向けにどこまで metadata を出すか |
| UQ-ACE-002 | Godot 2D 向けに Scene 生成を将来扱うか |
| UQ-ACE-003 | RPG Maker の対象バージョンを MV / MZ / Unite のどれから始めるか |
| UQ-ACE-004 | RPG Maker 向け画像プリセットのサイズ、並び、ファイル名をどう検証するか |
| UQ-ACE-005 | Blender 向けを texture preparation に留めるか、3D metadata まで扱うか |
| UQ-ACE-006 | SVG を取り込む場合、どの時点で rasterize するか |
| UQ-ACE-007 | Sprite Sheet / Texture Atlas の外部形式をどこまで読み込むか |
| UQ-ACE-008 | Export Preset 管理 UI をいつ作るか |
| UQ-ACE-009 | verified preset の手動検証サンプルをどこに置くか |

---

## 19. 完了条件

この方針に沿う実装を完了扱いにするには、次を満たす。

- docs に作成方法、入力、編集、検品、書き出し、外部ツール向け表現が書かれている。
- 既存 `asset.json` / `.casproj` / export ZIP が壊れていない。
- 作成可能ファイルと export preset の違いが明確である。
- `candidate` と `verified` が混同されていない。
- Unit test がある。
- UI を伴う場合は E2E がある。
- `npm run lint`、`npm run format:check`、`npm run build`、`npm run test` が通る。
- 必要に応じて `npm run e2e` が通る。
