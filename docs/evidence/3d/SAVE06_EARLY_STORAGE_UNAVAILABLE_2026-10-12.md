# SAVE-06 early storage-unavailable guidance — 2026-10-12

## Scope

This software-only slice verifies the existing 3D shell behavior when browser storage cannot be opened before a project session exists. The product E2E replaces `IDBFactory.prototype.open` with a deterministic `SecurityError`, checks the early Japanese storage-unavailable and backup guidance, and confirms project creation is not offered while the repository is disconnected. It then restores the native open method's behavior, explicitly reconnects, and creates a project successfully.

No production behavior or storage schema changed. The test models an access-denial failure; it does not emulate a browser's actual private-browsing implementation.

## Local verification

- Focused case: Chromium 1/1 and WebKit-critical 1/1 passed.
- Complete `native-recovery-product.spec.ts`: Chromium 3/3 and WebKit-critical 3/3 passed.
- `npm test`: 185 files / 3,534 tests passed.
- `npm run format:check`, `npx tsc --noEmit`, `npm run build`, and `git diff --check`: passed.
- `npm run lint`: zero errors; the existing `NativeViewportPanel.tsx:205` React Hook warning remains.
- App and H3 builds passed; the existing >500 kB chunk advisory remains.

The associated Draft PR description records the exact tested head and tree.

## Limits

SAVE-06 remains `partial`. The injected `SecurityError` verifies the software's early warning, creation gate, and explicit reconnect path. Actual private-mode behavior, browser storage eviction or disk-full conditions, physical devices, user-facing usability, and a deployed runtime remain unverified. No persistence guarantee is implied. CI was not monitored.
