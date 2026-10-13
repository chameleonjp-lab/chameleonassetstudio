# UX-01 error-message boundary evidence — 2026-10-13 JST

UX-01正本は「日本語の操作名、用語の短い説明、作業mode・選択・保存状態の一貫表示。内部例外だけを利用者へ投げない」ことを要求する。internal/core例外のraw文字列が英語でも、user-facing表示にそのまま漏れるとは限らないため、両方の境界を確認した。

## 実行結果

| 検査 | snapshot / 結果 | 確認内容 |
| --- | --- | --- |
| Formatter unit regression | `060d458`（PR #399 head）、`editingFailure.test.ts` focused run: 15 pass / 730 filtered | 未知の日本語・英語例外、URL/path/秘密値、non-Error thrown valuesを日本語generic guidanceに落とし、raw exceptionをreason/action/serialized resultへechoしない。 |
| Product error path | `e01d284`（PR #397 head）、production previewの`native-quality-product.spec.ts`全suite 12/12 pass。worker-startup-failure caseはChromium/WebKit各1回で2/2。 | testは`Error('PRIVATE-WORKER file:///private/user/model.glb')`を注入。画面に日本語の安全な品質検査案内と保存/backup guidanceが出てraw message/pathを含まず、検査結果を成功扱いせず、project/blobは前後同一。次の正常な検査も成功。 |

## 残る境界

代表的なunknown exception経路ではraw英語をそのまま表示せず、適切な日本語guidanceへ変換する証拠があるため、台帳の「core拒否理由に英文あり」は内部raw messageとuser-facing UIを混同している。全編集/import/save/export/renderer経路のerror catalog網羅、初回利用者の用語・mode/選択/保存状態の理解、実利用者 usabilityはこのunit/browser検査では証明しない。UX-01全体はpartialのまま。
