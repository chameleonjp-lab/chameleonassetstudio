# Architecture Decision Records（2D データ契約）

最終更新日: 2026-07-10
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
文書種別: ADR インデックス（work package `2D-1A-CONTRACT`）
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`, `docs/future/2D_COMPLETION_ROADMAP.md`（2D-1a）
関連: `docs/future/DECISION_LOG.md`, `docs/future/README.md`

---

## 1. このディレクトリの目的

`docs/future/2D_ASSET_DATA_CONTRACT.md` は将来契約の上位仕様であり、docs-only の accepted 文書である。この `docs/adr/` は、その契約のうち **2D-1a（データ層、ID・参照・variant、座標・trim・flip・scale、migration・復旧境界）で先に固定すべき決定**を、現行実装の挙動と対応づけて 1 決定 1 ファイルの ADR として残す。

ADR は仕様を新しく作るものではない。`2D_ASSET_DATA_CONTRACT.md` の該当章を規範とし、**現行コード（`src/`）のどの関数がその意味を実装しているか**を明示し、fixture テストで数値を固定する。ADR と現行コードが食い違う場合は、ADR側に「現状の制限」として食い違いを記録し、製品コードは変更しない（`2D-1A-CONTRACT` の変更範囲は docs と新規テストのみ）。

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

## 4. 変更してよいもの・してはいけないもの

この work package（`2D-1A-CONTRACT`）で変更してよいのは `docs/adr/`、`docs/future/DECISION_LOG.md`、`docs/future/README.md`、`src/` 配下の**新規**テストファイルのみである。製品コード、JSON Schema、`src/core/samples/` の既存ファイル、既存テストの期待値、version、dependencies は変更しない。Asset Family / Variant の実装、可変フレーム時間、frame 別判定、polygon、trim / scale / padding の実装、保存基盤（`2D-1B-STORAGE`）は本 work package の範囲外である。
