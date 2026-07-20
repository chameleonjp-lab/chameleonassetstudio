# 3D Interop / VRM / VR / Creation Spec（主要ツール連携・VRM・VR・ボーン・テクスチャ編集・画像→3D）

状態: **draft / human review required**
最終更新日: 2026-07-20
調査基準commit: `96d63c5`（PR #130 マージ後の main。初版計画の基準は `7018984`）
外部情報の確認日: 2026-07-20（9 章・11 章の表に個別記載）
上位文書: `README.md`（本ディレクトリ）, `3D_COMPLETE_PRODUCT_SPEC.md`
関連文書: `3D_FOUR_STAGE_IMPLEMENTATION_PLAN.md`（対応 work package）, `3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md`, `3D_ASSET_DATA_CONTRACT.md`, `3D_DECISION_LOG_AND_OPEN_ITEMS.md`

> **この文書は 3D 実装開始の承認ではない。** 2D Pro Gate（`../2D_COMPLETION_ROADMAP.md` 8 章）の人間承認前に、ここに書いた機能・依存関係を実装してはいけない。本書は初版計画（11 文書）に対する 2026-07-20 の改訂で追加された観点（主要ツール連携 / VRM / VR / 他ツールとの差分 / ボーン設定 / テクスチャ編集 / 画像→3D）の正本である。

---

## 1. 目的と責任範囲

この文書は、次の 7 観点を 1 か所で定義する。

1. 主要ツールとの連携（どのツールへ・どのレベルで持ち込めるか / どのツールから受け取るか）
2. 他の 3D・ゲーム作成ツールとの差分（Chameleon が持つもの / あえて持たないもの）
3. VRM（人型アバター形式）への対応レベル
4. VR（VR 向け素材準備と VR での確認）
5. ボーン設定（スケルトン検査・humanoid 対応付け・ボーン追従）
6. テクスチャ編集（既存 2D 編集機能の再利用による、3D テクスチャの修正）
7. 画像から 3D モデルを作る外部生成との接続詳細

各機能の「どの段階で実装するか」は `3D_FOUR_STAGE_IMPLEMENTATION_PLAN.md` の work package（`3D-STAGE2-11` / `3D-STAGE3-11` / `3D-STAGE3-12` / `3D-STAGE4-09` ほか）を正とする。データ構造の正本は `3D_ASSET_DATA_CONTRACT.md`、検査 ID の正本は `3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md` である。

---

## 2. 他ツールとの差分分析（gap analysis）

「Chameleon 3D は何であって何でないか」を、主要ツールとの重なりで定義する。**持たない機能は欠陥ではなく分担**であり、各行の「Chameleon の役割」がすみ分けを示す。

| ツール | 分類 | 重なる機能 | Chameleon が持たない機能（理由） | Chameleon の役割・差別化 |
|---|---|---|---|---|
| Blender | 総合 DCC（モデリング） | GLB 入出力、簡易検査 | モデリング・sculpt・UV 編集・リグ作成（非目標。ブラウザで再実装する価値がない） | 修正が必要な箇所を**警告と数値で特定**し、Blender で直すべき点を import notes で往復させる |
| Unity / Godot / Unreal | ゲームエンジン | モデル取り込み・collider 設定 | シーン構築・ゲームロジック・本番ビルド（エンジンの仕事） | エンジンに入れる**前**の検品・原点/スケール正規化・anchor/collider 等の metadata 付与 |
| VRoid Studio | 人型アバター作成 | VRM の閲覧 | アバターの作成・髪/衣装編集（VRoid の仕事。非目標） | VRoid 等が出力した VRM を**ゲーム素材として検品・整備**する受け側 |
| gltf.report / glTF-Transform CLI | glTF 検査・最適化 | 統計表示・prune/圧縮 | CLI・コード前提の操作性（対象利用者が違う） | 同等の検査・最適化を**日本語 UI + ゲーム影響の説明 + preset** で提供し、anchor/collider/ゲーム属性まで一体で扱う |
| three.js editor / Babylon Sandbox | ビューア・簡易編集 | 表示・material 確認 | 保存・プロジェクト管理なし（使い捨てビューア） | 保存（`.cas3dproj`）・検査履歴・書き出し記録・2D と同じ操作感を持つ**作業場** |
| Substance 3D Painter 等 | テクスチャペイント | テクスチャの変更 | 本格的な 3D ペイント（非目標） | 既存 2D 編集（背景透過・色調整・パレット置換）を**テクスチャ単位で再利用**する軽い修正（7 章） |
| Mixamo | 自動リグ・アニメ付与 | ボーン・animation の供給元 | 自動リグ生成（外部の仕事） | Mixamo 出力（FBX）を Blender 経由で GLB 化して持ち込む**手順書**を提供（4.2） |
| RapidPipeline 等の商用最適化 SaaS | アセット最適化サービス | 軽量化・LOD | クラウド処理・課金（ローカル方針に反する） | 完全ローカル・元モデル不変・検査履歴つきの軽量化 |

結論: Chameleon 3D の固有価値は「**作る**」でも「**動かす**」でもなく、外部で作られたモデルを**検品し、ゲーム用情報を付け、確実に持ち込める形へ整える**中間工程の完成度に置く（`3D_COMPLETE_PRODUCT_SPEC.md` 1 章の再確認）。

---

## 3. 主要ツール連携マトリクス

### 3.1 出力先（Chameleon → ツール）

区分の定義は `3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md` 8.6（verified / candidate / import notes only / unsupported）。**証拠なしに verified を名乗らない**規則は全対象共通。

| 出力先 | 初期区分（第二段階） | 完成時の目標区分 | notes に必ず書く内容 |
|---|---|---|---|
| Three.js | import notes only | verified（第四段階 `3D-STAGE4-03` で自動検証） | 変換不要（glTF ネイティブ）、anchor/collider の読み方、decoder 要件（圧縮時） |
| Babylon.js | import notes only | verified（同上） | 右手系モードの指定、その他同上 |
| Godot 4 | import notes only | verified（手動証拠が揃った場合のみ昇格） | -Z forward の読み替え、collider 変換（Shape3D 対応表） |
| Unity | import notes only | verified（同上） | glTF importer（UnityGLTF / glTFast）の選択、左手系変換、capsule の全高解釈 |
| Unreal Engine | **import notes only（第二段階で追加）** | import notes only のまま（昇格は証拠が揃った場合のみ） | glTF importer / Interchange の有効化手順、単位（UE は cm）とスケール換算、座標系（左手系 Z-up）の読み替え |
| Blender | **import notes only（第二段階で追加）** | import notes only | GLB 取り込み手順、修正して再出力する時の設定（+Y up / 単位 m / apply transform）、再取り込み時の注意（4.3） |
| Unity + UniVRM | import notes only（VRM 素材の場合のみ。第三段階以降） | import notes only | VRM 版（0.x / 1.0）と UniVRM 版の対応、meta ライセンスの尊重 |

- Unreal / Blender の追加は `3D-STAGE2-08`（import notes 生成）の対象を 4 → 6 に拡大して行う。
- エンジン向け座標系のバイト列自動変換は引き続き行わない（`3D-OPEN-19` の既定を維持。notes と数値補助のみ）。

### 3.2 供給元（ツール → Chameleon）

| 供給元 | 受け取り形式 | 状態 | 注意 |
|---|---|---|---|
| Blender | GLB / glTF bundle | 第一〜第二段階で対応済み範囲 | 出力設定（+Y up / meter）を notes で案内 |
| VRoid Studio | VRM（= glTF + VRM 拡張） | 第二段階の VRM 検出から（5 章） | VRM meta の利用条件を必ず表示 |
| Mixamo | FBX / DAE のみ（GLB 出力なし） | **直接読み込みは unsupported を維持** | 「Mixamo → Blender で GLB 化 → Chameleon」の手順書を supply notes として提供（Mixamo の利用規約確認は利用者の責任と明記。`3D-OPEN-27`） |
| 画像→3D 生成ツール（TripoSR 等） | GLB / glTF | 手動持ち込みは常時可能。自動接続は第四段階（8 章） | provenance 申告・検品必須 |
| アセットストア購入素材 | GLB / glTF / VRM | 対応形式なら可能 | license.declared の記録を促す |

---

## 4. ボーン設定（skeleton / humanoid）

### 4.1 対応レベル

| レベル | 内容 | 段階 |
|---|---|---|
| B0: 検出 | skin / joint 数 / skeleton 有無の表示（実装済み計画: `3D-CHK-SKIN-001`） | 第二段階（既存計画） |
| B1: 検査 | joint 階層ツリー表示、bind pose の整合検査、初期姿勢の T-pose / A-pose 推定表示、ウェイト異常（合計≠1、影響ボーン数超過）の警告 | 第二段階（`3D-STAGE2-05` の拡張 + 検査 ID `3D-CHK-BONE-001〜003`） |
| B2: humanoid 対応付け | glTF の node を標準 humanoid スロット（hips / spine / chest / neck / head / 左右の shoulder・upperArm・lowerArm・hand・upperLeg・lowerLeg・foot 等）へ対応付ける。名前からの自動推定 + 手動修正 UI。結果は `asset3d.json` の `humanoidMap` に保存（非破壊 metadata） | 第三段階（`3D-STAGE3-11`） |
| B3: 利用 | humanoid スロットを使った anchor 追加補助（「右手に anchor」ワンクリック）、エンジン retarget notes への反映、VRM humanoid 完全性検査（5 章） | 第三段階（同 WP 内） |
| 対象外 | リグ作成・ウェイトペイント・ボーンの追加/削除/変形（非目標。Blender / 自動リグ外部ツールの仕事） | - |

### 4.2 humanoid スロットの語彙

- VRM 1.0 の humanoid ボーン一覧（必須 + 任意）を基準語彙として採用する（Unity Humanoid とほぼ相互対応でき、VRM 検査と共用できるため）。独自語彙は作らない。
- 対応付けは node index を正、node 名を表示・再検証用とする（anchor の `nodeRef` と同じ規則。`3D_ASSET_DATA_CONTRACT.md` 7.1）。
- 自動推定は「候補の提示」までとし、確定は必ず利用者操作にする（推定精度の合格基準は `3D-OPEN-25`）。

### 4.3 外部リグ付けとの往復

- 自動リグ（Mixamo / RigAnything / UniRig 等）は外部の仕事のまま維持する。
- 「リグ無しで取り込んだモデルを外部でリグ付けし、リグ付き GLB として**同じアセットの新しい source 改訂として再取り込み**する」流れを将来候補として定義する（revision 再取り込み。既定は不採用で、通常は新規アセットとして取り込む。`3D-OPEN-24`）。

---

## 5. VRM 対応

VRM は glTF の拡張として定義された人型アバター形式である（VRM 0.x = 拡張名 `VRM` / VRM 1.0 = `VRMC_vrm` ほか）。**VRM ファイルは構造上そのまま GLB として読める**ため、source 不変の原則（拡張データをバイト列ごと保持）と相性が良い。

### 5.1 対応レベル（`3D-DEC-VRM-01` で人間承認）

| レベル | 内容 | 依存 | 段階 |
|---|---|---|---|
| V0: 素通し | VRM を通常の GLB として読み込み・書き出し（拡張は未知データとして保持） | なし | 第一段階（追加実装なしで成立） |
| V1: 検出と meta 表示（**推奨最低ライン**） | `VRM` / `VRMC_vrm` 拡張の検出、VRM 版の表示、**meta（タイトル・作者・利用許諾: 商用可否 / 改変可否 / 再配布可否 / アバター使用条件）の読み取りと表示**、humanoid ボーン一覧の表示、expression / spring bone の有無表示 | なし（JSON 読取のみ） | 第二段階（`3D-STAGE2-11`） |
| V2: VRM 検査 | humanoid 必須ボーンの欠落検査（`3D-CHK-VRM-002`）、meta 未記入の警告、Chameleon の license.declared との突合（VRM meta が商用不可なのに declared が商用可の場合に警告） | なし | 第二段階（同 WP） |
| V3: VRM 描画 | spring bone（揺れもの）・expression を反映した preview（`@pixiv/three-vrm` を 3D chunk 内で任意ロード） | three-vrm（MIT。2026-07-20 一次確認済み） | 第四段階の候補（`3D-OPEN-22`。既定: 通常 glTF として表示できれば完成条件は満たす） |
| 対象外 | VRM の作成・変換（glTF→VRM 化）、spring bone / expression / look-at の編集、VRM meta の書き換え | - | VRoid 等の仕事。非目標 |

### 5.2 VRM meta と利用条件の扱い

- VRM meta の利用許諾フラグは、**Chameleon の provenance / license 記録（契約 9〜10 章）へ自動転記**し、export ZIP の README にも表示する。VRM は形式自体が利用条件を内包する点で、本計画の「利用条件を記録し注意喚起する」方針と一致する。
- meta の内容を Chameleon が検証・保証はしない（記録と表示のみ。2D の ADR-0013 と同じ境界）。
- VRM を書き出す場合は source 素通し（バイト列不変）のみとし、meta を変更した派生は作らない。

---

## 6. VR 対応

### 6.1 VR 向け素材の準備（主目的）

- 検品プリセットに **`vr` プリセットを追加**する（`3D-STAGE2-06` の対象に含める）。VR は 72〜90fps 常時 + 両眼描画のため、mobile より厳しい暫定しきい値から開始する（例: 三角形 50,000 / texture 最大辺 2048 / material 数 4。**すべて暫定**、fixture 実測で確定）。
- import notes に VR 利用時の注意（片目あたり描画負荷、透過 material のコスト）を追記する。
- VRChat 等プラットフォーム固有のアップロード要件対応は対象外（プラットフォーム側の検証ツールの仕事）。

### 6.2 VR での確認（WebXR preview。条件付き）

- 「実寸で見る」価値（1.8m のキャラクターを VR で実寸確認）に限定した WebXR immersive preview を、**第四段階の条件付き work package**（`3D-STAGE4-09`）として定義する。
- 前提: WebXR 対応環境（PC + 対応 HMD、対応ブラウザ）でのみ有効化する feature detection。**iPhone / iPad Safari は WebXR 非対応のため、VR preview を完成条件に含めない**（`3D-OPEN-23`。既定: 不採用でも完成）。
- 実装する場合も閲覧専用（VR 内での編集はしない）。motion sickness 配慮（スナップ移動のみ・視界揺れなし）を要件にする。

---

## 7. テクスチャ編集（2D 編集資産の再利用）

Chameleon には 2D で実証済みの画像編集基盤（トリミング・背景透過・消しゴム・HSL 色調整・パレット置換・輪郭線。`src/core/images` + Worker、Phase 6）がある。これを**テクスチャ単位の軽い修正**として 3D に再利用する。これは本計画の中で最も Chameleon らしい差別化機能である（2 章の Substance 行参照）。

### 7.1 機能定義（`3D-STAGE3-12`）

1. Materials / Scene からテクスチャを選び「このテクスチャを編集」を実行する。
2. テクスチャ画像を取り出し、2D と同じ操作感の編集ビューで修正する（背景透過・色調整・パレット置換・消しゴム。**UV 展開線のオーバーレイ表示**付きで、どこがモデルのどこかを確認できる）。
3. 適用すると、**テクスチャを差し替えた derived model を生成**する（glTF-Transform でテクスチャ置換。source は不変。契約 8 章の `DerivedModel.kind` に `texture-replaced` を追加）。
4. Compare 画面で before / after を確認してから書き出し対象に選ぶ（既存の派生フローに乗る）。

### 7.2 制限（安全側の既定）

- 初期対象は **baseColor テクスチャのみ**。normal / metallic-roughness / occlusion / emissive は「見た目が壊れやすく色空間の意味が異なる」ため編集対象外とし、選択時に理由を表示する（対象拡大は `3D-OPEN-26`）。
- 色空間: baseColor は sRGB として扱い、書き戻し時に色空間指定を変更しない。
- 4096px 超のテクスチャは編集前に縮小を促す（2D の取り込み上限と整合）。
- 実装境界: `src/core/images` の**純関数を読み取り専用で import して再利用**する（2D 側ファイルは変更しない。変更が必要になったら core3d 側にラップ/コピーする。`3D_ARCHITECTURE_AND_BOUNDARIES.md` 3 章の規則に追記済み）。

### 7.3 material の簡易調整（旧 `3D-OPEN-14` の再定義）

- baseColor factor / metallic factor / roughness factor / emissive factor の数値調整を、テクスチャ編集と同じ「derived 生成」方式で第三段階の**任意拡張**として再定義する（`3D-STAGE3-12` の追加スコープ候補。採否は段階開始時に判断）。
- material の構造変更（シェーダー変更・テクスチャスロット追加）は対象外のまま。

---

## 8. 画像から 3D モデルを作る（外部生成の接続詳細）

原則は不変: **生成はブラウザ本体に入れない**。Python / GPU / モデル重みは外部。Chameleon は「入口（画像の用意）と出口（検品・整備）」を担う。初版計画の `3D-STAGE4-01/-02` を次のとおり詳細化する。

### 8.1 2D→3D ブリッジ（Chameleon 内の入口）

- 3D プロジェクトの Import 画面に「画像から作る（外部生成）」入口を置き、**既存 2D プロジェクトのアセット画像（edit テクスチャ）または任意の画像ファイル**を生成用入力として選べるようにする。
- 2D 側データへは**読み取り専用**でアクセスする（2D の store を変更しない。参照のみ）。
- 選んだ画像・生成先・日時は provenance の生成元記録として保存する。

### 8.2 adapter プロトコル（ローカル外部処理。`3D-DEC-EXTGEN-01` の承認範囲）

```jsonc
// 送信（Chameleon → local processor。毎回の明示承認後）
{ "protocol": "chameleon-3d-generate/1", "requestId": "…",
  "input": { "kind": "image", "mimeType": "image/png", "bytesBase64またはmultipart": "…" },
  "options": { "provider": "triposr", "quality": "draft" } }
// 応答（processor → Chameleon）
{ "requestId": "…", "status": "succeeded",
  "model": { "mimeType": "model/gltf-binary", "bytes": "…" },
  "provider": { "name": "TripoSR", "version": "…", "license": "MIT" },
  "log": "…" }
```

- job 状態は created → approved（利用者承認）→ running → succeeded / failed / cancelled。失敗しても入力画像と既存アセットは失われない。
- 受領 GLB は**通常の検証パイプライン（入出力仕様 3 章）を必ず通す**。provenance は `origin: external-generator` + provider 情報を自動記録する。
- 外部 API（クラウド）接続は、送信データの扱い・保存期間・学習利用の有無を provider 規約で確認できた場合のみ個別承認する（既定: 接続しない）。

### 8.3 provider 候補の現状（2026-07-20 時点）

| provider | コードのライセンス | 重み / 商用条件 | 現在の扱い |
|---|---|---|---|
| TripoSR | **MIT（2026-07-20 一次確認済み）** | 重みのモデルカードは未確認 | 最初の実験候補（ローカル） |
| TRELLIS | **MIT（2026-07-20 一次確認済み）** | 重み・依存モデルの条件は未確認 | 高品質候補（要 GPU） |
| Stable Fast 3D / SPAR3D | 未確認（Stability AI community license 系と報告されるが一次未確認） | 売上条件の確認必須 | 確認待ち |
| Hunyuan3D 系 | **未確認**（2026-07-20 に GitHub の LICENSE 取得を試行したが 404。リポジトリ所在含め要再調査） | 地域・MAU 条件の報告あり（未検証） | 確認待ち |
| その他（Step1X-3D 等） | 未確認 | - | 研究追跡のみ（既定変更なし） |

---

## 9. 新規依存関係候補（この改訂で追加）

install は従来どおり Gate 承認後のみ。確認日はいずれも 2026-07-20（一次情報 = 公式リポジトリ LICENSE）。

| 候補 | 用途 | 必須/任意 | 導入段階 | ライセンス | 削除方法 |
|---|---|---|---|---|---|
| @pixiv/three-vrm | VRM の spring bone / expression 反映 preview（V3） | 任意 | 第四段階候補（`3D-OPEN-22` 採用時のみ） | MIT（確認済み） | 3D chunk 内の任意ロードのため単独削除可 |

- VRM V1/V2（検出・meta・humanoid 検査）は **JSON 読取のみで依存追加なし**。WebXR も描画ライブラリ標準機能で依存追加なし（Three.js の WebXRManager / Babylon の WebXR 対応。Gate-02 の評価項目に「WebXR 対応の成熟度」を追加する）。

---

## 10. 完成条件への影響

- 本改訂で**完成条件（`3D_COMPLETE_PRODUCT_SPEC.md` 8 章の 12 項目）は変更しない**。
- 追加機能のうち完成必須に含めるもの: vr プリセット、VRM V1/V2（検出・meta 表示・検査）、B1（skeleton 検査）、B2/B3（humanoid 対応付け）、テクスチャ編集（baseColor）、Blender / Unreal import notes、8.1〜8.2 の手動持ち込み + provenance。
- 条件付き（無くても完成）: VRM V3 描画、WebXR preview、外部処理の実接続、material factor 調整、revision 再取り込み。

## 11. 未決定事項（この文書の範囲）

`3D_DECISION_LOG_AND_OPEN_ITEMS.md` に登録済み: `3D-DEC-VRM-01`（VRM 対応レベル）、`3D-OPEN-22`（VRM V3 描画）、`3D-OPEN-23`（WebXR preview）、`3D-OPEN-24`（revision 再取り込み）、`3D-OPEN-25`（humanoid 自動推定の合格基準）、`3D-OPEN-26`（テクスチャ編集の対象 map 拡大）、`3D-OPEN-27`（Mixamo 手順書の扱い）。8.3 の未確認ライセンス全件。
