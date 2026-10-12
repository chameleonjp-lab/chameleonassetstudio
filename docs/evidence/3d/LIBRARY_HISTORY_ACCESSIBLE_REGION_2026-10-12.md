# 3D library recovery-history region — 2026-10-12

## Scope

The saved-version comparison is exposed as a named `region` associated with its visible heading, **「最後の正常版と保持した復旧候補」**. The new browser E2E locates the comparison by that name and verifies its heading and history list; existing recovery behavior remains covered separately.

This is a bounded software-only accessibility-tree check. It does not change recovery behavior, saved data, or persistence.

## Verification

- `e2e/native-library-product.spec.ts`: the dedicated saved-version comparison scenario requires the named region, visible heading, and list.
- `npx playwright test e2e/native-library-product.spec.ts`: 28 passed across Chromium and WebKit-critical (14 scenarios in each browser project).
- `npm test`: 3,530 passed across 185 test files; `npm run build`: passed.
- `npm run lint`: no errors; one pre-existing `NativeViewportPanel.tsx:205` warning. `npm run format:check` and `git diff --check`: passed.
- `npm run test:ci-scope`: 8 passed.

## Unverified

Actual screen-reader speech and reading order, VoiceOver/TalkBack, physical devices, browser/OS zoom, and WCAG conformance remain unverified. See [the physical-device accessibility gates](PHYSICAL_DEVICE_ACCESSIBILITY_GATES_2026-10-11.md).
