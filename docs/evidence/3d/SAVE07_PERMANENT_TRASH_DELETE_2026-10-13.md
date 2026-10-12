# SAVE-07 — separately confirmed permanent removal from trash (2026-10-13)

## Scope

This focused slice completes the missing 3D project-library action in SAVE-07: **permanently remove one already-trashed, closed project only after a separate, accessible confirmation**. Normal deletion remains a reversible move to trash. Trash is not automatically expired; the library continues to show the trash time.

## Behavior and safety contract

- The permanent-delete action is absent for non-trashed projects. It targets one named project and shows its project ID, normal saved snapshot, retained recovery-candidate count, project-only image/GLB and legacy archive scope, the fact that shared data used by other projects and the separate 2D store are untouched, and that this operation cannot be undone. It also avoids promising physical media erasure by the browser.
- The repository rechecks the target's root ID, revision, current snapshot, recovery-candidate count and trash state in the same IndexedDB write transaction. A stale confirmation cannot delete a changed project or a changed recovery set.
- An active writer lease or a read/reference pin blocks deletion. On confirmation, only the target root, its target history/staging and legacy archive are removed. Snapshot and hash-addressed blob records are deleted only after recomputing live references inside the transaction; references from another project or an active pin keep the data. Project-specific orphaned snapshots are included in that reference-safe cleanup.
- The successful result reports counts of snapshot/blob records actually removed, not bytes securely erased.

## Local evidence

- Repository tests: `src/core3d/storage/repository.test.ts` — 40/40 passed, including shared-blob retention, project-only blob/history/legacy-archive removal, writer/pin refusal, and stale trash/recovery confirmation rejection.
- Product browser suite: `e2e/native-library-product.spec.ts` — 16/16 in Chromium and 16/16 in WebKit-critical. The new flow cancels the irreversible confirmation, then confirms it; the trashed target disappears, a sibling project remains, and its copy of the shared source bytes still matches.
- Full Vitest: 3,547/3,547 across 186 files.
- TypeScript no-emit, Prettier check, production app and H3 builds, and `npm run test:ci-scope` (8/8) passed.
- ESLint: zero errors; one existing `react-hooks/exhaustive-deps` warning remains at `src/features/editor3d/NativeViewportPanel.tsx:205` (untouched). Builds retain the repository's existing >500 kB chunk advisory. `git diff --check` passed.
- No remote CI was monitored.

## Remaining limits

This is automated evidence over generated fixtures, fake IndexedDB unit tests and headless Chromium/WebKit-critical browsers. It does not establish physical-device or assistive-technology acceptance, browser/OS storage compaction or secure erasure, real quota/eviction behavior, all cross-tab and process/OS interruption interleavings, arbitrary user projects, deployed-runtime behavior, or final release acceptance. SAVE-07 and overall acceptance remain partial/open; no global acceptance pass is claimed.


### Production-preview cross-check

After the full local validation, the new permanent-deletion scenario was also rerun against a freshly built application/consumer production preview: 1/1 in Chromium and 1/1 in WebKit-critical. This checks the selected UI flow in the built bundle, not a deployed service or physical device.

## Follow-up after guide correction and E2E readiness synchronization — 2026-10-13

A local audit found that the public 3D guide still said permanent deletion was unavailable. It now documents the no-expiry trash, the separately confirmed per-project irreversible deletion, the target-only saved/recovery records and unshared assets, the preservation of shared assets and 2D data, app-level non-recovery afterward, and the limitation that browser physical-media erasure is not guaranteed. A product regression checks those statements.

The expanded `e2e/native-library-product.spec.ts` passed 17/17 in serial Chromium and 17/17 in serial WebKit-critical. During the first expanded runs, the suite exposed two test-readiness assumptions: selecting a second backup before asynchronous project close re-enabled the file input, and focusing a recovery candidate before it became enabled. The tests now wait for the close/input-ready state, the copy-restore success status, and an enabled recovery trigger. The final full suites pass; the initial failures were test synchronization issues, not a confirmed product defect. A freshly built production preview passed both selected cases (permanent deletion and guide wording) in 2/2 Chromium and 2/2 WebKit-critical runs.

Follow-up quality checks passed: ESLint 0 errors (the existing `NativeViewportPanel.tsx:205` Hook warning remains), TypeScript no-emit, Prettier, app and H3 builds, CI-scope classification (8/8), and `git diff --check`. The full Vitest result remains 3,547/3,547 across 186 files; this follow-up changes no core implementation or unit-test code. The existing >500 kB chunk advisory remains. No remote CI was monitored.
