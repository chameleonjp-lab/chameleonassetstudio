# Product input performance evidence — production preview — 2026-10-11

## Scope and method

- **Source:** commit `4a41b16e4dbe027f721ef81e064cf2f9ab5bf9c3`; both raw records report `dirty: false` and `executionMode: vite-production-preview`.
- **Server mode:** the dedicated Playwright config runs `npm run build:app` followed by `vite preview` on port 5173 and sets `reuseExistingServer: false`. It cannot silently reuse the inherited Vite development server.
- **Product flow and input boundary:** open `/3d/`, create a native project, add a box, and apply 100 alternating X translations (`+0.01 m` / `-0.01 m`). Input latency is capture-phase click on **数値変形を適用** to completion of the next `requestAnimationFrame` callback containing a WebGL draw from `.native-viewport-host`.
- **Long-task boundary:** browser `PerformanceObserver` `longtask` entries from the same approximately 60-second foreground window. Unsupported observation remains explicitly `unsupported`.
- **Environment:** headless Linux desktop, 1280×720 CSS viewport. Chromium `151.0.7922.34` at DPR 1; WebKit `26.5` at DPR 2. One full run per browser; both Playwright projects passed (1/1).

## Results

| Engine | Input median | Input p95 | Input max | Long-task status | Long-task samples | Long-task median / p95 / max |
|---|---:|---:|---:|---|---:|---|
| Chromium | 61.45 ms | 89.6 ms | 106.4 ms | Measured; freeze none observed | 101 | 125 ms / 174 ms / 264 ms |
| WebKit | 61 ms | Not reported: `freeze-not-excluded` | 108 ms | Unsupported: `observer-unavailable` | 0 | Not available |

In Chromium, all 100 input intervals overlap at least one long-task interval (1–2 overlaps, median 1). The longest-overlap entry for each interval begins 21.2–51.5 ms after the click (median 25.8 ms) and extends through or beyond the next-draw observation in this trace. That is a temporal pattern consistent with work occurring in the same interaction/render window, **not causal attribution** to a particular component or proof of a performance-budget failure. The observer does not identify the responsible call stack.

## Execution-mode correction and comparison

The earlier input-only record at commit `afd50ca` and observer-enabled record at `9553615` inherited `npm run dev` from the general Playwright config. A CPU trace also showed Vite's React `jsxDEV` runtime. Those earlier records are valid **development-server diagnostics only**, not production-build performance measurements; see the runtime clarifications in [`PRODUCT_INPUT_PERFORMANCE_2026-10-11.md`](PRODUCT_INPUT_PERFORMANCE_2026-10-11.md) and [`PRODUCT_INPUT_LONG_TASK_2026-10-11.md`](PRODUCT_INPUT_LONG_TASK_2026-10-11.md).

For Chromium, the dev-server observer-enabled run reported input p95 184.3 ms and 310 long-task entries, while this production-preview run reported input p95 89.6 ms and 101 entries. These are separate single runs, not a paired benchmark or evidence of a product-code optimization; the difference demonstrates that execution mode materially affects the observed values. Production-preview long-task p95 is 174 ms, so the lower input p95 does not mean all main-thread work is short.

## Limits and remaining metrics

This is one headless Linux diagnostic run per engine against a local production build preview, not a deployed service, physical input-to-photon measurement, or physical-device acceptance test. B09 defines no numeric product-input threshold or final performance tiers. No performance pass/fail verdict is asserted. Animation-frame, import-first-draw, cancel, and autosave-window remain `not-measured`; WebKit long-task is unsupported. Physical-device, accessibility, performance-tier, and release gates remain open.

The build produced a non-blocking Vite advisory that some minified chunks exceed 500 kB. This report does not change chunking or declare that advisory a release failure.

## Reproduction

Run `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:product-performance` from the repository root when a system Chromium binary is required. Defaults are 100 samples over 60 seconds per Chromium and WebKit. The manual runner builds the app and serves that build with `vite preview`; the output raw JSON and final screenshot are written under ignored `test-results/product-performance-rehearsal/`. The optional Chromium-only `NATIVE_PRODUCT_CPU_PROFILE_PATH` captures a diagnostic CDP profile but is not enabled in this full measurement. This rehearsal remains manual-only and is not part of routine CI.

## Artifacts

| Engine | Raw record | Final product-page screenshot |
|---|---|---|
| Chromium | [JSON](PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11_chromium.json) | [PNG](PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11_chromium.png) |
| WebKit | [JSON](PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11_webkit.json) | [PNG](PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11_webkit.png) |

SHA-256 checksums:

- Chromium JSON: `cd51a4cde3fe66d3c1307c7288c963e401046da47d80075658a7d78610489e9e`
- Chromium screenshot: `174ea1af86ed4284c28b2599aae8e224d9742601c01214b6df94b47ee949c38b`
- WebKit JSON: `82bc6b53244765a4a130e3a98852f0ddc3575a596e0128594124d72ee233898f`
- WebKit screenshot: `ae89c0786a9fba635760b02bd5d79551b52fa8e48bd715881d7ae5dc8c1a17c6`
