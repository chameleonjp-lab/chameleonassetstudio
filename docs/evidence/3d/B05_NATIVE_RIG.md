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
