# Review Policy

この文書は、Chameleon Asset Studio の PR レビュー方針を定義する。主に Claude Code Opus 4.8 による CI 成功後レビューで使う。

## 1. 前提

- レビュー対象は 1 PR 1 目的である。
- `main` への直接 push は前提にしない。
- Opus 4.8 の深いレビューは CI 成功後だけ行う。
- CI が失敗している場合、まず Codex が CI 失敗を修正する。
- 最終 merge は人間が判断する。

## 2. Opus 4.8 が主指摘にしないもの

次は CI で拾えるため、Opus 4.8 の主指摘にしない。

- format error。
- lint error。
- TypeScript type error。
- unit test failure。
- E2E test failure。
- build failure。

これらが残っている PR は、深い設計レビューではなく Codex 修正へ戻す。

## 3. Opus 4.8 が重視するもの

Opus 4.8 は次を優先して確認する。

- `docs/REQUIREMENTS_SPECIFICATION.md` との矛盾。
- `docs/IMPLEMENTATION_PLAN.md` との矛盾。
- `docs/future/FABLELESS_DEVELOPMENT_GUIDE.md` の人間確認ルール違反。
- `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md` の Phase 順序違反。
- 1 PR 1 目的を超える変更。
- `asset.json` の互換性破壊。
- `.casproj` の互換性破壊。
- export ZIP の構成破壊。
- 座標系、原点、アンカー、当たり判定、リグ、アニメーションの意味の破壊。
- 3D 関連の範囲逸脱。
- docs と実装の不一致。
- 将来の実装者が誤解する命名、コメント、ドキュメント。

## 4. 重大指摘の基準

次に該当する場合は重大指摘として扱う。

- 既存プロジェクトまたは既存 export を読めなくする可能性がある。
- 既存の `asset.json` / `.casproj` / export ZIP の意味を変える。
- 座標系や原点など、ゲーム組み込み時の挙動を変える。
- Phase 18 以降の作業を、人間確認なしに確定している。
- dependencies 追加や外部サービス連携を、ライセンス・秘密情報・運用確認なしに行っている。
- 自動 merge を前提にしている。

## 5. レビュー出力形式

Opus 4.8 のレビュー結果は次の形式で残す。

```md
## 結論

- 重大指摘: なし / あり
- Codex 修正に戻す: はい / いいえ
- 人間確認が必要: はい / いいえ

## 重大指摘

-

## 設計・互換性コメント

-

## docs 矛盾

-

## CI で扱うべき軽微事項

-
```

## 6. Codex 修正ループ

Opus 4.8 の重大指摘がある場合、Codex は修正して再 CI へ戻す。Codex 自動修正ループは最大 2 回までとし、2 回後も重大指摘が残る場合は人間確認へ戻す。
