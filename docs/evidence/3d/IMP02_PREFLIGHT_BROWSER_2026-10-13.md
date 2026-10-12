# IMP-02: GLB preflight browser evidence

**Date:** 2026-10-13  
**Source/test commit:** `3cc3144` (`fix(3d): classify structural import failures`)  
**Acceptance status:** Partial; this records browser evidence for selected structural rejection paths, not the full hostile-input matrix.

## Finding and correction

Before the fix, the real product import path rejected a GLB whose accessor began outside its `bufferView`, but the worker failure classifier sent the rejection through the generic `WORKER` code. The product UI consequently showed worker-startup guidance (`[IO_WORKER]`) for malformed model data. The existing fixed-code protocol did not need to expose parser exception text: accessor-range, non-finite-accessor, and index-range validation failures now map to the existing `FORMAT` code. The UI reports the bounded Japanese format guidance (`[IO_FORMAT]`) without showing the raw exception.

The regression is covered by [the worker classifier unit test](../../../src/adapters3d/gltf/assetIoWorkerFailure.test.ts) and [the product import E2E](../../../e2e/native-asset-io-product.spec.ts). The shared preflight remains in [preflight.ts](../../../src/core3d/import/preflight.ts); the mapping change is in [assetIoWorkerFailure.ts](../../../src/adapters3d/gltf/assetIoWorkerFailure.ts).

## Browser fixtures

The E2E builds each malformed input from a valid product-exported fixture, verifies the rejection point with `preflightGlb`, attaches this SHA-256 manifest to the Playwright result, then selects the same bytes through the actual GLB upload UI.

| Fixture | Bytes | SHA-256 | Preflight rejection |
| --- | ---: | --- | --- |
| `imp02-invalid-magic.glb` | 4,884 | `2b95d6a69e479a6bf4440894be79cf8634b4ac00e2819fc14961ae66d87e96c8` | `Invalid GLB header` |
| `imp02-invalid-chunk-length.glb` | 4,884 | `e269228415e0c428152777f845b957cc300cdabc44ddcc9ca97672e08a1d9871` | `Invalid GLB chunk range` |
| `imp02-accessor-outside-buffer-view.glb` | 4,904 | `22805bd928b73c3c2bf1ff69d00202dac29728cd83a3dc975085c5e7a934c598` | `Accessor outside bufferView` |

For each upload, the test confirms the asset I/O worker starts, the UI displays `[IO_FORMAT]` (not `[IO_WORKER]`), raw fixture/parser details are not shown, and no unsaved import preview is created. A canonical backup taken before the three attempts is compared with a backup after them; project content and blobs remain equal.

## Local verification

- Production-preview Playwright: Chromium and WebKit (`webkit-critical`), `--repeat-each=3` — **6/6 test executions passed**, zero failures/flakes; each execution covers all three fixtures.
- Focused worker/client/UI failure unit tests — **60/60 passed**.
- Full Vitest suite — **186 files, 3,551/3,551 tests passed**.
- `npm run lint` — **0 errors**; one existing `react-hooks/exhaustive-deps` warning at `src/features/editor3d/NativeViewportPanel.tsx:205`, outside this change.
- `npm run format:check` — passed.
- `npm run build` — TypeScript check, app build, and H3 build passed. The production preview also emitted the existing Vite large-chunk advisory.
- `npm run test:ci-scope` — **8/8 passed**.

## Remaining boundary

This browser run covers GLB magic, a malformed chunk length, and an accessor range rejection. Other `IMP-02` cases—buffer/index/stride variants, integer overflow, non-finite numeric values, and node-depth limits—remain covered only by their existing focused preflight tests unless a separate browser fixture is added. No fuzz campaign, physical-device run, production deployment validation, or real-device memory measurement is claimed. Keep IMP-02 **partial**.
