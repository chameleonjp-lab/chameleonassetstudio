# Group 12 H3 再現可能計測プロトコル

最終更新日: 2026-07-22
work package: Group 12 `2D-3-TIMELINE + 2D-3-RIG`
判断: `H3=M1`（測定先行。数値budgetは未決定）
実装: 計測ハーネスのみ。製品機能、上限定数、warning、hard capは未実装
関連: `2D_3_TIMELINE_RIG_PLAN.md`, `2D_DEVICE_RELIABILITY_SPEC.md`, `docs/adr/0022-rig-flip-and-bake-parity.md`, `tools/h3/`

---

## 1. 目的と証拠境界

H3=M1は、rig bakeの安全上限を先に推測せず、同じfixture、同じ実装、同じ結果形式でPC Chromium、iPhone Safari、iPad Safariを測る判断である。120 Frame超warning / 240 Frame hard capは比較用の旧候補であり、採用値ではない。

この段階で測るcore pathは、現行`bakeRigAnimation`、JSON serialization、現行`computeSheetLayout`によるsheet pixel推定である。ハーネスは製品関数を直接importし、bake式を複製しない。次はまだ証明しない。

- React反映、renderer、History、Undo / Redo、IndexedDB保存、autosave、reload。
- 実画像のdecode / rasterize、sprite-sheet描画、PNG / WebP encode。
- `asset.json`、`.casproj`、product export ZIPの製品経路。
- 数値warning、hard cap、LayerState / serialized bytes / pixel上限の合否。

したがって、Node結果やブラウザcore結果だけを製品実装の開始条件、端末合格、数値budgetとして使わない。数値決定は本プロトコルの実測後に、別の人間承認として記録する。

## 2. 再現資産

| パス | 役割 |
| --- | --- |
| `tools/h3/matrix.ts` | 固定matrix、決定的fixture、現行bake / sheet計測、median / nearest-rank p95 |
| `tools/h3/measure-node.ts` | 1ケースずつ実行するNode runner。480 / 960 Frameは明示escalationが必要 |
| `tools/h3/index.html`, `browser.ts` | PC / iPhone / iPadで1ケースずつ実行し、結果JSONをdownloadする画面 |
| `tools/h3/result.schema.json` | 計測結果`h3-measurement-1`の機械検証schema |
| `tools/h3/result.template.json` | `measurement-not-run`のschema-valid見本。性能証拠ではない |
| `tools/h3/matrix.test.ts` | L1 fixture、matrix、実製品関数呼び出し、結果schemaの回帰test |

実行ごとにsource commit、fixture SHA-256、case、raw samples、median、nearest-rank p95、環境、能力検出、計数を残す。browser buildはGit HEADを静的bundleへ埋め込み、dirty worktreeでは`-dirty`となって正式計測を拒否する。Node runnerもdirty worktreeを拒否する。`bakeRigAnimation`が出力IDを再採番するため、出力JSON hashを同値oracleにしない。入力fixtureのSHA-256、Frame / LayerState件数、UTF-8 byte数を証拠にする。

## 3. 固定fixture

- fpsは30、keyframeは正規化時刻0 / 0.5 / 1の3件。
- 1 Partは一意な1 Layerを持ち、各Layerは高々1 Partへ所属する。H2=L1に適合する。
- Part / Layer / Texture / rig ID、時刻、名前、transformは決定的に作る。
- `chain`は直前Partを親にする。`flat`は全Partをrootにし、同じ状態量で階層costを比較する。
- 各iterationは新しいfixtureから開始し、結果を次のiterationへ再利用しない。
- warm-up 3回、記録10回を直列実行する。raw sampleを残し、medianとnearest-rank p95を算出する。

## 4. 固定matrix

sheetの計数は現行配置関数を使い、`sheetPixels = columns * rows * canvasWidth * canvasHeight`、`estimatedSheetRgbaBytes = sheetPixels * 4`とする。これは実encode後のPNG byte数ではなく、RGBA展開量の推定である。texture側は`sum(width * height * 4)`を別に記録する。

| Case ID | Frame | Part / State per Frame | px | 階層 | 推定sheet RGBA | 用途 |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| `baseline-60x4x64` | 60 | 4 | 64 | chain | 1 MiB | 全端末の最初の基準 |
| `candidate-120x8x256` | 120 | 8 | 256 | chain | 30.25 MiB | 旧120候補の比較。採用を意味しない |
| `state-240x16x64` | 240 | 16 | 64 | chain | 3.75 MiB | LayerState / JSON圧力 |
| `state-240x16x64-flat` | 240 | 16 | 64 | flat | 3.75 MiB | 親子chainとの比較 |
| `pixel-60x4x512` | 60 | 4 | 512 | chain | 64 MiB | Frame数とpixel負荷の分離 |
| `combined-240x16x256` | 240 | 16 | 256 | chain | 60 MiB | 状態量とpixel候補の組合せ |
| `node-escalation-480x16x64` | 480 | 16 | 64 | chain | 7.56 MiB | 240結果確認後のNode限定追加 |
| `node-escalation-960x16x64` | 960 | 16 | 64 | chain | 15.02 MiB | 480結果確認後のNode限定追加 |

480 / 960 FrameをiPhoneで自動実行しない。全device caseもbatch化せず、利用者が1件を選び、結果JSONを保存して端末状態を確認してから次へ進む。

## 5. Node core測定

```bash
npm run measure:h3:node -- --list
npm run --silent measure:h3:node -- --case baseline-60x4x64 > h3-node-baseline.json
```

240 Frameまでの結果を確認した後だけ、次のようにescalationを明示する。

```bash
npm run --silent measure:h3:node -- \
  --case node-escalation-480x16x64 \
  --allow-escalation > h3-node-480.json
```

Node結果にはOS、Node version、CPU、logical CPU数、総memoryを記録する。ブラウザAPI、画面描画、保存経路を測っていないfieldは`null / not-run`とし、0へ変換しない。生成結果ファイルは計測証拠の保管先へ置き、通常のsource commitへ混ぜない。

## 6. ブラウザcore測定

```bash
npm run measure:h3:build
npm run measure:h3:serve
```

desktop localhostで画面を確認できる。物理iPhone / iPadの正式証拠は、`dist-h3/`を承認済みの一時HTTPS originから同じcommitのまま配信して取得する。LAN上のHTTP preview、Playwright mobile viewport、device emulatorはSafari実機証拠の代替にしない。ハーネスは物理端末でsecure contextでない場合に実行を拒否する。

対象環境は最低でも次の4つとする。

1. PC Chromium。
2. iPhone 17 Pro Safari。
3. iPhone 11 Pro Safari。
4. iPad Pro 2018 Safari。

各結果へcommit、device、OS、browser version、user agent、viewport、device pixel ratio、orientation、Low Power Mode、温度状態を記録する。browserがJS heap、Long Task、storage estimateを提供しない場合は`unsupported`かつ値`null`とする。未対応を0件・0 byteと記録しない。Long Taskは`PerformanceObserver.supportedEntryTypes`で能力を確認し、core計測開始以降かつ終了前に開始したentryだけを集計する。

実行前にlocalStorageへcaseと開始時刻だけのpending markerを置き、完了時に消す。reload / crash後にmarkerが残っていれば、次の結果の`interruptedPreviousRun`へ含める。製品Project、IndexedDB、画像、秘密情報、計測結果を外部へ送信しない。

### 6.1 24時間限定のHTTPS配信

物理iPhone / iPadのB0測定では、`.github/workflows/h3-pages.yml`を使ってmainの計測ハーネスだけをGitHub Pagesへ一時配信する。初回だけrepository SettingsのPagesで配信元を`GitHub Actions`に設定する。この設定とworkflowのmain反映は人間判断後に行い、Draft PRやPR CIから公開しない。

手動workflowの`publish-24h`をmainで実行した時刻を`publishedAt`とし、正確に24時間後を`expiresAt`として静的buildへ埋め込む。公開画面は毎秒期限を確認し、`expiresAt`以降は新しい計測を拒否して期限終了状態を表示する。定期workflowや長時間待機jobは使わず、計測終了後も不要なActions実行を残さない。

全端末のJSONを保存できた場合は、24時間を待たず`close-now`を実行して終了画面へ置き換える。未完了で24時間に達した場合も画面側で計測は止まり、その後`close-now`を実行できる。これは現在のPages deploymentを閉じた静的画面へ更新する処理であり、Pages設定自体の削除ではない。URLも不要になった場合はrepository Settingsから人間がUnpublishする。再計測は新しい`publish-24h`を明示実行し、新しい24時間枠とsource commitを記録する。

Pagesは結果を受信しない。結果JSONは端末へdownloadし、この会話へ添付して非公開保管する。workflow artifactへ結果、端末名、OS状態、user agentをuploadしない。公開資産にsecret、token、Project data、画像を含めない。

公開workflowとPR CIはPlaywright Chromiumで`baseline-60x4x64`を1件実行し、3 warm-up / 10 sample、L1、source commit、結果schemaを確認する。raw JSONと端末情報はartifactへ保存せず、成功 / 失敗だけをCI証拠にする。これは配信資産の動作確認とPC Chromiumの参考計測であり、PC実機の正式raw値、Safari実機、製品pathの代替ではない。

## 7. 製品pathの後段Gate

T1 / R1 / P1の製品実装後は、同じfixtureと採用候補最大値を使い、別のproduct-path測定を行う。各caseはwarm-up 1回、記録3回とし、raw値、median、maxを残す。

```text
bake -> React反映 -> 保存完了 -> Undo -> Redo -> reload
     -> asset.json -> .casproj -> product export ZIP
```

次を別々に記録する。

- 生成分と最終Asset全体のFrame / LayerState。
- compact Asset JSONとpretty `asset.json`のUTF-8 byte数。
- `.casproj`内の各JSON文書。現行input safetyの個別JSON 4 MiB境界との関係。
- sheet pixel、推定RGBA、実sheet生成 / encode時間、出力byte数。
- UI応答、Long Task、保存成功、History往復、reload、crash / page reload marker。
- safe area、software keyboard、44px touch target、縦横orientation。

## 8. 数値決定の停止条件

次のどれかが欠ける間は、H3の数値budgetをacceptedにしない。

- 同じcommitとfixture SHA-256でPC Chromium、指定iPhone 2機種、iPadの結果が揃わない。
- `generated`と`final Asset total`、Frame / LayerState / JSON byte / sheet pixelのいずれかが欠ける。
- unsupported APIを0として集計している。
- reload / crash、Low Power Mode、温度状態、orientationを記録していない。
- Node core結果を製品pathやSafari実機の代替にしている。
- numeric warning / hard capと、上限超過時の原子的拒否を人間が別途承認していない。

H3=M1の完了は「測定方法を固定した」ことまでであり、「120 / 240または他の数値を採用した」ことではない。
