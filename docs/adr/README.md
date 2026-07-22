# Architecture Decision Records（2D データ契約）

最終更新日: 2026-07-22
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
文書種別: ADR インデックス（2D-1a契約群、group 11 import判断、group 12 Timeline / Rig判断を含む）
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`, `docs/future/2D_COMPLETION_ROADMAP.md`（2D-1a）
関連: `docs/future/DECISION_LOG.md`, `docs/future/README.md`

---

## 1. このディレクトリの目的

`docs/future/2D_ASSET_DATA_CONTRACT.md` は将来契約の上位仕様であり、docs-only の accepted 文書である。この `docs/adr/` は、まず **2D-1a（データ層、ID・参照・variant、座標・trim・flip・scale、migration・復旧境界）で先に固定した決定**を収め、後続work packageで人間承認したimport境界（ADR-0016〜0018等）も1決定1ファイルで追記する。

ADRは上位仕様・計画の判断を追跡可能にする記録である。対応する上位文書を規範とし、**現行コード（`src/`）のどの関数がその意味を実装しているか**を明示し、fixtureテストで境界を固定する。2D-1a契約群ではADRと現行コードの食い違いを「現状の制限」として記録し製品コードを変更しない。後続work packageでは、そのpackageで承認された変更範囲に限って実装し、各ADRの「影響とfixture」「再検討条件」に境界を残す。

## 2. 形式

各 ADR は次の見出しを持つ。

```md
# NNNN-<slug>

ステータス: accepted
上位文書:
関連 fixture:

## 文脈
## 決定
## 根拠
## 影響と fixture
## 再検討条件
```

- **ステータス**: 本ディレクトリの ADR は全て `accepted`（今後の実装・レビューの前提にする決定という意味であり、追加実装が完了したという意味ではない）。
- **文脈**: なぜこの決定が必要か。
- **決定**: 契約として固定する内容。
- **根拠**: 現行実装のどの関数・型がこの意味を体現しているか。
- **影響と fixture**: 影響する docs / 実装範囲と、数値を固定した fixture テストの場所。
- **再検討条件**: この ADR を変更してよい条件（原則、別 PR + Opus 4.8 設計レビュー + 人間確認）。

## 3. 一覧

| ADR | タイトル | 対応する契約章 | fixture |
|---|---|---|---|
| [0001](./0001-coordinate-and-transform-semantics.md) | 座標系と変形の意味 | §6.1, §6.2, §6.5 | `src/core/model/contract.fixtures.test.ts`（ADR-0001） |
| [0002](./0002-id-name-reference-rules.md) | ID・名前・参照の規則 | §5.1 | `src/core/model/contract.fixtures.test.ts`（ADR-0002） |
| [0003](./0003-variant-and-derived-asset-interpretation.md) | Variant・派生アセットの解釈 | §4, §7 | なし（解釈の固定のみ、将来 PR のための境界） |
| [0004](./0004-trim-atlas-scale-output-semantics.md) | trim・atlas・scale の出力層の意味 | §6.3, §6.5 | `src/core/export/contract.fixtures.test.ts`（ADR-0004） |
| [0005](./0005-flip-semantics.md) | 左右反転の意味 | §6.4 | `src/core/model/contract.fixtures.test.ts`（ADR-0005） |
| [0006](./0006-migration-and-recovery-boundaries.md) | migration・復旧境界 | §13 | `src/core/model/contract.fixtures.test.ts`（ADR-0001/0006） |
| [0007](./0007-data-layer-separation.md) | データ層の分離（source / edit / derived / 配布物 / 検査記録） | §2, §3 | なし（層の解釈の固定。保存・復旧の fixture は `2D-1B-STORAGE` で追加） |
| [0008](./0008-motion-time-semantics.md) | 時間の正本と rig bake の正本関係 | §8.1, §8.3 | `src/core/model/motionContract.fixtures.test.ts`（ADR-0008） |
| [0009](./0009-animation-event-boundary.md) | animation event の境界 | §8.2 | なし（将来フィールドの境界確定のみ。前提は ADR-0011 の fixture で固定） |
| [0010](./0010-collider-override-and-polygon-boundary.md) | frame 別判定上書きと polygon の境界 | §9.2, §9.3 | なし（将来フィールドの境界確定のみ。前提は ADR-0011 の fixture で固定） |
| [0011](./0011-motion-forward-compatibility.md) | 0.1.0 無変換条件と追加フィールドの共通条件 | §8.2, §9.2, §13 | `src/core/model/motionContract.fixtures.test.ts`（ADR-0011） |
| [0012](./0012-target-extension-and-unknown-data.md) | target 固有 extension と unknown data の境界 | §10, §11 | `src/core/model/targetContract.fixtures.test.ts`（ADR-0012） |
| [0013](./0013-provenance-and-ai-record-boundary.md) | 来歴・利用条件・AI 送信記録の保存境界 | §11 | `src/core/model/provenanceContract.fixtures.test.ts`（ADR-0013） |
| [0014](./0014-validation-staging.md) | 検証の段階（構造検証 / 意味検証 / 出力検証）の境界 | §12 | `src/core/model/validationContract.fixtures.test.ts`（ADR-0014） |
| [0015](./0015-migration-detailed-contract.md) | version 採番・移行手順・独立 version・新形式拒否の詳細契約 | §13 | `src/core/model/migrationContract.fixtures.test.ts`（ADR-0015） |
| [0016](./0016-import-optional-format-classification.md) | 任意取り込み形式（SVG / GIF / APNG / Aseprite / PSD / OpenRaster / Krita）の分類 | 互換 matrix §4.1 | `src/core/images/importOptionalContract.fixtures.test.ts`（ADR-0016） |
| [0017](./0017-ai-boundary.md) | AI 境界（consent・外部送信・受け入れ経路・手動代替） | §11 | `src/core/model/aiBoundaryContract.fixtures.test.ts`（ADR-0017） |
| [0018](./0018-chameleon-atlas-semantic-reimport.md) | Chameleon自形式atlasの意味上再取り込み限定例外 | import計画 W1 / データ層 §3 | `src/core/images/importAtlasBundle.test.ts`（ADR-0018） |
| [0019](./0019-optional-source-mime-and-asset-0.2.0.md) | SVG / GIF source MIMEとAsset 0.2.0 migration | import計画 Slice E / データ層 §2, §11, §13 | migration / signature / storage fixture（ADR-0019） |
| [0020](./0020-optional-import-product-behavior.md) | SVG / GIF / APNG製品取り込みの安全・frame・時間・fallback境界 | import計画 Slice E / ADR-0016・0019 | optional parser / timing unit + 製品フローE2E（ADR-0020） |
| [0021](./0021-frame-duration-semantics.md) | Frame単位可変時間と旧fps-only互換 | Group 12計画 T1 / §8.2 | 将来のT1実装sliceで追加 |
| [0022](./0022-rig-flip-and-bake-parity.md) | rig flipの鏡映式・完全ID map・bake同値 | Group 12計画 R1 / §6.4・§8.3 | 将来のR1実装sliceで追加 |
| [0023](./0023-part-layer-replacement.md) | 静的なPart.layerIds差し替え境界 | Group 12計画 P1 / §8.3 | 将来のP1実装sliceで追加 |

## 4. 変更してよいもの・してはいけないもの

この work package（`2D-1A-CONTRACT`）で変更してよいのは `docs/adr/`、`docs/future/DECISION_LOG.md`、`docs/future/README.md`、`src/` 配下の**新規**テストファイルのみである。上位契約文書（`docs/future/2D_ASSET_DATA_CONTRACT.md`）への「この章の境界は ADR で決定済み」という参照注記の追加は許可される（本文の書き換えは不可。PR #60 / #62 / #63 の前例）。製品コード、JSON Schema、`src/core/samples/` の既存ファイル、既存テストの期待値、version、dependencies は変更しない。Asset Family / Variant の実装、可変フレーム時間、frame 別判定、polygon、trim / scale / padding の実装、保存基盤（`2D-1B-STORAGE`）は本 work package の範囲外である。

`2D-1A-MOTION`（ADR 0008〜0011）も同じ変更範囲の原則に従う。animation event・frame 単位可変時間・rig bake・frame 別判定上書き・polygon の**契約境界**を ADR として固定するのみで、`events` / frame `durationMs` / `colliderOverrides` / polygon の実装、JSON Schema 変更、`asset.json` / `.casproj` / export ZIP の version・構成変更は本 work package の範囲外である。

`2D-1A-TARGET`（ADR 0012）も同じ変更範囲の原則に従う。target 固有 extension と unknown data の扱いの**契約境界**を ADR として固定するのみで、`Asset.extensions` の実装・schema 追加、`ExportPreset` の変更、unknown data 保持保証の実装は本 work package の範囲外である。

`2D-1A-PROVENANCE`（ADR 0013）も同じ変更範囲の原則に従う。来歴・利用条件・AI 送信記録の保存境界の**契約境界**を ADR として固定するのみで、provenance / AI 送信記録の実装・schema 追加・import 経路の変更は本 work package の範囲外である。

`2D-1A-VALIDATION`（ADR 0014）も同じ変更範囲の原則に従う。検証の段階（構造検証 / 意味検証 / 出力検証）の**契約境界**を ADR として固定するのみで、統一意味検証パス・preflight の実装、schema 変更は本 work package の範囲外である。

`2D-1A-MIGRATION`（ADR 0015）も同じ変更範囲の原則に従う。version 採番・移行手順の不変条件・独立 version・新形式の拒否・migrate と検証の順序の**契約境界**を ADR として固定するのみで、実際の version 進行・移行手順の追加・`CURRENT_*_VERSION` や schema の変更は本 work package の範囲外である。

`2D-2-IMPORT-OPTIONAL` / `2D-2-AI-BOUNDARY`（ADR 0016〜0017、group 11 Slice A）も同じ変更範囲の原則に従う。任意取り込み形式の分類と AI 境界の**契約境界**を ADR として固定するのみで、rasterized-import の実装・consent UI・AI 連携・`Asset.provenance` の schema 追加は本 slice の範囲外である（provenance 導入は `docs/future/2D_2_IMPORT_PLAN.md` の Slice B、rasterized-import は Slice E）。上位文書が `2D_ASSET_DATA_CONTRACT.md` 以外（互換 matrix / import 計画）にまたがる点が 2D-1A 系と異なる。

group 11 Slice BはPR #126で、ADR-0013の再検討条件とaccepted P1に従って`Asset.provenance?`をoptional / additiveに実装済みである。source-file recordだけを厳格化し、`sourceFileName`を持たない旧候補・AI候補recordはopen recordとして保持する。AIの具体field、外部送信、consent UIは引き続き範囲外である。

group 11 Slice DのADR-0018は、ADR-0007 / ADR-0015へ限定例外を追加する。配布物を正本へ戻す一般機能ではなく、exactな現行Chameleon atlasを厳格検証し、新しいflattened Assetへゲーム上の意味を復元する。schema / version / migration / `.casproj` / export ZIP / dependencyは変更しない。

group 11 Slice Eの前提補正であるADR-0019は、2026-07-21の人間承認（選択肢A）に従い、source原本を失わずSVG / GIFを表現するためAssetだけを0.2.0へ進める。0.1.0→0.2.0 migration、source-only MIME schema、旧fixture roundtripを先に固定し、rasterize UI / animated decodeは別PRで扱う。Project / export-presets / atlas / app version、IndexedDB schema、`.casproj`配置、product export ZIP、dependencyは変更しない。

group 11 Slice E製品実装のADR-0020は、2026-07-21の人間承認（1A + 2A + 3A）に従い、新規Asset入口だけへSVG / GIF / APNGを追加する。SVGはactive / external構造をsanitizeせず拒否し、animated画像は最大16frame、対応環境で全frame、非対応時だけ先頭frameへfallbackする。時間は総durationから1〜240のuniform整数fpsへ写像し、有限repeatはloop無効とloss表示にする。schema / version / migration / storage配置 / export / dependencyは変更しない。

group 12のADR-0021〜0023は、2026-07-22の人間承認（T1 + R1 + P1）に従い、Frame単位可変時間、rig flip / bake parity、静的part replaceの中核契約を固定する。派生exportの初期挙動、Layer所属と空集合、rig bake資源上限は`docs/future/2D_3_TIMELINE_RIG_PLAN.md`のH1〜H3として人間判断を残す。H1〜H3が未決定の間は製品実装を開始しない。本docs-only契約監査は型、schema、version、migration、storage、product export、dependencyを変更しない。
