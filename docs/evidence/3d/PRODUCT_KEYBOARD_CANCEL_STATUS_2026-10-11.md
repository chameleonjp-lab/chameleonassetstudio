# Headless keyboard Escape cancellation and status smoke — 2026-10-11

## Scope

`e2e/native-editing-product.spec.ts` adds `keyboard-only Escape cancels numeric edits and exposes status announcements`. Starting at `/3d/`, the test uses Tab/Enter to create a project and box, open numeric transform, and start an edit. After waiting for the initial project to be persisted, it decodes a keyboard-triggered baseline backup. It enters `9.5` in the X field, verifies the edit-state `role="status"` live region says `数値を入力中（未プレビュー）` with `aria-live="polite"`, then presses Escape. The unchanged editor/persisted revision, restored `確定済みの状態` status, and disabled numeric field confirm cancellation; the separate cancellation `role="status"` notice is also explicitly checked for `aria-live="polite"`. A second keyboard-triggered backup is decoded and its entire project object is deep-equal to the baseline (including its identity/content), with canonical translation `[0, 0, 0]`. The test uses no mouse click or programmatic focus.

## Local verification

The targeted Playwright test passed in Chromium using `/usr/bin/chromium` through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and in WebKit-critical. Both runs used one worker.

## Boundaries

This verifies status-role markup and text transitions in headless desktop browsers; it does **not** test actual speech from a screen reader, VoiceOver, TalkBack, a physical keyboard/device, touch, or mobile software keyboards. It is a partial UX-04/UX-05 software slice and does not complete 3D-STAGE4-04 or close any physical accessibility gate.
