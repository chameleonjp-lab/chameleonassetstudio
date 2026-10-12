# SEC-07 runtime log privacy follow-up — 2026-10-13 JST

## Scope and subject

- Requirement: [SEC-07](../../THREE_D_PRODUCT_REQUIREMENTS_2026-10-03.md) — debug output must not retain asset contents, secrets, or personal local paths; only minimal reproducibility information should be exposed.
- Tested source commit: `0d4d6787d11dd34d1bfcc4d387ab386d959991a2`.
- Parent: `1ae6a7673e78d74e4bc5df95df190a7197af4853` (Draft PR #411 head).
- Change scope: the shared 2D image editor's best-effort recovery-point-save warning in `src/features/editor/EditorScreen.tsx`. This is not a 3D product-browser acceptance run.

## Finding and correction

A source audit found that this recovery-point failure path passed the raw storage exception to `console.warn`. Storage exceptions can carry user-specific identifiers, paths, or other details. The call now uses `warnRecoveryPointSaveFailure`, which deliberately discards the exception and emits only the fixed category `復旧点の保存に失敗しました`. A regression unit test supplies a synthetic error containing a private-token marker and a personal-path marker and verifies that the console receives exactly the fixed string and no exception object.

After the change, a search of product `src` found only this sanitized `console.warn` sink; build/evidence scripts outside `src` are not runtime product logging.

## Local validation

- Targeted regression: `npx vitest run src/features/editor/recoveryPointLogging.test.ts --reporter=dot` — **1/1 passed**.
- Full unit suite: **187 files / 3,554 tests passed**.
- Lint: **0 errors**; one existing warning remains at `src/features/editor3d/NativeViewportPanel.tsx:205` (`react-hooks/exhaustive-deps`).
- `npm run format:check`: passed.
- `npm run build`: app and H3 builds passed; existing large-chunk advisory remains.
- `npm run consumer:build`: passed; existing large-chunk advisory remains.
- `npm run test:ci-scope`: **8/8 passed**.
- `git diff --check`: passed.
- Remote CI was not queried or monitored.

## Status and limits

This is a focused mitigation and regression test for one discovered shared-product log sink. **SEC-07 remains `implemented-candidate / partial`; this is not an acceptance pass.** No product-browser execution of the 2D image-edit failure path, clipboard flow, assistive-technology test, physical-device test, or deployed-runtime log audit was performed in this follow-up. The previously recorded SEC-07 diagnostics UI and privacy evidence retain their own scope and limitations.

Related records: [acceptance status](ACCEPTANCE_STATUS_2026-10-10.md), [current-head recheck](ACCEPTANCE_LEDGER_RECHECK_2026-10-13.md).
