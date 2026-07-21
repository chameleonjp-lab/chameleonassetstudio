# Chameleon Asset Studio App — Competitive Landscape & Value Benchmarks

状態: **draft / concept only / human review required**
最終更新日: 2026-07-21
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
文書種別: 将来コンセプト（競合・OSS 調査・価値ベンチマーク）
入口文書: `docs/future/app/README.md`
調査日: 2026-07-21（GitHub star 数・外部価格は調査時点。star 数は変動する）

---

> この文書は外部事例の観察記録である。掲載する star 数・価格は調査時点の外部公開値で、正確性は各出典に従う。特定ツールの機能同等性・優劣を断定するものではなく、**採用や価格の決定でもない**。

---

## 1. なぜ調査したか

「これまでにない計画」を名乗るには、既にある強い事例を知った上で、どこで差を出すかを言語化する必要がある。ここでは GitHub でスターを集める OSS を、(A) 2D 制作、(B) レベル／タイル、(C) 2D+3D モジュラーの参照、(D) 3D 描画、(E) 3D アセット整備・軽量化、(F) 相互運用（VRM 等）、(G) 拡張機構・外殻 の観点で棚卸しする。

---

## 2. OSS ランドスケープ（GitHub star 数：2026-07-21 時点）

### A. 2D 制作（作る・整える）

| プロジェクト | ★ | 言語 | 位置づけ／学ぶ点 |
|---|---:|---|---|
| [aseprite/aseprite](https://github.com/aseprite/aseprite) | 38,195 | C++ | ネイティブ・軽量・Lua スクリプト拡張。低価格でも圧倒的支持。「焦点が明快で速い」の手本 |
| [KDE/krita](https://github.com/KDE/krita) | 10,072 | C++ | Qt 製ペイント。Python プラグイン機構を持つ |
| [Orama-Interactive/Pixelorama](https://github.com/Orama-Interactive/Pixelorama) | 9,926 | GDScript | Godot 製。拡張 API を持つ OSS ドット絵ツール。Web/デスクトップ両対応 |
| [LibreSprite/LibreSprite](https://github.com/LibreSprite/LibreSprite) | 8,074 | C++ | Aseprite の GPL フォーク |
| [opentoonz/opentoonz](https://github.com/opentoonz/opentoonz) | 7,434 | C++ | 2D アニメ制作。エフェクト・プラグイン |

### B. レベル／タイル

| プロジェクト | ★ | 言語 | 学ぶ点 |
|---|---:|---|---|
| [mapeditor/tiled](https://github.com/mapeditor/tiled) | 12,739 | C++ | 汎用レベルエディタ。プラグイン API と多形式 export。デファクト |
| [deepnight/ldtk](https://github.com/deepnight/ldtk) | 4,125 | Haxe | 現代的で軽量なレベルエディタ。クリーンなデータ形式。"lightweight" を名乗る設計 |

### C. 2D+3D モジュラーの参照（エンジン／プラグイン合成）

| プロジェクト | ★ | 言語 | 学ぶ点 |
|---|---:|---|---|
| [godotengine/godot](https://github.com/godotengine/godot) | 114,396 | C++ | 単一製品で 2D と 3D を両立。GDExtension と AssetLib による拡張。**目的分離 + 拡張**の最大参照 |
| [bevyengine/bevy](https://github.com/bevyengine/bevy) | 47,256 | Rust | plugin を第一級にした構成。「必要な plugin を足して組む」の設計手本 |
| [4ian/GDevelop](https://github.com/4ian/GDevelop) | 24,953 | JS | 2D/3D・拡張マーケットを持つノーコード。extension 配布の運用参照 |
| [raysan5/raylib](https://github.com/raysan5/raylib) | 33,948 | C | 小さく速い土台。ミニマル志向の手本 |
| [ocornut/imgui](https://github.com/ocornut/imgui) | 74,870 | C++ | 依存最小の即時 GUI。ツール系 UI の軽量実装の参照 |

### D. 描画（Edition Runtime 候補の母体）

| プロジェクト | ★ | 言語 | 学ぶ点 |
|---|---:|---|---|
| [mrdoob/three.js](https://github.com/mrdoob/three.js) | 113,875 | JS | 3D 描画の事実標準。3D Edition の描画候補 |
| [pixijs/pixijs](https://github.com/pixijs/pixijs) | 47,829 | TS | 高速 2D レンダラ。2D Edition 描画の候補（現行知見と接続） |
| [phaserjs/phaser](https://github.com/phaserjs/phaser) | 39,996 | JS | 2D ゲームフレーム。preview/検証の参照 |
| [BabylonJS/Babylon.js](https://github.com/BabylonJS/Babylon.js) | 25,832 | TS | WebGPU 対応 3D。3D Edition 描画の候補 |
| [google/filament](https://github.com/google/filament) | 20,270 | C++ | PBR 描画。ネイティブ高品質描画の候補 |
| [playcanvas/engine](https://github.com/playcanvas/engine) | 16,267 | JS | WebGL/WebGPU/glTF ランタイム |

### E. 3D アセット整備・軽量化（3D Edition モジュールの母体）

| プロジェクト | ★ | 言語 | 学ぶ点 |
|---|---:|---|---|
| [assimp/assimp](https://github.com/assimp/assimp) | 13,069 | C++ | 40+ 形式の統一取り込み。**検品前の読み込み**の要 |
| [zeux/meshoptimizer](https://github.com/zeux/meshoptimizer) | 8,130 | C++ | mesh 簡略化・圧縮。3D 軽量化モジュールの核候補 |
| [google/model-viewer](https://github.com/google/model-viewer) | 8,166 | TS | glTF 表示の手軽な標準。inspect UI の参照 |
| [turanszkij/WickedEngine](https://github.com/turanszkij/WickedEngine) | 7,155 | C++ | 現代描画 + VRM 対応 |
| [f3d-app/f3d](https://github.com/f3d-app/f3d) | 4,559 | C++ | ミニマル 3D ビューア。「軽い検品ビューア」の手本 |
| [GPUOpen-Tools/compressonator](https://github.com/GPUOpen-Tools/compressonator) | 1,439 | C++ | テクスチャ・3D 圧縮。軽量化モジュール候補 |

### F. 相互運用（VRM 等）

| プロジェクト | ★ | 言語 | 学ぶ点 |
|---|---:|---|---|
| [pixiv/three-vrm](https://github.com/pixiv/three-vrm) | 2,019 | TS | three.js 上の VRM。VRM Kit モジュールの候補 |
| [saturday06/VRM-Addon-for-Blender](https://github.com/saturday06/VRM-Addon-for-Blender) | 1,669 | Python | VRM 入出力アドオン。相互運用の運用参照 |

### G. 外殻・拡張機構（軽量ネイティブ + install-on-demand の参照）

- **システム WebView + ネイティブコア型（Tauri 系）**: インストーラ 10MB 未満、常駐 30–50MB、冷間起動 0.5 秒未満の報告。Hoppscotch は Electron から移行して 165MB→8MB・メモリ約 70% 減（出典: 4 章）。**「軽量が前提」への直接的な設計材料**。
- **VS Code 拡張マーケット / Blender extensions / Godot AssetLib（beta の Asset Store 含む） / Bevy plugins**: 「必要な機能を後から入れて拡張する」体験の実運用モデル。中央リポジトリ・依存解決・権限・審査の設計を学ぶ。

---

## 3. 拡張機構が本体を超えうる証拠

拡張の力を端的に示す観察がある。ペイントソフト Krita 本体は **10,072★**、一方で単一のサードパーティ拡張 [Acly/krita-ai-diffusion](https://github.com/Acly/krita-ai-diffusion) は **10,354★**。**拡張が本体を上回る関心・価値を集めうる。** これはモジュラー戦略（`APP_MODULAR_ARCHITECTURE.md`）の追い風であると同時に、拡張機構の設計品質（発見性・安全性・権限）が製品の運命を左右することも意味する。本コンセプトはまず**公式モジュール**で機構の質を固め、第三者開放は後段の判断とする。

---

## 4. 差別化の仮説（どこで勝つか）

上の事例は各領域で強い。だが「1 本のアプリで、2D 制作と 3D 整備を、必要な機能だけ入れて、軽量に、検品と互換性の確かさまで通す」ものは横断的に見当たらない。本コンセプトの差別化仮説は次の 3 点。

1. **install-on-demand の目的特化ネイティブ**: エンジン（Godot/Bevy）は汎用で重い。単機能ツール（Aseprite/Tiled/f3d）は焦点が狭い。本コンセプトは「アセット制作〜整備〜検品〜書き出し」に**目的を絞りつつ、機能はモジュールで広げる**中間帯を狙う。
2. **検品と互換性の確かさを商品価値にする**: 「作れる」ではなく「外部エンジンで確実に使える状態か」を、inspection report・import notes・export preset・schema 検証で保証する。ここは現行 Chameleon の最も濃い知見が活きる。
3. **軽さを前提として売る**: 多くのプロツールは多機能ゆえに重い。本コンセプトは「使わない機能の重さを負わせない」を体験の核に据え、`非採用の法則`（Vision 3 章）に真正面から答える。

---

## 5. 価値ベンチマーク（value positioning の根拠）

「月額 2,000 ドル / 買い切り 10,000 ドル級」がどの帯かを、外部公開・調達データ（2026-07 時点）で位置づける。**これらは他社価格の記録であり、本コンセプトの価格でも、他社との同等性の主張でもない。**

| ツール | 外部公開・調達データ（調査時点） | 帯としての含意 |
|---|---|---|
| SideFX Houdini FX | サブスク 年額 ≈ $4,495 / perpetual ≈ $6,995 + 保守 ≈ $2,495/年 | 「月額数千ドル級」サブスク帯の上 |
| SideFX Houdini Core | サブスク 年額 ≈ $1,995 / perpetual ≈ $2,995 | 同帯の中 |
| Adobe Substance 3D Painter | perpetual $199.99 / Collection サブスク $119.99/月 | 中価格帯（対照事例） |
| Esoteric Spine | 調達データで 1 件あたり $7,000〜$11,000 規模（平均 ≈ $9,000）、機能段階の買い切り | 「買い切り 1 万ドル級」帯の実在例 |
| Aseprite | $19.99 買い切り | 低価格でも 38,000★ 超。**adoption の対照**として重要 |

読み取り: 目標帯は Houdini FX サブスク級 × Spine 上位買い切り級に相当する。ただし本コンセプトは、その価値を**課金・クラウドではなく、制作物の確かさ・軽さ・拡張性で説明する**。同時に Aseprite の教訓——低価格でも「速く・焦点が明快・拡張できる」ネイティブツールは深く愛される——を品質規律として併存させる。

出典:
- SideFX Houdini 価格: [Houdini Store | SideFX](https://www.sidefx.com/buy/), [How much does Houdini cost? (2026)](https://blog.thefix.it.com/how-much-does-houdini-cost-the-complete-2026-pricing-guide/)
- Substance 3D 価格: [Substance 3D plans — Adobe](https://www.adobe.com/products/substance3d/plans.html), [Adobe to raise Substance 3D prices — CG Channel](https://www.cgchannel.com/2025/02/adobe-to-raise-the-price-of-substance-3d-subscriptions/)
- Spine 価格/調達: [Esoteric Software Pricing — Vendr](https://www.vendr.com/buyer-guides/esoteric-software), [Purchase Spine — Esoteric Software](https://esotericsoftware.com/spine-purchase)
- 外殻実測（Tauri/Electron）: [Tauri vs Electron — gethopp](https://www.gethopp.app/blog/tauri-vs-electron), [Tauri v2 vs Electron 2026 — buildmvpfast](https://www.buildmvpfast.com/blog/tauri-v2-vs-electron-desktop-apps-2026), [Electron vs Tauri — DoltHub](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)

---

## 6. 各事例から本コンセプトが持ち帰るもの（要約）

- Aseprite / raylib / imgui → **小さく速く、焦点を明快に**。軽量は前提。
- Godot / Bevy / GDevelop → **目的分離 + 拡張合成**。2D/3D を別最適化しつつ拡張で広げる。
- Tiled / LDtk → **クリーンなデータ形式と多形式 export**。互換性は商品価値。
- assimp / meshoptimizer / model-viewer / f3d / compressonator → **読み込み・検品・軽量化**を 3D モジュールの核に。
- three-vrm / VRM-Addon → **相互運用はモジュールで足す**。ライセンス確認を前提に。
- Tauri 系実測 → **外殻を痩せさせる**方向の material。
- VS Code / Blender / Godot AssetLib / krita-ai-diffusion → **install-on-demand と拡張機構の質**が製品の成否を分ける。
