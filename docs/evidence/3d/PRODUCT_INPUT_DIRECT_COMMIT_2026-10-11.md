# Product input performance — direct numeric commit — 2026-10-11

## Change under test

Commit `42ae13efb240e8561cdc19d75fd3ddf40596f8dc` adds `NativeEditBinding.applyDelta`. The numeric-transform Apply action now validates the proposed delta and commits it directly, without first publishing an intermediate preview overlay and then publishing the committed project. Existing transaction validation and stale/invalid-token handling remain covered by unit tests. The intent is to remove one intermediate state publication; this report measures the whole product interaction and does not isolate the contribution of that code path.

## Method

- **Source identity:** both raw records report commit `42ae13efb240e8561cdc19d75fd3ddf40596f8dc`, `dirty: false`, and `executionMode: vite-production-preview`.
- **Application path:** open `/3d/`, create a native project, add a box, then apply 100 alternating X translations (`+0.01 m` / `-0.01 m`). Input latency is measured from the capture-phase click on **数値変形を適用** through completion of the next `requestAnimationFrame` callback containing a WebGL draw from `.native-viewport-host`.
- **Long-task boundary:** browser `PerformanceObserver` long-task entries from the same approximately 60-second foreground measurement window. Unsupported observation remains explicitly `unsupported`.
- **Server mode:** the dedicated manual Playwright config runs `npm run build:app` and `vite preview` with `reuseExistingServer: false`; the run cannot silently reuse the development server.
- **Environment:** headless Linux desktop, 1280×720 CSS viewport; Chromium `151.0.7922.34` at DPR 1 and WebKit `26.5` at DPR 2. One 100-sample, 60-second run per engine for this commit.

## Results and comparison

The comparison column is the earlier single production-preview run at commit `4a41b16e4dbe027f721ef81e064cf2f9ab5bf9c3`, recorded in [`PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11.md`](PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11.md). That run and this run were not paired; their per-run fixture SHA-256 values differ.

| Engine | Input latency, baseline → direct commit (median / p95 / max) | Main-thread long tasks, baseline → direct commit (n; median / p95 / max) |
|---|---|---|
| Chromium | 61.45 / 89.6 / 106.4 ms → 57.75 / 71.4 / 88.2 ms | 101; 125 / 174 / 264 ms → 100; 117 / 137 / 167 ms |
| WebKit | 61 / not reported (`freeze-not-excluded`) / 108 ms → 51 / not reported (`freeze-not-excluded`) / 71 ms | Unsupported (`observer-unavailable`) in both runs |

All 100 Chromium input intervals in the direct-commit run overlap exactly one observed long-task interval. This is temporal overlap only: the observer does not identify a responsible call stack and this does not prove causal attribution to a particular component. Long tasks therefore remain present in the interaction window despite the lower values in this individual run.

The measurements are single, independent headless runs, not a randomized or paired benchmark. The baseline and follow-up fixture hashes differ, so the results are suggestive diagnostics—not proof that `applyDelta` caused the observed reductions, a performance-budget pass, or a cross-browser ranking. The product UI input boundary is measured, but no numeric B09 threshold is defined.

## Verification

The code change passed the repository formatting check, TypeScript check, ESLint, CI-scope classification, and full Vitest suite. The selected native-editing product E2E suite passed in Chromium and configured WebKit-critical mode; the dedicated production-preview measurement passed in both engines (2/2). These are local headless software checks, not CI/release sign-off.

## Limits and remaining gates

This is a local production build preview, not a deployed service or physical input-to-photon measurement. `physicalAcceptance` is `false` in both raw records. WebKit p95 is withheld because freeze state is unknown, and its long-task observer is unsupported. Animation-frame playback, import-first-draw, cancel, and autosave-window remain `not-measured`; physical-device, accessibility, performance-tier, rollback/device-lifecycle, and release gates remain open. The Vite build also emits its existing non-blocking advisory that some minified chunks exceed 500 kB; this change does not alter chunking or declare that advisory a release failure.

## Reproduction

From the repository root, run:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:product-performance
```

The manual runner defaults to 100 samples over 60 seconds per Chromium and WebKit and writes the raw JSON and final product-page screenshot under ignored `test-results/product-performance-rehearsal/`. The run used no optional CPU profile.

## Artifacts

| Engine | Raw record | Final product-page screenshot | Fixture SHA-256 |
|---|---|---|---|
| Chromium | [JSON](PRODUCT_INPUT_DIRECT_COMMIT_2026-10-11_chromium.json) | [PNG](PRODUCT_INPUT_DIRECT_COMMIT_2026-10-11_chromium.png) | `f50d4b324b612479be570eab16bf4a2263acb174bbe878d838c47f2eb74d70f1` |
| WebKit | [JSON](PRODUCT_INPUT_DIRECT_COMMIT_2026-10-11_webkit.json) | [PNG](PRODUCT_INPUT_DIRECT_COMMIT_2026-10-11_webkit.png) | `4a2fa84f4f78a560f9ab15ebe8840588be7fdee33f68a9ff01a033664992a430` |

Artifact SHA-256:

- Chromium JSON: `528b92d3855780b0a4eb1bb1a6c0b73042f440d5995d72205eb97e72ed4d29a9`
- Chromium screenshot: `d50e75828b8156d6a44b3acb1d8b654ed2f6ed7ea24abbdd5e4702b27c105fb5`
- WebKit JSON: `b64d4388884b68ad51cf5edceab08d02dae59816262ee8d4a6d75e5390cf0b79`
- WebKit screenshot: `bef62b278b486cbb93f9e930684b5676007b8146d0dacba18733d517e04b85e5`
