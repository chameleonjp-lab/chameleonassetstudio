# LIFE-10: WebGL failure leaves binary rescue available

- **Date:** 2026-10-13
- **Source/test commit:** `f454cb7` (`test: cover rescue without WebGL contexts`)
- **Acceptance status:** Partial; the product-browser path is exercised with deterministic WebGL context fault injection, not a physical no-GPU device or operating-system failure.

## Product-browser fault and acceptance flow

The shell and child-editor failure boundaries already retained project data, but the acceptance ledger still called for product-browser evidence that an unavailable WebGL renderer would not strand the user away from navigation and binary rescue. The new [LIFE-10 product E2E](../../../e2e/native-recovery-product.spec.ts) changes no production source: before app scripts run, it wraps `HTMLCanvasElement.getContext`, returns `null` for `webgl2`, `webgl`, and `experimental-webgl`, and counts those blocked requests. It restores a fixture, explicitly opens 3D display to trigger renderer creation, and asserts that at least one request was actually blocked.

| Invariant | Product-browser evidence |
| --- | --- |
| WebGL failure is surfaced | The 3D region shows the existing WebGL2-unavailable alert after a real canvas context request is blocked. |
| Recovery remains reachable | The top link, saved-project list, and saved-project backup control remain visible in the same editor page. |
| Current and persisted project bytes remain recoverable | Both “現在の内容をバックアップ” and “保存済みの版をバックアップ” downloads parse to the fixture's exact blob map and expected skin/clip counts. |
| Failure does not immediately navigate away | After the downloads, the main-frame navigation count remains at its initial value of one through a further 1.5-second observation, and the unavailable alert remains present. |

The LIFE-10 case passed three times each in Chromium and Playwright WebKit (`webkit-critical`), **6/6**. The complete [native recovery product suite](../../../e2e/native-recovery-product.spec.ts) passed in both browsers, **10/10** (five cases per browser), including the existing child-renderer failure with independent-context restore, source-backed backup under an injected total-write-quota failure, storage reconnect, and aborted snapshot retry cases.

## Local verification

- Full Vitest suite — **186 files, 3,553/3,553 tests passed**.
- `npm run lint` — **0 errors**; one existing `react-hooks/exhaustive-deps` warning at `src/features/editor3d/NativeViewportPanel.tsx:205`, outside this test-only change.
- `npm run format:check` — passed.
- `npm run build` — TypeScript check, app build, and H3 build passed. The existing Vite large-chunk advisory remains.
- `npm run test:ci-scope` — **8/8 passed**.
- Remote CI was not monitored.

## Remaining boundary

This E2E simulates context-creation failure by intercepting the canvas API. It does not validate a physical device with no usable GPU, browser/OS GPU-driver reset or policy-level WebGL disablement, real profile quota or eviction behavior, process discard, or assistive technology. The no-navigation observation is finite (1.5 seconds); it is not a guarantee against every delayed reload or crash. Keep LIFE-10 **partial** until final-browser and device/OS interruption evidence is available.
