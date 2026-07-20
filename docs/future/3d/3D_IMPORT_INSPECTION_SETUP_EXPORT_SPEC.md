# 3D Import / Inspection / Setup / Export Spec（読み込み・検品・設定・書き出し仕様）

状態: **draft / human review required**
最終更新日: 2026-07-19
調査基準commit: `7018984ba9e6867c6fab12fb313308218a35c22b`
上位文書: `README.md`（本ディレクトリ）, `3D_ASSET_DATA_CONTRACT.md`
関連文書: `3D_UI_UX_SPEC.md`, `3D_PERFORMANCE_DEVICE_SECURITY_LICENSE_SPEC.md`, `3D_TEST_EVIDENCE_AND_RELEASE_SPEC.md`

> **この文書は 3D 実装開始の承認ではない。** しきい値のうち「暫定」と記した値は、Gate 後の fixture 実測（`3D-GATE-05` / `3D-STAGE2-06`）で確定するまで根拠のある確定値として扱わない。

---

## 1. 対応形式

| 形式 | 段階 | 扱い |
|---|---|---|
| GLB（単一ファイル） | 第一段階 | 必須。最初の唯一の入力形式 |
| glTF + bin + textures（bundle） | 第二段階 | 複数ファイル選択または ZIP で受け取る |
| OBJ + MTL + textures | 対象外（将来候補） | 旧要件で後続候補だったが、material/animation 表現力が低く、glTF へ集約する。第四段階の再判断項目 `3D-OPEN-20` |
| FBX / Blender file | 対象外 | 旧要件の決定を維持（ブラウザ・ライセンス・仕様の負担が大きい） |
| 出力: GLB / `.cas3dproj` / export ZIP | 第一段階から | 8 章 |

- 第一段階を GLB だけに限定する理由: 単一ファイルで外部参照が無く、安全検証が単純になる。生成 AI 系ツールの主要出力でもある。glTF bundle は「外部 URI」という攻撃面が増えるため、検証設計（3.4）を伴う第二段階に回す。

**export ZIP の再読み込みについて**: 書き出した ZIP そのものは、Chameleon の通常の取り込み経路の入力形式ではない（正式な取り込みは GLB / glTF bundle / `.cas3dproj`）。契約 15 章の round-trip 条件 2「export ZIP 内の `asset3d.json` を再度読み込んだ場合、anchors / colliders / settings が同値で読める」は、**テストが ZIP を展開して `model/` の GLB を通常経路で取り込み、同梱の `asset3d.json` を `validateAsset3d` で読んで値を照合する**ことを指す（利用者が ZIP を直接開く UI 経路を作る意味ではない）。この照合は `3D-STAGE1-10` の round-trip テストで行う。

---

## 2. import bundle の受け取り方（第二段階）

- 受け取り方は「複数ファイル選択（`.gltf` + `.bin` + 画像）」と「ZIP」の 2 通り。
- フォルダ D&D は PC のみの補助とし、必須経路にしない（iPhone / iPad で使えないため）。
- `.gltf` が参照する URI は、**同時に渡されたファイル名の集合の中でだけ**解決する。それ以外は 3.4 のとおり拒否する。

---

## 3. 安全な読み込み（検証パイプライン）

読み込みは次の順に検証し、どこで失敗しても「元ファイルを変更せず、理由を表示し、必要なら quarantine3d へ隔離」する。2D の `CasprojError` 段階検証（invalid-archive / input-limit / unsafe-input …）と同じ思想で、3D 用のエラー code を新設する。

### 3.1 受付前チェック（同期・数 ms）

1. 拡張子と宣言 MIME を見るが、**信用しない**（判定の主根拠にしない）。
2. ファイルサイズ上限: 暫定 **512MB 超は即時拒否**、**64MB 超は警告付き確認**（「読み込みに時間がかかり、モバイルでは失敗する可能性があります」）。確定は Gate 後実測。
3. magic number: 先頭 4 bytes `glTF`（0x676C5446）で GLB と判定。glTF (JSON) は UTF-8 テキストとして `{` 開始 + `"asset"` キー存在で判定。

### 3.2 GLB 構造チェック

1. header: version == 2 のみ受理。length がファイル実サイズと一致。
2. chunk 走査: JSON chunk（必須・先頭）と BIN chunk（0 or 1 個）以外の未知 chunk は**保持するが警告**。chunk length の合計が超過/不足するファイルは拒否（`corrupt-container`）。
3. JSON chunk のサイズ上限: 暫定 **32MB**（異常に巨大な JSON による DoS 防止）。
4. JSON parse は try/catch + 時間計測。parse 自体は Worker で行う（UI を固めない）。

### 3.3 glTF 構造チェック（Worker 内）

上限はすべて暫定値。プリセット確定（`3D-STAGE2-06`）まで「読み込み拒否」ではなく「エラー級警告 + 表示は試行」を既定とし、拒否するのは資源枯渇に直結する下記のみ。

| 項目 | 暫定上限（拒否） | 理由 |
|---|---|---|
| node 数 | 100,000 | 走査・表示の DoS 防止 |
| accessor が指す byte 範囲 | buffer 実サイズ内であること | 破損 buffer の読み出し防止 |
| 画像 1 枚の解像度 | 16384px 超 | デコードでのメモリ枯渇防止 |
| animation channel 数 | 65,536 | 同上 |
| 展開後テクスチャ推定メモリ | 暫定 2GB 超 | width×height×4 の合計で見積もる |

### 3.4 外部参照の扱い

- **remote URL（http/https URI）は解決しない**。検出したら「外部 URL を参照しています。この参照は読み込まれません」というエラー級警告を出し、該当 texture/buffer を欠落扱いで続行する。外部 URL から自動取得する設計は将来も既定にしない。
- data URI は許可（サイズは 3.3 の上限に含める）。
- 相対パス URI は、第二段階の bundle 内でのみ解決。`..`・先頭 `/`・backslash・drive letter・percent-encoding で上記になるものは拒否（2D の `blobPaths` 安全規則と同じ発想。path traversal 防止）。
- ZIP 読み込み時: 展開後合計サイズの上限（暫定 1GB）と、entry 数上限（暫定 4,096）を超えたら拒否（zip bomb 防止）。entry パスにも上記の安全規則を適用。

### 3.5 失敗時の処理

- 検証エラーは日本語の理由文＋対象（何番目の chunk / どの URI か）を添えて表示。
- 受付前〜構造チェックで拒否したファイルは `quarantine3d` に隔離（最新 3 件、50MB 超は bytes 無し。2D と同じ規則）。
- 読み込み中の利用者中断（キャンセルボタン）は常に可能とし、中断時は途中生成物（部分保存・Object URL）を残さない。

---

## 4. 検品（inspection）

### 4.1 検査の実行モデル

- 検品は「検査バージョン（`inspectionVersion: "3d-inspect-v1"`）+ プリセット + 検査項目の実測値」で構成し、結果を inspection report（5 章）に記録する。
- 検査は source バイト列に対して行う。派生（derived）に対しては第三段階で同じ検査を再実行し比較する。

### 4.2 検査項目と警告の構造

各警告は次のフィールドを必ず持つ（`3D_ASSET_DATA_CONTRACT.md` 4 章の `chameleon-3d-inspection` 文書）:

```jsonc
{
  "checkId": "3D-CHK-TRI-001",
  "severity": "warning",          // info | warning | error
  "target": { "kind": "mesh", "index": 2, "name": "Body" },
  "measured": 180234,              // 実測値
  "recommended": 100000,           // 推奨値（プリセット由来）
  "preset": "mobile",
  "reason": "三角形数が mobile プリセットの推奨値を超えています",
  "gameImpact": "低性能スマホで描画落ち（フレームレート低下）が起きる可能性があります",
  "fix": "第三段階の簡略化（simplification)、または外部ツールでのポリゴン削減",
  "fixableInChameleon": false,     // 第三段階実装後に true へ更新される項目もある
  "ignorableWhen": "PC 専用ゲームで、対象端末に低性能スマホを含めない場合",
  "inspectionVersion": "3d-inspect-v1"
}
```

### 4.3 検査項目一覧（段階別）

第一段階（最小セット。ID は `3D-CHK-*`）:

| checkId | 内容 |
|---|---|
| 3D-CHK-SIZE-001 | ファイルサイズ（プリセット比） |
| 3D-CHK-TRI-001 | 三角形数 |
| 3D-CHK-VTX-001 | 頂点数 |
| 3D-CHK-MAT-001 | material 数 |
| 3D-CHK-TEX-001 | texture 枚数 |
| 3D-CHK-TEX-002 | texture 最大解像度 |
| 3D-CHK-ANIM-001 | animation 数（0 の場合は info「アニメーションがありません」） |
| 3D-CHK-BND-001 | bounds の大きさ（unit 前提でのサイズ表示。極端な大小を警告） |
| 3D-CHK-BND-002 | bounds 中心の原点からのズレ |
| 3D-CHK-ORG-001 | 原点が足元（bounds 底面中心）から大きくずれている |

第二段階で追加:

| checkId | 内容 |
|---|---|
| 3D-CHK-GEO-001/002 | normal 欠落 / tangent 欠落（normal map があるのに tangent が無い） |
| 3D-CHK-UV-001/002 | UV 欠落（texture 付き material なのに UV が無い）/ UV 範囲異常 |
| 3D-CHK-PBR-001 | metallic-roughness texture の色空間指定の疑い（sRGB/linear 取り違え） |
| 3D-CHK-ALPHA-001 | alpha blend material の多用（描画順問題の予告） |
| 3D-CHK-DS-001 | double-sided material の多用 |
| 3D-CHK-SKIN-001 | skin / skeleton の有無と joint 数 |
| 3D-CHK-MORPH-001 | morph target の有無と数 |
| 3D-CHK-NODE-001 | 未使用 node / 空 node の多さ |
| 3D-CHK-EXT-001 | 未対応 extension の列挙（KHR_* の既知/未知を区別） |
| 3D-CHK-LGT-001 / CAM-001 | light / camera の同梱（ゲーム素材では通常不要の info） |

第二段階で追加（2026-07-20 改訂。`3D-STAGE2-11`。定義は `3D_INTEROP_VRM_VR_AND_CREATION_SPEC.md` 4〜5 章）:

| checkId | 内容 |
|---|---|
| 3D-CHK-VRM-001 | VRM 拡張の検出と版（0.x / 1.0）・meta 記入状況（未記入は warning） |
| 3D-CHK-VRM-002 | VRM humanoid 必須ボーンの欠落 |
| 3D-CHK-VRM-003 | spring bone / expression の有無（info。Chameleon では編集不可の明示） |
| 3D-CHK-BONE-001 | bind pose（inverseBindMatrices）と node 階層の整合 |
| 3D-CHK-BONE-002 | 初期姿勢の T-pose / A-pose 推定表示（info） |
| 3D-CHK-BONE-003 | 頂点ウェイト異常（合計が 1 でない / 影響 joint 数超過） |

第三段階で追加: 重複 mesh/material/texture 検出（3D-CHK-DUP-*）、未使用 resource（3D-CHK-UNUSED-*）、圧縮状態の表示（3D-CHK-COMP-*）。

### 4.4 プリセット（暫定しきい値）

`mobile` / `generic-web` / `desktop` / `vr` の 4 プリセット（`vr` は 2026-07-20 改訂で追加。`3D_INTEROP_VRM_VR_AND_CREATION_SPEC.md` 6.1）。**下表の数値はすべて暫定**であり、`3D-STAGE2-06` で fixture 実測とともに確定する（vr は VR 実機が用意できるまで暫定のままと明示して残してよい）。根拠の無い断定を避けるため、UI にも「暫定基準」と表示する。

| 項目 | mobile 暫定 | generic-web 暫定 | desktop 暫定 | vr 暫定 |
|---|---|---|---|---|
| ファイルサイズ warning | 8MB | 25MB | 100MB | 15MB |
| 三角形数 warning | 100,000 | 300,000 | 1,000,000 | 50,000 |
| texture 最大辺 warning | 2048 | 4096 | 8192 | 2048 |
| material 数 warning | 8 | 16 | 64 | 4 |
| joint 数 warning | 64 | 128 | 256 | 64 |

---

## 5. inspection report（検査記録）

```jsonc
{
  "format": "chameleon-3d-inspection",
  "version": "0.1.0",
  "inspectionVersion": "3d-inspect-v1",
  "assetId": "a3d_xxxxxxxx",
  "sourceSha256": "…",
  "preset": "generic-web",
  "inspectedAt": "2026-07-19T00:00:00.000Z",
  "stats": { /* asset3d.stats と同形の実測値 */ },
  "bounds": { "min": {…}, "max": {…} },
  "findings": [ /* 4.2 の警告オブジェクト配列 */ ],
  "summary": { "errorCount": 0, "warningCount": 2, "infoCount": 3 }
}
```

- report は追記型（検査のたびに新ファイル）。`.cas3dproj` には最新 1 件を必須同梱、履歴は容量を見て任意。
- `sourceSha256` により「どのバイト列に対する検査か」を必ず紐づける。

---

## 6. Setup（原点・向き・大きさの設定）

- 設定項目と意味は `3D_ASSET_DATA_CONTRACT.md` 6 章 `settings` / 13 章のとおり（unit / unitScale / upAxis / forwardAxis / originMode / originOffset / rotationOffset）。
- すべて非破壊（metadata のみ）。viewer は設定を反映した見た目（ground に足が付く、正面がカメラを向く）を即時表示する。
- 「自動推定」は第一段階では行わない。bounds からの feet 候補表示（「足元をここに設定しますか?」ボタン）だけを提供し、勝手に適用しない。
- 利用者確認が必要な操作（13.2 の区分）には、適用前に差分（before/after の数値）を表示する。

---

## 7. Game Data（anchor / collider）

- 構造は `3D_ASSET_DATA_CONTRACT.md` 7 章。第一段階は model space の anchor + box/sphere collider、第二段階で capsule と node 追従（nodeRef）を追加。
- 入力は 3D viewer 上のギズモ操作**と**数値入力の両方を必ず提供する（タッチ端末・アクセシビリティ・精密入力のため。`3D_UI_UX_SPEC.md`）。
- collider の視覚表示は半透明 + ワイヤー表示。purpose 別の色は 2D の判定編集（Phase 19-C の用途カラー）と同じ配色規則を使う。

---

## 8. 書き出し（export）

### 8.1 export ZIP 構造（第一段階の最小形）

```txt
{asset.name}-3d-export.zip
├─ model/
│  └─ model.glb                  … source をそのまま複製（バイト列不変・hash 一致）
├─ metadata/
│  └─ asset3d.json               … 現在の編集情報
├─ reports/
│  └─ inspection-report.json     … 最新の検査記録
├─ export-manifest.json          … 下記 8.3
└─ README.md                     … 8.4
```

第二段階で追加: `engines/README-threejs.md` ほか import notes、`thumbnails/thumb.webp`。
第三段階で追加: `model/model.optimized.glb`（選択した derived）、verification record。

**glTF bundle（`source.kind = "gltf-bundle"`）の場合（第二段階 `3D-STAGE2-01` の範囲）**: `model/` 配下に source の `files[]` 全件（`.gltf` + `.bin` + textures）を、取り込み時の相対構成を保って複製する。各ファイルは export-manifest の `files[]` に `role: "source-copy"` で列挙し、それぞれ byteLength / sha256 を記録する。`.gltf` 内の相対 URI は複製後も同一集合内で解決できる配置にする（外部 URI は取り込み時に既に欠落扱いのため複製対象に無い）。

### 8.2 変換の扱い

- 第一段階: モデルは**常に source のまま**出す。settings は metadata として同梱し、変換はゲーム側 / エンジン側の作業として import notes に書く。
- 第二段階以降（`3D-OPEN-05` 承認後): 「変換を焼き込んだ GLB を出す」オプションを追加。skin / animation 付きモデルは既定オフ + 警告（`3D_ASSET_DATA_CONTRACT.md` 13.5）。

### 8.3 export-manifest.json

```jsonc
{
  "format": "chameleon-3d-export-manifest",
  "version": "0.1.0",
  "exportedAt": "2026-07-19T00:00:00.000Z",
  "appVersion": "<package.json の version>",
  "preset": "generic-web",
  "files": [
    { "path": "model/model.glb", "byteLength": 1234567, "sha256": "…", "role": "source-copy" },
    { "path": "metadata/asset3d.json", "byteLength": 4567, "sha256": "…", "role": "metadata" }
  ],
  "source": { "sha256": "…", "originalFileName": "slime.glb" },
  "deterministic": true            // 8.5 の条件を満たす場合のみ true
}
```

- `deterministic` フィールドは第一段階から出力する。第一段階〜第二段階の書き出しは source 複製 + JSON 整形のみで決定性を満たせるため、`3D-STAGE1-10` で 8.5 のタイムスタンプ・順序固定を実装した時点で `true` にできる。焼き込み・最適化を含む出力（第三段階）で決定性を保証できない操作を含む場合のみ `false` とし、理由を併記する。決定性の自己検証（同一入力から 2 回書き出して hash 一致を確認）の自動化は `3D-STAGE3-08` で行う。

### 8.4 README（ZIP 同梱）

- アセット名、内容一覧、座標系（glTF: 右手系 / +Y up / +Z 正面 / meter）、settings の値、anchor / collider の一覧、利用条件（license.declared。unknown の場合は「利用条件未確認」と明記）、既知の制限（未対応 extension 等）を日本語で記載。
- 2D export ZIP の README と同じ「これを読めば何をゲームに入れればよいか分かる」品質を目標にする。

### 8.5 再現可能な出力（deterministic export）

- 目標: 同じ source + 同じ asset3d.json + 同じアプリ版から、同じ bytes の ZIP を再現できる。
- 条件: ZIP 内のタイムスタンプ固定、ファイル順序固定、JSON の key 順序と整形の固定。`exportedAt` は manifest のみに置き、他ファイルへ埋め込まない。
- 焼き込み・最適化を含む出力は、ツールチェーン版を manifest に記録し、決定性を保証できない操作は `deterministic: false` と明記する（第三段階 `3D-STAGE3-08`）。

### 8.6 engine 対応の表示区分

| 区分 | 意味 | 初期の対象 |
|---|---|---|
| `verified` | 実際にそのエンジンで fixture を読み込み、表示・スケール・向き・（あれば）animation を確認した証拠がある | 第四段階で Three.js / Babylon.js を目標 |
| `candidate` | 対応作業中。証拠が揃っていない | - |
| `import notes only` | 手順書のみ提供。実行検証はしていない | 第二段階の Godot / Unity / Three.js / Babylon.js + Blender / Unreal（2026-07-20 改訂で追加。連携マトリクスは `3D_INTEROP_VRM_VR_AND_CREATION_SPEC.md` 3 章） |
| `unsupported` | 対応しない | FBX 入力等（Mixamo 等の FBX は Blender 経由の supply notes で受ける） |

**説明を書いただけの対象を `verified` と表示してはいけない**（2D 互換性表と同じ規則）。区分は export ZIP の README と import notes に明記する。

### 8.7 ZIP 内の安全なパスとファイル名規則

- パスは ASCII の相対パスのみ。`..` / 先頭 `/` / backslash / 制御文字を含めない（2D `blobPaths` 規則を流用）。
- `{asset.name}` は 2D と同じファイル名サニタイズ規則を通す。
- 同名衝突時は連番（`model-2.glb`）。

---

## 9. 失敗時の処理（書き出し）

- 書き出し前に `validateAsset3d`（schema 検証）を必ず実行。不正なら理由を `ExportError` 相当で表示し、ZIP を作らない（2D `exportZip` と同じ順序）。
- source Blob が IndexedDB から欠落している場合は書き出しを中止し、「元モデルが見つかりません」と復旧手段（`.cas3dproj` の再読み込み）を案内する（2D Phase 15.5-A の `CasprojError` と同じ思想)。
- 書き出し中は進捗を表示し、キャンセル可能にする（大容量 ZIP の生成は Worker + 進捗。第一段階では GLB 複製が主なので簡易でよい）。

---

## 10. 未決定事項（この文書の範囲）

- 3.1 / 3.3 / 3.4 / 4.4 の暫定上限・しきい値の確定（`3D-GATE-05` で端末確定 → `3D-STAGE2-06` で fixture 実測）。
- `3D-OPEN-05`: 焼き込み書き出しの提供時期。
- `3D-OPEN-20`: OBJ 入力の再検討（第四段階）。
- KTX2 / Draco / Meshopt 圧縮済み GLB の「読み込み対応」を第二段階に前倒しするか（既定: 第三段階 `3D-STAGE3-02`。圧縮 GLB は AI 生成物では稀のため）→ `3D-OPEN-08`。
