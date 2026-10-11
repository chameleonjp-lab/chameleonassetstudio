# Headless keyboard authoring smoke — 2026-10-11

## Scope

`e2e/native-editing-product.spec.ts` adds `keyboard-only Tab flow creates, numerically edits, saves and backs up a project`. Starting at `/3d/`, the test uses Tab, Enter, and keyboard text entry to create a project and box, then uses Tab/Enter to open the 3D assembly list and Tab/Space to deselect and reselect its checked checkbox. It verifies that selection guidance changes from 0 to 1 selected object and that the reselected entry is active. The test continues with Tab/Enter and keyboard text entry to open numeric transform controls, apply an X translation, save, and download a native backup. It checks actual focus reachability through `document.activeElement`; after Tab reaches the X input, it verifies the existing keyboard-visible outline is solid, 3 px wide, and offset by 3 px. The test does not call `.click()` or programmatically focus controls. The downloaded backup is decoded and the canonical translation is asserted as `[1.25, 0, 0]`.

## Local verification

- Chromium: passed in the final 16-test matrix; this case completed in 7.5 s.
- WebKit-critical: passed in the same matrix; this case completed in 8.5 s.
- The full selected matrix passed 16/16 with one worker.

## Boundaries

This is a headless browser software test, not a physical-keyboard, mobile software-keyboard, screen-reader, VoiceOver, or TalkBack result. The assertion verifies that a focus outline is rendered, not its contrast compliance or perceptual visibility. It covers one basic authoring slice and one assembly-list selection, not the complete Stage 4-04 import → inspect → setup → GameData → export flow, key editing, all dialog exits, complete screen-reader alternatives, or physical-device acceptance. It therefore adds partial UX-04 keyboard evidence and does not close UX-04/UX-05, Stage 4-04, B09, or any physical accessibility gate.
