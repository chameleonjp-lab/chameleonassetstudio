# Product input and main-thread long-task evidence — 2026-10-11

## Scope and method

- **Source:** commit `9553615417f624959582880b3fa7dfbcbbb3995a`; both records report `dirty: false`.
- **Product flow:** the same manual `/3d/` numeric-edit rehearsal described in [`PRODUCT_INPUT_PERFORMANCE_2026-10-11.md`](PRODUCT_INPUT_PERFORMANCE_2026-10-11.md). It applies 100 alternating X-axis translations while sampling a foreground window of approximately 60 seconds.
- **Input boundary:** capture-phase click on **数値変形を適用** to completion of the next `requestAnimationFrame` callback containing a WebGL draw from `.native-viewport-host`.
- **Long-task boundary:** actual browser `PerformanceObserver` `longtask` entries during that same measurement window. The observer is installed only if the engine reports and accepts the entry type. Unavailable support is recorded as `unsupported`, not as zero events.
- **Environment:** headless Linux desktop, 1280×720 CSS viewport. Chromium `151.0.7922.34` at DPR 1; WebKit `26.5` at DPR 2. One full run per browser; both Playwright projects passed (1/1).

## Results

| Engine | Input median | Input p95 | Input max | Long-task observer | Long-task samples | Long-task median / p95 / max |
|---|---:|---:|---:|---|---:|---|
| Chromium | 154.4 ms | 184.3 ms | 210.3 ms | Measured; freeze none observed | 310 | 116 ms / 150 ms / 208 ms |
| WebKit | 84 ms | Not reported: `freeze-not-excluded` | 151 ms | Unsupported: `observer-unavailable` | 0 | Not available |

For Chromium, all 100 input intervals overlap at least one long-task interval; overlap counts range from 1 to 2 (median 2). This is a temporal association in the same page and window, **not causal attribution** to a particular component or proof that long tasks alone explain input latency. Use it to prioritize profiling, not to claim a measured improvement or a product budget failure. WebKit's input measurement remains available while its long-task observer is explicitly unsupported.

The input values in this observer-enabled run are not a before/after comparison with the input-only run at commit `afd50ca`: the source and instrumentation differ. Chromium's p95 changed from 194.2 ms to 184.3 ms, but that difference is not evidence of a performance improvement. B09 still has no numeric input threshold or final performance tiers.

## Limits and remaining metrics

This is one headless Linux diagnostic run per engine. The input boundary is browser-event-to-WebGL-draw, not hardware input-to-photon, physical display presentation, or a physical device acceptance test. The overlap calculation cannot identify causality. No performance pass/fail threshold is asserted.

Animation-frame, import-first-draw, cancel, and autosave-window remain `not-measured`. WebKit long-task is `unsupported`. B09 performance tiers, input/accessibility acceptance, physical-device coverage, and release sign-off remain open.

## Reproduction

Run `npm run test:product-performance` from the repository root. Defaults are 100 product edits over 60 seconds per Chromium and WebKit. The raw record and final product-page screenshot are written under the ignored `test-results/product-performance-rehearsal/` directory. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when a system Chromium binary is required. This rehearsal remains manual-only and is not part of routine CI.

## Artifacts

| Engine | Raw record | Final product-page screenshot |
|---|---|---|
| Chromium | [JSON](PRODUCT_INPUT_LONG_TASK_2026-10-11_chromium.json) | [PNG](PRODUCT_INPUT_LONG_TASK_2026-10-11_chromium.png) |
| WebKit | [JSON](PRODUCT_INPUT_LONG_TASK_2026-10-11_webkit.json) | [PNG](PRODUCT_INPUT_LONG_TASK_2026-10-11_webkit.png) |

SHA-256 checksums:

- Chromium JSON: `af4925b2b546e12f7a07ce14d3b54f60bb27e2fb093fe15c02f34f913b229823`
- Chromium screenshot: `49c890fc2d6be9a2f20dc35a0b350c214e861e96d38fd3132faa272a03cccc9a`
- WebKit JSON: `d0dd7695c0710fa9079d99353b224863abd7c47e93ec1a0bc7ab588ff8125f98`
- WebKit screenshot: `4754708a17c6cf447fc81ac788281453e438a1ade563a7163d4135dfe8ba2595`
