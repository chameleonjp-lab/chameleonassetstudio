# Native retained-version library and object deletion candidate

## Scope and storage preservation

This local candidate follows f87e40b0594567dcd417f024490e3b54d1ca101f and closes implementation gaps found by the 169-requirement ledger. It is not final acceptance or a main integration claim. Publication dependent on the cancelled PR318 write remains held.

- Explicit normal/recovery comparison: optional save timestamps, revision, name/hash and node/mesh/material/skin/clip/source count differences. Historical unknown times stay unknown. Metadata is read in pages of at most ten snapshots, without loading original blob bytes.
- Selected recovery opens a separately persisted identity, revalidating canonical hash and every original blob. Source root, snapshots and trash state are retained. Current dirty-session save must succeed before transition.
- Closed-project trash/restore atomically validates expected root revision/snapshot/trash state and the absence of an active writer. It changes only list state/timestamp plus GC epoch. No automatic expiry, source reclamation or permanent deletion is introduced. Explicit confirmation describes one affected project, retained copies and restoration.
- General object deletion previews exact IDs and dependent tracks/keys, anchors, colliders, dedicated/shared meshes and skins. Effective locks and joints used by remaining skins reject the operation. Shared geometry, clip identity, materials and original bytes are retained. Apply rechecks the canonical baseline, then uses one existing History transaction with Undo/Redo.

Optional IDB record metadata is additive; database version, native schema 0.3.0 and 2D contracts are unchanged. Original before-change source archive is held outside the checkout. Undo/revert restores source implementation; no actual user project was trashed or edited during development.

## Failure and interruption checks

Focused repository/helper tests cover timestamp-less history, missing retained snapshot, pagination bounds, active writer exclusion, stale revision/trash state, quota atomicity, read-only metadata during write failure, exact bytes after trash/restore, older-version new-copy identity, altered confirmation tokens, and failed copy persistence. An independent review identified a writer lease leak when opening failed after copy commit. restoreCopy now returns its exact writer token; opening failure best-effort releases only that token while preserving durable copy bytes. The regression confirms another owner can acquire the retained copy afterward.

Browser cases are prepared for explicit cancel/trash/restore, older-version comparison/new identity, normal-version preservation, and object deletion cancel/Undo/Redo with original PNG bytes. Browser collection is not execution. Local Chromium socket EPERM and prior official artifact-download 403 remain documented; neither was bypassed. No new pixels, physical-device result or performance number is claimed.

## Remaining acceptance

VIEW-06 project thumbnail/list management is still unverified; this candidate does not implement it. Metadata recovery candidates do not guarantee recovery of unsaved tab-only edits. Same-head browser execution, visual inspection, physical-device and assistive-technology acceptance remain required. Existing dependency findings remain untriaged because the separate audit attempt was cancelled. These limits are not converted into acceptance passes by unit or build success.

## Local verification checkpoint

The integrated candidate passed 2227 unit tests across 170 files, TypeScript, targeted ESLint with zero errors/warnings, Prettier and production app build. The three new browser scenarios collect as six Chromium/WebKit cases; they have not executed here. Independent library review closed its writer-cleanup P2 after a 45-test focused regression. These counts do not certify browser, pixels, assistive technology or physical devices.
