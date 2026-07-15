# 2D-1B-INPUT-SAFETY 実装完了報告

作成日: 2026-07-16
状態: `implementation completed / Draft PR #90 open`
正式work package: `2D-1B-INPUT-SAFETY`
基準main: `3b0ac92f073e23a45fb4fd3f334783b12f3f8b4f`（PR #89 merge）
契約PR: #89 merged
実装Draft PR: #90
実装head: `1c88c8d4386d60ccce4807b30541051ab9ea7346`
CI: Run #264 success

## 1. 結果

accepted済みの`B+X`を実装した。`.casproj`の圧縮入力、ZIP展開、JSON parse、archive画像decode、直接画像入力に数量・構造・実体guardを置き、guard通過前にはcanonical storeへ書き込まない。

Asset追加と画像Layer追加は、1回のpicker / drop batchを全件準備してからだけ確定する。途中の不正入力、decode失敗、保存失敗ではbatchを0件確定とし、Layer batchは1 transaction、1 History entryで保存する。

## 2. accepted profile B

| guard | 固定値 |
|---|---:|
| `.casproj`圧縮入力 | 128MiB |
| ZIP展開合計 | 256MiB |
| ZIP entry数（directory含む） | 1,024 |
| ZIP個別entry | 25MiB |
| JSON 1文書 | 4MiB |
| JSON nesting depth | 64 |
| ZIP path長 | 512 Unicode code points |
| 圧縮率 | 100:1（展開size 1MiB以上） |
| 画像1回選択数 | 16 |
| 画像1枚 | 25MiB / 4096 x 4096 |

## 3. 実装内容

### `.casproj` / ZIP / JSON

- Homeで`File.size`を確認し、128MiB超は`arrayBuffer()`前に拒否する。core入口でも圧縮bytesを再確認する。
- central-directory metadataでentry数、個別 / 合計展開size、圧縮率、path長、unsafe / duplicate path、store / deflate以外のmethodを展開前に拒否する。
- 展開後の実entry数とbytesを再確認する。
- JSONを4MiB以下、strict UTF-8、depth 64以下と確認してから`JSON.parse`へ渡す。
- path違反を黙って無視せず、archive全体を`unsafe-input`として拒否する。

### 画像実体

- PNG / JPEG / WebPをmagic bytesで判定し、直接入力の`File.type`またはarchiveの`TextureRef.mimeType`と照合する。
- archive内canonical画像をbrowser decoderへ通し、decode可否、4096px上限、TextureRef宣言寸法との一致を確認する。
- guard失敗時はstageを中断し、Project / Asset / Blobをcanonical storeへ保存しない。

### B+X batchとquarantine

- Asset batchは最大16件を全件準備し、1回の`saveProjectBundle` transactionで確定する。
- Layer batchは全件のTextureRef、Layer、Blobを準備し、1回の`saveAssetRevision` transactionと1 History entryで確定する。1回のUndo / Redoでbatch全体を戻す。
- 途中失敗時はReact stateも保存正本も更新せず、0件追加を表示する。
- 128MiB超の`.casproj`はbytesを読まず、既存quarantineへfile名、size、理由だけを保存する。最新3件 / 50MiB超bytes非保存の既存契約を維持する。

## 4. 検証証拠

| 検証 | 結果 |
|---|---|
| `npm run lint` | success |
| `npm run format:check` | success |
| `npm run build` | success。既存の500 kB chunk warningのみ。 |
| `npm run test` | 44 files / 392 tests success |
| GitHub Actions | CI Run #264 success |
| E2E job | success |

追加・補強した主な回帰:

- profile B各境界と+1、unsafe / duplicate / long path、unknown compression、展開合計、entry数、圧縮率を検査する。
- invalid UTF-8、JSON bytes、depth、画像MIME spoof、decode失敗、実寸法不一致を拒否する。
- unsafe path、高圧縮entry、壊れたarchive画像を理由付きで拒否し、quarantineへ表示する。
- 17画像選択を拒否し、不正画像を含むAsset batchを0件確定とする。
- 不正画像を含むLayer batchを0件確定とし、正常な複数Layer batchを1回のUndo / Redoで戻す。
- 既存の正常`.casproj` roundtripとPNG / JPEG / WebP入力回帰を維持する。

## 5. 維持した安全不変条件

- schema、DB version、IndexedDB store / index layout、migrationを変更していない。
- `.casproj`とexport ZIPの内部構成、dependenciesを変更していない。
- 復元とtrash完全削除のID衝突拒否、live正本とtrashの維持、全件原子的`purgeAllTrash`を変更していない。
- autosave失敗後に破壊的操作を開始せず、Historyを保存成功後だけ確定する方針を維持した。
- snapshotのStored edit Blob一致確認、`saveProjectBundle`のProject / Asset / TextureRef / Blob整合拒否を変更していない。
- 入力拒否と保存失敗のいずれでも、既存の整合した正本を維持する。

## 6. 残リスク

- browser memory peakは圧縮bytes、展開bytes、decode結果、B+X stagingが同時に存在し得る。B profileで上限を置いたが、実機差は後続の端末検証でも確認する。
- ZIP metadataは展開前に検査し、展開後実bytesも再確認するが、fflate自体のparser / decoder挙動は依存する既存libraryの範囲に残る。
- magic bytesは形式同定であり、画像内容の完全性はbrowser decode結果に依存する。

## 7. 後続

PR #90はDraftのまま維持する。明示指示前にready化、merge、auto-mergeを行わない。PR #90がmainへmergeされた後に文書を同期し、次の正式work package`2D-1B-GATE`へ進む。

`2D-1B-GATE`が完了するまで、追加の2D-2 / 2D-3本実装と3D実装へ進まない。
