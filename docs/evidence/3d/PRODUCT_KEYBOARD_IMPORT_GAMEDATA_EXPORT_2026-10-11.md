# Headless keyboard import-preview, GameData, and export smoke — 2026-10-11

## Scope

`e2e/native-asset-io-product.spec.ts` adds `keyboard-only import preview, GameData edit and export after fixture upload`. It creates a project and box using Tab/Enter, opens GLB I/O with Tab/Enter, inspects the candidate using keyboard-operated full-frame and left-view controls, acknowledges the conversion/preview note with Space, and saves the verified import as a new copy with Enter. It opens the saved project and 3D view with keyboard navigation, edits `asset種類` to `character`, applies GameData with Enter, then acknowledges export review with Space and generates/downloads the GLB package using Enter. The decoded package's `game.json` confirms `assetKind: character` and its model hash matches the GLB.

The test reaches the GLB file input with Tab and activates it with Enter. Playwright receives the `filechooser` event and injects the fixture with `FileChooser.setFiles`; the native operating-system dialog UI and its own keyboard selection are **not** exercised. The application UI before and after fixture injection is driven with keyboard navigation and key presses; the test uses no mouse click/tap or programmatic focus.

## Local verification

The targeted Playwright test passed in Chromium using `/usr/bin/chromium` through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and in WebKit-critical. Both runs used one worker.

## Boundaries

This is headless software evidence for the post-selection import-preview, inspection, copy-save, GameData, and export path. It does not prove keyboard operation of the OS file picker, physical keyboard/device or mobile software keyboard, touch, screen-reader, VoiceOver, TalkBack, or manual acceptance. It is one partial 3D-STAGE4-04/UX-04 path and does not complete the full workflow or close UX-04/UX-05 or any physical accessibility gate.
