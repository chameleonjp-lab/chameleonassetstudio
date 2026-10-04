# Native object interaction evaluation (G03b / B04)

This separate entry evaluates native object picking, selection and transactional translate/rotate/scale. It is not connected to the product UI and is not a G03c adoption or a B04 completion record. See [the implementation plan](../../docs/THREE_D_IMPLEMENTATION_PLAN_2026-10-03.md) and [evaluation evidence](../../docs/evidence/3d/G03_NATIVE_INTERACTION_EVALUATION.md).

## Inputs and boundary

- Only the self-authored native box fixture and an empty group. No import UI, GLB, loaders, external assets, network textures, decoder, rig, animation or external API.
- Existing native 0.1.0 schema and `ProjectHistory` are reused without changes. `src/`, schemas, dependencies, product entries and storage are unchanged by this evaluation.
- `transaction.ts` owns an immutable start project, selected canonical IDs, active pivot, transform options, session generation/token, and candidate TRS values. Three objects remain in evaluation adapters. A committed command contains canonical IDs and plain numeric arrays only.
- `picking.ts` raycasts only the native graph. Coordinates use the actual canvas CSS rectangle, including offsets and CSS scaling; backing-store pixel dimensions and device pixel ratio do not enter selection math. Hidden branches and unknown IDs are excluded. Empty groups can be selected through the list.
- `controller.ts` owns a separate disposable proxy and TransformControls helper. Preview updates native graph objects directly, without calling the product `setProject` path or replacing canonical data.

## Transaction semantics

Each operation captures its start revision, options and targets. Pointer and numeric paths share `snapDelta` and `evaluateDelta`. Translation uses metres, rotation uses XYZ Euler radians, and scale uses factors. Snap is measured from the captured start delta; scale snap is measured from factor 1. The addon snap properties remain null, preventing a second absolute-coordinate quantization.

One changed, valid commit calls `ProjectHistory.execute` once. Cancel, no-op and rejected commits add no entry. An invalid update clears the candidate before evaluation, so a release after an invalid final sample cannot commit an older valid preview. Stale token identity/revision, read-only mode, locked targets/ancestors/affected descendants, ambiguous parent/descendant selection, singular/non-finite transforms, shear and history-budget failures preserve canonical data. A valid later sample may recover an invalid session; it is the latest sample that can commit.

Multiple selected roots transform coherently about the active selected object's world origin. Local axes use the active object's representable world rotation. A sheared starting world basis is rejected for local operations. For world scale the unit-scale proxy has identity rotation: this supplies world-oriented axes despite stock TransformControls always orienting scale locally. Every resulting local matrix must round-trip through TRS without shear. A proxy does not make an unrepresentable transform valid. Uniform negative/reflected TRS can be represented; zero and near-zero scales are rejected.

Pointer rotation is restricted to X/Y/Z rings. The pinned source's raw `rotationAngle` is used, avoiding Euler branch changes beyond 90 degrees and preserving snap semantics beyond a full turn. Free screen/trackball rotation is excluded. Numeric input supports all three XYZ components in one operation.

Cancellation invalidates the token before addon `reset`, `pointerUp` or detach. This suppresses reset's `objectChange` and any late `mouseUp`. Escape, explicit Cancel, pointercancel, lost capture, another pointer, selection/mode/space/snap/read-only/lock changes, camera projection changes, project replacement, hidden, freeze, pagehide, context loss, composition start and disposal all cancel. A cancelled old gesture cannot commit after a new operation begins. DOM pointer listeners are owned here; stock TransformControls DOM listeners are disconnected.

Gizmo input is consumed before OrbitControls sees pointerdown, and OrbitControls is disabled while the gizmo owns capture. Ordinary camera drags remain available elsewhere. PNG capture is blocked during preview. Save and suspend snapshots cancel preview first and return only canonical data. Save in this page is an in-memory snapshot/acknowledgement, not persistence or backup. Suspend here is an input/render pause, not a claim of product GPU suspension.

## Lifecycle and diagnostics

The page renders on demand. Hidden/freeze/pagehide/suspend/context-loss states cancel scheduled frames. Disposal cancels the operation, releases pointer capture, removes listeners and the resize observer, disposes helper/native geometry and materials, disposes controls and renderer, and removes the canvas. Helper geometry/material diagnostics are decremented by actual dispose events. Counters describe owned resources; they are not a browser heap or GPU-driver memory measurement.

Node tests instantiate the real pinned TransformControls without launching a browser or WebGL. They exercise raycasting, actual pointer math, transaction boundaries, cancellation, resource disposal, and repeat mount/dispose ownership. E2E tests use real browser mouse events and keyboard/numeric UI; lifecycle events such as freeze and pagehide are simulated. Browser automation does not establish physical touch-device acceptance.

## Run and verify

```sh
npx vitest run tools/3d-edit-evaluation
npx eslint tools/3d-edit-evaluation e2e/native-transform-evaluation.spec.ts
npx prettier --check tools/3d-edit-evaluation e2e/native-transform-evaluation.spec.ts
npx tsc --noEmit
npx vite build --config tools/3d-edit-evaluation/vite.config.ts
```

The standalone output is `dist-3d-edit-evaluation/`, separate from product bundles. The development URL served by the existing Vite server is `/tools/3d-edit-evaluation/index.html`.

Browser command for the existing CI environment:

```sh
npx playwright test e2e/native-transform-evaluation.spec.ts --project=chromium
```

The browser suite is selected for both Chromium and WebKit by the CI configuration. No browser result is claimed by the source alone. Browser images, browser resource behavior, touch capture ordering and physical-device quality remain pending until those executions provide evidence. PNG evidence is written to unique `native-transform-*.png` test output paths and attached by path for separate image-artifact collection.

## Pinned source and license

- `three` 0.186.1 and `@types/three` 0.186.0, already installed; no dependency changes.
- Three LICENSE SHA-256: `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc`
- TransformControls.js SHA-256: `151befe25bb0d68626f9a6b033625b7b0cf6848e39ba71623b7bed8e3df565d6`
- The addon is used unmodified under the existing Three MIT license; see [the recorded dependency notices](../3d-evaluation/LICENSES.md).
- Official [TransformControls documentation](https://threejs.org/docs/pages/TransformControls.html) and [OrbitControls documentation](https://threejs.org/docs/pages/OrbitControls.html), checked alongside the pinned local source. The pinned source is authoritative for implementation-specific behavior. Its normalized pointer payload and observable `rotationAngle` require narrow adapter casts because the pinned type declarations do not describe them accurately.

This evaluation does not decide a persisted lock/selection contract, wire autosave, add picking to product panels, establish performance/mobile budgets, or cover mesh/vertex/face editing. Those remain separate work.
