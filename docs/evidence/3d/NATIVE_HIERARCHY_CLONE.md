# Hierarchy clone and dependency confirmation

Local implementation candidate for EDIT-04 / DATA-07, based on local export-pre-review commit `04d576c9dca461b14d9190b3f9c114840d11c1f6`. This is not evidence of remote publication or main integration.

## Contract

- One selected subtree, same parent and exact local TRS. Copies occupy the same rest-world placement and are selected after the transaction.
- Independent node/mesh/material/skin/vertex/face identities with reference reconstruction. Sharing within the copied subtree is preserved, without sharing editable geometry/material instances with the original.
- Every joint needed by a copied skin must belong to the copied subtree. Otherwise reject atomically; no implicit missing dependency, rebinding or lossy conversion.
- Copied-node tracks append to the same clips. Existing clip identity, metadata, original tracks and external animated-parent motion stay intact. Preview lists the affected clip and track/key counts.
- Node-attached anchors/colliders are copied with new IDs. Global game metadata, original source/rights records and binary hashes remain unchanged.
- Effective locks, shared locked-clip protection, stale revision, same-revision data mutation, tampered confirmation, invalid references and ID collisions reject atomically.
- UI reserves a conservative twelve-times canonical estimate before preparing expanded candidate/maps/snapshot and retains that owner through confirmation. This is an engineering ownership estimate, not measured heap or device-memory proof.
- Apply is one existing History transaction with Undo/Redo/autosave. Preview does not modify the canonical project. Cancel, close, newer selection/revision/session, error and unmount discard the held confirmation.

## Verification

Verification outcomes are recorded after completion below. New focused unit coverage and browser case collection are distinct from execution of the full suite or a real browser. Existing cancellation/access boundaries remain in force; no alternative full-suite run or browser-launch workaround is part of this candidate.

### Local checkpoint — 2026-10-10 JST

- New hierarchy clone unit suite: **74 tests passed**. Includes scoped ID remapping, deep independence, intra-copy sharing, skin weights/inverse bind, inherited motion, empty tracks, source/metadata retention, locks, Undo/Redo, confirmation tamper/staleness and pre-clone profile rejection.
- Exact confirmation also distinguishes same-revision `-0` to `0` changes that plain JSON serialization would erase. The snapshot is opaque transient data, not a new persistence format.
- Focused core TypeScript, ESLint and formatting passed; integrated application TypeScript/build and UI lint were checked separately.
- Browser cases collected: **28 in two files**, including two new hierarchy cases and updated existing independent-copy flow. Added cancel/close/Escape/focus return, stale selection, missing external joints, Undo/Redo, independent backup restore and unchanged original bytes. **Not executed here.**
- Read-only UI review found one restore-test mismatch: `restoreCopy` resets revision to zero. The test now asserts the new ID and zero revision separately, then compares the remaining complete project after normalizing those two fields. No product expectation was weakened.
- The previous full-suite wait cancellation is not replaced by a new aggregate run. Local browser launch and artifact access limits remain unchanged; physical-device/visual acceptance remains open.
- Final read-only core/UI review: no remaining P1/P2. A missing focus-ref connection introduced during UI integration was corrected; the preparation button now receives Cancel/Escape focus, with both assertions present in the browser cases. Dependency IDs and same-name clip IDs are displayed explicitly.
