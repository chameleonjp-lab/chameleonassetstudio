# SEC-06 VRM rights review follow-up — 2026-10-13 JST

## Scope and subject

- Requirement: [SEC-06](../../THREE_D_PRODUCT_REQUIREMENTS_2026-10-03.md) — retain user-declared rights and embedded VRM metadata separately, warn for review, and never let a declaration automatically replace an embedded restriction.
- Tested source commit: `50f3a28518cfa0b2b7b80f8aedceda0c66dbdf64` (child of Draft PR #412 head `a97e71e314a26e382e93fa7e26aba17210a5b9d0`).
- Test: [`e2e/native-quality-product.spec.ts`](../../../e2e/native-quality-product.spec.ts), `SEC-06: embedded VRM restrictions stay separate from declarations through inspection and package provenance`.
- Environment: local production preview, Playwright Chromium, one run.

## Fixture and observed behavior

A synthetic metadata-only GLB was placed in a native project backup. Its `VRMC_vrm.meta` contains `commercialUsage: "personalNonProfit"` and `allowRedistribution: false`, alongside a separate user declaration saying commercial use and redistribution are permitted and a separate stored embedded-rights note.

The product quality inspection:

- emits the existing generic source-terms warning;
- displays the user declaration, stored embedded-rights note, and parsed VRM restriction fields as separate values;
- leaves the native backup's source record and source GLB bytes unchanged after inspection.

The locally exported `game.json` retains `claims: "user-declared-not-verified"` and the source hash, MIME type, declared-rights string, and stored embedded-rights string in provenance. The distribution ZIP is a metadata package and does **not** include the original source GLB bytes.

## Local validation

- Targeted production-preview E2E: **1/1 passed**.
- Command: `npx playwright test --config playwright.production.config.ts e2e/native-quality-product.spec.ts --project=chromium --grep 'SEC-06: embedded VRM restrictions' --timeout=60000`.
- Full unit suite: **187 files / 3,554 tests passed**.
- Lint: **0 errors / one pre-existing warning** at `src/features/editor3d/NativeViewportPanel.tsx:205` (`react-hooks/exhaustive-deps`).
- Format check passed.
- App + H3 build and consumer build passed; existing large-chunk advisories remain.
- CI-scope tests: **8/8 passed**; `git diff --check` passed.
- Remote CI was not queried or monitored.

## Status and limits

This is a synthetic local Chromium subset. The warning is a generic request to review the source terms, not an automated semantic/legal conflict determination. The test does not establish license validity, comprehensive export enforcement, WebKit behavior, deployed delivery, third-party real-asset behavior, external-engine behavior, assistive-technology behavior, or physical-device acceptance. **SEC-06 remains `implemented-candidate / partial`; this is not an acceptance pass.**

Related records: [acceptance status](ACCEPTANCE_STATUS_2026-10-10.md), [current-head recheck](ACCEPTANCE_LEDGER_RECHECK_2026-10-13.md).
