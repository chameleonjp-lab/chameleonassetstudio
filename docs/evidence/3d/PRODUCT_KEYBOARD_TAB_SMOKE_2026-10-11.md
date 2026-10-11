# Headless keyboard authoring smoke — 2026-10-11

## Scope

`e2e/native-editing-product.spec.ts` adds `keyboard-only Tab flow creates, numerically edits, saves and backs up a project`. The test starts from `/3d/` and uses Tab, Enter, and keyboard text entry to create a project, add a box, open numeric transform controls, enter an X translation, apply it, save, and download a native backup. It checks actual focus reachability through `document.activeElement`; it does not call `.click()` or programmatically focus controls. The downloaded backup is decoded and the canonical translation is asserted as `[1.25, 0, 0]`.

## Local verification

- Chromium: passed using `/usr/bin/chromium` through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (6.5 s).
- WebKit-critical: passed (6.2 s).
- Both runs used the same targeted Playwright test and one worker.

## Boundaries

This is a headless browser software test, not a physical-keyboard, mobile software-keyboard, screen-reader, VoiceOver, or TalkBack result. It covers one basic authoring slice only. It does not cover the complete Stage 4-04 import → inspect → setup → GameData → export flow, key editing, all dialog exits, screen-reader alternatives, reduced-motion or contrast audits, or physical-device acceptance. It therefore adds partial UX-04 keyboard evidence and does not close UX-04/UX-05, Stage 4-04, B09, or any physical accessibility gate.
