# Headless keyboard animation-key edit smoke — 2026-10-11

## Scope

`e2e/native-animation-product.spec.ts` adds `keyboard-only Tab flow selects and edits an animation key`. Starting from `/3d/`, the test uses Tab/Enter and keyboard text entry to create a project, add a box, open the native animation panel, create a clip, choose the object with ArrowDown/Enter, and add one key. It reaches the key-list entry with Tab and selects it with Enter, then uses Shift+Tab to reach its time input and Tab to reach its X value input. Enter applies the updated time/value. The editor revision must advance, the key-list label must change to `キー 1秒: 2, 0, 0`, and a decoded saved backup must contain exactly one key at time `1` with value `[2, 0, 0]`. The test uses no mouse click or programmatic focus.

## Local verification

The targeted Playwright test passed in Chromium using `/usr/bin/chromium` through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and in WebKit-critical. Both runs used one worker.

## Boundaries

This is a headless desktop-browser keyboard result only. It does not test touch selection (also required by ANIM-04), a physical keyboard/device, mobile software keyboards, screen readers, VoiceOver, or TalkBack. It covers one selected-key time/value-edit path, not all timeline zoom, paging, interpolation, duplicate-time, clip, export, dialog-exit, or full Stage 4-04 acceptance. It is partial UX-04/ANIM-04 software evidence and does not close UX-04/UX-05, Stage 4-04, or any physical accessibility gate.
