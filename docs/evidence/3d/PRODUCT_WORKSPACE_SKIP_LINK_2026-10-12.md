# 3D workspace skip-link focus — 2026-10-12

## Scope

`e2e/native-workspace-skip-link.spec.ts` verifies one page-level keyboard path on `/3d/`: the first Tab reaches **本文へ移動**, the focused link receives its existing visible style, and Enter navigates to `#editor3d-main` and transfers DOM focus to the main content. The main landmark now uses `tabIndex={-1}` so it can receive focus from the fragment link without becoming an additional sequential Tab stop. The focused main content retains the existing 3px focus outline.

Before the change, the browser updated the fragment but left focus inactive on the main landmark. The new regression test exposed this behavior; the focus-only tab index corrected it.

No project content, saved data, backup format, export, or schema is changed.

## Verification

- Focused E2E: `npx playwright test e2e/native-workspace-skip-link.spec.ts --project=chromium --project=webkit-critical --reporter=list` — passed in Chromium and WebKit-critical (1/1 each).
- `npm run lint` — zero errors; one existing React Hook warning remains at `NativeViewportPanel.tsx:205`.
- `npm run format:check` — passed.
- `npm run build` — app and H3 builds passed; the existing large-chunk advisory remains.
- `npm test -- --reporter=dot` — 185 files and 3,530 tests passed.
- `git diff --check` — passed.

## Boundaries

This checks browser-emulated keyboard focus, fragment navigation, and computed focus styles in headless Chromium and WebKit-critical. It does not establish a complete editor focus-order audit, actual screen-reader speech, assistive-technology behavior, real OS/browser zoom, contrast compliance, physical keyboard/device behavior, or physical-device acceptance. UX-05 and 3D-STAGE4-04 remain partial/open.
