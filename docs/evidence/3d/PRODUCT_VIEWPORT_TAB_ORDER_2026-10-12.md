# 3D viewport keyboard focus-order smoke — 2026-10-12

## Scope

Subject code commit: `3be73cbe93f05c5042a96c1f66368d97aac2ec9a`.

`e2e/native-viewport-product.spec.ts` now verifies the keyboard focus sequence within the active 3D viewport controls, starting at **カメラをリセット** and proceeding through **全体を表示**, GPU pause, PNG, thumbnail, orbit, pan, zoom, and the named 3D viewer group. The same sequence is traversed in reverse with Shift+Tab. Every Tab-reached target is checked for keyboard focus and a computed solid 3px outline; the test only moves focus and does not activate controls or edit the project.

The order is deliberately scoped to the viewport control area; it is not a full-editor focus-order audit. The expected sequence includes the product shell's thumbnail action.

## Local verification

- Full `e2e/native-viewport-product.spec.ts`: 42/42 passed across Chromium (system `/usr/bin/chromium`) and WebKit-critical, including the new forward/reverse Tab-flow case.
- `npm run format:check`: passed.
- `npm run lint`: zero errors; one pre-existing React Hook warning in `NativeViewportPanel.tsx:205`.
- `npm test`: 3,530/3,530 passed across 185 files.
- `npm run build`: passed for the app and H3; the existing large-chunk advisory remains.
- `git diff --check`: passed.

An initial run overlapped the full browser suite and full unit suite and produced one existing WebKit 30-second timeout and one 5-second timeout in the large-backup unit case. Each timed-out case passed alone; then the full viewport E2E and full unit/build/quality sequence passed after the heavy runs were serialized. No timeout or test configuration was changed.

## Boundaries

This is DOM focus order and computed CSS evidence in headless desktop browsers only. It does not establish actual screen-reader speech, VoiceOver/TalkBack behavior, physical keyboard/device acceptance, actual browser/OS zoom behavior, or contrast compliance. A 3px outline style is not a contrast-threshold verdict. UX-05 and 3D-STAGE4-04 remain partial/open; physical and assistive-technology acceptance remain unverified.
