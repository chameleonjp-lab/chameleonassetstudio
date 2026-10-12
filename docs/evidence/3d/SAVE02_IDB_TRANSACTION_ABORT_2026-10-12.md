# SAVE-02 browser IndexedDB transaction-abort follow-up — 2026-10-12

## Scope

`e2e/native-recovery-product.spec.ts` now exercises the 3D product save path using the browser's actual IndexedDB implementation. After restoring a current project and capturing its saved records, the test edits the project name, queues the normal snapshot `add`, and immediately calls `IDBTransaction.abort()` on that read/write transaction. It then verifies that the canonical project records remain unchanged, while the still-open session can produce a backup containing the resident edit. Once the injected abort is removed, the existing retry control saves the edit; reload and reopen confirms the persisted name.

The comparison covers the 3D project stores other than `meta`. Staging and discard each advance `meta.epoch` by design, so that coordination counter is not part of the canonical-project atomicity assertion. Staging, roots, snapshots, blobs, pins, leases, history, and legacy-backup records are compared.

## Local evidence

- Focused abort/retry case: Chromium 1/1 and WebKit-critical 1/1.
- Complete `native-recovery-product.spec.ts`: Chromium 4/4.
- TypeScript check, Prettier check, application and H3 production builds: passed.
- Full Vitest suite: 3,534 tests across 185 files passed.
- ESLint: zero errors; the existing `NativeViewportPanel.tsx:205` Hook warning remains. The build retains its existing non-blocking >500 kB chunk advisory.

## Limits

This is a synthetic abort injected into a real browser IndexedDB transaction. It is not evidence of physical quota exhaustion, disk-full behavior, process/OS termination, concurrent cross-tab writes, corrupted durable records, a physical device, or a production deployment. The result adds only a software/browser slice; SAVE-02 and overall acceptance remain partial. CI was not monitored.
