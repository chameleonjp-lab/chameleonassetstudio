# 工程単位の開発・検査

PR #281への実装開始指示を受け、R01からR06へ順に進める。
工程内の製品コード・テスト・ガイド・関連文書は同じPRにまとめる。
調査、必要な試作、実装、検査、Draft PR、CI修正、独立レビューまで続ける。
mergeは人間が判断し、merge後は最新mainから次工程へ進む。
R02以降の保存・出力形式判断は完成計画§8へまとめる。

## 実装中

変更した境界のVitestを指定して実行する。例:
`npx vitest run src/core/storage/autosave.test.ts`。
画面境界は `npm run e2e -- e2e/storage.spec.ts`、
WebKitは `npm run e2e:webkit -- e2e/storage.spec.ts` で対象を絞る。
分類変更は `npm run test:ci-scope` で検査する。
成功済みの無関係な全検査を毎回反復しない。

## 統合PR

最終headで lint、format:check、build、test、test:ci-scope、e2e、e2e:webkitを実行する。
Chromiumは既存の全件を維持する。WebKitは保存・PNG取込・出力・バックアップ・
端末導線の既存テストを実行する。自動WebKitはiPhone Safari実機確認の代替ではない。
独立レビューの重大な指摘は同じPRで直す。未実行は成功として扱わない。

CIは `tools/ci/classify-changes.mjs` を共通で使用する。
Markdownだけなら分類のみ。コード・設定はlint・整形・アプリbuild・unit、
ブラウザに影響する変更はChromium全件とWebKit重要経路を実行する。
分類自体のテストもコード検査に含む。
H3は本体のcore（atlas・rig・model等の依存）、H3・Pages処理、依存・ビルド設定、
workflow変更時に計測と公開／閉鎖検査を行う。UIだけの変更ではH3を繰り返さない。
既存成果物名を保持し、別途アップロードされる3つのエンジン証拠だけを
Playwright総合成果物から除く。他の証拠・過去の記録は保持する。
通常CIのbuildをアプリだけにし、H3は必要な検査経路でビルドする。

## mainと公開

統合結果のtree照合による検査再利用は未実装なので、mainの全検査は維持する。
公開workflowも同じ分類を使い、アプリ、public、Pages/H3処理、依存・ビルド設定の
変更で公開する。Markdown-onlyとE2E-only変更は自動公開しない。
比較元が不明なら全検査・公開対象として扱う。
手動のclose-now / publish-24hは変更分類に関係なく維持する。
公開jobは実際に公開するSHAをビルドし、アプリ・ガイド・H3の経路と
publication recordのsourceCommitを検査してから成果物をdeployへ渡す。
正式出荷時はH3関連確認も実行し、6課題・実機・性能・実出力を同じ版で確認する。
Actionsの14日成果物だけを永続的な出荷記録とせず、版・結果・再現手順・
出力ハッシュをリポジトリに残す。
