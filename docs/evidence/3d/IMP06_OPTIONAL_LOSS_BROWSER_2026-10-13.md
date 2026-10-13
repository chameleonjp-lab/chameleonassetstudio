# IMP-06: Optional-loss approval and original-byte retention

**Date:** 2026-10-13

**Source/test commit:** `a684871` (`fix(3d): transport optional GLB loss approvals`)

**Acceptance status:** Partial; this records the product-browser path for one synthetic unsupported optional material extension, not the complete glTF extension compatibility matrix.

## Finding and correction

The product import path correctly identified source-only optional features and deliberately threw a request for explicit loss approval. However, the worker boundary replaced every exception message with a fixed failure code. The UI therefore received a generic `[IO_WORKER]` error instead of the loss names, so the intended Japanese loss list and explicit retry were unreachable. A real upload of an otherwise valid GLB with `VENDOR_optional` reproduced this gap before the fix.

The worker now recognizes only the exact loss-request prefix and parses a bounded, duplicate-free list. It sends a dedicated fixed `LOSS_APPROVAL_REQUIRED` code with the validated names as structured data; it never forwards the raw exception, path, stack, or arbitrary message. The client validates the structured list again and reconstructs the existing bounded request consumed by the UI. Invalid or oversized payloads fall back to a fixed generic error. This transport does not grant consent: the user must still review the list and check the approval control, and changing the selected file clears that approval and the prior loss report.

The protocol and shared validation live in [optionalLoss.ts](../../../src/core3d/import/optionalLoss.ts), [assetIoWorkerFailure.ts](../../../src/adapters3d/gltf/assetIoWorkerFailure.ts), [assetIo.worker.ts](../../../src/adapters3d/gltf/assetIo.worker.ts), and [assetIoClient.ts](../../../src/adapters3d/gltf/assetIoClient.ts). Regression coverage includes [worker classifier tests](../../../src/adapters3d/gltf/assetIoWorkerFailure.test.ts), [client protocol tests](../../../src/adapters3d/gltf/assetIoClient.test.ts), and the [product E2E](../../../e2e/native-asset-io-product.spec.ts).

## Browser fixture and acceptance flow

The product E2E starts with a valid product-exported GLB, adds `VENDOR_optional` to `extensionsUsed` and a source-only material extension payload, and confirms that it is optional (not in `extensionsRequired`) and listed as a conversion loss. It uploads the actual bytes through the product UI.

| Invariant | Product-browser evidence |
| --- | --- |
| Loss is shown before conversion | The loss request reaches the Japanese review path; the checkbox starts unchecked and retry remains disabled until explicit approval. |
| Approval is bound to the selected bytes | Checking approval and selecting a plain GLB clears the list and resets/disables approval. Reselecting the source-only GLB requires a new inspection and a fresh unchecked approval. |
| The current project is not overwritten | Canonical backups taken before import and from the original saved project afterward have equal project data and blob maps. |
| The source remains recoverable in the new copy | The imported-copy backup contains an `original-glb` source record and the exact original GLB bytes under the displayed SHA-256. |
| Converted output is distinct and does not claim to preserve the loss | The exported model GLB has a different SHA-256 and contains neither the `VENDOR_optional` declaration nor its material extension payload. The test attaches source/output hashes and byte counts to its Playwright result. |

The target IMP-06 case passed on production Vite preview in Chromium and Playwright WebKit (`webkit-critical`), repeated three times per browser (**6/6**). The complete `native-asset-io-product.spec.ts` suite then passed in Chromium and WebKit (**48/48**).

## Local verification

- Focused worker/client/UI/preflight tests — **112/112 passed**.
- Full Vitest suite — **186 files, 3,553/3,553 tests passed**.
- `npm run lint` — **0 errors**; one existing `react-hooks/exhaustive-deps` warning at `src/features/editor3d/NativeViewportPanel.tsx:205`, outside this change.
- `npm run format:check` — passed.
- `npm run build` — TypeScript check, app build, and H3 build passed. The existing Vite large-chunk advisory remains.
- `npm run test:ci-scope` — **8/8 passed**.
- Remote CI was not monitored.

## Remaining boundary

This run covers one synthetic unknown optional extension attached to a material. It does not establish semantic rendering or round-trip compatibility for other standard/vendor extensions, independent third-party consumers, physical Safari/other browser versions, assistive technology, real devices, or a deployed environment. Keep IMP-06 **partial** until broader compatibility and environment acceptance is exercised.
