# Product recovery-copy failure alert — 2026-10-12

## Scope

`e2e/native-library-product.spec.ts` covers a failed recovery-copy operation through the 3D project library UI. The test saves a newer version, selects the earlier retained revision, and injects one `QuotaExceededError` at the 3D database write boundary after the confirmation step.

The product-path assertions verify that:

- The recovery failure is exposed through a visible `role="alert"` with localized, actionable storage guidance.
- The raw injected exception text is not exposed to the user.
- The selected project remains open and its saved project data and source blobs are unchanged.
- Refreshing the library still shows only the original project; no partial recovery copy is exposed.

This is test-only coverage. No production UI, persistence/schema, or dependency changes are included.

## Verification

- Focused product E2E — Chromium and WebKit-critical: `npx playwright test e2e/native-library-product.spec.ts --grep 'failed recovery-copy write' --project=chromium --project=webkit-critical --workers=1 --reporter=list` — 2/2 passed.
- `npm run lint` — 0 errors; the existing React Hook warning remains at `src/features/editor3d/NativeViewportPanel.tsx:205`.
- `npm run format:check` — passed.
- `git diff --check` — passed.
- Full CI and complete browser suites for this branch are not yet run; PR checks remain the final automated gate.

## Boundaries

The test uses synthetic IndexedDB quota fault injection in headless Chromium and WebKit-critical. It does not establish actual device storage exhaustion behavior, screen-reader speech, VoiceOver/TalkBack behavior, physical-device acceptance, or release readiness. UX-05/UX-08 and the physical/accessibility acceptance gates remain partial/open.
