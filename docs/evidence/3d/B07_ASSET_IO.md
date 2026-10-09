# B07 game metadata and native asset I/O candidate

## Scope and recovery

The approved B07 scope contains 62 paths; the subsequent explicit overnight continuation adds one related shared-budget owner, core3d/model/textureResources.ts. The original studio-entries test file required no change, so the actual patch remains 62 files (28 new and 34 existing). Existing files were copied with hashes before changes. The branch starts from PR316 submitted content; submitted predecessors and main integration are reported separately.

Native schema is 0.3.0. 0.1.0/0.2.0 parsing remains strict and frozen. Both old DB names reject writer opening; legacy listing identifies namespace plus ID. Read-only capture and original archive validation precede copy to a distinct ID in chameleon-asset-studio-3d-v3. 0.2 visibility, locks and material attributes are preserved. Failed/quota/cancelled copies do not alter the originals. The immediate old archive is retained; earlier archives still reside in the old namespace. No silent downgrade is provided.

Code can be reverted, while new 0.3 projects must be retained as new-format backups. Deleting old DBs, cleanup, merge and deployment are not part of this change.

## Product contracts

Game metadata includes asset kind/ID, dimensions preview, unit, forward, feet/center/custom origin, anchors and box/sphere/capsule colliders with purpose and local transforms. Capsule height is cylinder length; total height is height+2*radius. Node/bone following uses current display transforms. Game helpers are excluded from canonical PNG and GLB. Metadata is not physics/game logic.

Commands validate detached candidates and use the existing one-operation history path. Locks protect referenced targets. Phone-sized numeric controls, IME and stale-draft rejection retain current source data.

GLB import makes a new saved copy, retaining exact source and optional paired sidecar bytes. It does not replace the current project automatically; the user opens the new copy from the project list. Required extension/URI/malformed/over-budget inputs reject before candidate mutation. Optional unsupported features require an explicit, reset-on-file-change loss choice.

Exports capture a complete rest snapshot and blobs before awaits. Editing may continue while a worker exports the fixed displayed revision. GLB, game.json, manifest.json and a separate asset ZIP are distinct from .cas3dproj backup. The final GLB hash binds all mappings and the sidecar. Unit/origin/forward are descriptive metadata: canonical GLB is always meters/Y-up/+Z-forward, and consumers must apply any delivery conversion exactly once.

Unverified source rights and lineage are retained as claims, not licenses granted by the application. Previous paired-sidecar provenance is hash-checked, flattened/deduplicated and bounded. Original source bytes remain in project backup, not implicitly included in the distribution ZIP.

## Validation and open gates

Unit tests cover strict versions, detached migrations, immutable sources, combined budgets, malformed GLB, raw weights/indices/affine matrices, UV direction, Float32 time errors, independent-root skin encoding, nonidentity bind-space roundtrip, game locks, source/sidecar pairing, provenance backup/reexport, worker cancellation and game-preview helper disposal.

The original fixture includes mixed skin, duplicate human-readable names, sparse and empty clips, game attachments and a four-corner RGBA image. Khronos validator tests require zero errors and non-truncated reports. Product E2E covers actual worker files, ZIP/hash checks, separate-context backup/re-edit/reexport, phone IME/keyboard/touch/cancel, malformed input and sidecar mismatch.

Local validation on 2026-10-10 JST passed lint, formatting, application/H3 build, CI-scope classification and 1,963 unit tests across 149 files. The product spec collects twelve Chromium/WebKit cases. Independent read-only review closed its reported blockers, including Float32 rest admission and game-helper fault isolation. A nonidentity mesh/bone mixed-weight fixture agreed with an independently computed GLB world equation within 9.32e-8.

Submitted head/tree, CI runs and screenshots are recorded after execution. Test discovery is not execution. Browser color/worker/cancel evidence remains pending at candidate time.

This closes the implementation candidate for GAME-01–04 and basic EXP-01–06. It does not claim all-plan completion. Independent consumer/runtime use of clips/sidecar/anchor/collider is B08; physical devices and finalized budgets remain B09; final acceptance/updates remain B10. Unadopted SHOULD features are not silently included.
