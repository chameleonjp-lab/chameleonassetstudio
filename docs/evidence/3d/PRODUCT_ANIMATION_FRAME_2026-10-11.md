# Product animation playback frame intervals — 2026-10-11

## Measurement method

- **Product flow:** open `/3d/`, create a project and box, create a two-key one-second clip, enable looping, and start playback through the editor's **clipを再生** action.
- **Measured boundary:** interval between completion times of consecutive `requestAnimationFrame` callbacks that each issue at least one WebGL draw call from a canvas inside `.native-viewport-host`, while the clip is playing. The renderer advances animation from the RAF timestamp, renders, and requests the next frame while playback remains active.
- **Not measured:** GPU command completion, compositor presentation, scan-out, input-to-photon latency, or physical display cadence. This is a headless JavaScript/WebGL submission-interval observation, not a displayed-frame guarantee.
- **Execution:** the dedicated manual Playwright config runs `npm run build:app` and `vite preview` with `reuseExistingServer: false`; it does not use the Vite development server and is not part of routine CI.
- **Window:** one approximately 60-second foreground loop-playback run per engine. The final screenshot is captured after playback is stopped; the raw record covers the preceding playback window.
- **Source:** commit `10ed2821ac2e60f2909b0fbf54e76c910acc2616`, `dirty: false`. Each engine generated its own fixture, so the fixture hashes differ; these are independent single runs, not a paired benchmark.
- **Environment:** headless Linux desktop, 1280×720 CSS viewport; Chromium `151.0.7922.34` at DPR 1 and WebKit `26.5` at DPR 2.

## Results

| Engine | Samples | Foreground window | Median interval | p95 interval | Maximum interval | Freeze status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Chromium | 3,597 | 60,040.4 ms | 16.7 ms | 17.1 ms | 65.9 ms | None observed |
| WebKit | 807 | 60,042 ms | 73 ms | Not reported (`freeze-not-excluded`) | 123 ms | Unknown |

The collector withholds WebKit p95 because the browser's freeze state could not be excluded. Chromium has sufficient samples and a foreground window with no observed freeze. No B09 numeric frame-interval threshold is defined, so these measurements are diagnostic and do not constitute a pass/fail verdict or a cross-browser ranking.

The difference between these headless runs should not be generalized to physical browsers or devices. The metrics describe callback/draw-call cadence in the declared environment only. `physicalAcceptance` is `false` in both raw records.

## Verification

The manual E2E passed in Chromium and WebKit (2/2). A separate 3-second smoke run also passed in both engines before the full measurement. Repository checks passed: Prettier format check, TypeScript, ESLint (zero errors; one existing `NativeViewportPanel` hook warning), CI-scope tests (8/8), and Vitest (3,530/3,530). The full run built the production app and served the preview successfully; Vite emitted its existing non-blocking advisory about minified chunks exceeding 500 kB.

## Reproduction

From the repository root:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:product-animation-frame
```

The runner defaults to both Chromium and WebKit, 60 seconds per engine. `PRODUCT_ANIMATION_FRAME_BROWSER=chromium|webkit` selects one engine; `PRODUCT_ANIMATION_FRAME_WINDOW_MS` can set a smoke window from 1,000 to 3,600,000 ms. Raw output and final screenshots are written under ignored `test-results/product-animation-frame-rehearsal/`.

## Artifacts

| Engine | Raw record | Final product-page screenshot | Fixture SHA-256 |
| --- | --- | --- | --- |
| Chromium | [JSON](PRODUCT_ANIMATION_FRAME_2026-10-11_chromium.json) | [PNG](PRODUCT_ANIMATION_FRAME_2026-10-11_chromium.png) | `35d335bd822d5ebde1037e70c9349a0560a72444183db51ab7ba0e923586707f` |
| WebKit | [JSON](PRODUCT_ANIMATION_FRAME_2026-10-11_webkit.json) | [PNG](PRODUCT_ANIMATION_FRAME_2026-10-11_webkit.png) | `f4c01e077f75f0c542b786034153be84c0675bded7b6bf6f2706155cf6f191c9` |

Artifact SHA-256:

- Chromium JSON: `b127b82c375553b159696a543b1372316b51c67bd86229f05c1ca89e7bf5b6f5`
- Chromium screenshot: `9432054de7eb9d14e50587183eb839c83cf192af60fdd348c1738729c1f58512`
- WebKit JSON: `a250f54f8258696704d8852d2dc6c00100c08353a33a1c4063ac7ebe379cee42`
- WebKit screenshot: `6ff16064d04cf1138e115af7757f6e492926c2e144941c0377ec3ae5706b6428`
