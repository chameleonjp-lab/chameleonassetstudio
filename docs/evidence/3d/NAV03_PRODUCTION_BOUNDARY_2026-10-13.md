# NAV-03 production domain-boundary evidence — 2026-10-13 JST

## 対象と実行

対象コードsnapshotは `8fb870a655af534dec09dd362e61855d21541e47`（Draft PR #404 head）。この追補は既存の製品・検査コードを変更せず、現snapshotから再生成したproduction buildをローカルpreviewで検査した。

| 項目 | 結果 |
| --- | --- |
| Spec | `e2e/studio-entries.spec.ts` — `lightweight hub opens a separate noopener 3D tab and preserves 2D discovery`、`production graph identifies every domain and has no cross-domain chunk fetch` |
| 実行 | `playwright.production.config.ts`、Chromium (`chromium`) と Playwright WebKit (`webkit-critical`)、各case・各browser 3回 |
| 集計 | Chromium 6/6、WebKit-critical 6/6、計12/12 pass。失敗・skipなし |
| build/serve | production configが現snapshotからappをbuildし、Vite production previewを `http://localhost:4176` でserve |
| 実行環境 | Node.js 24.19.0、npm 11.17.0、Playwright 1.61.1 |
| Browser binaries | Playwright Chromium revision `1228`、WebKit revision `2311` |

検査コード: [domain boundary checker](../../../tools/build/domainBoundary.ts)、[checker unit tests](../../../tools/build/domainBoundary.test.ts)、[product E2E](../../../e2e/studio-entries.spec.ts)、[production Playwright config](../../../playwright.production.config.ts)。

## 検査範囲

- 新規browser test contextでHubを開き、実際のrequestを観察。Hubから3D向けsource/chunk名（`core3d`、`editor3d`、`EditorScreen`、`imageOps`等）のrequestがないことを確認した。
- 3D linkが別tabで開き、`window.opener` が `null` であること、Hubから2Dへ進み、back/forwardでもHub・2D画面へ戻れることを確認した。
- production buildの `domain-bundles.json` が `hub` / `2d` / `3d` の3 entryを持つことを確認し、各entryの実ページ遷移で観測したnetwork requestに、他domain専用のbundle fileが含まれないことを検証した。
- 検査はDOM・build manifest・ブラウザーrequestを使用する。性能のタイミング値を受入指標としていない。

## 補足: 同一コードsnapshotのローカルsuite

| Check | 結果 |
| --- | --- |
| Vitest | 186 files、3,553/3,553 passed |
| ESLint | 0 errors。`NativeViewportPanel.tsx:205` にHook dependency warningが1件 |
| Production build | app buildとH3 build pass。Viteの500 kB超chunk advisoryは表示された |
| CI-scope tests | 8/8 passed |

## 残る境界

これは現HEADからのローカルproduction preview検査であり、GitHub Pages等の最終配信artifact、CDN/cache/404を含む公開経路、別revision、実端末、物理GPU、初回利用者の選択理解を検証していない。選択した2つの既存caseだけを実行しており、全product E2E suiteではない。Remote CIは確認していない。

NAV-03は **implemented-candidate / partial** のまま。今回の結果はこのsnapshotでの選択範囲の再現可能な証拠であり、最終配信版や全体の受入passを意味しない。
