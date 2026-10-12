# IMP-03 compressed native-backup entry rejection — 2026-10-12

## Scope and observed behavior

The test starts with an exporter-produced, valid stored native 3D backup, then rebuilds its entries using deflate compression. The archive metadata confirms a non-stored compression method. The parser rejects it with `This backup profile requires stored ZIP entries`; the rejected caller-owned bytes remain unchanged. The existing `unzipSync` admission filter checks the ZIP entry metadata (`file.compression`) before admitting any entry to the returned file map, while separately bounding entry count, stored size, and expanded payload.

The product E2E first restores the valid stored backup and reloads the project library, then submits the deflated archive under the native `.cas3dproj` extension. The fixed `EDIT_STORAGE_BACKUP` compatibility guidance is displayed and the pre-existing project remains in the library. Storage error guidance now covers this specific compressed-profile failure along with the previously recognized unsupported path/version/incomplete-backup messages.

## Local evidence

- Focused parser unit and compatibility-guidance cases passed; the full Vitest suite passed 3,539 tests across 185 files.
- Focused IMP-03 E2E passed 1/1 in Chromium and 1/1 in WebKit-critical. The complete `native-legacy-backup-product.spec.ts` passed 3/3 in each configuration.
- TypeScript, formatting check, app/H3 production builds passed. ESLint had zero errors; the existing `NativeViewportPanel.tsx:205` Hook warning and >500 kB chunk advisory remain.

## Limits

This verifies one deflated native-backup profile rejection and project retention. It does not exercise path traversal, duplicate entries, oversized declared expansion, a real ZIP bomb, memory ceilings, or mobile/device behavior. General compressed ZIPs remain unsupported by design. IMP-03 and overall acceptance remain partial. CI was not monitored.
