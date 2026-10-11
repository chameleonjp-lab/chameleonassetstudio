# Product-path input performance evidence — 2026-10-11

## Scope and method

- **Source:** commit `afd50cab24ae4f385e4ca869f62f7fecb2bfd5f0`; both raw records report `dirty: false`.
- **Product flow:** open `/3d/`, create a native project, add a box, open numeric transform controls, and alternate the X translation between `+0.01 m` and `-0.01 m` for 100 applied edits. Y and Z remain `0`.
- **Metric boundary:** the browser capture-phase `click` on **数値変形を適用** to the completion of the next `requestAnimationFrame` callback that contains a WebGL draw by a canvas inside `.native-viewport-host`. This is a product-UI boundary, not hardware input-to-photon latency or physical display presentation time.
- **Sampling:** 100 commits across a foreground window of approximately 60 seconds per browser; project/render resources are warm. Each browser test passed (1/1). The run used the current product page, not the isolated evaluation route.
- **Environment:** headless Linux desktop, 1280×720 CSS viewport. Chromium `151.0.7922.34` ran at DPR 1; WebKit `26.5` ran at DPR 2. Models and thermal state are unrecorded. These are separate headless observations, not a cross-browser ranking or physical-device measurement.
- **Fixture identity:** both records use fixture family `F01`; the project-content SHA-256 differs by browser because each test creates a fresh project. The exact per-run hashes are retained in the raw JSON.

## Results

| Engine | Window | Samples | Median | p95 | Maximum | Visibility / freeze |
|---|---:|---:|---:|---:|---:|---|
| Chromium | 60,109.2 ms | 100 | 157.2 ms | 194.2 ms | 229.7 ms | Foreground / none observed |
| WebKit | 60,108 ms | 100 | 80.5 ms | Not reported: `freeze-not-excluded` | 147 ms | Foreground / unknown |

Chromium's p95 is reportable under the collector contract. WebKit's freeze state is unknown, so p95 is intentionally null despite having 100 samples; the raw record retains all observations. Other metrics—animation-frame, long-task, import-first-draw, cancel, and autosave-window—remain `not-measured`.

## Interpretation and limits

These values are diagnostic observations, **not a pass/fail result**. The B09 candidate does not define a numeric product-input latency threshold or final performance tiers. Do not infer that B09, release acceptance, mobile readiness, input/accessibility acceptance, or any physical-device gate is complete.

The measured interval starts at a browser event listener, so it excludes hardware event delivery and ends when JavaScript finishes the next animation-frame callback containing a WebGL draw; it does not confirm that pixels were presented by a physical display. Headless scheduling, viewport scale, DPR, browser engine, host load, and thermal conditions limit comparison. The measured numbers are not used as a cross-browser performance ranking.

## Reproduction

Run `npm run test:product-performance` from the repository root. It defaults to 100 samples over 60 seconds in both Chromium and WebKit and writes raw JSON plus final product-page screenshots under the ignored `test-results/product-performance-rehearsal/` directory. When the system Chromium binary is needed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path. The rehearsal is manual-only and is not added to routine CI.

## Artifacts

| Engine | Raw record | Final product-page screenshot |
|---|---|---|
| Chromium | [JSON](PRODUCT_INPUT_PERFORMANCE_2026-10-11_chromium.json) | [PNG](PRODUCT_INPUT_PERFORMANCE_2026-10-11_chromium.png) |
| WebKit | [JSON](PRODUCT_INPUT_PERFORMANCE_2026-10-11_webkit.json) | [PNG](PRODUCT_INPUT_PERFORMANCE_2026-10-11_webkit.png) |

SHA-256 checksums:

- Chromium JSON: `49842b0737b52e114db2cd58f52547fecaedcad197603238b2a121033bd0c116`
- Chromium screenshot: `d1ca3752bdffe9ed04fc4c2598ff13f939fb83dbe08d35673b7ee99d5c6534fd`
- WebKit JSON: `6b09b5ace9a930127244ed3010e1eeefd8075478048e86d440a3a8aee6a36573`
- WebKit screenshot: `6e71bca031c0207ba4d459dc74e4a50797b0fe71ba1ab57e3cb2e97ec93763a9`

## Execution-mode clarification — 2026-10-11

The run at commit `afd50ca` inherited `npm run dev` from the general Playwright configuration. It is development-server diagnostic evidence only, **not** a production-build performance result. See [`PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11.md`](PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11.md) for the later clean production-preview run.
