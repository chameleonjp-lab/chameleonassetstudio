# 3D-0 ライブラリ評価（一次調査・静的bundle）

調査日: 2026-09-27 JST（2026-09-26 UTC）

比較対象本体main SHA: `ba1bf5dcd468dae7d906bb07561925e30a74616a`

状態: **investigation-in-progress / partial-runtime-evidence / not adopted**

開始根拠: [2D Pro Gate人間承認](3D_GATE_BASELINE.md)

対象: 既存ロードマップ `3D-0`。四段階draftの `3D-GATE-02` 完了ではない。

## 1. 結論と採用状況

表示用の**実測候補はThree.jsを第一候補、Babylon.jsを比較候補**とする。外部viewerのLinux headless Chromium比較では、Three.jsの同一viewer gzipとGLB import時間が小さかった。ただし実機、React / TypeScript統合、採用判断は未完了であり、これだけでrenderer採用を確定しない。

glTF-Transformとmeshoptimizerは表示用rendererの代替ではない。前者はモデル処理、後者は圧縮・最適化の候補として分ける。glTF-Transform WebIOは今回の素のesbuild browser設定ではNode組み込みmoduleの解決に失敗した。これは次の調査で扱う具体的な統合課題であり、WebIOのbrowser利用が不可能という結論ではない。

**本体のpackage.json / package-lock.jsonは変更していない。全候補とも製品未採用。** 試験installは本体外の一時ディレクトリだけで行った。実験コード・node_modules・生成bundleは製品リポジトリへ入れない。

## 2. 役割・版・利用条件

| 候補と固定版 | 役割・実行環境 | 一次確認と未確認 | 今回の判断 |
|---|---|---|---|
| Three.js `0.186.0` / tag `r186` | browserのWebGL表示。GLTFLoader、OrbitControlsは追加module | [MIT LICENSE](https://github.com/mrdoob/three.js/blob/r186/LICENSE)。商用利用可能、著作権・許諾表示を保持。Safari・Android実動作は未測定 | 最小viewerの第一実測候補。未採用 |
| Babylon.js core / loaders `9.28.0` | browser表示、Scene / camera / glTF loader。今回はWebGPU専用のLiteではなくWebGL Engine | [Apache-2.0](https://github.com/BabylonJS/Babylon.js/blob/9.28.0/license.md)。商用利用可能、LICENSE・該当NOTICE・改変時表示等の条件あり | 比較候補。今回の構成は大きいが、機能範囲やimport最適化の差もある。未採用 |
| glTF-Transform core `4.5.0` | glTF読込・加工・書込。WebIOはbrowser、NodeIOはNode向け | [MIT LICENSE](https://github.com/donmccurdy/glTF-Transform/blob/v4.5.0/LICENSE.md)。表示エンジンではない。WebIOの静的bundleは今回失敗 | 後段の非破壊変換候補。最初のviewerには追加しない。未採用 |
| meshoptimizer `1.3.0` / tag `v1.3` | JS / WASMのdecoder・encoder等。個別import可能 | [MIT LICENSE](https://github.com/zeux/meshoptimizer/blob/v1.3/LICENSE.md)。`supported`の確認と`ready`待ちが必要 | 圧縮GLB対応・後段軽量化の候補。decoder容量のみ測定。未採用 |
| gltfpack（meshoptimizer `v1.3`に属する候補） | glTF最適化ツール。rendererではなく、別の実行・配布経路が必要 | [公式手順](https://github.com/zeux/meshoptimizer/tree/v1.3/gltf)。meshoptimizerと同じrepoのLICENSEを確認。gltfpack本体のbuild・実行・WASM配布物は未検証 | 最初のviewerには持ち込まず保留。未採用 |

利用条件の確認は、今回の固定版の一次調査であり、将来取り込む全配布物への包括的な法務承認ではない。3D素材・texture・Draco・KTX2/Basis等は別の確認対象。Three.jsのGLTFLoaderでも、圧縮拡張のdecoderを別設定する必要がある。[公式GLTFLoader説明](https://threejs.org/docs/pages/GLTFLoader.html)に従い、圧縮機能が無条件に含まれるとは扱わない。

試験で解決された推移依存は `babylonjs-gltf2interface@9.28.0` と `property-graph@4.1.0`。前者の配布LICENSEはApache-2.0、後者はMITを確認した。Babylon core配布物の`NOTICE.md`にはDraco、Basis、GLSLang、TWGSL、meshoptimizerが列挙されている。採用時には**実際に同梱・遅延取得するもの**を特定し、NOTICEを出力へ含める。今回の計測でdecoderのネットワーク取得を許可・検証したわけではない。

一次情報の補足: [WebIO API](https://gltf-transform.dev/modules/core/classes/WebIO)、[meshoptimizer JS API](https://github.com/zeux/meshoptimizer/blob/v1.3/js/README.md)、[Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)。本調査はWebGPUを必須にしない。

## 3. 静的bundleの実測

環境: Linux、Node `v24.19.0`、npm `11.9.0`、esbuild `0.25.12`。`platform=browser`、`format=esm`、`target=es2022`、minify、source mapなし、gzip level 9。法的表示は容量比較のため`legalComments=none`とし、bundleを配布していない。製品採用時はLICENSE / NOTICEを別途同梱し、その容量も再計測する。

| entry（§6に完全なimportを記載） | minified bytes | gzip bytes | 結果 |
|---|---:|---:|---|
| Three WebGLRenderer + GLTFLoader + OrbitControls | 633,925 | 159,884 | build成功 |
| Babylon Engine + Scene + ArcRotateCamera + ImportMeshAsync + glTF 2 loader登録 | 3,424,120 | 795,141 | build成功 |
| glTF-Transform WebIO | — | — | build失敗: `node:fs` / `node:path`を解決できない |
| meshoptimizer MeshoptDecoder | 26,254 | 7,215 | build成功。WASM初期化・decode実行は未検証 |

これは**公開exportを保持したimport面の容量**であり、動作する同一viewerや最小可能容量ではない。Babylon glTF 2のentryは拡張登録を含み、Threeとの機能範囲は完全同一ではない。asset、外部decoder、CSS、React、実行時の通信・メモリ・GPU負荷を含まない。Threeが実機で約5倍速い等とは解釈しない。

生成物SHA-256（同条件で2回実行し一致）:

| entry | SHA-256 |
|---|---|
| three | `cf81255ffadd9cbf639073f63041b194c6c287a9d6676f052e825de6b6153909` |
| babylon | `afc12ef7b88b7660561c36a2cbab7a4510a204c9d099226812997565596bdaf1` |
| meshopt | `48731f392152a8670b13640292d40b52a50c0105901f5bb7625e460a35aedc2a` |

WebIO失敗は`@gltf-transform/core/dist/index.js`内のNodeIO用dynamic importに対する解決時エラー。Node polyfillの追加や未検証のexternal指定で成功扱いにはしなかった。次の検証ではViteのbrowser境界とtree-shaking後の出力を確認し、Nodeコード・外部URL取得が実際のbrowser経路へ入らないことを確かめる。最初のGLTFLoader viewerを進める必須依存ではない。

参考として、本体の既存`npm run build`も成功した。2D main JSはVite出力値で938.74 kB、gzip 276.96 kB（既存の500 kB chunk警告あり）。これはVite既定条件の参考値であり、上表のesbuild / gzip level 9とは直接比較しない。今回の変更はdocsとtoolsのテストだけで、本体3D chunkは存在しない。


## 3.1 同一viewerの外部runtime比較（部分実測）

2026-09-27 JSTに、本体リポジトリ外の使い捨て作業場で、Three.jsとBabylon.jsの最小viewerを同じ条件で5回ずつ実行した。これはGATE-02の部分証拠であり、renderer採用やGATE-02完了を意味しない。

### 固定条件

| 項目 | 条件 |
|---|---|
| fixture | 自作GLB（三角形1枚、法線・明示材質あり）、980 bytes |
| fixture SHA-256 | `4e0782a61f8ef61530515a0b9e7906172ef7b048d2102b92aed9653381185d49` |
| Three.js | `0.186.0` |
| Babylon.js | `@babylonjs/core / @babylonjs/loaders 9.28.0`、`babylonjs-gltf2interface 9.28.0` |
| 実行環境 | Linux managed runtime、Node `v24.19.0`、Playwright `1.53.0`、Chromium `138.0.7204.15` |
| viewer条件 | canvas 360×240 CSS px、viewport 390×300 CSS px、DPR 1、WebGL、同一色背景、同一距離の固定camera |
| 反復 | 新しいPlaywright pageを各候補5回。通信はlocalhost。実機の冷起動・通信時間は測っていない |
| シナリオ | GLB読込 → 表示 → camera固定 → render loop開始からimport完了後1000msまでのfps算出（import時間を含む） → screenshot → `WEBGL_lose_context`でloss/restore → screenshot → viewer dispose |

### bundleとruntime結果

| 項目 | Three.js | Babylon.js | 注記 |
|---|---:|---:|---|
| 同一viewer minified bytes | 639,440 | 3,429,839 | esbuild `0.25.12`、`legalComments=none` |
| 同一viewer gzip bytes | 161,772 | 796,764 | gzip level 9 |
| bundle SHA-256 | `ccae8cbc7af8c5bbf41bfa28a9b26ddf3de8b69e1e469a54e07c6a0050c85926` | `a1e394c8fe2256275dea2be1259df4f25f508440d1e865ef4c70ff70e1a4fc6f` | 同じfixture生成・viewer条件 |
| GLB import時間の中央値 | 3.9 ms | 16.2 ms | 5回のimport完了まで。ページ移動時間は含めない |
| fps中央値（render loop開始〜import完了後1000msまで） | 58.747 | 57.103 | import時間を含む参考値。headless Chromium上の観測値で、レンダリング単体や実機性能へ転用しない |
| `performance.memory`観測 | 10,000,000 bytes | 15,200,000 bytes | Chromium非標準値。メモリ優位の断定には使わない |
| context loss / restoreイベント | 5/5 | 5/5 | 両候補でイベントを確認 |
| 復旧後center pixel | `[213,214,215,255]` | `[227,227,227,255]` | 各候補5回すべてで同じ値。背景色ではなく三角形のpixelを確認 |
| 代表実行の復旧前後screenshot SHA-256 | `14592e65e8905501e79693d60e4707144765007869109ebf76d0f84d9b789fe1` | `1b15f828a5a79b409a31a17f01009dc334aa915d79a5ec0bd5144add0d4c63c1` | 各候補のindex=1のみ保存。代表実行では前後hashが一致。5回分の画像保存ではない |
| dispose呼出し | 5/5 | 5/5 | harnessのdispose経路が完了。RAF / event listener停止・GPU残留量の直接測定ではない |

raw結果の配列は次のとおりである。

```text
Three.js loadMs:  [4.0, 3.6, 3.9, 4.0, 3.7]
Three.js fps:     [58.701, 58.771, 58.753, 58.747, 57.775]
Babylon loadMs:   [16.2, 15.5, 16.4, 17.1, 15.5]
Babylon fps:      [57.070, 57.103, 58.031, 57.014, 57.103]
```

この結果から、今回のLinux headless Chromium条件ではThree.jsのbundleとGLB import時間が小さかった。fpsはrender loop開始からimport完了後1000msまでの区間で算出しており、import時間を含むため、レンダリング単体の比較や採用理由には使わない。次回はimport完了後にfps計測を開始する。Babylon.jsも同条件で表示し、context loss後の復旧画面を確認できた。

### 未実施・観測できない範囲

- PC Chrome実機、iPhone Safari実機、iPad Safari実機、Android実機。
- 初回表示時間（GLB import完了から実際に描画された時点まで）は未分離。今回の`loadMs`はGLB import完了までの時間である。
- Safariの実メモリ、GPU resource残留、実機context lossの挙動。
- React / TypeScriptへ組み込んだ型検査、mount / unmount反復。今回の外部viewerはplain JavaScriptで作った。
- 大きいGLB、texture、animation、圧縮拡張、外部URL、取消操作。
- この結果を用いた`3D-DEC-LIB-01`の人間承認、製品dependency追加、3D画面実装。

従って状態は引き続き **調査中 / 部分実測済み / 未採用** とする。Linux ChromiumをPC Chrome実機、今回の2D承認、またはSafariの代わりには扱わない。

## 4. 2Dに影響させない構成案（未採用）

- 3D入口のdynamic importでrenderer・loader・decoderを遅延読込し、既存2D起動経路からruntime importしない。2D初回networkに3D chunkが入らないことを後続テストで確認する。
- rendererは交換可能なviewer境界へ閉じ込める。GPU object、ImageBitmap、object URL、event listener、render loopの解放責務を明確にする。キャンセル・読込失敗・再選択・画面離脱でも同じ解放経路を通す。
- 元GLB bytesを不変で保存し、向き・原点・scale等は派生設定として分離する案を比較する。既存Asset / Layer / Frame / Animationへ意味を足さず、`.casproj`やIndexedDBを流用変更しない。3D保存形式は別ADRで決める。
- local GLBを最初の比較fixtureとし、外部URLを含むglTF、圧縮拡張、texture上限超過は明示的な検査対象にする。既定で外部decoder CDNへ通信しない設計を検証する。
- glTF-Transformやgltfpackの最適化は後段。追加時はWorker境界・取消・元データ保持・変換前後比較を検証し、renderer選定と同時にまとめて本体へ追加しない。

## 5. 次の比較で埋める項目

| 項目 | 今回 | 次の受入条件 |
|---|---|---|
| 静的import容量・版・一次LICENSE | 測定・確認済み。WebIO失敗も記録 | 同一viewerの配布物全体で再計測、LICENSE / NOTICE含む |
| GLB表示・camera・dispose | Linux headless Chromiumで5回実測。両候補の表示とdispose経路を確認 | PC Chrome実機・iPhone Safari・iPad Safariで同一条件を実測。GPU残留は別測定 |
| 初回表示時間、fps、memory | GLB import時間と、import時間を含む参考fpsをLinux headless Chromiumで5回実測。初回表示とレンダリング単体fpsは未分離。memoryは非標準値として記録 | import完了後にfps計測を開始し、初回表示時間を別測定する。端末・OS・browser版・反復数・測定方法を固定して実機結果を記録 |
| PC／iPhone／iPad／Android | Linux Chromiumのみ。実機はnot-run | OS・browser版・deviceを記録。今回の2D承認を3D実機証拠へ転用しない |
| context loss復帰・screenshot・取消 | Chromiumでloss/restoreとcenter pixelを5/5確認。前後screenshotは代表1回のみ。取消はnot-run | Safari実機を含め、失敗・再読込・離脱・取消を確認 |
| React / TypeScript組込 | plain JavaScriptの外部viewerのみ。not-run | 型検査、mount / unmount反復、2D初回bundle非混入 |
| 選定 `3D-DEC-LIB-01` | proposed、未決定 | 比較結果とライセンス配布条件を見て人間または上位判断で採用 |

この残表は2D Gateをもう一度承認してもらうためのものではない。**新しい3D機能の調査残**である。四段階計画全体、dependency追加、保存形式まで承認済みにはしない。

## 6. 再現手順

本体とは別の新しい作業ディレクトリで、下記の版をinstallして`measure.mjs`を実行する。本調査では本体に既存のesbuild `0.25.12`を絶対パス引数で参照した。別環境では同じ版を実験ディレクトリへinstallすればよい。

```sh
npm install --ignore-scripts --no-audit --no-fund --save-exact three@0.186.0 @babylonjs/core@9.28.0 @babylonjs/loaders@9.28.0 babylonjs-gltf2interface@9.28.0 @gltf-transform/core@4.5.0 property-graph@4.1.0 meshoptimizer@1.3.0 esbuild@0.25.12
node measure.mjs
```

`measure.mjs`の内容（bundler設定を弱めず、候補ごとの失敗も出力する）:

```js
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { build, version } = require(process.argv[2] ?? 'esbuild');
const entries = {
  three: `export { WebGLRenderer } from 'three';
export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export { OrbitControls } from 'three/addons/controls/OrbitControls.js';`,
  babylon: `export { Engine } from '@babylonjs/core/Engines/engine.js';
export { Scene } from '@babylonjs/core/scene.js';
export { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
export { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/glTFFileLoader.js';
import '@babylonjs/loaders/glTF/2.0/index.js';`,
  webio: `export { WebIO } from '@gltf-transform/core';
`,
  meshopt: `export { MeshoptDecoder } from 'meshoptimizer/decoder';`,
};
console.log({ node: process.version, esbuild: version });
for (const [name, contents] of Object.entries(entries)) {
  try {
    const result = await build({
      stdin: { contents, resolveDir: process.cwd(), sourcefile: `${name}.js` },
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      write: false,
      sourcemap: false,
      legalComments: 'none',
      logLevel: 'silent',
    });
    const bytes = result.outputFiles[0].contents;
    console.log({
      name,
      status: 'built',
      bytes: bytes.length,
      gzipBytes: gzipSync(bytes, { level: 9 }).length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  } catch (error) {
    console.log({ name, status: 'failed', errors: error.errors.map(({ text }) => text) });
  }
}
```

結果は上表の通り。`node:fs` / `node:path`のエラーを含むWebIOは失敗として集計する。スクリプトが最後まで走ることだけを全候補成功の証拠にしない。

## 7. 同一viewer外部実測の再現条件

比較viewerは本体リポジトリの外部作業場に置き、次の固定版をinstallした。比較コード、`node_modules`、bundle、raw JSON、screenshotは本体repoへ追加していない。

```sh
npm install --ignore-scripts --no-audit --no-fund --save-exact \
  three@0.186.0 \
  @babylonjs/core@9.28.0 @babylonjs/loaders@9.28.0 \
  babylonjs-gltf2interface@9.28.0 \
  esbuild@0.25.12 playwright@1.53.0
npx playwright install chromium
node measure.mjs
node run-browser.mjs
```

外部作業場の固定条件・raw結果・画像のhashを上記3.1に記録した。外部viewerはplain JavaScriptであり、これはReact / TypeScript統合の証拠ではない。比較viewerの作成中に、法線を持たないfixtureではBabylon.jsの初期表示が空になることを検出したため、法線と明示材質を付けた自作GLBへ修正してから最終測定した。初期表示が空の結果は採用していない。

外部viewerのソース、GLB実体、raw JSON、screenshotは本体repoへ永続保存していない。したがって、このPRに記録したhashとコマンドだけでは同一harnessを完全再構成できず、今回のruntime値は監査可能な**部分証拠**として扱う。次回は外部アーカイブの保存先と保持期間を先に固定する。

