# IMP-08 import cancellation and reselection race — 2026-10-12

## Scope

This software-only slice adds regression evidence for the existing import cancellation boundary; it does not change production behavior, project schema, storage, or export behavior. The product path is checked for cancellation during an in-flight import, preservation of the current canonical project, explicit reselection, and adoption of only the replacement GLB after review.

A separate client unit test saves the worker message callback, cancels the job, then directly delivers a queued result through that callback. It verifies the settled job ignores the result, terminates once, and returns its memory reservation to the pre-job baseline. This is a synthetic late-message probe, not a claim about browser scheduler ordering.

## Local verification

- `npx vitest run src/adapters3d/gltf/assetIoClient.test.ts`: 1 file / 6 tests passed.
- Focused `native-asset-io-product.spec.ts` case: Chromium 1/1 and WebKit-critical 1/1 passed.
- Product browser case holds the asset worker script request, cancels the active import, and verifies no unsaved review or imported project was published and the downloaded canonical project remains unchanged. It then selects a different GLB, checks the candidate SHA-256, saves only that reviewed copy, and verifies the changed node plus exact retained GLB bytes; the canceled source hash is absent.
- `npm test`: 185 files / 3,534 tests passed.
- `npm run format:check`: passed.
- `npm run lint`: zero errors; the existing `NativeViewportPanel.tsx:205` React Hook warning remains.
- `npm run build`: app and H3 builds passed; the existing >500 kB chunk advisory remains.
- `npx tsc --noEmit` and `git diff --check`: passed.

The associated Draft PR description records the exact tested head and tree.

## Limits

IMP-08 remains `implemented-candidate / partial`. These checks cover one injected worker-start/cancel boundary and one replacement-file retry in headless Chromium and WebKit-critical. They do not exhaust every Worker event-loop interleaving, switching to a different `ProjectSession` while an import is running, real OS/process suspension or discard, physical devices, GPU behavior, or a deployed/production runtime. CI was not monitored.
