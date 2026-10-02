# D3 consumer integration notes

Status: D3 prototype candidate; adoption is pending under the release plan §8. Product ZIP to actual browser engines is verified at the baseline below. The additional mobile/evidence changes still require final-head CI. R05/R06 are not complete.

## Scope and compatibility

The additive timeline and frame projection modules prepare the D3 proposal in `R05_OUTPUT_PROPOSAL.md`. Legacy ZIP, Atlas 0.1.0, distribution 0.1.0, canonical asset.json, the .casproj container contract and existing helper APIs are preserved. Export-preset schema 0.1.0 gains a backward-compatible optional `distribution` setting; .casproj carries that setting through its existing preset entry. New version-specific distribution/package schemas are separate. Old presets receive defaults on read. No dependencies are added. PR #288's merged R05/R06 baseline is retained. The prototype was human-merged in PR #289 at `e04902b6d89821d58e2ec44ab8a44ee1d6019524`; its tree `04a359ad3958f52dda64e38469a6e8927fea50cc` equals the CI #954 candidate. This records integration, not a D3 adoption response.

Canonical references: `future/2D_ASSET_DATA_CONTRACT.md` §8.2, `src/core/model/animationTiming.ts`, `src/core/model/frameColliderOverrides.ts`, and `src/core/model/collider.ts`.

- Frame `durationMs` takes precedence over `1000 / fps`. Animation `durationMs` is informational and is not used for playback.
- Events reference `frameId`, not an occurrence-specific canonical `frameIndex`. They fire for every repeated occurrence and every loop, in saved event-array order. Output occurrence indexes and packed frame indexes are separate concepts.
- Frame intervals are half-open. A non-looping timeline retains its last image after completion. Empty animations have no current frame.
- Event collection uses `(previousTime, currentTime]`; initial playback includes time zero. Long ticks keep the elapsed remainder and deliver intervening events in order. Excessive catch-up fails atomically instead of silently losing events. Stop suppresses further delivery; restart begins at zero.
- Frame collider overrides preserve their resolved geometry and visibility. Collider `visible` controls editor/debug drawing; it does not remove the collider from game data.
- Packed image geometry is already scaled. Origin, anchors and collider geometry are scaled once using existing rounding rules. World placement is `worldOrigin - scaledOrigin + contentOffset`.
- In 0.2, `rect` is page-local and `contentRect` is relative to that placed rectangle. Packed `contentRect.x/y` are zero; `contentOffset` retains the original source-canvas trim position. The old packer's source-local crop and legacy manifests are unchanged. The first real ZIP test caught an incompatible source-local crop being rejected by the reader; real-packer regression tests now cover 1/2/3x.

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

Product UI ZIP → Canvas 2D, PixiJS 8.12.0 and Phaser 4.2.0 passed all nine engine/scale cases in both Chromium and WebKit. The consumer uses downloaded bytes and shipped ESM helpers, not app modules or hand-built manifests. Checks include exact opaque pixels, transparent outside pixels, trim, three pages, 1/2/3x, origin, anchors, resolved collider visibility/geometry, variable timing, repeated IDs, ordered inert event payloads, loops, stop/restart and two same-name assets with different pixels.

The current candidate expands this baseline to fixed-grid and packed profiles, full-frame pixel comparisons, Phaser Canvas/WebGL and actual bundled examples (24 cases per browser). Separate old-format UI ZIP tests compare every opaque/transparent pixel with the source PNG at 1–3x. The old Generic Web helper samples packed pixels from the page rectangle origin without applying source trim twice; legacy manifest/version/ZIP contracts and loss guards remain unchanged. All 36 focused cases (24 engines, six legacy, six controls) passed locally in Chromium and WebKit after fixing the Canvas example's mixed performance/RAF clocks. Its deterministic regression executes the actual generated module against real playback validation. CI #954 passed this expanded engine and legacy scope at head `1186f4ee621bb206d846f338478ac50023e7afd3` (unit 1024, Chromium 273, WebKit 87, production quality 4, H3 1, open/closed Pages 1 each). The added mobile and measurement changes still require final-head aggregate CI.

[CI #952](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/36957625478) passed at head `9c677723596a3be152a0a17df082756760ff428e`: unit 1017, Chromium 252, WebKit 66, production quality 4, H3 1 and open/closed Pages 1 each; failed/flaky/skipped/retry were zero. The tested merge was `9e9969ff7a7e284523a8ab0cc5612edffeeb37c6`. A previous environment could not launch Chromium because of a process-singleton socket error; a separate permitted environment and CI completed the browser checks. These results are Linux automation, not physical iPhone Safari.

Additional checks cover 320×568 and 667×375, default 16px inputs, enlarged text, 44px controls, center hit testing, no horizontal overflow and explicit settings save. A downloaded .casproj is imported in a fresh browser context, then its restored target/profile/scale/padding are checked in the actual re-exported ZIP. The six control cases passed in both browsers. Export labels show display names with selection numbers, while IDs remain the storage/output keys. Production reports have a separate folder so they cannot overwrite Chromium evidence. Engine cases preserve ZIPs, a two-asset .casproj and JSON results with browser version and output hashes.

The [durable baseline](evidence/r05-runtime-baseline-2026-10-02.json) preserves CI #952's WebKit hashes and gameplay/time results with its narrower verification scope. [Three-scale field fixtures](R05_FIELD_CHECK.md) contain actual UI-generated .casproj/ZIP files and expected results for the consolidated physical check. Their generation checks passed in Chromium after regeneration from the final RAF clock. A regression compares all three checked-in ZIPs with the current shipped examples and runtime modules, preventing old samples from being handed to the physical check. They do not establish physical Safari compatibility.

Still required: D3 adoption, final-head aggregate checks and independent review for the additional changes, the final-candidate performance results and physical memory coverage, one consolidated physical iPhone check, human merge and matching deployed-revision verification. Existing PR #288 supplies the merged R05/R06 baseline; D3 must not replace or discard its quality fixes.
