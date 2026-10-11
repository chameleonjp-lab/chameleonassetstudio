# Headless keyboard GLB-export smoke — 2026-10-11

## Scope

`e2e/native-asset-io-product.spec.ts` adds `keyboard-only Tab flow exports and saves a GLB package`. The test creates a project and box using Tab/Enter, opens the GLB section using Tab/Enter, reaches the export-review acknowledgement with Tab and checks it with Space, creates the package with Enter, and saves the ZIP with Tab/Enter. It decodes the ZIP and verifies the exact required entries; parses `model.glb`, `game.json`, and `manifest.json`; checks the GLB mesh count and sidecar format/version/revision; and validates the non-empty node mapping, package revision, both manifest file entries, byte lengths, and SHA-256 hashes. The test does not call `.click()` or programmatically focus controls.

## Local verification

The targeted Playwright test passed in Chromium using `/usr/bin/chromium` through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and in WebKit-critical. Both runs used one worker.

## Boundaries

This is headless desktop-browser keyboard evidence only. It does not establish physical keyboard/device, mobile software keyboard, screen-reader, VoiceOver, TalkBack, touch, or physical-device acceptance. It covers one explicit GLB-package export route only; it does not close all UX-04/UX-05 operations, import-picker flows, dialog exits, or Stage 4-04 acceptance.
