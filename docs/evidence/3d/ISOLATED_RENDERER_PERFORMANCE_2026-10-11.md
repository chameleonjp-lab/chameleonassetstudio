# Isolated renderer performance evidence — 2026-10-11

## Scope and method

- **Source:** commit `64cb319bb46a0526f282193dca7f292d08baee96`; both records report a clean source tree (`dirty: false`).
- **Fixture:** `F01`, SHA-256 `7a0b4fe323ddf2c56fd823da0a98429783facc36bc6f854c71ad38865ce04b62`.
- **Route:** the isolated native viewport evaluation page, explicitly marked as development-only and not loaded from the product entry.
- **Metric boundary:** `setProject` numeric commit to an actual `framesRendered` counter increment. The record labels this metric `input`, but it is **not product input-dispatch latency**.
- **Sampling:** 100 numeric commits in a foreground window of at least 60 seconds; warm cache. Each Playwright test passed (1/1) in its browser project.
- **Environment limits:** headless desktop; OS family and browser version are unknown; device model is unrecorded. Chromium viewport is 1280×720 at DPR 1; WebKit is 1280×720 at DPR 2. These are not physical-device measurements and are not a cross-browser performance ranking.

## Results

| Engine | Window | Numeric commits | Median | p95 | Maximum | Long-task observation |
|---|---:|---:|---:|---:|---:|---|
| Chromium | 60,001.7 ms | 100 | 77.1 ms | 111.4 ms | 140.4 ms | 100 samples; median 75 ms, p95 109 ms, max 138 ms |
| WebKit | 60,012 ms | 100 | 41 ms | Not reported: freeze state unknown (`freeze-not-excluded`) | 67 ms | Unsupported: observer unavailable |

The Chromium record reports `freeze: none-observed`, so its p95 is available under the collector's rules. WebKit reports `freeze: unknown`; its p95 is intentionally null rather than inferred from the 100 samples. The unavailable WebKit long-task observer is recorded as `unsupported`, not as zero.

## Acceptance boundary

These records verify only the bounded **isolated-renderer** measurement path. They do not establish product input latency, a device-tier budget, acceptable frame rate, mobile readiness, physical acceptance, or release readiness. Animation-frame, import-first-draw, cancellation, and autosave-window metrics remain explicitly `not-measured`. Full product-path timing, physical-device and assistive-technology checks, and release sign-off remain open.

## Artifacts

| Engine | Raw record | Final evaluation-page screenshot |
|---|---|---|
| Chromium | [JSON](ISOLATED_RENDERER_PERFORMANCE_2026-10-11_chromium.json) | [PNG](ISOLATED_RENDERER_PERFORMANCE_2026-10-11_chromium.png) |
| WebKit | [JSON](ISOLATED_RENDERER_PERFORMANCE_2026-10-11_webkit.json) | [PNG](ISOLATED_RENDERER_PERFORMANCE_2026-10-11_webkit.png) |

SHA-256 checksums:

- Chromium JSON: `ca4ea15b5aa767e2857d8bb5485730a8c4838c3a1e3925cb1638ceebf0305ff6`
- Chromium screenshot: `34ce84108f92a06c9b1ef34c8474c129e3e9397609391d049e8d0ca0b8cae17b`
- WebKit JSON: `6df175551c8ae455fe35fd6036035dc8b9d1554130d6684d8ba37b7cedfaff5e`
- WebKit screenshot: `77ec8535c6cd79a3251bda4a6742fe88610dea4c434f9ec8a343be295fd5350b`
