# 3D Asset Data Contract（3D データ契約・候補案）

状態: **draft / human review required**
最終更新日: 2026-07-20（第2改訂: nodeBinding / rigDraft / derived 連鎖 parentRef / rigged・motion-baked kind を追加）
調査基準commit: `7018984ba9e6867c6fab12fb313308218a35c22b`
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
上位文書: `README.md`（本ディレクトリ）, `3D_ARCHITECTURE_AND_BOUNDARIES.md`
関連文書: `3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md`, `3D_FOUR_STAGE_IMPLEMENTATION_PLAN.md`

> **この文書は 3D 実装開始の承認ではない。** 2D Pro Gate（`../2D_COMPLETION_ROADMAP.md` 8 章）の人間承認前に、この契約を実装（型追加・schema 追加・dependency 追加）してはいけない。この文書は計画段階の候補構造であり、採用には `3D_DECISION_LOG_AND_OPEN_ITEMS.md` に列挙した決定記録の人間承認が必要である。

---

## 1. 目的と責任範囲

この文書は、3D Asset Preparation Mode が扱う保存データの候補構造を定義する。

分かりやすく言うと、「3D モデルと、そこに付けるゲーム用の情報を、どういうファイルとしてどこに保存するか」の約束事である。

この文書が責任を持つ範囲:

- 3D プロジェクト形式（`.cas3dproj`）の候補構造
- `asset3d.json`（3D アセットのメタデータ）の候補構造
- 元モデル・編集情報・派生モデル・検査記録・書き出し記録の分離
- version と migration の方針
- 座標・単位・軸・原点の意味
- anchor / collider / provenance / license / unknown data の扱い
- 不変条件と round-trip 条件

この文書が責任を持たない範囲（他文書が担当）:

- 読み込みの安全検証・検品項目 → `3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md`
- 画面と操作 → `3D_UI_UX_SPEC.md`
- 性能・端末・ライセンス → `3D_PERFORMANCE_DEVICE_SECURITY_LICENSE_SPEC.md`

---

## 2. 既存 2D 契約との関係（最重要の不変条件）

3D データ契約は、既存 2D 契約に **一切の変更を加えない**。

| 既存 2D 契約 | 3D 導入後の扱い |
|---|---|
| `asset.json`（`chameleon-asset` 0.1.0） | 変更しない。3D の型・フィールドを追加しない |
| `project.json`（`chameleon-project` 0.1.0） | 変更しない。3D アセットを既存 Project へ混ぜない |
| `.casproj` | 変更しない。3D は別拡張子 `.cas3dproj` を使う（推奨案。12 章） |
| 2D export ZIP / `atlas.json` | 変更しない |
| 既存 JSON Schema（`src/core/schema/*.schema.json`） | 変更しない。3D schema は新規ファイルとして追加する |
| IndexedDB `chameleon-asset-studio`（DB_VERSION 2） | 変更しない。3D は別 DB を新設する（推奨案。11 章） |
| 既存 TypeScript 型（`Asset` / `Layer` / `Frame` / `Animation` 等） | 意味を変えない。3D 型は新しい名前空間（`src/core3d/model/` 案）に置く |

2D の `Layer` と 3D の node、2D の `Frame` と 3D の animation clip、2D の pixel 座標と 3D の unit は**同一視しない**（`../PRODUCT_DIRECTION_2D_TO_3D.md` 6.2 の決定を維持）。

---

## 3. データの 5 層分離

3D アセットのデータは、次の 5 層に分けて保存する。「元のモデルは絶対に壊さない」ことを構造で保証するためである。

| 層 | 内容 | 変更可否 | 保存場所（候補） |
|---|---|---|---|
| 1. source（元モデル） | 取り込んだ GLB / glTF bundle のバイト列そのもの | **不変**。編集・最適化で上書きしない | IndexedDB `blobs3d` / `.cas3dproj` の `source/` |
| 2. edit metadata（編集情報） | 単位、軸、原点、スケール、anchor、collider、名前、タグ | 利用者が編集する | `asset3d.json` |
| 3. derived（派生モデル） | 変形焼き込み・最適化で生成した別バイト列 | 再生成可能。source から作り直せる | IndexedDB `blobs3d` / `.cas3dproj` の `derived/` |
| 4. inspection（検査記録） | 検品の実測値と警告 | 検査のたびに追記 | IndexedDB `reports3d`（11 章）/ `.cas3dproj` の `reports/` 配下の JSON |
| 5. export record（書き出し記録） | いつ、何を、どの hash で書き出したか | 書き出しのたびに追記 | IndexedDB `reports3d` / `.cas3dproj` の `reports/` 配下の JSON |

層をまたぐ規則:

- 層 2〜5 が失われても、層 1 から再作業できる。
- 層 3 は層 1 + 層 2 から決定的に再生成できることを目標にする（再現条件は 15 章）。
- UI の一時状態（カメラ位置、選択中 node、開いているパネル）はどの層にも保存しない（2D と同じ原則。`docs/DATA_FORMAT.md` 6 章）。
  - 例外候補: カメラ初期位置を「表示設定」として保存したい場合は、層 2 に明示フィールドを追加する決定を先に行う（`3D-OPEN-12`）。

---

## 4. 文書一覧（3D で新設する形式）

| 文書 | format 識別子（候補） | 置き場所 | 用途 |
|---|---|---|---|
| project3d.json | `chameleon-3d-project` | `.cas3dproj` 直下 / IndexedDB | 3D プロジェクト（アセットの束） |
| asset3d.json | `chameleon-3d-asset` | `assets/<id>/` | 1 つの 3D アセットの編集情報 |
| inspection-report.json | `chameleon-3d-inspection` | `assets/<id>/reports/` | 検品の実測値と警告 |
| export-manifest.json | `chameleon-3d-export-manifest` | export ZIP 直下 | 書き出し内容の一覧と hash |

すべての文書は 2D と同じ規則で `format`（固定文字列）と `version`（semver 文字列）を先頭に持つ。初期 version は `0.1.0`。

---

## 5. project3d.json（候補構造）

```jsonc
{
  "format": "chameleon-3d-project",
  "version": "0.1.0",
  "id": "p3d_xxxxxxxx",
  "name": "モンスター素材集",
  "assets": [
    { "id": "a3d_xxxxxxxx", "name": "slime_green", "displayName": "緑スライム", "assetType3d": "character" }
  ],
  "createdAt": "2026-07-19T00:00:00.000Z",
  "updatedAt": "2026-07-19T00:00:00.000Z"
}
```

- `assets` は一覧用サマリー。実体は `assets/<id>/asset3d.json`（2D の `ProjectAssetEntry` と同じ分担）。
- 2D の `families`（variant registry）に相当する機構は第一〜第三段階では持たない。第三段階の派生モデル管理は asset3d.json 内の `derived` で行う（8 章）。

---

## 6. asset3d.json（候補構造）

中心となる文書。旧 `../THREE_D_ASSET_PREPARATION_REQUIREMENTS.md` 4 章の `ThreeDAssetSettings` 案を土台に、source / derived / provenance / license / unknown data を追加した。

```jsonc
{
  "format": "chameleon-3d-asset",
  "version": "0.1.0",
  "id": "a3d_xxxxxxxx",
  "assetType3d": "character",          // character | prop | environment | other
  "name": "slime_green",
  "displayName": "緑スライム",
  "tags": ["enemy", "forest"],
  "gameAttributes": {},                 // 2D と同じ「ゲーム側で自由に使う属性」

  "source": {                           // 層1への参照（バイト列は blobs3d / source/ にある）
    "kind": "glb",                     // glb | gltf-bundle（第二段階から）
    "files": [
      { "path": "model.glb", "mimeType": "model/gltf-binary", "byteLength": 1234567, "sha256": "…" }
    ],
    "importedAt": "2026-07-19T00:00:00.000Z",
    "originalFileName": "slime.glb"
  },

  "settings": {                         // 層2: 非破壊の編集情報（モデル本体は書き換えない）
    "unit": "meter",                   // meter | centimeter | unknown
    "unitScale": 1,                     // 表示・書き出し時の倍率（1 = そのまま）
    "upAxis": "Y",                     // Y | Z | unknown（glTF 正本は +Y up）
    "forwardAxis": "Z",                // Z | -Z | X | -X | unknown（glTF 正本は +Z が正面）
    "originMode": "feet",              // asIs | center | feet | custom
    "originOffset": { "x": 0, "y": 0, "z": 0 },   // originMode=custom 用（モデル座標系）
    "rotationOffset": { "x": 0, "y": 0, "z": 0 }  // 向き補正（度。表示と書き出しの変換にのみ使用）
  },

  "stats": {                            // 検品時に計測した実測値のキャッシュ（正本は inspection report）
    "vertexCount": 0,
    "triangleCount": 0,
    "meshCount": 0,
    "primitiveCount": 0,
    "materialCount": 0,
    "textureCount": 0,
    "maxTextureSize": 0,
    "animationCount": 0,
    "hasSkin": false,
    "hasMorphTargets": false,
    "fileSizeBytes": 0
  },
  "bounds": {                           // モデル座標系の AABB（軸に平行な箱）
    "min": { "x": 0, "y": 0, "z": 0 },
    "max": { "x": 0, "y": 0, "z": 0 }
  },

  "anchors": [ /* ThreeDAnchor（7.1） */ ],
  "colliders": [ /* ThreeDCollider（7.2） */ ],

  "humanoidMap": {                      // optional（2026-07-20 改訂で追加。第三段階 3D-STAGE3-11）
    // 人型モデルの標準スロット → node の対応付け。語彙は VRM 1.0 humanoid ボーン一覧を採用
    // 例: "hips": { "nodeIndex": 3, "nodeName": "mixamorig:Hips" }
    // 不在 = 未対応付け。additive field のため version は 0.1.0 のまま
  },
  "nodeBinding": {                      // optional（2026-07-20 第2改訂で追加。7.3 章）
    // humanoidMap と space:"node" の anchor / collider の nodeIndex が、
    // 「どのバイト列（source か、どの derived か）の node 並び」を指すかの宣言。
    // 省略時は source。rigged derived 生成時に再バインドして切り替える。
    "target": "source",                // "source" | "<derivedId>"
    "sha256": "…"                       // 対象バイト列の hash（照合用）
  },
  "rigDraft": {                          // optional（2026-07-20 第2改訂で追加。第三段階 3D-STAGE3-13/-14）
    // 骨格フィット・ウェイト設定の編集中データ（テンプレ種別・各ボーン端点[model space]・
    // 対称フラグ・ボーン別影響半径/減衰）。rigged derived の recipe の元になり、再生成を可能にする。
    // UI 一時状態ではなく再編集可能な保存データとして扱う（Undo 対象）
  },

  "derived": [ /* DerivedModel（8章）。第一段階は常に空配列 */ ],

  "inspection": {                       // 最新検査の要約。詳細は reports/
    "latestReportPath": "reports/inspection-2026-07-19T000000Z.json",
    "inspectionVersion": "3d-inspect-v1",
    "preset": "generic-web",
    "errorCount": 0,
    "warningCount": 2
  },

  "provenance": {                       // 9章
    "origin": "manual-import",         // manual-import | external-generator | unknown
    "generatorName": null,
    "generatorVersion": null,
    "notes": ""
  },
  "license": {                          // 10章
    "declared": "unknown",             // 利用者申告。unknown を既定にする
    "notes": "",
    "redistributionAllowed": null       // true | false | null（未確認）
  },

  "createdAt": "2026-07-19T00:00:00.000Z",
  "updatedAt": "2026-07-19T00:00:00.000Z"
}
```

設計判断（理由付き）:

- **変形は焼き込まず metadata で持つ**（`settings`）。元モデル不変の原則を守り、失敗時に必ず戻せるため。書き出し時に「metadata のまま出す」か「変換を焼き込んだ derived を出す」かを選ぶ（第一段階は metadata のみ。焼き込みは第二段階 `3D-STAGE2` 以降の判断。`3D-OPEN-05`）。
- **stats はキャッシュ**であり、正本は inspection report。stats と report が矛盾した場合は再検査を促す。
- **scene / node / mesh / material / animation の構造自体は asset3d.json に複製しない**。正本は GLB / glTF バイナリ内にあり、複製すると同期ズレの温床になる。UI 表示用の解析結果は実行時に生成し、名前参照が必要な場合（anchor の node 追従など）だけ node 名 / index を記録する。

---

## 7. anchor と collider

### 7.1 ThreeDAnchor（候補）

```jsonc
{
  "id": "anc_xxxxxxxx",
  "name": "右手",
  "role": "hand_right",   // root | feet | head | hand_left | hand_right | weapon | projectile_spawn | camera_focus | custom
  "space": "model",        // model | node（第一段階は model のみ。node は第二段階）
  "nodeRef": null,          // space=node の時: { "nodeIndex": 12, "nodeName": "hand_R" }（index 正、name は表示・検証用）
  "position": { "x": 0, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 }   // 度。任意
}
```

- `role` の語彙は旧 3D 要件（`../THREE_D_ASSET_PREPARATION_REQUIREMENTS.md` 4.1）を踏襲する。
- `space: "model"` は settings 適用**前**のモデル座標系で記録する（座標の正本を 1 つにするため。13 章）。
- `nodeRef` は node の並び順（index）を正とし、`nodeName` は表示と再検証に使う。glTF は node 名の重複を許すため、名前だけを頼りにしない。

### 7.3 nodeBinding（node index の基準バイト列。2026-07-20 第2改訂）

> **⚠️ 整合注意（`3D-RISK-02`）— 後続実装で最もずれやすい箇所。**

- `nodeRef.nodeIndex` と `humanoidMap` の nodeIndex は「あるバイト列の node 並び」に対する添字であり、**バイト列が変われば意味が変わる**。特に rigged derived（骨格 node を追加した派生。8 章）は source と node 構成が異なる。
- そのため asset3d.json は `nodeBinding`（6 章）で「node index 系 metadata がどのバイト列を基準にしているか」を 1 か所で宣言する。省略時は source。
- 規則:
  1. rigged derived を生成した時点で、humanoidMap・node 追従 anchor / collider を rigged derived の node index へ**再バインド**し、`nodeBinding` を切り替える（model space の anchor / collider は影響を受けない）。
  2. 読み込み時に `nodeBinding.sha256` と実バイト列を照合し、不一致なら node 追従系を「未解決」として警告表示する（黙って誤った node に付けない）。
  3. viewer / export / retarget は、node index を解釈する前に必ず nodeBinding の対象バイト列を確認する。

### 7.2 ThreeDCollider（候補）

```jsonc
{
  "id": "col_xxxxxxxx",
  "name": "本体",
  "purpose": "body",       // body | attack | pickup | sensor | custom
  "shape": "box",          // box | sphere | capsule（capsule は第二段階から）
  "space": "model",
  "nodeRef": null,
  "position": { "x": 0, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "size": { "x": 1, "y": 1, "z": 1 },     // box 用
  "radius": 0.5,                            // sphere / capsule 用
  "height": 1.8,                            // capsule 用（両端の半球を含む全高）
  "visible": true
}
```

- mesh collider は作らない（旧要件の決定を維持。重く、エンジン差が大きい）。
- capsule の `height` の解釈（半球込み全高）は import notes に必ず明記する（エンジンごとに解釈が割れやすい）。

---

## 8. DerivedModel（派生モデル。第三段階から使用）

```jsonc
{
  "id": "drv_xxxxxxxx",
  "kind": "optimized",           // optimized | transformed-bake | thumbnail-render | texture-replaced（3D-STAGE3-12）| rigged（3D-STAGE3-14）| motion-baked（3D-STAGE3-15/-16）
  "label": "mobile向け最適化",
  "files": [
    { "path": "derived/drv_xxxxxxxx/model.glb", "mimeType": "model/gltf-binary", "byteLength": 345678, "sha256": "…" }
  ],
  "recipe": {                     // どう作ったか（再現可能性の記録）
    "toolchain": "gltf-transform@<version>",
    "operations": [ { "op": "prune" }, { "op": "dedup" } ],
    "parentRef": { "kind": "source" },   // 2026-07-20 第2改訂: 入力バイト列。{ kind: "source" } | { kind: "derived", derivedId: "…" }
    "parentSha256": "…",         // parentRef が指すバイト列の hash（旧 sourceSha256 を置き換え。連鎖対応）
    "settingsSnapshot": { },      // 適用時の settings の複製
    "rigSnapshot": { }            // kind=rigged の時のみ: 適用した rigDraft の複製
  },
  "stats": { /* asset3d.stats と同形 */ },
  "createdAt": "2026-07-19T00:00:00.000Z"
}
```

> **⚠️ 整合注意（`3D-RISK-07`）**: 派生は連鎖し得る（例: source → rigged → motion-baked → optimized）。`parentRef` / `parentSha256` は**直接の親**を指す。「source からの再現」は親をたどって recipe を順に適用することで成立する。連鎖の途中の派生を削除する場合、子を持つ派生は削除をブロックする（または子ごと削除の明示確認）。

不変条件:

- derived は source を**上書きしない**。常に別パス・別レコード。
- derived の削除は source に影響しない（子を持つ場合は上記の連鎖規則に従う）。
- `recipe.parentSha256` が現在の親バイト列と一致しない derived は「古い派生」と表示し、書き出しの既定から外す。
- kind=rigged / motion-baked の derived 生成は、既存の anchors / colliders（model space）と settings の値を変更しない（node 追従系の再バインドは 7.3 の規則で行う）。

---

## 9. provenance（出所記録）

外部 3D 生成（AI 生成を含む）の持ち込みを将来受け入れるための記録。

- `origin: "manual-import"`: 利用者が手動でファイルを選んだ（第一段階の唯一の値）。
- `origin: "external-generator"`: 外部生成ツールの結果と利用者が申告した場合。`generatorName` / `generatorVersion` は利用者入力または adapter（第四段階）が記録する。
- 検証不能な内容（「このモデルは商用利用可」など）を Chameleon が保証しない。record は申告の記録である。

2D 側の ADR-0013（provenance / AI record boundary）と同じ思想で、正確性を保証できない情報は「申告」として保存し、UI にもそう表示する。

---

## 10. license information（利用条件記録）

- `declared` は利用者が選ぶ: `unknown`（既定） / `cc0` / `cc-by` / `proprietary-own` / `proprietary-licensed` / `other`。
- `unknown` のまま書き出した場合、export ZIP の README に「利用条件が未確認である」旨を必ず記載する（`3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md` 8 章）。
- Chameleon はライセンスの判定・検証を行わない。記録と注意喚起のみを行う。
- VRM 素材の場合（2026-07-20 改訂）: VRM meta の利用許諾（商用可否・改変可否・再配布可否等）を読み取り、`license.notes` へ自動転記して表示する（`3D-STAGE2-11`。転記であって検証ではない。詳細は `3D_INTEROP_VRM_VR_AND_CREATION_SPEC.md` 5.2）。⚠️ 整合注意（`3D-RISK-05`）: 正は常に利用者申告の `declared`。VRM meta と矛盾しても自動上書きせず、警告表示にとどめる。

---

## 11. IndexedDB（3D ローカル作業コピー）

推奨案: **別 DB `chameleon-asset-studio-3d`（DB_VERSION 1）を新設**し、既存 `chameleon-asset-studio`（v2、`src/core/storage/db.ts`）には一切触れない。

| store | keyPath | index | 内容 |
|---|---|---|---|
| `projects3d` | `id` | - | project3d.json 相当 |
| `assets3d` | `id` | `byProject`（`projectId`） | `{ id, projectId, data: Asset3D }` |
| `blobs3d` | `key` | `byProject` | `{ key, projectId, mimeType, bytes: ArrayBuffer, updatedAt }`。`key` は `${assetId}/${path}`（2D の `blobKeyFor` と同じ規則） |
| `trash3d` | `id` | - | プロジェクトのごみ箱（2D `trash` と同じ方式・上限 5 件） |
| `snapshots3d` | `id` | `byAsset` | metadata 編集前の復旧点（asset3d.json のみ。巨大な GLB は複製しない。上限 3 件/asset） |
| `reports3d` | `id` | `byAsset` | inspection / export record の JSON（層 4・5）。`{ id, projectId, assetId, kind: 'inspection' \| 'export', createdAt, data }`。最新は必須保持、古い履歴は容量を見て間引く |
| `quarantine3d` | `id` | - | 読み込み失敗ファイルの隔離（最新 3 件、50MB 超は bytes を保存しない。2D `quarantine` と同じ規則） |

理由と代替案:

- 別 DB の利点: 既存 DB の `DB_VERSION` を上げないため、2D 回帰リスクが構造的にゼロになる。誤って 2D store を読む事故も防げる。
- 代替案（不採用寄り）: 既存 DB を v3 に上げて store を追加する。v1→v2 の additive upgrade 実績はあるが、2D の正本ファイル `db.ts` の変更が必要になり、2D Pro Gate 後の凍結方針に反する。
- 注意: ブラウザの保存容量（quota）は origin 単位で共有される。DB を分けても容量は 2D と取り合いになるため、使用量表示は 2D + 3D 合算で見せる（`3D_UI_UX_SPEC.md`）。
- `snapshots3d` に GLB バイト列を複製しない理由: 3D は 1 ファイルが数十 MB になり得るため、2D と同じ「Blob 込み snapshot」を作ると容量を圧迫する。metadata（asset3d.json）は snapshot し、source は元々不変なので復旧点が不要、という分担にする。破壊的な画像編集に相当する操作（第三段階の派生生成）は derived 側に積むため、上書き自体が発生しない。

この設計は決定記録 `3D-DEC-STORAGE-01`（`3D_DECISION_LOG_AND_OPEN_ITEMS.md`）として人間承認を得てから実装する。

---

## 12. `.cas3dproj`（可搬正本。候補構造）

推奨案: **3D 専用の `.cas3dproj`（ZIP）を新設**する。ADR-0007 の「IndexedDB はローカル作業コピー、可搬正本はプロジェクトファイル」という 2D の関係をそのまま踏襲する。

```txt
project.cas3dproj            … ZIP（fflate。2D .casproj と同じ圧縮基盤を再利用）
├─ project3d.json
├─ assets/
│  └─ a3d_xxxxxxxx/
│     ├─ asset3d.json
│     ├─ source/
│     │  └─ model.glb                 … 元モデル（不変）
│     ├─ derived/                      … 第三段階から。無ければ省略
│     │  └─ drv_xxxxxxxx/model.glb
│     ├─ reports/
│     │  └─ inspection-….json          … 最新分のみ必須。履歴は任意
│     └─ thumbnails/
│        └─ thumb.webp                 … 第二段階から
└─ README.md
```

4 案の比較（詳細比較は `3D_FOUR_STAGE_IMPLEMENTATION_PLAN.md` の GATE 節と `3D_DECISION_LOG_AND_OPEN_ITEMS.md`）:

| 案 | 2D 互換性 | migration | 実装コスト | 人間の理解しやすさ | 判定 |
|---|---|---|---|---|---|
| A. 既存 `.casproj` に種類を追加 | 既存 schema / 読み込みコードの変更が必要。**2D 回帰リスク大** | 2D 側 version up が必要 | 中 | 拡張子が同じで混乱 | 不採用を推奨 |
| B. 3D 専用 `.cas3dproj`（推奨） | 2D コード無変更 | 3D 側だけで完結 | 中 | 拡張子で判別できる | **推奨** |
| C. 共通 container + 2D/3D 別 manifest | 新 container へ 2D も移行が必要 | 大規模 | 大 | 高いが遠い | 将来候補として保留 |
| D. GLB + sidecar JSON（プロジェクト無し） | 2D 影響なし | ファイル散逸しやすい | 小 | 複数ファイル管理が利用者負担 | 単体書き出しには採用（export ZIP）。正本形式には不採用 |

- `.cas3dproj` を誤って 2D の「.casproj を読み込む」に渡した場合、および逆の場合は、拡張子と `project.json` / `project3d.json` の有無で判別し、「これは 3D プロジェクトです。3D の読み込みから開いてください」という明確なエラーにする（quarantine には入れない）。

---

## 13. 座標・単位・軸・原点の契約

曖昧さを残さないための規則。自動変換・表示変換・利用者確認の 3 区分で定義する。

### 13.1 正本座標系

- **正本は glTF の内部座標系**とする: 右手系、+Y up、+Z が正面、単位 meter（glTF 2.0 仕様）。
- Chameleon は取り込み時にモデルのバイト列を座標変換**しない**（source 不変の原則）。
- `settings.upAxis / forwardAxis / unit` は「このモデルは glTF 規約に従っていない」と利用者が申告・補正するための metadata であり、表示と書き出し変換にだけ使う。

### 13.2 区分

| 区分 | 対象 | 例 |
|---|---|---|
| 自動で行う（無確認） | bounds / stats の計測、glTF 規約準拠モデルの表示 | AABB 計算 |
| 表示だけ変える（保存データ不変） | viewer 内の grid / axis / ground 表示、unitScale を掛けたサイズ表示、rotationOffset を掛けた向き表示 | 「このモデルは高さ 1.8m」表示 |
| 利用者確認が必要 | settings の変更全般、書き出し時の焼き込み（第二段階以降）、エンジン向け座標変換の適用 | Z-up 素材の補正 |

### 13.3 space の定義

- **model space**: source glTF のルート座標系。anchor / collider / originOffset / bounds はすべてこの座標系で記録する。
- **node space**: 特定 node のローカル座標系。`space: "node"` の anchor / collider だけが使う（第二段階）。
- **world space（表示用）**: viewer 内でカメラと ground を置く座標系。保存しない。
- pivot / origin: glTF に「origin」という単独概念はないため、Chameleon の origin は「model space のどの点を、ゲームでの配置基準点として扱うか」という **metadata 上の定義**である。`originMode: feet` は「bounds 底面の中心」を、`center` は「bounds の中心」を、`custom` は `originOffset` を指す。
- feet の既定計算: `{ x: (min.x+max.x)/2, y: min.y, z: (min.z+max.z)/2 }`（Y-up 前提。upAxis=Z と申告された場合は Z を高さとして読み替えた値を表示し、書き出し変換で扱う）。

### 13.4 エンジン向け変換

- Three.js: 変換不要（glTF ネイティブ）。
- Babylon.js: 既定は左手系。GLB loader が右手系モードを持つため import notes で示す。
- Unity: 左手系 Y-up。glTF importer（UnityGLTF / glTFast）の変換規約に従う旨を import notes に書く。
- Godot: 右手系 Y-up、-Z forward。向きの読み替えを import notes に書く。
- **第一〜第二段階では、エンジン向けのバイト列変換は行わない**。import notes（文章と数値）で変換を説明する。自動変換の提供は第三段階の `3D-STAGE3-09`（engine preset）で判断する。

### 13.5 animation への影響

- settings（unitScale / rotationOffset）は animation クリップのバイト列に触れない。表示時にルートへ掛けるだけである。
- 焼き込み書き出し（第二段階以降の選択機能）を行う場合、skin / animation を持つモデルではルート変換の焼き込みが animation を壊す可能性があるため、**skin または animation を持つモデルへの焼き込みは既定で無効**とし、警告付きの明示選択にする。
- モーション付与（M1/M2。2026-07-20 第2改訂）で生成するクリップは、**rigged derived の骨格座標系で焼き込む**。settings の表示変換はクリップに含めない（⚠️ `3D-RISK-01`）。retarget の骨長補正はクリップ生成時に一度だけ適用し、recipe に記録する。

---

## 14. version と migration

- 3D の各文書は独立した version 定数を持つ（`CURRENT_ASSET3D_VERSION` など）。2D の version 定数と連動させない。
- migration 機構は 2D の `migrateDocument`（`src/core/model/migrate.ts`）の**方式を踏襲した 3D 側の実装**を新設する（`MIGRATIONS` 配列、古い版から順に適用、新しい版は拒否、適用ログ）。2D の migrate.ts へ 3D の知識を追加しない。
- 未知フィールドは 2D と同じく「検証エラーにせず、消さずに保持する」（要件 12.2 の原則を 3D にも適用）。glTF 側の未知 extension もバイト列ごと保持される（source 不変のため自然に成立）。
- ⚠️ 整合注意（`3D-RISK-10`）: humanoidMap / nodeBinding / rigDraft のような optional 追加が 0.1.0 のまま積み上がっている。各追加時に schema・samples・テストを同時更新するのは当然として、**各段階終了 Gate で「0.2.0 への version up リハーサル前倒しの要否」を判断**し、migration 機構が未使用のまま肥大しないようにする。
- `.cas3dproj` 読み込みは、未来 version を明確なエラーで拒否し、過去 version は migration 適用ログを warnings として返す（2D `CasprojImportResult` と同じ形）。

---

## 15. 不変条件と round-trip 条件

実装とテストで常に守るべき条件。受け入れテストの根拠になる。

不変条件（invariant）:

1. source のバイト列と sha256 は、取り込み後のあらゆる操作（検品・setup・anchor 編集・派生生成・書き出し）で変化しない。
2. asset3d.json の削除・破損は、source の復元可能性に影響しない（不変の source バイト列からの再解析と、`snapshots3d` の直前復旧点で asset3d.json を再構築できる。source の再取得が必要な壊れ方の場合は `.cas3dproj` の再読み込みで復旧する）。
3. 2D の IndexedDB・`.casproj`・export ZIP・schema・型のバイト列/構造は、3D 機能の有無・操作に関わらず不変である。
4. anchors / colliders / settings は model space で記録され、表示変換の変更で値が書き換わらない。
5. derived の生成・削除は source と edit metadata に影響しない（例外は 7.3 の nodeBinding 再バインドのみで、これは明示的な規則に基づく更新である）。
6. rigged / motion-baked derived の生成は、settings（unitScale / rotationOffset 等）の値を読み取るだけで書き換えない。骨格・モーションの焼き込みで settings を二重適用しない（⚠️ `3D-RISK-01`: 表示変換と焼き込み変換の適用箇所は「derived 生成時に一度だけ・recipe に記録」を正とする）。
7. rigDraft は rigged derived を再生成できる十分な情報を常に保持する（rigged derived が消えても rigDraft から作り直せる）。

round-trip 条件:

1. `.cas3dproj` 書き出し → 読み込みで、project3d.json / asset3d.json（humanoidMap / nodeBinding / rigDraft を含む）/ source バイト列 / derived（連鎖関係含む）/ reports が過不足なく復元される（ID 再採番の扱いは 2D 同様「常に再採番して別プロジェクトとして保存」を踏襲。`3D-OPEN-13` で確定。derivedId は asset 内部 ID のため再採番対象外）。
2. export ZIP 内の `asset3d.json` を再度読み込んだ場合、anchors / colliders / settings が同値で読める。
3. 同じ source + 同じ settings + 同じツールチェーン版から生成した derived は、同じ sha256 になることを目標とする（決定的出力。達成できない操作は export record に「非決定的」と明記する。第三段階 `3D-STAGE3-08`）。

---

## 16. 未決定事項（この文書の範囲）

いずれも `3D_DECISION_LOG_AND_OPEN_ITEMS.md` に選択肢・推奨・期限付きで登録済み。

- `3D-DEC-STORAGE-01`: 別 DB 方式の承認（11 章の推奨）。
- `3D-DEC-FORMAT-01`: `.cas3dproj` 新設の承認（12 章の推奨）。
- `3D-OPEN-05`: 書き出し時の焼き込み（bake）を第二段階で提供するか。
- `3D-OPEN-12`: カメラ初期位置を保存データに含めるか（既定: 含めない）。
- `3D-OPEN-13`: `.cas3dproj` 読み込み時の ID 再採番規則（既定: 2D と同じ常時再採番）。
- 大容量 GLB の IndexedDB 格納上限と分割格納の要否（`3D-OPEN-03`。Safari の実測が必要なため Gate 後に確定）。
