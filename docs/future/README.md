# Future Planning Index

最終更新日: 2026-07-10
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`
文書種別: 将来計画インデックス
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`, `docs/IMPLEMENTATION_PLAN.md`

---

## 1. このディレクトリの目的

このディレクトリは、Phase 1〜17 の完了後に Chameleon Asset Studio をどう伸ばすかを定義する。

ここに置く文書は、今すぐ販売するための SaaS 設計ではない。まずは、ローカル中心の制作ツールとして完成度を上げ、将来の 3D 対応や外部生成モデル連携を安全に検討するための計画である。

このプロジェクトは、現時点では販売・SaaS 化を目的とせず、作者自身のブラウザゲーム制作を効率化するための内製ツールとして開発する。ただし、内製ツールであっても品質目標は低く置かず、将来的に月額 800 ドル級の価値を説明できる制作支援ツールを目指す。将来の公開・販売・クラウド化は未定であり、現在の実装判断には含めない。

Chameleon Asset Studio は、画像取り込み専用の変換ツールに限定しない。空キャンバス、テンプレート、図形、パーツ、既存素材の修正、検品、書き出しまでを扱うゲーム用アセット制作ツールとして伸ばす。Unity / Godot / RPG Maker / Blender などには、まず直接連携ではなく、持ち込み可能なファイルと import notes を出す。

2026-07-10 から、将来の2D完成条件は `2D_COMPLETE_PRODUCT_SPEC.md` を正本とする。データ、互換性、端末・信頼性、着手順は新設した専門文書がそれぞれ担当し、詳しい優先順位は同文書の「10.1 優先順位」に従う。**2D Pro Gate を人間が承認するまで、旧 Phase 22〜28 の 3D 実装・library 評価・dependency 追加を開始しない。** 3D の旧文書は削除せず、2D 完成後に `3D-0` から再開するための記録として残す。

特に、`claude-fable-5` が使えない、または利用量を節約しなければならない状況でも、誤った実装を避けて進められるようにする。

---

## 2. このディレクトリに含める文書

| ファイル | 目的 |
|---|---|
| `2D_COMPLETE_PRODUCT_SPEC.md` | 2D 完成形、対象利用者、完了条件、AI と 3D の境界を定義する上位仕様 |
| `2D_ASSET_DATA_CONTRACT.md` | 保存形式、座標、派生素材、動き、判定、migration の将来契約 |
| `2D_EXPORT_COMPATIBILITY_MATRIX.md` | 入出力形式、対象別 preset、`verified` の条件、未対応範囲 |
| `2D_DEVICE_RELIABILITY_SPEC.md` | PC / iPad / スマホ、保存、復旧、性能、アクセシビリティ、安全性 |
| `2D_COMPLETION_ROADMAP.md` | 2D Pro Gate までの実装順、PR 分割、品質 gate、3D 再開条件 |
| `2D_1A_BASELINE_REPORT.md` | 現行 version、型、schema、保存、`.casproj`、export、migration、fixture/test coverage の baseline |
| `FABLELESS_DEVELOPMENT_GUIDE.md` | `claude-fable-5` を使わない前提の実装・レビュー運用ルール |
| `CODEX_OPUS_AUTOMATION_WORKFLOW.md` | Codex 主実装、CI 成功後の Opus 4.8 レビュー、Codex 修正ループの PR 運用設計（Opus レビュー workflow は未実装） |
| `DECISION_LOG.md` | 重要な方針変更と変更経緯の記録 |
| `PRODUCT_DIRECTION_2D_TO_3D.md` | 2D 完成を優先し、3D を同じテイストの別画面として広げる方針 |
| `ASSET_CREATION_AND_EXPORT_STRATEGY.md` | 画像取り込みに限らない作成方法、作成可能ファイル、外部ツール向け書き出し方針 |
| `POST_PHASE17_REQUIREMENTS.md` | Phase 17 後に伸ばすべきローカル制作ツールとしての要件 |
| `POST_PHASE17_IMPLEMENTATION_PLAN.md` | Phase 17 後の段階的な実装計画 |
| `THREE_D_ASSET_PREPARATION_REQUIREMENTS.md` | 将来の 3D Asset Preparation Mode の要件 |
| `OPEN_ITEMS.md` | 今すぐ実装しないが今後検討すべき項目の一覧（Phase 18 整合確認の成果物） |
| `FLIP_DESIGN.md` | Phase 19「左右反転」の設計方針（通常は transform 反映、反転コピーは別コマンド） |
| `COLLIDER_EDITING_DESIGN.md` | Phase 19-C「判定編集強化」の docs-first 設計（rect / circle を壊さず、多角形判定の影響を整理） |
| `EXPORT_QUALITY_DESIGN.md` | Phase 20「書き出し品質改善」の docs-first 設計（padding / scale / helper 選択を互換性を壊さない export 関数オプションとして整理） |

---

## 3. 今回の計画から明示的に除外するもの

以下は、将来もし公開・販売・SaaS 化を検討する場合の話であり、このディレクトリでは実装計画の対象にしない。

- アカウント
- クラウド保存
- チームワークスペース
- プロジェクト共有
- バージョン履歴
- 権限管理
- 課金
- 請求書払い
- SLA
- 商用サポート
- 導入支援
- 社内ワークフロー連携
- 本格的な共同編集
- 大量アセット作成サービス
- 生成処理の標準運用
- 既存ゲームエンジンとの本番運用レベルの双方向連携

これらを実装しない理由は、不要だからではない。現在の段階で混ぜると、ローカル制作ツールとしての完成前にスコープが大きくなりすぎるためである。

---

## 4. 現在の基本判断

Chameleon Asset Studio は、まず 2D ブラウザゲーム用アセット制作ツールとして 2D Pro Gate を通す。

ただし、2D 制作ツールの完成形は、画像取り込みだけではない。空キャンバス、テンプレート、図形、パーツ、既存素材の修正、sprite sheet / tileset の再整理、作成物の検品、外部ツールへ持ち込める書き出しを含む。

その後の拡張では、最初から 3D 生成 AI を内蔵しない。2D Pro Gate を人間が承認した後に、生成済みの GLB / glTF / OBJ などを読み込み、検品し、軽量化し、ゲームで使う情報を付ける「3D Asset Preparation Mode」を `3D-0` から検討する。

画像から 3D モデルを作る処理は、将来の外部連携候補として扱う。外部候補は、採用前にライセンス、商用利用条件、必要な実行環境、出力形式、品質を必ず確認する。

---

## 5. 実装順の原則

将来拡張では、次の順序を守る。

1. 現在の 2D 機能を壊さない。
2. 既存の `asset.json` / `.casproj` 互換性を守る。
3. 書き出し形式と docs を先に決める。
4. 作成方法、作成可能ファイル、export preset、外部ツール向け表現を分ける。
5. 外部ツール連携は、まず直接連携ではなくファイル出力と import notes から始める。
6. 1 PR 1 目的で小さく進める。
7. 2D Pro Gate より先に、3D の読み込み、検品、軽量化、書き出しを作らない。
8. 外部ライブラリや研究モデルは、採用前にライセンス確認を必須にする。
9. `claude-fable-5` が使えない場合は、設計判断を急がず、レビューを段階化する。

---

## 6. このディレクトリの文書の扱い

このディレクトリの文書は、既存の Phase 1〜17 計画を置き換えるものではない。

Phase 1〜17 が完了した後の拡張計画である。Phase 16 / Phase 17 の作業中に、このディレクトリの内容を理由にスコープを広げてはいけない。

既存の完了条件を満たしていない場合は、まず既存計画を完了させる。
