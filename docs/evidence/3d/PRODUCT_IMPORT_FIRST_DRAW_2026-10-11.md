# Product backup import to first WebGL draw — 2026-10-11

## Measurement method

- **Product flow:** create a 3D project and box in the product UI, export a `.cas3dproj` backup, then select those exact backup bytes through **.cas3dproj を選んでコピー復元**. After the success notice, activate **3D表示を開く** and wait for the new viewport to render.
- **Measured boundary:** capture-phase `change` event on `#editor3d-restore` through the restore notice and **3D表示を開く** action, ending when the first successful WebGL draw call returns from a canvas in the new `.native-viewport-host`. The canvas node must differ from the pre-import canvas.
- **Observation:** five restore runs per browser, reusing that browser run's exact backup archive. The page and viewport are already loaded; the record declares `cacheState: warm`. The browser-specific seed archives differ, so this is not a paired cross-engine benchmark.
- **Metric contract:** `import-first-draw` reports median and maximum only; the format deliberately withholds p95 for this metric. Both runs meet `initialRunCoverage: at-least-five-runs`.
- **Execution:** dedicated manual Playwright config builds the application and serves `vite preview` with `reuseExistingServer: false`. It is not part of routine CI.
- **Source:** commit `6bd00766aaa1bfed02f97f35f4f632885b5066a0`, `dirty: false` for both browser records.
- **Environment:** headless Linux desktop, 1280×720 CSS viewport; Chromium `151.0.7922.34` at DPR 1 and WebKit `26.5` at DPR 2.

## Results

| Engine | Runs | Median | Maximum | p95 | Window | Visibility / freeze |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| Chromium | 5 | 266.3 ms | 277.3 ms | Not reported (`first-draw-median-max-only`) | 1,932.3 ms | Foreground / none observed |
| WebKit | 5 | 361 ms | 461 ms | Not reported (`first-draw-median-max-only`) | 2,387 ms | Foreground / unknown |

These are small repeated-run summaries, not a threshold pass/fail or cross-browser ranking. The WebKit freeze state remains unknown; no p95 is inferred for either engine.

## Interpretation and limits

- The endpoint is the return from the first WebGL draw call. It does **not** measure GPU completion, compositor presentation, scan-out, displayed-frame latency, file-picker time, or physical-device behavior.
- The flow includes the product's explicit **3D表示を開く** action after copy restoration. It does not claim that restore automatically mounts the viewport.
- The measurement is local headless product-UI evidence only. `physicalAcceptance` is `false`; no numeric B09 import-latency threshold is defined, and the result is not release acceptance.
- Only `import-first-draw` is measured in these raw records. Other metrics remain `not-measured` rather than being represented as zero.

## Verification

The manual E2E passed in Chromium and WebKit (2/2), with five restore samples in each engine. A one-sample smoke also passed in both browsers before the formal run. Repository checks passed: Prettier format check, TypeScript, ESLint (zero errors; the existing `NativeViewportPanel` hook warning remains), CI-scope tests, and Vitest (3,530/3,530). The production build emitted the existing non-blocking advisory about minified chunks exceeding 500 kB.

## Reproduction

From the repository root:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:product-import-first-draw
```

The runner defaults to Chromium and WebKit with five restore runs per engine. `PRODUCT_IMPORT_FIRST_DRAW_BROWSER=chromium|webkit` selects one engine; `PRODUCT_IMPORT_FIRST_DRAW_RUNS` accepts 1–20 (use at least five for initial-run coverage). Raw JSON and final screenshots are written under ignored `test-results/product-import-first-draw-rehearsal/`.

## Artifacts

| Engine | Raw record | Final product-page screenshot | Fixture SHA-256 |
| --- | --- | --- | --- |
| Chromium | [JSON](PRODUCT_IMPORT_FIRST_DRAW_2026-10-11_chromium.json) | [PNG](PRODUCT_IMPORT_FIRST_DRAW_2026-10-11_chromium.png) | `5e13bb573e17d7ad5d6b8daca601d335938a7444f95c8edd352c19644785fe7b` |
| WebKit | [JSON](PRODUCT_IMPORT_FIRST_DRAW_2026-10-11_webkit.json) | [PNG](PRODUCT_IMPORT_FIRST_DRAW_2026-10-11_webkit.png) | `13d27a6315e36c5d8759a0509e84ca736eed43425f92613e18f7a63ed39784d2` |

Artifact SHA-256:

- Chromium JSON: `3eaac27cc33273c450d8e3ba391dcc2212f459aa8fdeeb10a1e5072ed22cd7d4`
- Chromium screenshot: `e472b7007ebbca293c0efe1afb5fb433f8aae78db57fcba192be14f4479096aa`
- WebKit JSON: `ed9e088d4e30ca08abb9084c607d230508dc4ea8579902e28937ac8f09942a4b`
- WebKit screenshot: `72afd3e896d4ccd85de17322bf6fb04248c2d5aff7dcf488e0dd3e8425080570`
