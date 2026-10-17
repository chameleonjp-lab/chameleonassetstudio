# SAVE-03 offline copy recovery and re-edit follow-up — 2026-10-17 JST

## Scope

Tested source commit: `2bb67b419c3e796edda2771561f980d2f8ba99ad` (child of Draft PR #413 head `6f073ddcfc3cf4e666feb59b5803b0302a1b792c`).

The extended product E2E creates a source-backed `.cas3dproj` from the populated `Binary rescue` fixture, waits for the browser download event, checks the suggested filename, and reads the completed download through Playwright's `Download.path()`. It verifies the archive's project data and source image/GLB bytes against the fixture. The existing product notice is asserted verbatim: download has started, the user should check the device, and the browser's internal save state has not changed.

A brand-new browser context with empty site storage then loads the 3D app shell. After the restore input is available, the test aborts every HTTP(S) request. It restores only from the external archive, checks that the restored project has a distinct project ID and identical source blobs, then edits one skin vertex from weights `[0.75, 0.25]` to `[0.5, 0.5]` and changes the 1-second animation key from `[0, 2, 0]` to `[0, 3, 0]`. It explicitly saves the edit and exports another backup, verifying the edited values and project name in that archive. No HTTP(S) requests are attempted after blocking begins.

No product behavior or storage schema change was needed: the editor already reports download initiation and tells users to verify the file on their device. This change adds the missing end-to-end acceptance evidence for that behavior and for offline re-editability.

## Local verification

- Focused SAVE-03 case in production preview: Chromium **1/1 passed**.
- Complete `e2e/native-recovery-product.spec.ts`: Chromium **6/6** and WebKit-critical **6/6**; **12/12 passed**.
- Unit suite: **187 files / 3,554 tests passed**.
- `npm run format:check`: passed.
- `npm run lint`: **0 errors**; the existing `NativeViewportPanel.tsx:205` React Hook warning remains.
- `npm run build` (application and H3): passed.
- `npm run consumer:build`: passed.
- `npm run test:ci-scope`: **8/8 passed**.
- `git diff --check`: passed.
- The builds report the existing non-blocking large-chunk advisory (>500 kB). Remote CI was not queried or monitored.

## Limits

This validates a fresh **empty browser storage context**, but the 3D application shell is loaded before HTTP requests are blocked. It does not establish that a cold page load works when the application shell itself has never been loaded or cached and the device is already offline.

The E2E's completed `Download.path()` is a file in Playwright's test runner. It is not evidence that a human's browser or operating system completed a save to the user's physical device, nor that the user can reopen that file on a separate device. Deployed delivery, cold-offline boot, actual device/browser save and reopen, OS interruption, and final release acceptance remain unverified. SAVE-03 therefore remains `implemented-candidate / partial`; no persistence guarantee is implied.
