# D3 consumer integration notes

Status: product implementation connected; browser runtime verification and final CI remain pending. No claim of R05 completion or engine runtime verification.

## Scope and compatibility

The additive timeline and frame projection modules prepare the D3 proposal in `R05_OUTPUT_PROPOSAL.md`. They do not change legacy ZIP, Atlas 0.1.0, distribution 0.1.0, asset.json, .casproj, schemas, or existing helper APIs. They add no dependencies. R05/R06 changes from the previously stacked branches must be retained when integrated into main.

Canonical references: `future/2D_ASSET_DATA_CONTRACT.md` §8.2, `src/core/model/animationTiming.ts`, `src/core/model/frameColliderOverrides.ts`, and `src/core/model/collider.ts`.

- Frame `durationMs` takes precedence over `1000 / fps`. Animation `durationMs` is informational and is not used for playback.
- Events reference `frameId`, not an occurrence-specific canonical `frameIndex`. They fire for every repeated occurrence and every loop, in saved event-array order. Output occurrence indexes and packed frame indexes are separate concepts.
- Frame intervals are half-open. A non-looping timeline retains its last image after completion. Empty animations have no current frame.
- Event collection uses `(previousTime, currentTime]`; initial playback includes time zero. Long ticks keep the elapsed remainder and deliver intervening events in order. Excessive catch-up fails atomically instead of silently losing events. Stop suppresses further delivery; restart begins at zero.
- Frame collider overrides preserve their resolved geometry and visibility. Collider `visible` controls editor/debug drawing; it does not remove the collider from game data.
- Packed image geometry is already scaled. Origin, anchors and collider geometry are scaled once using existing rounding rules. World placement is `worldOrigin - scaledOrigin + contentOffset`.

## Implemented integration

- A separate rich exporter produces distribution/package 0.2.0, preserves canonical asset.json, and uses SHA-256 asset-ID directories. Display-name collisions do not overwrite files.
- Version-specific schemas and a standalone reader validate structure, paths, IDs, page/frame references, bounds, timeline semantics and resource hashes. PNG signature/IHDR dimensions are checked before decode; APNG pages are rejected. All source/page files are bounded, including streamed responses.
- Shipped ESM helpers share the exact tested timeline/projection logic. Canvas 2D, PixiJS 8.12.0 and Phaser 4.2.0 use thin adapters. The package includes all three examples and both JSON schemas.
- The new product panel selects multiple assets, changes target/profile/padding/scale, explicitly saves backward-compatible optional presets and preserves settings through .casproj. Synchronous locks and AbortSignal prevent repeated/cancelled/stale downloads.
- New-format pages use their actual packed bounds. The old distribution path retains 2048px pages and its fixed-fps/collider-loss guards. Reused bitmap loading now closes decoded resources on failure and optionally observes cancellation between texture operations.

## Limits and failures

Exports allow 1–32 selected assets, at most 4096 frames/total animation occurrences per asset, 4 pages per asset, 2048px per page dimension, 64MiB uncompressed ZIP entries and 256MiB estimated working/decoded page bytes. Metadata is preflight-bounded before repeated event payloads are materialized. Canonical JSON is capped at 16MiB, each distribution manifest at 4MiB, the package manifest at 1MiB and each PNG file at 20MiB. Unsupported/oversized data fails before download; no lossy conversion is substituted. These are conservative resource guards, not physical-iPhone performance guarantees.

Events remain inactive data. URL-like payloads are never fetched or executed. Geometry overflow and unrepresentable playback-time increments fail explicitly. Clock event catch-up is bounded and fails atomically rather than dropping events.

## Verification status

Automated component/schema/storage tests and real ESM adapter mocks are implemented. Independent review identified and repaired ordinary 60fps boundary errors, coordinate overflow, decode-before-bounds checking, mismatched producer/reader budgets and cancellation gaps.

New browser cases cover product ZIP to Canvas/PixiJS/Phaser, exact opaque pixel colors, trim/multiple pages/1–3x, variable timing, repeated frames, events, hidden collider overrides, settings restore and cancelled/repeated output. Local browser launching failed before assertions: Chromium could not create its process-singleton socket (`Operation not permitted`). The same limitation affected the installed Chromium wrapper and existing Google Chrome binary. These cases are **not verified** until they run successfully in CI or another permitted environment. Tests must not be skipped or weakened to hide this gap.

Still required: final-head aggregate checks and independent review, real browser execution of new and existing paths, performance comparison, one consolidated physical iPhone check, human merge and matching deployed-revision verification. Existing PR #288 supplies the consolidated R05/R06 baseline; D3 must not replace or discard its quality fixes.
