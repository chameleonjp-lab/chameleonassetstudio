# 外部 GitHub 追加調査 — PULSEDRIVE / let-bullet-fly / Modly

作成日: 2026-07-26  
対象: `chameleonjp-lab/chameleonassetstudio`  
状態: reference only / implementation not approved  
関連: `docs/future/EXTERNAL_GITHUB_REFERENCE_CATALOG.md`  

## 1. 結論

3件とも記録する価値がある。ただし、CAS への有用性とコードを利用できるかは分けて判断する。

| 対象 | ゲーム制作への有用性 | CAS への有用性 | 判断 |
|---|---|---|---|
| [lightningpixel/modly](https://github.com/lightningpixel/modly) | A / HIGH | A / HIGH | 3D の生成、検品、軽量化、拡張、AI 操作の設計を一つの製品で確認できる。CAS の将来 3D 設計で優先して読む。 |
| [digi-the-robot/PULSEDRIVE](https://github.com/digi-the-robot/PULSEDRIVE) | A / HIGH | B / MEDIUM | 音声を先に解析し、時間に同期した 3D 世界を決定的に作る構成が強い。CAS では重い解析の分離、決定的 preview、描画負荷を抑える実装を参照する。 |
| [Wh1tZz/let-bullet-fly](https://github.com/Wh1tZz/let-bullet-fly) | B / MEDIUM | C / CONDITIONAL | 2D 物理パズル、部位別の人形、画像の透明範囲測定は参考になる。ライセンス不明、巨大な単一 HTML、ソース内コメントの文字化けによりコード利用候補にはしない。 |

調査時点で固定した commit:

- Modly: `b771e29265887f52e714bdda232579e53ae29264`
- PULSEDRIVE: `6f8682fc4aff247d3bdf78dafce0e668bc77df4f`
- let-bullet-fly: `c7102b0e5e20c2f02e7fda0bceb3773f459e8786`

## 2. Modly

### 2.1 何が有用か

Modly は、画像から 3D mesh を作るローカル desktop application である。Windows、Linux、Apple Silicon macOS を対象とし、Electron の画面、Python backend、ローカル GPU 上の生成 model を組み合わせている。

CAS に直接役立つ点は、生成 model そのものよりも、その前後を扱う製品構造にある。

1. **外部拡張を manifest で定義する**
   - 拡張 repository に `manifest.json` を置き、model、node、入力、出力、設定項目、model download 先を宣言する。
   - 公式 Hunyuan3D Mini 拡張では、生成 node、品質、mesh resolution、guidance、seed が schema として記録されている。
   - CAS の install-on-demand module、provider manifest、設定画面の比較対象になる。

2. **拡張機能の導入を途中状態から守る**
   - extension id に path separator、絶対 path、`.`、`..` を許さない。
   - staging、backup、incomplete marker を分け、同一 volume の rename で切り替える前提を持つ。
   - CAS の extension 導入、取消、失敗復旧、path traversal 防止の実装比較に使える。

3. **成果物を一覧、分類、検品する**
   - `Workflows` と `Exports` の限定 root だけを走査する。
   - GLB / glTF、他 mesh、motion、manifest、text を分類し、開けるものと一覧だけのものを区別する。
   - source、manifest、artifact id、version id、provenance、warning を一つの entry にまとめる。
   - 一覧で重い 3D viewer を全件起動せず、選択した GLB / glTF だけを 3D preview へ渡す設計の参考になる。

4. **mesh 軽量化を派生ファイルとして出す**
   - face 数を指定した decimation、smoothing、transform bake を扱う。
   - texture 付き mesh では UV、normal、topology を保つ設定を明示している。
   - 結果は `_opt<faces>.glb`、`_smooth<iterations>.glb`、`_xf_<id>.glb` として別 file に書き出す。
   - CAS の `F-3D-10` mesh simplification、`F-3D-12` before / after comparison を具体化するときの比較対象になる。

5. **AI agent 用の機械可読な操作面がある**
   - `health`、`model`、`workflow-run`、`capability`、`process-run` を正式な操作として分ける。
   - JSON を stdout、任意の進捗を stderr に出す。
   - 長い処理に run id、status、cancel、export path、再開用 command を持たせる。
   - 旧 API と実験用 helper を正式な操作から分ける。
   - CAS を AI が操作する将来を考える際、画面操作だけに依存しない contract の参考になる。

### 2.2 CAS へ持ち込む候補

- 外部 3D 生成 provider を、CAS 本体へ model を埋め込まず呼び出す契約。
- `health → capability確認 → run開始 → status → cancel / export` の長時間処理契約。
- provider / model / node / parameter schema を分けた manifest。
- 生成物、元画像、workflow、model、seed、version をつなぐ provenance。
- 一覧は軽く、選択時だけ 3D viewer を起動する Asset Library。
- mesh 軽量化を元 model とは別の候補として保存し、前後比較後に採用する流れ。
- staging、backup、incomplete marker を使う拡張導入の原子性。

### 2.3 そのまま採用しない理由

- Electron、Python、GPU、複数の重い 3D dependency を前提とする。現行 browser 版 CAS や iPhone へ直接入れない。
- Modly の path resolver は absolute path の入力も受け入れる箇所がある。CAS では利用者が明示的に選んだ file、project root、許可済み provider workspace のいずれかへ限定する。
- optimize 結果を workspace 内へ書き戻すだけでは、CAS が求める Source の verbatim 保持、候補間の関係、採用履歴、比較 evidence が不足する。CAS 側の既存契約を優先する。
- root `LICENSE` は冒頭で MIT と書かれているが、末尾に app UI または documentation での credit を追加条件として記載している。標準 MIT と同一だと決めつけず、採用時に法的条件を再確認する。
- repository code の条件と、Hunyuan3D、Trellis、Hugging Face model weight、生成物、extension の条件は別に確認する。
- Modly の機能を丸ごと複製せず、CAS の「生成より検品と game-ready 化を重視する」方針を維持する。

## 3. PULSEDRIVE

### 3.1 ゲーム制作で有用な点

PULSEDRIVE は、利用者が読み込んだ音声から、レース用の track、起伏、曲がり、配置物、色を作る browser 3D game である。

1. **再生前に曲全体を解析する**
   - audio file を PCM へ decode し、Web Worker で FFT、band energy、spectral flux、onset、tempo、section、palette を計算する。
   - gameplay 中に現在時刻だけを読む方式ではなく、曲全体の `SongMap` を先に作る。
   - 読み込み、decode、解析の段階と進捗を分け、worker error 時は処理を終了して理由を返す。

2. **距離ではなく曲の時間を正本にする**
   - track の frame `i` を `t = i / 60` と対応させる。
   - 音符、player、track geometry が同じ時間を参照するため、audio と配置がずれにくい。
   - gameplay 中の物理積分ではなく、事前に作った時間軸上の geometry を進む。

3. **同じ入力から同じ世界を作る**
   - 曲の長さ、tempo、onset から seed を作る。
   - 同じ曲なら同じ track と配置になる。
   - 見た目の試験、再現、共有、難易度調整に向く。

4. **描画負荷を構造で抑える**
   - road を一つの ribbon mesh とし、lane や発光を shader で描く。
   - collectible と hazard は instanced mesh へまとめる。
   - block の解決状態は instance matrix を作り直さず、attribute の float 一つを更新する。
   - Low / Medium / High / Ultra で pixel ratio、bloom、particle、star、raymarch step を分ける。

5. **ゲーム上の意味を色だけに頼らない**
   - 取得物は明るい octahedron、危険物は暗い jagged silhouette とする。
   - 曲から palette が変わっても、形で役割を区別できる。
   - overdrive は取得範囲を広げるが、危険物への当たり範囲も広げる。単なる無料 bonus にせず、使用時点を判断させる。

### 3.2 CAS で参照する点

- 重い解析を worker へ出し、進捗、成功、失敗を明示する処理枠。
- 外部入力を一度、意味のある中間 data へ変換し、その中間 data だけから preview を再生成する構造。
- 時刻、seed、quality、camera を固定した決定的 3D preview fixture。
- 多数の同種 object を instancing し、一覧や preview の draw call を抑える方法。
- 端末別に描画設定を変えられる quality preset。
- 色が変わっても意味が失われない silhouette、outline、label の組み合わせ。

CAS の中心機能として audio-reactive game を作るのではない。procedural preview、effect preview、animation stress test、性能検証の参考に限定する。

### 3.3 境界・注意

- README は desktop-first と明記し、touch controls は未実装である。iPhone 操作の参考にはしない。
- Three.js と Vite を使用する。CAS の dependency 採用とは別判断にする。
- root `LICENSE` を確認できなかった。コードの copy、改変、再配布は license が確認できるまで行わない。
- package scripts は build / preview が中心で、公開された automated test 契約を確認できない。品質主張は CAS 側の test で独立検証する。
- 曲の解析結果や codec 対応は browser、sample rate、入力 file に依存する。固定 fixture と期待値を別途用意する。

## 4. let-bullet-fly

### 4.1 ゲーム制作で有用な点

この repository は、Matter.js を使った 2D physics puzzle を単一 `index.html` と画像・音声素材で構成している。

- level を platform、wall、enemy、prop、validation の data object で定義する。
- barrel、box、stone、explosive、swing hammer など、prop 種別ごとに density、friction、air resistance、restitution、velocity cap を分ける。
- physics substep、bullet lifetime、bounce count、slow 判定、linear / angular velocity cap を持つ。
- enemy を head、torso、arm、leg の画像と複数 physics body / constraint で構成し、見た目と当たりを部位単位で対応させる。
- rope segment、cuttable rope、pendulum、explosive chain reaction、ricochet など、少ない操作で結果が連鎖する puzzle を作っている。
- PNG の alpha を走査して内容 bounding box を測る処理と、白背景を透明へ変換する処理がある。
- 実音声素材が読めない場合に Web Audio API の合成音へ退避する。
- 音声素材の用途と出所を `assets/SOUND_CREDITS.md` に分けて記録している。

### 4.2 CAS で参照する点

- Part、Layer、Anchor、Collider を使った 2D 部位 asset の外部検証例。
- 画像の透明範囲を測り、余白、見た目の中心、bounds を inspection に表示する方法。
- 同じ画像部品を visual と physics body の両方へ対応付ける fixture。
- collider と見た目がずれた場合を検出する read-only test scene。
- 種類別の physics profile を asset metadata へ直接保存せず、engine 側 preset として分ける考え方。
- 素材の file、用途、出所、license をまとめる attribution table。

CAS に Matter.js physics editor を内蔵する根拠にはしない。CAS は game engine を作らず、anchor / collider / part が外部で正しく使えるかを確認する最小 fixture または import notes の参考にする。

### 4.3 境界・注意

- root `LICENSE` を確認できない。コードと画像の利用、改変、再配布は行わない。
- README、package manifest、test 手順を確認できない。
- 大部分が一つの `index.html` に入り、機能境界が弱い。CAS の module、storage、history、validation の構造へ移植しない。
- source comment に文字化けが多く、意図を誤読する危険がある。
- Matter.js を CDN から読み込む。offline、version 固定、供給元障害、integrity を CAS の条件で再設計する必要がある。
- runtime で白背景を透明へ変換する処理は、原本を正本として保持する CAS の image import contract へ直接使わない。結果は preview または派生候補に限定する。
- SOUND_CREDITS の記載だけで素材条件を確定せず、元配布元の規約と file 単位の権利を再確認する。

## 5. 既存カタログへ統合するときの候補 ID

既存 `EXTERNAL_GITHUB_REFERENCE_CATALOG.md` の current main は、2D が `2D-EXT-040`、3D が `3D-EXT-079` まで使用している。本書を統合するときは、main の最新状態で重複を再確認してから次を候補とする。

| 候補 ID | 評価 | 対象 | 要点 |
|---|---|---|---|
| `3D-EXT-080` | A / HIGH | Modly | local image-to-3D、extension manifest、安全な導入、Asset Library、provenance、mesh optimize、JSON-first agent contract。 |
| `3D-EXT-081` | B / MEDIUM | PULSEDRIVE | 事前解析した中間 data、時間同期、決定的 procedural 3D、worker、instancing、quality tier。 |
| `2D-EXT-041` | C / CONDITIONAL | let-bullet-fly | data-driven 2D physics、multipart ragdoll、alpha bounds、attribution。license と保守性の制約が大きい。 |

## 6. 既存機能案・仕様への反映

### 6.1 Modly で強化する既存項目

- `IDEA-3D-01 Import → Inspect → Optimize → Compare → Export`
- `IDEA-3D-02 外部 image-to-3D connector`
- `IDEA-3D-08 2D card + live 3D inspector + provenance`
- `F-3D-01 GLB / glTF safe loading`
- `F-3D-03 3D viewport & inspection`
- `F-3D-10 mesh simplification`
- `F-3D-12 before / after comparison`
- `F-MOD-01`〜`F-MOD-04` と `F-CORE-09` / `F-CORE-10`

追加候補:

- **`IDEA-3D-10` Local provider / agent bridge**  
  CAS の外で動く生成・変換 application と、`health / capability / start / status / cancel / export` の機械可読 contract で接続する。provider が停止していても CAS の project を開ける。生成途中を成功扱いせず、run id、入力 hash、provider version、model、seed、出力 hash、失敗理由を provenance に残す。

### 6.2 PULSEDRIVE で強化する既存項目

- `IDEA-2D-09` / `IDEA-3D-09` の決定的 visual-performance gate。
- `F-PLT-03` heavy work offload。
- `F-PLT-04` performance measurement & regression。
- `F-3D-03` viewport quality preset。

追加の独立機能にはせず、固定 input から固定 timeline data を作り、同じ frame を再現する test fixture の設計例として使う。

### 6.3 let-bullet-fly で強化する既存項目

- `F-2D-04` Layer & Part。
- `F-2D-09` origin / anchor。
- `F-2D-10` collider authoring。
- `F-2D-15` engine fit inspection。

追加候補:

- **`IDEA-2D-10` Minimal engine-fit fixture**  
  CAS 自身へ physics engine を入れず、part image、origin、anchor、collider、frame を読み込む小さな外部 fixture と import notes を生成する。目的は遊べる game の生成ではなく、見た目と判定のずれ、未解決参照、反転後の位置、frame override を確認すること。対象 engine ごとに verified 記録を分ける。

## 7. 採用優先順位

1. **Modly を 3D 設計の必読参考にする。** ただし model や Electron / Python 構成を採用するのではなく、provider contract、Asset Library、extension safety、provenance、mesh candidate の比較に使う。
2. **PULSEDRIVE を browser game と 3D preview の性能・決定性の参考にする。** CAS 本体の機能候補ではなく、worker、timeline、instancing、quality tier の比較対象にする。
3. **let-bullet-fly は game mechanic と検証 fixture の資料に限定する。** license が確認できないため、コード利用候補からは外す。

本書は参照記録であり、dependency の追加、3D 実装、外部 model の導入、license 承認、Ready 化、merge を承認しない。
