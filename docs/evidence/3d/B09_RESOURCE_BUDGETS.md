# B09 resource ownership candidate

## Scope and unchanged data

This change unifies declared in-realm resource estimates for texture, asset I/O, geometry, history, storage-copy and framebuffer owners under a 256 MiB engineering cap. Category-specific limits remain in force. It introduces no database/schema conversion, automatic mesh simplification, source deletion or automatic history eviction. Code can be reverted without rewriting saved projects; a pre-change source archive and parent commit preserve recovery.

## Ownership

- Resource tickets are acquired before declared allocations and released by their owners. Atomic positive-delta growth rejects without changing an old ticket; shared aliases transfer one ticket. Separate tabs/workers have separate ledgers. The main-thread I/O reservation continues to cover its declared worker-operation estimate; this is not a global process-memory meter.
- Texture and GLB I/O no longer depend cyclically on each other's counters. Geometry admission includes expanded numeric scratch arrays, typed CPU attributes, upload estimates, nodes, materials and skin instances. Graph disposal clears CPU attributes and releases its ticket.
- Rendering keeps the existing 1,000-node / depth-64 / 100,000-vertex / 100,000-triangle / 300,000-corner profile. Raw GLB admission can be larger; quality inspection explicitly distinguishes this from a display guarantee. It never reduces the original model silently.
- A display-only target cap is 4,096 pixels per edge, 4,000,000 pixels total and DPR at most 2. The estimate uses 32 bytes per pixel for color/depth/multisample/intermediate allowance. Actual driver overhead remains unknown. DPR/size update order prevents an old-large-size/new-large-DPR intermediate; failed admission retains the old target. Reducing display quality does not alter canonical geometry, materials or export bytes.
- Real sessions track current, Undo, Redo and preview snapshots plus declared edit-clone overlap. The existing 32 MiB serialized-history limit remains. Internal snapshot moves do not double-charge aliases. Failed edits/admission preserve old snapshots. Successful close releases snapshots; failed save/close or lost-owner close preserves rescue data.
- Autosave pending/failed snapshots and SaveQueue detached copies are admitted separately. Replacement overlaps keep old tickets until release. Failed admission keeps the editor dirty; explicit save can capture its latest canonical revision again after resources become available. An exact saved-copy revision is required before failed autosave clones may be released during close.
- Native backup admission precedes source copies. Stored-ZIP JSON expansion adds a conservative structural/upgrade allowance before parsing. Errors keep caller-owned source bytes unchanged. Downloaded return values become caller-owned; this ledger does not measure browser download buffers or garbage collection.

## Evidence and limitations

Local validation on 2026-10-10 JST passed 2,083 unit tests across 160 files, TypeScript, ESLint (no errors; one pre-existing viewport hook warning), formatting, application build and isolated consumer build. Independent review found and rechecked fixes for UTF-8-heavy/near-token-limit backup round-trip admission and return-to-original-size recovery after resize denial. Its reported P1/P2 findings are closed; that review is not physical-device acceptance.

Unit tests cover category sharing, exact-cap/over-cap/unsafe estimates, atomic growth, clone/validation rollback, failed-save retry, twenty edit/save/close cycles, repeated graph/target creation, resize denial/recovery, malformed backup cleanup and original-byte retention. Browser lifecycle coverage is extended to twenty disposal/remount cycles and a bounded actual canvas-size check. Those browser changes are collected for later CI execution, not claimed as already passed.

Structural estimates are not exact JavaScript heap usage. Caller-owned public reads, callback-created objects before the callback returns, serialization/runtime/GC overhead, browser/driver allocations and other realms are not a measured total. Callback-created growth is checked before canonical adoption. GPU free memory is unknown. The cap is a guard, not proof that a given device can complete the whole workflow.

B09 is not complete: physical PC/iPad/iPhone/Android measurements, OS termination/background behavior, input/accessibility acceptance and final performance tiers remain open. B08 runtime verification and B10 final acceptance remain separate gates. No physical-device pass is inferred from headless browser or injected-GPU tests.
