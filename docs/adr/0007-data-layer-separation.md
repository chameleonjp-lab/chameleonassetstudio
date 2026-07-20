# 0007-data-layer-separation

ステータス: accepted
上位文書: `docs/future/2D_ASSET_DATA_CONTRACT.md`（§3 将来のデータの層, §2 基本原則）
関連 fixture: なし（層の解釈の固定。数値 fixture は各層を扱う ADR-0001〜0006 側にある）

---

## 文脈

契約 §3 は完成形のデータを「元データ / 編集元 / 派生プレビュー / 配布物 / 検査記録」の 5 層に分ける。保存基盤（`2D-1B-STORAGE`）は、どの層を原子的な保存・復旧点・復元の対象にするかで設計が変わるため、現行実装の各層への対応付けと、層をまたいではいけない規則を先に固定する必要がある。

## 決定

現行実装を 5 層へ次のとおり対応付け、この解釈を保存基盤・派生素材・書き出しの前提にする。

| 層 | 現行実装での対応 | 変更・破棄の扱い |
|---|---|---|
| 元データ | `TextureRef.kind: 'source'` の Blob（取り込んだ元画像） | 不変。破壊的画像編集は `source` へ適用せず、明示的な削除以外で上書き・破棄しない |
| 編集元 | `asset.json` の内容（layers / parts / frames / animations / origin / anchors / colliders / 属性）と `kind: 'edit'` の Blob | ユーザー操作と Undo / Redo の対象。正本 |
| 派生プレビュー | `kind: 'thumbnail'` の Blob、UI 上の一時合成 | 再生成できる。失われても編集元から作り直せることを要件とし、整合性保証の必須対象にしない |
| 配布物 | PNG / WebP / sprite sheet / atlas.json / export ZIP | 常に編集元から再生成し、正本にはしない。ADR-0018の限定経路だけ、現行Chameleon atlasを未信頼入力として検証し、新しいflattened Assetへ意味上再取り込みできる |
| 検査記録 | 未実装（将来の 2D-4 / 2D-5 で追加） | 追加時は編集元と分離して保存し、秘密情報を含めない |

層をまたぐ規則:

- 破壊的な画像編集は `edit` Blob へのみ適用し、`source` Blob は残す（現行の画像編集パイプラインの挙動を規範とする）。
- 選択状態・ズーム・ドラッグ途中などの UI 一時状態は、どの層にも保存しない（契約 §2.6）。
- `2D-1B-STORAGE` の原子性・復旧点・削除復元の必須対象は「元データ + 編集元」とする。派生プレビューは復旧対象から除外してよいが、欠落時に編集元を壊さず再生成できなければならない。
- IndexedDB はローカル作業コピーであり、可搬正本は `.casproj` とする（ADR-0006 (e) と同一）。`.casproj` の同梱範囲は現行の `docs/DATA_FORMAT.md` を正とし、本 ADR では変更しない。
- 検査記録・来歴（契約 §11）を追加する場合は、編集元の schema を変えない置き場所（別ファイルまたは名前空間付き領域）を設計してから実装する。ただしこの指針は編集元 schema の無秩序な変更を防ぐためのものであり、ADR-0011 の導入 gate 4 条件を満たす optional / additive なフィールド追加まで排除しない。来歴の置き場所については `docs/adr/0013-provenance-and-ai-record-boundary.md` が optional / additive な `Asset.provenance?` として確定し、本行の「別ファイルまたは名前空間付き領域」の例示を上書きする（2D-1A-PROVENANCE レビューのフォローアップ）。
- ADR-0018のatlas再取り込みは、配布物を元の正本へ戻す操作ではない。`atlas.json + spritesheet.png`を未信頼入力として厳格検証し、復元可能なゲーム上の意味だけを新しいIDのAssetへ写す限定例外である。元layer構造やraw JSONを正本とみなさず、loss確認なしに確定しない。

## 根拠

- `TextureKind = 'source' | 'edit' | 'thumbnail'`（`src/core/model/texture.ts`、`docs/DATA_FORMAT.md` の「source は元画像で破壊的編集をしない」）が、元データ / 編集元 / 派生プレビューの 3 層分離を既に型として持つ。
- `createImageAsset`（`src/core/model/factories.ts`）が取り込み時に source / edit / thumbnail の 3 Blob を分けて生成する。
- 配布物（export ZIP / atlas）は `exportZip` / `buildAtlas` が毎回編集元から生成する。ADR-0018以前は逆方向経路がなく、Slice D以降も一般的な逆変換は行わず、現行自形式の意味上roundtripだけを例外とする。

## 影響と fixture

- 影響 docs: `docs/future/2D_ASSET_DATA_CONTRACT.md` §3（本 ADR は同章の現行対応付けを確定するのみで内容を変えない）、`docs/DATA_FORMAT.md`。
- 影響実装（現状維持）: `src/core/model/texture.ts`、`src/core/model/factories.ts`、画像編集・書き出しパイプライン。
- fixture: 専用の数値 fixture は持たない。source 不変性・再生成可否は `2D-1B-STORAGE` の実装 PR で、保存・復旧の unit test として固定する。

## 再検討条件

層の追加（検査記録・来歴・履歴）、`.casproj` の同梱範囲変更、派生プレビューの保存方式変更を行う場合は、契約 §13 の gate に従い、別の設計 / migration PR と Opus 4.8 レビュー、人間確認を経る。
