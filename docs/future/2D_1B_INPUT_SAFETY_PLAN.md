# 2D-1B-INPUT-SAFETY 実装契約

作成日: 2026-07-16
状態: `implementation completed / Draft PR #90 / CI Run #264 success`
正式work package: `2D-1B-INPUT-SAFETY`
基準main: `a9a1e27a6f69544c379fb9fcefc90a13e0928859`（PR #88 merge）
直前work package: `2D-1B-CASPROJ` completed（最終head CI Run #260 success）

## 1. 目的

ZIP、JSON、画像、Files / drag-and-drop入力をすべて信頼しない入力として扱い、展開・parse・decode・canonical保存の前に、構造、種類、数量、参照、実体を検査する。拒否時は理由を利用者へ示し、既存正本を変更せず、`.casproj`は既存quarantine契約へ隔離する。

本work packageでは、入力を安全に拒否する境界だけを実装する。schema、version、migration、`.casproj` / export ZIP内部構成、DB layout、dependenciesは変更しない。

## 2. 着手時GitHub基準

- default branch: `main`
- main: PR #88 merge commit `a9a1e27a6f69544c379fb9fcefc90a13e0928859`
- PR #88: merged
- PR #88最終head: `15e77f4bd59c7e03dc5877060fbc9195567db177`
- CI Run #260: lint、format、build、unit test、E2Eがすべてsuccess
- open PR: 0件

## 3. 既存防御の監査

| 対象 | 既存防御 | 未完了gap |
|---|---|---|
| 直接画像入力 | PNG / JPEG / WebPの`File.type`、1枚25MiB、最大辺4096px、browser decode失敗を拒否する。 | magic bytesと宣言MIMEの一致、複数選択数、batch途中失敗の扱いが未固定。 |
| `.casproj`圧縮bytes | ZIPとして読めない入力を`CasprojError`にする。 | 圧縮入力bytes上限がなく、File全体を`arrayBuffer`へ読む。 |
| ZIP展開 | fflateで展開し、危険な相対pathはcanonical候補へ入れない。 | 展開前のfile数、個別 / 合計展開bytes、圧縮率、重複path、path長、unknown compression検査がない。危険pathを黙って無視する。 |
| JSON | 文書ごとにmigrate後、AJV schema検証する。 | UTF-8 strict decode、document bytes、nesting depthの上限がない。 |
| archive内画像 | TextureRefが必要とするpath存在と重複を検査する。 | 画像magic、declared MIME、decode可否、実寸法、TextureRef寸法一致、25MiB / 4096px境界を検査しない。 |
| canonical保存 | CASPROJ stage完了後だけ原子的`saveProjectBundle`を呼ぶ。 | 入力resource上限を通過した証拠をstage結果へ持たない。 |
| quarantine | 最新3件。50MiB超の元bytesは保存せずsizeと理由だけ残す。 | 既存契約を維持する。巨大入力をquarantineへ複製しない点は防御として有効。 |
| UI | `.casproj`拒否理由と正本非変更を表示する。 | limit種別ごとの理解可能な理由、直接画像batchの結果表示が未固定。 |

## 4. 変更範囲

### 4.1 扱うこと

- `.casproj`圧縮入力bytesの読取り前 / core入口の二重guard
- ZIP central-directory metadataを使う展開前preflight
- file数、個別 / 合計展開bytes、圧縮率、path長
- absolute path、`.` / `..`、空segment、backslash、NUL / control文字、重複pathの拒否
- store / deflate以外のcompression method拒否
- JSONのstrict UTF-8、document bytes、nesting depth
- archive内PNG / JPEG / WebPのmagic、decode、実寸法、declared MIME / TextureRef寸法一致
- 既存25MiB / 4096px画像境界の直接入力とarchive入力への一貫適用
- 複数画像選択の件数guardと失敗時契約
- 正本非変更、quarantine、理由表示
- unit、E2E、完了報告

### 4.2 変更しないこと

- `asset.json` / `project.json` / export presets schemaとversion
- migration配列とmigration手順
- `.casproj`内部path、必須file、ZIP構成
- export ZIP内部構成
- DB version、IndexedDB store / index layout
- quarantineの3件 / 50MiB既存契約
- dependencies
- SVG / atlas JSONの新規import実装
- network URLの取得機能
- 2D-2 / 2D-3本実装
- 3D / WebGPU

## 5. 非数値の固定契約

次は値の選択に依存せず、本契約で固定する。

1. ZIPは展開前metadata preflightを通過したentryだけを展開する。
2. path違反、重複path、unknown compressionはorphan扱いで無視せずarchive全体を拒否する。
3. JSONはstrict UTF-8 decodeとdepth検査後にだけ`JSON.parse` / migrate / schema検証へ進める。
4. archive内画像はTextureRefの宣言だけを信用せず、実体decode、MIME、実寸法を照合する。
5. 外部URL文字列を保存dataに持つ既存provenance契約は壊さないが、入力を理由にURLへ自動接続しない。
6. limit拒否は`CasprojError`のinput-limit分類とし、canonical storeへ書かない。
7. `.casproj`拒否時は既存quarantineへ理由とsizeを残す。50MiB超の元bytesは既存どおり複製しない。
8. 保存容量不足などcommit側の失敗は不正入力としてquarantineしない。

## 6. 数量profile

MiBは`1024 * 1024 bytes`とする。画像の25MiB / 4096pxは既存accepted要件のため全案で維持する。

| guard | A: mobile-first | B: balanced（accepted） | C: large-project |
|---|---:|---:|---:|
| `.casproj`圧縮入力 | 64MiB | 128MiB | 256MiB |
| ZIP展開合計 | 128MiB | 256MiB | 512MiB |
| ZIP entry数（directory含む） | 512 | 1,024 | 2,048 |
| ZIP個別entry | 25MiB | 25MiB | 25MiB |
| JSON 1文書 | 2MiB | 4MiB | 8MiB |
| JSON nesting depth | 48 | 64 | 96 |
| ZIP path長（Unicode code point） | 240 | 512 | 1,024 |
| 圧縮率guard | 50:1 | 100:1 | 200:1 |
| 圧縮率を判定する最小展開size | 1MiB | 1MiB | 1MiB |
| 直接画像の1回選択数 | 8 | 16 | 32 |

accepted Bの理由:

- 既存25MiB画像を複数含む実用projectをAより許容しつつ、入力bytesと展開後copyが同時に存在する現在のbrowser memory modelでCほど大きなpeakを許さない。
- 既存生成pathとJSONは十分小さく、512 code point / 4MiB / depth 64は現行正常dataを制限しにくい。
- PNG / JPEG / WebPは既に圧縮済みで通常のZIP圧縮率が低く、100:1はzip bombを早期拒否しつつ通常画像を妨げにくい。

2026-07-16にユーザーが`B+X`を選択したため、production constantはBで固定する。A / Cは判断履歴としてのみ残し、実装値には使用しない。

## 7. 複数画像batch契約

### X: batch全件原子（accepted）

- 1回のfile picker / dropで渡された全fileを検査・decode・準備してから1 transactionで保存する。
- 1件でも不正、decode失敗、保存失敗なら新規Asset / Layerを1件も確定しない。
- 利用者には失敗file名と理由、既存正本非変更を表示する。
- peak memoryは増えるため、§6の選択数上限と組み合わせる。

### Y: file単位確定 + 明示結果（非採用）

- fileごとに検査と保存を確定し、後続fileが失敗しても先行成功分は残す。
- 成功 / 失敗file一覧と「何件保存されたか」を必ず表示する。
- peak memoryは抑えられるが、1回の利用者操作が部分成功になる。

2026-07-16にユーザーが`B+X`を選択したため、Asset追加とLayer追加の両方をXへ統一する。Layer batchは全件を1 transaction、1 History entryで確定し、1回のUndo / Redoでbatch全体を戻す。

## 8. 実装段階

| 段階 | 処理 | canonical書込 |
|---|---|---|
| 1. intake | file数、File.size、入力bytes、種類を確認する。 | なし |
| 2. ZIP preflight | central directoryからpath、重複、method、圧縮 / 展開size、ratioを確認する。 | なし |
| 3. bounded unpack | accepted entryだけを展開し、個別 / 合計実bytesを再確認する。 | なし |
| 4. document guard | JSON bytes、UTF-8、depthを確認する。 | なし |
| 5. image guard | magic、MIME、decode、寸法、TextureRef一致を確認する。 | なし |
| 6. CASPROJ reconcile | 既存CASPROJのmigration、schema、参照、ID mappingを実行する。 | なし |
| 7. commit | 既存transactionで確定する。 | この段階だけ |

metadata値だけを信用せず、展開中 / 展開後の実bytesでも上限を再確認する。

## 9. errorとUI契約

- 入力size、展開合計、file数、個別entry、圧縮率、path、JSON、画像のどのguardで拒否したかを区別する。
- 利用者向けmessageには実測値、上限、問題file名を可能な範囲で含める。
- `.casproj`拒否時は「既存の保存済みProjectは変更されていない」を表示する。
- 直接画像拒否時も、既存Project / Asset / Layerが変更されていない範囲を表示する。
- 375px幅で長いfile名やpathが横overflowを起こさない。
- limit値を非対応や故障として曖昧表示しない。

## 10. test契約

### unit

- 圧縮入力、展開合計、file数、個別entry、ratioの境界値を受理し、+1を展開前に拒否する。
- directoryを含むentry数、duplicate / unsafe / long path、unknown methodを拒否する。
- invalid UTF-8、JSON bytes、depthの境界と+1を拒否する。
- PNG / JPEG / WebPのmagic spoof、decode失敗、MIME不一致、寸法超過、TextureRef寸法不一致を拒否する。
- stage失敗時にcanonical storeへ書かない。
- quarantineの3件 / 50MiB契約を維持する。
- 選択したX / Y batch契約をAsset追加とLayer追加の両方で固定する。

### E2E

- zip bomb相当の高圧縮entryを理由付きで拒否し、Project件数を維持する。
- duplicate / unsafe path、oversized JSON、壊れた画像を理由付きで拒否し、quarantineへ表示する。
- 直接画像のMIME spoof、上限超過、複数file失敗契約を表示する。
- 正常な現行`.casproj`とPNG / JPEG / WebP入力回帰を維持する。
- 375px幅でlimit errorと長いfile名が横overflowを起こさない。

### CI

- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run test`
- `npm run e2e`

すべて成功すること。失敗は同じbranch・同じDraft PRで修正する。

## 11. 完了条件

- accepted profileの全limitが展開 / parse / decode前後で実装されている。
- accepted batch契約がAsset / Layer入力で一貫している。
- 入力拒否と保存失敗のどちらでも既存正本を壊さない。
- `.casproj`不正入力を理由付きでquarantineし、巨大bytesを重複保存しない。
- schema、version、migration、ZIP構成、DB layout、dependenciesに差分がない。
- unit、E2E、標準CIが全成功する。
- `2D_1B_INPUT_SAFETY_REPORT.md`へ実装、test、残リスク、次の`2D-1B-GATE`を記録する。

## 12. 停止条件

- schema / version / migration / ZIP内部構成の変更が必要になる。
- DB version / store layout変更が必要になる。
- dependency追加が必要になる。
- provenance URL文字列自体の禁止など既存data契約変更が必要になる。
- accepted済みの保存安全方針と両立しない。

## 13. 後続順序

```text
2D-1B-INPUT-SAFETY
→ 2D-1B-GATE
```

`2D-1B-GATE`が完了するまで、追加の2D-2 / 2D-3本実装と3D実装へ進まない。
