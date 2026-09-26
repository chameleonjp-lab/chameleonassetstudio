# 3D-0 ライブラリ評価（一次調査・静的bundle）

調査日: 2026-09-27 JST（2026-09-26 UTC）

状態: **investigation-in-progress / not adopted**

開始根拠: [2D Pro Gate人間承認](3D_GATE_BASELINE.md)

対象: 既存ロードマップ `3D-0`。四段階draftの `3D-GATE-02` 完了ではない。

## 1. 結論と採用状況

表示用の**次の実測候補はThree.jsを第一候補、Babylon.jsを比較候補**とする。今回のimport構成ではThree.jsのgzipが小さかった。ただし同一viewerの動作・実機性能は未測定であり、これだけでrenderer採用を確定しない。

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
| GLB表示・camera・dispose | not-run | 同一の自作GLBと固定cameraで両候補を実行。試作はrepo外 |
| 初回表示時間、fps、memory | not-run | 同一fixture・viewport・端末・反復数・計測方法とraw結果を記録 |
| PC／iPhone／iPad／Android | 3D候補の実機比較はnot-run | OS・browser版・deviceを記録。今回の2D承認を3D実機証拠へ転用しない |
| context loss復帰・screenshot・取消 | not-run | 成功だけでなく失敗・再読込・離脱の確認 |
| React / TypeScript組込 | APIの調査のみ | 型検査、mount / unmount反復、2D初回bundle非混入 |
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
