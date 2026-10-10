# Native binary recovery correction

## Reproduced failures

A child-editor teardown previously called `ProjectSession.close()`. Successful close clears resident blob bytes while the surviving outer error boundary still references that session. A real session containing an image and GLB source produced a valid backup before close, then a `Missing blob` error afterwards. An independent source-level reproduction also showed that a late open/restore completion could close the rescue session after child failure.

The stored-backup path previously used a pinned snapshot read. Pin/meta writes fail when all readwrite IndexedDB transactions throw `QuotaExceededError`, even when the stored project and its original bytes remain readable.

## Correction

The surviving shell owns sessions and repository handles. Child failure blocks editing and attempts save without clearing resident source bytes. Final shell teardown and explicit current-owner project transitions release resources. A lifetime epoch rejects stale operations; close rechecks ownership after asynchronous storage work. Ref transfer or explicit navigation occurs synchronously at the final release boundary before old resident bytes are cleared. A delayed promise continuation cannot leave the rescue ref pointing at an emptied old session.

Stored backup captures the root, immutable snapshot and referenced binary bytes in one readonly transaction. Detached bytes are validated after the transaction, without pins, lease acquisition, metadata writes or garbage collection. Concurrent root advancement therefore cannot mix revisions. The library provides a clearly labeled last-saved-version download; it never claims to include unsaved changes.

## Coverage and limits

Unit cases cover image/GLB byte identity, skin and clip retention, repeated rescue, failed-save retention, late session adoption, ownership expiry during release, the close-promise microtask boundary, successful resource release, quota rejection of all writes, invalid/hash-mismatched/missing blobs, and concurrent saved-root advancement. Product tests inject an actual editor render exception, download rescue twice, restore into a fresh browser context, and compare all stores before/after a saved-version backup with writes denied.

Local final validation passed 2,030 unit tests across 157 files, TypeScript, ESLint (no errors), formatting and the application build on 2026-10-10 JST. The six lifetime cases include a deliberately delayed close-promise continuation; an independent source review found the reported ownership failures resolved. Four product cases are collected for Chromium and WebKit but are not yet executed on this correction. Browser CI and screenshot review must be recorded separately. Headless evidence does not certify physical-device memory, OS termination recovery, or unavailable browser storage. This correction advances B09/B10 recovery requirements; it does not close their full gates.

## Recovery

No schema, database upgrade or source-asset rewrite is introduced. The pre-change source archive and parent commit preserve the previous implementation; reverting this code restores it without deleting projects. The readonly export keeps original records unchanged. A failed final save retains memory rather than forcing a destructive discard.
