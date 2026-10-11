# Headless keyboard import-preview, GameData, and export smoke — 2026-10-11

## Scope

`e2e/native-asset-io-product.spec.ts` adds `keyboard-only import preview, GameData edit and export after fixture upload`. It creates a project and box using Tab/Enter, opens GLB I/O with Tab/Enter, inspects the candidate using keyboard-operated full-frame and left-view controls, acknowledges the conversion/preview note with Space, and saves the verified import as a new copy with Enter. It opens the saved project and 3D view with keyboard navigation, edits `asset種類` to `character`, applies GameData with Enter, then acknowledges export review with Space and generates/downloads the GLB package using Enter. The decoded package's `game.json` confirms `assetKind: character` and its model hash matches the GLB.

The related import-preview lifecycle test now reaches the acknowledgement checkbox with actual Tab traversal (rather than programmatic focus), sends Escape, and verifies that the preview closes and focus returns to its launch button. Other close, replacement, and canonical-change dismissal cases remain covered in that lifecycle test.

The test reaches the GLB file input with Tab and activates it with Enter. Playwright receives the `filechooser` event and injects the fixture with `FileChooser.setFiles`; the native operating-system dialog UI and its own keyboard selection are **not** exercised. The application UI before and after fixture injection is driven with keyboard navigation and key presses; the import/export workflow test uses no mouse click/tap or programmatic focus.

## Local verification

- Keyboard import/GameData/export: Chromium passed in 8.2 s; WebKit-critical passed in 10.3 s in the final matrix.
- Import-preview Escape lifecycle: Chromium passed in 7.1 s; WebKit-critical passed in 8.7 s.
- All selected accessibility workflows passed in the same single-worker 14-run matrix.

## Boundaries

This is headless software evidence for the post-selection import-preview, inspection, copy-save, GameData, and export path. It does not prove keyboard operation of the OS file picker, physical keyboard/device or mobile software keyboard, touch, screen-reader, VoiceOver, TalkBack, or manual acceptance. It is one partial 3D-STAGE4-04/UX-04 path and does not complete the full workflow or close UX-04/UX-05 or any physical accessibility gate.
