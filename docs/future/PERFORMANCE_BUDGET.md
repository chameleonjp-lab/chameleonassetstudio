# Chameleon Asset Studio Performance Budget & Baseline

最終更新日: 2026-07-11  
work package: `2D-6-PERFORMANCE` baseline slice only  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`

## 1. 文書の目的

この文書は、現行 Chameleon Asset Studio の性能上の事実、再現手順、測定できなかった範囲を固定し、今後の改善前後比較に使う baseline である。新しい性能改善、Worker 化、保存形式変更、`asset.json` / `.casproj` / export ZIP / JSON Schema / IndexedDB / version / dependency の変更は含まない。

## 2. 状態と適用範囲

- 正式 work package は `2D-6-PERFORMANCE` だが、今回の成果は現状基準計測のみであり work package 全体は未完了。
- `docs/future/2D_COMPLETION_ROADMAP.md` の実行キューでは `2D-1A-MOTION` が次の正式作業で、`2D-6-PERFORMANCE` / `2D-6-A11Y` の baseline だけが並行可能。
- PR #53 と PR #55 は provisional / partial のまま扱い、`2D-1B-GATE` は未完了。追加の `2D-1B-*`、`2D-2-*`、`2D-3-*` 本実装は停止中。

## 3. 調査対象commit

- 調査対象 commit: `c524611a9a85c45b720dfced6cbc5884480077ac`
- branch: `codex/2d-6-performance-baseline`
- 測定日時: `2026-07-11T15:02:51Z` 付近
- 確認コマンド: `git rev-parse HEAD`, `git log --oneline --decorate -5`
- `gh` CLI は環境に存在せず、open PR のオンライン確認はこの環境では取得不可だった。ローカル roadmap 上は PR #53 / #55 provisional 状態が維持されている。

## 4. 測定環境

| 項目 | 値 |
|---|---|
| OS | Linux `2c175ef8c47c` kernel `6.12.47`, x86_64 |
| CPU | Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz, 3 vCPU |
| 利用可能メモリ | `free -h`: total 17GiB, available 17GiB, swap 0B |
| Node.js | `v20.20.2` |
| npm | `11.4.2` |
| Playwright | `1.61.1` |
| Chromium | Playwright Chromium `149.0.7827.55` / v1228 が要求されたが、ブラウザ実体は未取得 |
| headless / headed | E2E は headless Chromium 設定。ただし executable 欠落で起動不可 |
| viewport | `playwright.config.ts` の既定 viewport。ブラウザ未起動のため実測 viewport は取得不可 |
| device scale factor | 取得不可 |
| production build / dev server | `npm run build` は production build。E2E は config の webServer 経由の dev server 起動まで |
| cold / warm | `npm ci` 後の cold 相当。ブラウザ操作は Chromium 未取得で未測定 |
| 試行回数 | build/test は各 1 回。ブラウザ操作 3 回測定は未実施 |

## 5. 既存仕様で決まっている条件

A. 既存仕様値として扱い、今回の Codex 測定値と混同しない。

| 値 | 内容 | 根拠 |
|---|---|---|
| 25MB | 取り込み画像 1 ファイルの初期上限 | `src/core/images/importImage.ts` の `MAX_IMAGE_BYTES`、`EditorScreen.tsx` の UI 文言、`importImage.test.ts` |
| 4096 x 4096 | 取り込み画像の最大寸法 | `src/core/images/importImage.ts` の `MAX_IMAGE_DIMENSION`、`importImage.test.ts` |
| 60fps 目標 | PC / iPad の通常編集目標 | `docs/future/2D_DEVICE_RELIABILITY_SPEC.md` |
| 長時間 30fps 未満継続を避ける | スマホ確認条件 | `docs/future/2D_DEVICE_RELIABILITY_SPEC.md` |
| スマホ軽量 preview | 長辺 2048px 程度の preview は可。ただし元解像度、編集元、最終書き出しを縮小版で置換しない | `docs/future/2D_DEVICE_RELIABILITY_SPEC.md` |

これ以外の home 起動時間、import 時間、export 時間、復元時間、メモリ警告値、長時間操作後の許容増加量は判断待ちであり、Codex が合格値を新設しない。

## 6. 測定方法

- 依存関係: `npm ci`
- build: `time npm run build`
- dist サイズ: `du -sk dist`, `find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.map' \) -printf '%k KB %p\n'`
- test: `time npm run lint`, `time npm run format:check`, `time npm run test`, `time npm run e2e`
- Chromium 取得確認: `npx playwright install chromium`
- コード経路調査: `rg -n "new Worker|Worker|OffscreenCanvas|createImageBitmap|ImageBitmap|AbortController|AbortSignal|cancel|URL\.createObjectURL|URL\.revokeObjectURL|canvas\.toBlob|ArrayBuffer|zip|unzip|decode|drawImage|getImageData|putImageData|indexedDB|Blob" src e2e playwright.config.ts package.json`

## 7. build成果物の基準

`npm run build` は成功。所要時間は shell `time` で `real 0m9.204s`、Vite 表示では `built in 3.00s`。

| ファイル | サイズ | gzip | 備考 |
|---|---:|---:|---|
| `dist/index.html` | 0.41 kB | 0.27 kB | Vite 出力 |
| `dist/assets/imageOps.worker-DBson69w.js` | 4.01 kB | 取得なし | Worker chunk |
| `dist/assets/index-Ce7S2wH9.css` | 14.18 kB | 2.96 kB | CSS |
| `dist/assets/index-B-75BjXw.js` | 530.48 kB | 161.67 kB | main JS |
| `dist/` 全体 | 552 KiB | - | `du -sk dist` |

- chunk size warning: あり。main JS が 500 kB を超え、Vite が code-splitting / manualChunks / warning limit 調整を提案した。
- source map: `dist` に `.map` は見つからなかった。
- dependency 数: production dependency tree は 6 行、all dependency tree は 223 行（`npm ls --omit=dev --parseable | wc -l`, `npm ls --all --parseable | wc -l`）。
- bundle size の合格上限は未設定。今回の値は B. 参考値。

## 8. 自動テスト実行時間の参考値

テスト suite の実行時間は利用者操作速度ではない。CI / local 環境の参考値であり、UX 性能の合格証拠として扱わない。

| コマンド | 結果 | ファイル数 / test数 | 所要時間 | 備考 |
|---|---|---:|---:|---|
| `npm run lint` | 成功 | - | `real 0m4.191s` | ESLint |
| `npm run format:check` | 成功 | - | `real 0m3.778s` | Prettier |
| `npm run test` | 成功 | 29 files / 291 tests | Vitest `10.75s`, shell `11.756s` | 長い file は `projectStore.test.ts` 104ms、`casproj.test.ts` 91ms、`validate.test.ts` 85ms |
| `npm run e2e` | 環境要因で失敗 | 16 spec files / 70 tests attempted | `real 1m17.293s` | Chromium executable 欠落 |

E2E 失敗の代表エラー:

```text
browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell
Please run the following command to download new browsers: npx playwright install
```

`npx playwright install chromium` も CDN 403 Forbidden で失敗した。未確認範囲は全 Playwright ブラウザ操作、download、IndexedDB E2E、mobile viewport E2E、実ブラウザ由来の性能測定であり、CI または Chromium が取得できる環境に委ねる。

## 9. ブラウザ操作の測定結果

Playwright Chromium の executable がなく、`npx playwright install chromium` も 403 Forbidden で失敗したため、headless Chromium でのブラウザ操作参考測定は実施できなかった。値を推測して作らない。

| 操作 | 測定結果 | 状態 |
|---|---|---|
| home画面が操作可能になるまで | 未測定 | Chromium 未取得 |
| 新規Project作成 | 未測定 | Chromium 未取得 |
| 64 x 64 空アセット作成 | 未測定 | Chromium 未取得 |
| 画像取り込み後キャンバス表示 | 未測定 | Chromium 未取得 |
| 代表的な編集操作確定 | 未測定 | Chromium 未取得 |
| export ZIP download開始 | 未測定 | Chromium 未取得 |
| `.casproj` 書き出し | 未測定 | Chromium 未取得 |
| `.casproj` 読み込み・再オープン | 未測定 | Chromium 未取得 |

headless Chromium の結果が将来取得できても、実機体感速度、Safari 性能、iPad / iPhone / Android の合格証拠とは扱わない。

## 10. 4096 x 4096画像の確認

| 観点 | 現在確認できる範囲 | 未確認範囲 |
|---|---|---|
| validation | `importImage.test.ts` が 4096 x 4096 境界の受理と 4097 超過拒否を unit test で確認 | 実ブラウザでの file input 経由 validation |
| decode | `decodeImageSource.test.ts` は `createImageBitmap` と HTMLImageElement fallback の挙動を mock で確認 | 実 4096 x 4096 PNG の decode |
| import | `importImage.ts` は decode 後に edit / thumbnail Blob を生成する経路を持つ | 実 4096 x 4096 PNG import の所要時間・メモリ |
| canvas表示 | `CanvasEditor.tsx` は Blob load + decode + drawImage で表示する | 実 4096 x 4096 表示、pan / zoom / layer 操作 |
| 保存 | `projectStore.ts` は Blob を ArrayBuffer 化して保存する | 実 4096 x 4096 の IndexedDB quota / latency |
| export | `exportAsset.ts` と `casproj.ts` が canvas 合成・ZIP 化を行う | 実 4096 x 4096 export / download |
| エラー表示 | import / export / casproj の失敗表示は既存 E2E にあるが今回は未起動 | 実 4096 x 4096 失敗時の UI 復帰 |
| 操作後復帰 | unit は一部保証、E2E は Chromium 不足で未確認 | 実機復帰 |

外部素材は使っていない。Chromium がないため一時 4096 x 4096 PNG の実ブラウザ decode / edit / export は行っていない。

## 11. 25MB条件の現在の確認範囲

25MB はファイルサイズ上限であり、decode 可能性、編集可能性、export 可能性、スマホ可用性とは別である。

| 観点 | 現在確認できる範囲 | 未確認範囲 |
|---|---|---|
| 25MB以下を validation が受理 | `importImage.ts` の file size check と unit test 範囲 | 実 file input での境界 |
| 有効な25MB画像を decode | 未確認 | 実画像 decode |
| 25MB画像を編集 | 未確認 | 実編集操作 |
| 25MB画像を書き出し | 未確認 | PNG / WebP / ZIP / `.casproj` 書き出し |
| スマホで25MB画像を扱う | 未確認 | iPhone / Android 実機 |

安全に有効な 25MB 実画像を生成してブラウザで扱う確認は、Chromium 欠落のため今回は行わなかった。

## 12. 主スレッド処理の一覧

| 処理 | ファイル / 関数 | 主スレッドか | Workerか | 取消可能か | 大きな一時メモリ | 解放処理 | 現在のtest | 危険 |
|---|---|---|---|---|---|---|---|---|
| 画像取り込み validation / decode / edit Blob / thumbnail Blob | `src/core/images/importImage.ts` `importImageFile`, `createBlankImportedImage` | 主スレッド呼び出し。`OffscreenCanvas` があれば利用 | なし | なし | decode source、canvas、Blob | `decoded.close()` | `importImage.test.ts` | 4096画像で decode + full-size canvas + thumbnail が重い可能性 |
| Canvas表示 | `src/features/editor/CanvasEditor.tsx` effect + draw | 主スレッド React / Canvas 2D | なし | effect cleanup の `cancelled` flag のみ | decoded image map | cleanup で `decoded.close()` | E2E `canvas.spec.ts` だが今回未起動 | 画像多数・大画像で main thread paint が重い可能性 |
| 背景preview | `BackgroundPreview.tsx` | 主スレッド | なし | `cancelled` flag のみ | decoded image map | cleanup で `decoded.close()` | asset type E2E 範囲 | 背景 layer 多数で重い可能性 |
| PNG / WebP / JSON / ZIP export | `ExportPanel.tsx`, `src/core/export/exportAsset.ts` | 主スレッド | なし | なし | canvas, decoded images, ZIP buffers | decoded close / Blob URL revoke | `export.spec.ts`, export unit | ZIP と canvas 合成が大きい asset で重い可能性 |
| `.casproj` export/import | `src/core/storage/casproj.ts` | 主スレッド | なし | なし | ZIP buffers, ArrayBuffer, Blob | 明示的 cancel なし | `casproj.test.ts`, `casproj.spec.ts` | 大容量 bundle で main thread / memory 負荷 |
| IndexedDB Blob保存 | `src/core/storage/projectStore.ts` | 主スレッド async IDB | なし | なし | Blob → ArrayBuffer | delete / purge 経路あり | `projectStore.test.ts`, storage E2E | Blob 変換が transaction 前に一括発生 |
| 空アセット透明PNG生成 | `blankAsset.ts` | 主スレッド Canvas 2D | なし | なし | canvas + Blob | なし | `create.spec.ts` | 大きい空キャンバスで toBlob が重い可能性 |
| 画像編集の pixel buffer 変換 | `runOperation.ts` `blobToPixelBuffer`, `pixelBufferToBlob` | decode / getImageData / putImageData は主スレッド | operation 本体は Worker 可 | なし | full pixel buffer, ImageData | `decoded.close()` | `operations.test.ts`, imageedit E2E | 4096画像で ArrayBuffer / ImageData が大きい |

## 13. Worker利用状況

- `src/core/images/runOperation.ts` は `new Worker(new URL('../../workers/imageOps.worker.ts', import.meta.url), { type: 'module' })` で画像操作 Worker を作成する。
- Worker がない、起動失敗、error 発生時は同期実行に fallback する。
- `src/workers/imageOps.worker.ts` は `applyImageOperation` を実行し、結果または error を postMessage する。
- production build では `dist/assets/imageOps.worker-DBson69w.js` が 4.01 kB として出力された。
- 現在 Worker 化されているのは pixel buffer に対する画像編集 operation 本体であり、decode、getImageData、putImageData、import、export、ZIP、IndexedDB 変換は Worker 化されていない。

## 14. 取消可能性

| 処理 | 取消可能性 |
|---|---|
| React effect 内 decode | `CanvasEditor.tsx` / `BackgroundPreview.tsx` は cleanup の `cancelled` flag で state 反映を止め、取得済み decoded source を close する。ただし decode 自体を AbortSignal で中断しない |
| Worker 画像操作 | request id と pending map で応答を紐付けるが、ユーザー操作による cancel / AbortController はない |
| import / export / ZIP / `.casproj` | AbortController / AbortSignal は見つからず、実行中 cancel は不可 |
| autosave / IndexedDB | debounce / flush はあるが、容量負荷の高い保存処理をユーザーが cancel する導線はない |

`AbortController` / `AbortSignal` の product code 利用は検索上見つからなかった。

## 15. メモリ・画像資源の解放

- `decodeImageSource.ts` は `createImageBitmap` 利用時に `ImageBitmap.close()` を返し、HTMLImageElement fallback 時に `URL.createObjectURL` を使って `URL.revokeObjectURL` する close を返す。
- `CanvasEditor.tsx` と `BackgroundPreview.tsx` は decoded map の入れ替え・unmount cleanup で `decoded.close()` を呼ぶ。
- `downloadBlob` は Blob URL を作り、click 後に `URL.revokeObjectURL` する。
- IndexedDB の Blob は `projectStore.ts` の delete / purge / deleteAsset で削除される経路がある。
- Chrome DevTools Protocol の JSHeapUsedSize / DOM node数などは、Chromium 未取得のため今回は測定できなかった。Chrome の JS heap は画像、GPU、Canvas、ブラウザ全体のメモリを完全には表さないため、将来取得できても「メモリリークなし」の単独証拠にしない。

## 16. 保存・書き出し・復元失敗時の挙動

| 経路 | 表示・失敗挙動 | 根拠 |
|---|---|---|
| unsupported import | UI alert に理由表示 | `EditorScreen.tsx`, `import.spec.ts` |
| image Blob 欠落 export ZIP | `画像 Blob が見つかりません` を alert に表示 | `export.spec.ts` |
| `.casproj` ではない import | 理由表示、正本 store へ書かず隔離 | `HomeScreen.tsx`, `casproj.spec.ts`, `storage.spec.ts` |
| `.casproj` 画像欠落 | warning 表示、正常 import 時は警告なし | `casproj.spec.ts` |
| Blob / asset 整合復元 | snapshot restore flow の unit test | `snapshotRestoreFlow.test.ts` |

今回の E2E は Chromium 欠落で未実行のため、UI 表示の実ブラウザ確認は CI / 別環境に委ねる。

## 17. 現在確認できる性能上の危険

- main JS が 530.48 kB で Vite chunk size warning が出ている。
- import は full-size decode、edit PNG 生成、thumbnail 生成を主スレッド経路で行う。
- export / `.casproj` は ZIP buffer を主スレッドで組み立てる。
- IndexedDB 保存は Blob を ArrayBuffer へ変換して保持するため、大画像で一時メモリが増える可能性がある。
- 画像編集は operation 本体が Worker 化されているが、decode と pixel buffer 変換は主スレッドに残る。
- AbortController による cancel がなく、大きい import / export / ZIP を途中停止できない。

これらは後続 work package への引き継ぎ事項であり、今回の PR では修正しない。

## 18. 自動測定では確認できない内容

- Safari / iPadOS / iOS の decode、Canvas、Blob URL download、IndexedDB quota。
- Android Chrome のメモリ圧迫時挙動。
- 長時間編集で 30fps 未満が継続しないこと。
- 4096 x 4096、25MB 実画像の実機編集・書き出し。
- GPU / Canvas / browser process を含む実メモリ。
- Apple Pencil、touch、pinch、software keyboard、safe area、orientation。

## 19. 実機確認表

| 端末 | OS | browser | 必要な確認 | Codex自動確認 | 人間実機確認 | 状態 |
|---|---|---|---|---|---|---|
| PC Chrome | 未指定 | Chrome | import→edit→export、4096画像、download、memory | 未確認。headless Chromium 未取得 | 未実施 | 未完了 |
| PC Edge | 未指定 | Edge | download / Blob URL / layout | 未確認 | 未実施 | 未完了 |
| PC Firefox | 未指定 | Firefox | Canvas / IndexedDB / download | 未確認 | 未実施 | 未完了 |
| iPad Safari | iPadOS | Safari | 60fps目標、touch、Files、download | 未確認 | 未実施 | 未完了 |
| iPhone 17 Pro Safari | iOS | Safari | 長時間30fps未満継続なし、25MB実画像 | 未確認 | 未実施 | 未完了 |
| iPhone 11 Pro Safari | iOS | Safari | 旧機種相当のメモリ / layout | 未確認 | 未実施 | 未完了 |
| iPhone SE級layout | iOS | Safari | small viewport / software keyboard | 未確認 | 未実施 | 未完了 |
| Android Chrome | Android | Chrome | file input / download / memory | 未確認 | 未実施 | 未完了 |

Codex 環境の headless Chromium は、取得できた場合でも PC Chrome 実機確認済みとして扱わない。

## 20. 人間またはFable5の判断が必要な数値

C. 判断待ち:

- home 起動時間の合格値。
- 新規 Project / 空アセット作成時間の合格値。
- import / decode / canvas 表示時間の合格値。
- 編集操作確定時間の合格値。
- export ZIP / `.casproj` 書き出し時間の合格値。
- `.casproj` 復元時間の合格値。
- build bundle size の上限。
- JS heap / browser memory の警告値。
- 長時間操作後の許容メモリ増加量。
- 4096 x 4096 / 25MB 実画像で許容する処理時間。

## 21. 再測定条件

次のいずれかが変わったら再測定する。

- `src/core/images/**`, `src/features/editor/**`, `src/core/export/**`, `src/core/storage/**`, `src/workers/**` の変更。
- Vite / Playwright / TypeScript / fflate / React など build または runtime 依存の変更。
- package script、CI、browser target、source map、chunk 分割の変更。
- import / export / `.casproj` / IndexedDB / autosave / image operation の仕様変更。
- 2D Pro Gate 前の実機確認実施時。

## 22. 再現手順

```bash
npm ci
npm run build
npm run lint
npm run format:check
npm run test
npm run e2e
npx playwright install chromium
```

build サイズ:

```bash
du -sk dist
find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.map' \) -printf '%k KB %p\n' | sort -n
```

環境:

```bash
uname -a
lscpu
free -h
node -v
npm -v
npx playwright --version
```

コード経路:

```bash
rg -n "new Worker|Worker|OffscreenCanvas|createImageBitmap|ImageBitmap|AbortController|AbortSignal|cancel|URL\.createObjectURL|URL\.revokeObjectURL|canvas\.toBlob|ArrayBuffer|zip|unzip|decode|drawImage|getImageData|putImageData|indexedDB|Blob" src e2e playwright.config.ts package.json
```

## 23. 既知の制限

- open PR 確認は `gh` CLI 不在で未取得。現在の main / roadmap を優先した。
- Playwright Chromium を CDN 403 Forbidden で取得できず、E2E とブラウザ操作測定は未完了。
- 4096 x 4096 実画像、25MB 実画像、CDP memory metrics は未測定。
- 文書内の B. 参考値は Codex container の一回測定であり、実機・Safari・iPad・iPhone・Android の保証値ではない。

## 24. 後続work packageへの引き継ぎ

- `2D-6-PERFORMANCE`: Chromium が取得できる環境でブラウザ操作 3 回測定、CDP memory metrics、4096 x 4096 / 25MB 実画像確認を追加する。
- `2D-6-DEVICE-FLOW`: 実機表の PC / iPad / iPhone / Android を埋める。
- `2D-6-A11Y`: 同条件で accessibility baseline を作る。
- `2D-1B-CAPACITY` / `2D-1B-GATE`: IndexedDB quota、Blob / ArrayBuffer 変換、`.casproj` 失敗復旧を再監査する。
- `2D-6-PERFORMANCE` 改善フェーズ: Worker 化、chunk 分割、import/export cancel、preview 軽量化を検討する。ただし本 baseline PR では実装しない。
