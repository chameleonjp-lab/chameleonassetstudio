# Chameleon Asset Studio Group 18 契約監査・実装 handoff

最終更新日: 2026-08-14
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
正式work package: `2D-5-EVIDENCE + 2D-5-LABELS`
基準main SHA: `b79327857b2d9f9bfbc9a4c0a4a4566d1000a69a`
文書種別: docs-only 契約監査・人間判断 handoff
状態: `human-decision-pending / proposal-only`

上位文書: `docs/IMPLEMENTATION_PLAN.md`, `docs/future/2D_COMPLETION_ROADMAP.md`
関連文書: `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`, `docs/future/2D_4_ENGINE_FIXTURE_EVIDENCE.md`, `docs/future/2D_FIVE_PERSPECTIVE_REVIEW_ACTION_PLAN_2026-08-13.md`

> Group 17（PixiJS / Phaser）の専用fixture実装はPR #246でmainへmerge済みである。Group 18は、対象別検証を増やす前に、何を証拠と呼び、どの範囲を `candidate` / `verified` / `import-notes` / `unsupported` と表示できるかを固定するdocs-only handoffである。ここで案をmainへ置いても、人間が採用するまでproduct codeやtarget fixtureを変更しない。

## 1. 現在確認できる事実

| 項目 | 確認結果 | Group 18への意味 |
|---|---|---|
| 最新main | `b79327857b2d9f9bfbc9a4c0a4a4566d1000a69a`。PR #246のmerge commit。 | Group 18の基準headを固定する。 |
| open Pull Request | 0件。 | このhandoffが同一目的の唯一のDraft PRになる。 |
| Group 17 | PR #246（final head `9380494f7a662b9211f341d87a15f62d4b82986f`）をmerge。CI Run #785は全job成功、PixiJS / Phaser artifactを記録。 | fixture-localな `verified` の境界を再利用する。 |
| Group 18 | ロードマップ上は未着手。採用判断は未確認。 | Gate Aとして契約案を提示し、Gate Bの明示採用を待つ。 |

## 2. 今回の目的

Group 19 / 20の対象別fixtureへ進む前に、検証結果の意味を再現可能な形で揃える。

- 検証済み対象の名前、version、fixture、期待結果、既知制限を追跡できる。
- package内の安定した記録と、CI実行時だけ得られる動的証拠を混同しない。
- `verified` を対象version・fixture・証拠の組み合わせへ限定し、未確認の互換性を広げない。
- `candidate`、`import-notes`、`unsupported` を利用者向けの誤解がない説明へつなげる。

## 3. 範囲

### 3.1 対象

- ラベルの定義、表示境界、対象version・fixture単位のスコープ。
- 安定したverification recordと、CI artifact / run recordの分離。
- 必須証拠の項目、欠落時の失敗条件、再検証・無効化ルール。
- `2D_EXPORT_COMPATIBILITY_MATRIX.md`、target handoff、Group 17 evidenceとのトレーサビリティ。

### 3.2 対象外

- Unity、Godot、RPG Maker MZのtarget fixture・実機検証（Group 19 / 20）。
- PixiJS / Phaserの新version、標準atlas完全互換、project自動生成、物理iPhone Safari。
- product UI、export ZIP、`asset.json`、`.casproj`、schema、migration、IndexedDB、既存Atlas `0.1.0`、helper API、package dependencies。
- 既存のGroup 17専用fixtureやCI証拠の改変。

## 4. 人間判断が必要な選択

### G18-C1: 証拠記録の形

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | 安定した `verification/record.json` は profile ID、target / version、source・fixture・manifest hash、確認項目、期待結果、既知制限、証拠参照だけを持つ。browser version、実行日時、console error、download数、artifact digestなどの動的情報はCI artifactへ分離する。 | 同じ入力から作るpackageの意味とhashを安定させ、CI実行の揺れを別に追跡できる。 |
| B | 動的なbrowser・日時・実行結果もpackage内recordへ含める。 | 人間には一枚で見えるが、同じ入力の再出力が毎回変わり、決定性の証明が難しくなる。 |
| C | recordを作らず、PR本文とREADMEだけを証拠にする。 | 証拠の機械的な欠落検出と後日の再検証ができない。 |

### G18-C2: 互換性ラベルの意味とスコープ

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | ラベルは target profile・対象version・fixture IDの組み合わせに付ける。`candidate`は出力候補、`verified`は必須証拠が同じheadで揃った対象だけ、`import-notes`は手動手順を添付したが実行確認未完了、`unsupported`は対象外・理由付き拒否とする。 | Generic Webや一つのengineの成功を、別version・別engineへ誤って広げない。 |
| B | 対象名（PixiJS、Unityなど）へラベルをまとめて付ける。 | version差・fixture差が隠れ、検証範囲を広く誤認しやすい。 |
| C | verified / unsupportedだけを使い、candidate / import-notesを廃止する。 | 検証前の候補と、手順はあるが未確認の対象を区別できない。 |

### G18-C3: verifiedの成立・失効ルール

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | `verified` は同じ対象version、fixture hash、manifest / source hash、受入項目、artifact参照が揃ったときだけ成立する。対象version、fixture、manifest、変換意味、受入項目が変わったら自動的に再検証へ戻し、CI失敗・artifact欠落・期待結果不一致もverifiedを維持しない。 | 状態が固定headと証拠へ結び付き、古い成功を再利用しない。 |
| B | docsを更新した担当者が手動でverifiedを維持する。 | 見落としで古い証拠が残る可能性がある。 |
| C | 最新CIが成功すれば、変更範囲に関係なくverifiedを維持する。 | 対象versionやfixtureの変更を取り逃がす。 |

## 5. 推奨採用範囲

```text
G18-C1 A + G18-C2 A + G18-C3 A
```

Group 17で確認した対象version・fixture単位のverified境界、Group 16で分離した安定record / 動的artifactの考え方と整合する。これは提案であり、採用判断前に実装契約へ昇格させない。

## 6. Gate Aで確認する受入ID

| ID | 受入内容 |
|---|---|
| G18-LABEL-SCOPE | ラベルがtarget profile・version・fixture単位で、未確認範囲へ拡張されない。 |
| G18-RECORD-STABLE | 安定recordと動的CI証拠の境界、hash対象、参照関係が文書で説明できる。 |
| G18-EVIDENCE-COMPLETE | target、version、fixture、入力、期待結果、実行環境、制限、artifact参照の必須項目が定義される。 |
| G18-INVALIDATION | version、fixture、manifest、source、受入項目の変更、CI失敗、artifact欠落時にverifiedを維持しない。 |
| G18-NO-REGRESSION | Group 17専用fixture、既存Generic Web、legacy ZIP、schema、`.casproj`、export、helper、dependencyを変更しない。 |

## 7. 採用後のhand-off境界

採用後に変更できるのは、Group 18の契約docs、ラベル・証拠の契約unit、必要な検証記録テンプレートとCIの欠落検出に限る。Group 19 / 20のtarget fixture、product UI、既存export形式、schema、保存形式、helper、dependenciesは別Group・別判断で扱う。

採用前に変更してよいのは、このdocs-only監査・handoffだけである。CIがdocs-onlyとして分類されても、Group 18が採用済みになったことを意味しない。

## 8. 人間判断

次の形式で採用する。

```text
G18-C1 [A/B/C] + G18-C2 [A/B/C] + G18-C3 [A/B/C]
```

採用回答があるまでは契約状態を `human-decision-pending` とし、Group 19 / 20のtarget実装を開始しない。