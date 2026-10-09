# B05 native rig: authoring command foundation

Status: B05a core-only implementation. This is not B05 completion, a renderer adoption, or physical-device acceptance.

## Scope and base

- Batch: B05a-native-rig-authoring-20261009
- Base: `a3bf36c5a1fcf4211c380c6fd7be6d5e66d08211` (merged PR #312 / #313)
- Added paths: `src/core3d/rig/authoring.ts`, its colocated `authoring.test.ts`, and this record
- No existing source, native schema/version, DB, 2D format, dependency, renderer, UI, or CI configuration changes
- Dependency direction: authoring → canonical model/coordinates/editability + existing authoring coordinate guard + pure rig math/profile. No React, Three, DOM, network, or rendering access

## Command contract

Call exactly one command inside `ProjectHistory.execute` (or the existing session authoring boundary). Each command validates a detached candidate and publishes nodes/skins only after all checks succeed. Commands do not increment revisions, save, or retain caller-owned mutable arrays.

- `addRigJoint`: add a plain canonical node under an explicit parent and local rest transform
- `bindSkin`: create one skin per mesh from explicit joint IDs and complete per-vertex assignments. Missing vertices, unknown references, duplicate influences and more than four influences are rejected
- `setSkinWeights`: replace only named vertices; normalize only with the explicit `normalize` option. Zero totals, negative/nonfinite values and invalid references are rejected. Scaling before summation avoids overflow from large finite input weights
- `fitRigJoint` / `reparentRigJoint`: edit a joint-only node's rest transform/hierarchy and rebind every affected skin atomically. Reparenting takes an explicit new local rest transform; it does not silently preserve world coordinates
- `rebindSkin`: explicitly regenerate inverse binds from canonical rest transforms, retaining weights

The current canonical node transforms are the rest data for these commands. Inverse binds use column-major inverse joint world matrices. Mesh vertices remain mesh-local; the future display boundary must apply each mesh instance's rest world transform exactly once. Inverse-bind zero entries are canonicalized to positive zero so JSON backup round trips preserve the authored representation.

Rest changes reject animation on descendants, old/new ancestors, and affected skin dependencies until an explicit animation-aware conversion is available. No clip is rewritten. Joint/ancestor and mesh-instance locks are checked, including every skin affected by a shared joint. Bound negative/zero scales and unsupported Float32/inverse ranges are rejected. Coincident joints are allowed when their transforms are nonsingular; positional bone length is not used as a divisor.

## Verification and evidence

Fixtures are self-authored connected box meshes with two manually mixed joint contributions. Tests cover the pure skinning oracle, complete assignment, one-command history, input copying, explicit normalization, references/cycles, locked shared dependencies, nonuniform ancestors, rebind, and durable storage → backup → unrelated database → editing again.

Relevant checks: new authoring tests plus existing rig math/profile, then lint, format, type/build, CI classification and the full unit suite. No previous baseline success is substituted for this candidate's checks. Final results and candidate SHA are recorded on the Draft PR; subsequent failures must be fixed and rerun there.

### Local final-source checks (2026-10-09)

- Environment: Linux cloud workspace, Node 24.19.0, npm 11.9.0; CI uses its existing Node 22 configuration
- Dependency lock SHA-256: `458c970b5e68ded9cff6a380df0c6d4fc4a631b01084549b495f6a9a1c13d545`
- Source SHA-256: authoring `348be351b37221722f411a3421b516b9aad6fcea3d9bcfdd970e5726e84acac6`; tests `7db9afd2bf151de7ae738fa2c2be8d362ee76c5d75132c9330045ae15db1661e`
- Focused rig: 67/67 passed (29 new authoring, 23 math, 15 profile)
- `npm run lint`, `npm run format:check`, `npm run build` (app and H3), `npm run test:ci-scope` (7/7): passed. Existing >500 kB bundle warning remains
- `npm run test`: 1,853/1,853 passed across 134 files, started 2026-10-09 10:37:57 UTC, duration 18.37 seconds
- Local browser suite: blocked before browser execution. Official Playwright install returned a truncated/non-ZIP Chrome archive (`End of central directory record signature not found`). No alternate download route or test weakening was used. GitHub CI browser results are reported separately for the submitted SHA
- Independent read-only review found an animated-ancestor reparenting issue; old/new ancestor and affected skin animation scopes now reject atomically. Focused regressions pass. Initial JSON round-trip detection of negative zero was addressed by canonicalizing inverse-bind zero entries

These runs used the above source hashes before commit. The only later local change is this evidence paragraph; the Draft PR records the submitted commit. The frozen original baseline and final source were not altered to bypass test failures.

## Remaining B05 work

The production renderer still rejects skins and the product UI does not call these commands. This batch cannot demonstrate the on-screen smooth-skin creation flow. Manual templates/fit UI, ephemeral pose preview and its cancellation lifecycle, GPU skin attributes/palettes, multiple mesh/skin display, phone/IME interaction, screenshot inspection, and browser/device acceptance remain. Bind/rebind tests are not GPU or consumer/export evidence.

B06 animation, B07 GLB/sidecar, B08 independent consumer, B09 resource/device budgets, and B10 final acceptance remain separate unfinished work.

## Compatibility and recovery

Existing 0.2.0 `nodes` / `skins` fields are reused without adding persisted fields. No migration or automatic rewrite occurs. Unsupported existing projects are not altered; a failed command leaves the entire input unchanged. History retains the previous bind/rest state, including inverse binds and weights. Reverting this addition removes the unused commands and tests while existing projects remain readable by the unchanged parser and backup code. Merge and release remain separate decisions.

## B05b product integration candidate (2026-10-09)

This section supersedes B05a's "UI/renderer not connected" status for this candidate only. The B05a record above remains historical evidence. Base is submitted PR #314 head `cc37ba300f7336135cc8a5e8dceb2ecb87849bcf`, subsequently included in main `10756e950797d354cfc9ed6708e0361a14840566`. Changes are limited to the approved 25 paths (the three B05a paths, nine additional new paths, thirteen existing paths). No schema/version/DB, dependency, 2D, or CI workflow change.

### User flow

1. Create/select an editable mesh. In "骨と重みを作る", add manual joint nodes or the self-authored seven-joint humanoid guide. The guide does not estimate weights or fit itself.
2. Read a joint's current values, set local translation/rotation/scale and apply rest. Parent changes explicitly use the entered local rest transform. Existing bound dependencies are rebound atomically; referenced joints cannot be deleted.
3. Select the target mesh, its full joint palette, and up to four joint/weight pairs per vertex. Bind explicitly assigns the given values to every vertex. The palette can contain more than four joints; explicit palette extension preserves existing binds and weights. Select individual vertices to read/change weights; normalization requires its checkbox. Unassigned/invalid input is rejected without losing the previous project.
4. Read a bound joint's values and use pose to check mixed deformation. Pose is an ephemeral overlay. "restへ戻す", selection changes, authoring, Undo/Redo, save/backup/copy/close, ownership loss, hidden/frozen display, GPU pause/context loss, and disposal invalidate or clear it.
5. Save or export a native backup. The canonical rest, inverse binds and manual weights persist; transient pose does not. Restore as a new identity and continue editing weights.

Phone controls use labelled lists and numeric drafts, 44px controls, explicit Apply, and IME suppression. Rest edits require the same project/revision/joint as the values that were read. The global active object selection remains shared with the existing authoring controls.

### Ownership and GPU contract

- `rigPosePort.ts` carries plain local TRS and epoch-bound tokens; `rigPoseTransaction.ts` owns preview/capture lifetime, observer isolation and cancellation. It cannot write history or storage.
- `pose.ts` checks detached canonical candidates, affected locks and inverse ranges. Float32 validation follows the actual fixed Three shader order, including all four zero-padded slots, intermediate homogeneous coordinates, weighted normal matrices and final world positions. A precombined matrix alone would miss overflow that later subtraction cannot repair.
- The Three adapter creates `Bone`, `Skeleton` and `SkinnedMesh`, uses stored inverse joint-world binds and each mesh instance's bind matrix, and expands stable vertex assignments across render corners. It does not normalize weights silently. Skeleton resources are disposed with their owning graph. Posed bounds are used for focus/fit and selection/inspection bounds.
- Skin assignment is unique per mesh. Multiple meshes/skins and multiple instances are supported. A node simultaneously carrying a mesh and acting as a joint is explicitly unsupported in this native display profile; raw sources remain available for backup. Clips still require B06 display integration.
- PNG clears pose and captures the canonical rest revision. Both panel and renderer hold pose capture guards, including delayed encoders and fixture providers, so intervening/binding-replaced previews cannot publish stale images.

### Verification boundary

New coverage includes connected mixed-weight deformation against the existing CPU oracle under rotated/nonuniform parents and multiple mesh instances; template/reference safety; skin-lock mutation and retarget protection; storage/backup cancellation; stale-token and selected-target invalidation; padded shader overflow; near-unit sums; posed focus/fit; and GPU-owner disposal using injected renderer boundaries.

`e2e/native-rig-product.spec.ts` covers actual UI creation/bind, pose pixels, rest-only backup, unrelated-context restore/re-edit/Undo/Redo, phone width, IME, invalid inputs and GPU pause/restart. Native panel fixture coverage adds pose binding replacement and delayed PNG guards. The rig spec is explicitly included in WebKit and production configurations without weakening existing tests or changing workflow files.

Local browser execution remains blocked: the installed Chromium was selected through the repository's existing supported environment variable, but failed before opening the product with `socket() failed: Operation not permitted`. No security flag, permission workaround or alternate browser route was used. Browser results and screenshots must come from the submitted-head CI, and screenshot inspection is reported separately. Test discovery and injected-renderer unit tests are not browser/physical-device passes.

B06 animation, B07 GLB/sidecar, B08 independent consumer, B09 physical-device/resource budgets and B10 final acceptance remain unfinished. No merge, deployment or new paid service is included in this implementation.


### B05b local candidate checks

- Final core/UI source: all 1,884 unit tests in 137 files passed (2026-10-09 11:39:36 UTC, 15.06 seconds). Lint, formatting, TypeScript/app and H3 builds, and all seven CI-scope tests passed. Existing bundle-size warning remains.
- The final palette browser regression and label wrapping were added during the full pipeline; their explicit formatting and Playwright discovery checks passed afterward. They do not change runtime TypeScript or unit-test source. Six rig browser cases are discovered across Chromium and WebKit; discovery is not execution.
- Independent read-only review verified cancellation/capture, shader-order and padded-slot safety, locked-skin retarget protection and posed bounds. The last palette regression passed 47 focused tests, including seven-joint rendering with index 6 and atomic invalid-extension rejection. No source blockers remain from that review.
- Current main and submitted B05a head have identical trees (`57dfacd5acea5f5cf7f1d29c0904e28394f08a5c`). This candidate therefore adds no duplicate B05a commit content to main. The Draft PR records the exact submitted head and separate browser-CI outcome.


### First submitted-head CI correction

CI 37925292425 passed build/unit and 26 isolated browser cases, then passed 24/25 existing WebKit product cases. The assembly phone full-page screenshot exceeded WebKit's 32,767-pixel limit after the new always-expanded rig controls increased page height. The product now exposes rig editing through an explicit disclosure and a bounded internal scrolling region. Rig product cases explicitly open that disclosure. No existing test, screenshot limit or CI workflow is weakened; the corrected head must be rerun before browser acceptance is claimed.

The layout-corrected CI 37926013716 passed all 25 existing WebKit product cases, 26 isolated browser cases and production takeover. Chromium passed 346 cases (one existing skip), while the three new rig cases stopped at their first select lookup: exact `getByLabel` includes nested option text in Playwright's label-text selector. Their select locators now use the accessible `combobox` role and exact name, matching existing product tests. Input locators and all assertions remain unchanged. This failure did not exercise the later rig browser assertions; they still require a successful rerun.
