# B06 native animation candidate

## Scope and base

Approved 28 paths: eleven new and seventeen existing. Based on PR315 submitted head `765eea7305065fb3115d103a89b4d4d46f3e37a8`; main `c79de07677c27d983bc9dad24b053ffadfe40a94` had the identical tree at implementation start. Existing files were preserved with hashes before writing. No schema/version/storage/DB, 2D, dependency or workflow changes. Draft PR only; no merge/deployment.

## Authoring contract

Existing 0.2.0 `Clip3D` stores seconds, duration, loop and node/TRS tracks. Commands create/duplicate/rename/delete clips; add/move/value-edit/duplicate/delete keys; explicitly set track STEP/LINEAR. Duplicate times, unknown targets, malformed values and duration changes that discard keys reject atomically. History remains owned by ProjectSession; current pose/TRS drafts are copied before an authoring boundary cancels preview. Locks cover protected descendants and joints that affect locked skin instances.

Numeric controls provide a key list, bounded timeline zoom and range, start/end/time jumps, play/pause and explicit rest reset. Up to 200 visible markers are accompanied by a fully paginated key list. IME composition suppresses apply. Auto-key is explicitly off: no implicit recording or scrub history.

## Sampling and lifetime

Each clip samples from canonical rest, never the last clip's pose. Sparse channels clamp to first/last keys; empty tracks preserve rest. STEP holds the preceding key; LINEAR interpolates vectors and normalized shortest-arc quaternions. Looping applies only to playback, while scrub can inspect the exact final endpoint. Zero duration is static. Large time jumps are bounded; positive modular time does not add huge durations and lose subsecond precision.

A separate session-owned animation controller permits read-only playback while maintaining authoring locks. Canonical boundaries invalidate preview and capture leases. PNG uses canonical rest with outer/inner guards. Native evaluation is lazy: an unsupported skin cannot prevent session open, backup or close. Renderer availability controls playback independently of ordinary numeric editing.

The Three adapter owns a single RAF chain and applies a shared same-revision transform overlay without rebuilding geometry per frame. Animation and manual pose/transform gestures are mutually exclusive. Background/freeze stops playback and discards its timestamp basis; return does not automatically catch up. Context loss/suspension/failed construction/disposal make playback unavailable until the display is restored.

## Numerical safety and performance

Manual rig preview retains its prior bound-joint/edit-lock rules. Animation uses a separate display-only validator with revision-owned immutable sources. Each shader stage receives an absolute magnitude bound with conservative slack. Only values below a 1e30 ceiling take the fast path; anything close to Float32 limits falls back to the original ordered per-vertex/normal checks, including padded zero-weight slots. Sampling source AABB corners alone was rejected during review because multistage Float32 rounding can overflow at an interior vertex.

The independent review reproduced the interior-vertex overflow; the implementation includes a regression. Prepared evaluation avoids revalidating/cloning the entire canonical project at every frame. Synthetic timing is diagnostic, not physical-device or B09 release evidence.

## Acceptance evidence to collect

Unit coverage includes clip/key operations, locked skin dependencies, invalid atomic candidates, endpoints/midpoints/STEP, quaternion signs, empty/single tracks, clip switch rest, huge/zero duration, immutable prepared revisions, capture races/readonly, background clock reset, one RAF/resource disposal, unsupported-source rescue, backup restoration and Undo branching.

Product browser coverage creates actual object and bone keys, scrubs/replays, duplicates/deletes clips, uses STEP, downloads canonical PNG/backup, restores into an independent context and edits keys again. Phone checks cover numeric/keyboard/IME, duplicate-time rejection, timeline zoom and explicit GPU/background restart. Dedicated panel coverage exercises binding replacement and delayed capture. Chromium/WebKit and production quality explicitly include the new spec.

Local validation on 2026-10-10 JST passed lint, format, application/H3 build, CI-scope classification, and 1,931 unit tests across 140 files. Browser discovery collected 36 cases across the animation/product-panel specs and Chromium/WebKit projects. Independent read-only review found no remaining static blocker.

Submitted head, CI execution and visual inspection are recorded separately after execution. Local browser execution was blocked before product launch; discovery is not reported as a browser pass.

## Remaining cross-gate work and recovery

This candidate targets ANIM-01–05/07 native authoring/playback and the native-save portion of AC-03. ANIM-06 GLB/reimport/sidecar/runtime acceptance remains B07/B08; physical devices and final budgets remain B09/B10. Templates/retarget SHOULD features are not silently added.

Revert the PR to restore previous UI/render behavior. Existing backup format and canonical originals remain intact; explicit key edits use Undo/Redo. No failure automatically deletes keys, converts unsupported interpolation or replaces original sources.
