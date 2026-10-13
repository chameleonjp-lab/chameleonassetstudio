# LIFE-07 BFCache and history-return evidence — 2026-10-13

## Product path and assertions

`e2e/native-viewport-product.spec.ts` creates and saves **Native box work**, leaves `/3d/` for `/`, then returns through browser history. It records `pagehide` and `pageshow` `persisted` values in same-tab `sessionStorage` and attaches the event log plus a dynamic `LIFE-07 restore path` test annotation.

The test uses `page.goBack({ waitUntil: 'commit' })`: BFCache restoration does not fire a new `load` event, so Playwright's default `load` wait can time out even after the cached document is restored.

- When the browser reports a persisted restore, the test requires exactly one `/3d/` `pagehide.persisted=true` and one `pageshow.persisted=true`, checks the saved project is still active, requires exactly one viewport canvas, and compares the saved-project snapshot and rendered PNG byte-for-byte with their pre-navigation values.
- When BFCache is not used, the test expects the saved-project list, explicitly reopens the saved revision, and runs the same project/canvas/PNG checks. This fallback is reported as a reload, not as BFCache evidence.

## Playwright harness behavior

Playwright's default Chromium launch explicitly includes `--disable-back-forward-cache`. This also prevents a minimal same-origin two-page control from entering BFCache. `playwright.config.ts` now provides an opt-in, `PLAYWRIGHT_ENABLE_BFCACHE=1`, which removes only that default argument; ordinary runs retain the previous default. The production-preview config inherits the opt-in. For the BFCache acceptance run, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` selected Google Chrome for Testing 151.0.7922.34.

## Local results

Production-preview run, three repetitions per project:

| Project | Observed return path | Result |
| --- | --- | --- |
| Chromium (Chrome for Testing 151.0.7922.34), BFCache opt-in | `pagehide.persisted=true` then `pageshow.persisted=true` | 3/3 passed; saved project, single canvas, and PNG equality passed |
| `webkit-critical` | `pageshow.persisted=false`; saved project reopened from the list | 3/3 passed; this verifies reload recovery, not WebKit BFCache |

Overall: **6/6 passed, 0 flaky**. The event log is attached by the E2E so future browser runs can distinguish actual BFCache restores from reload fallback. Earlier default-harness runs also passed their reload path; because the default Chromium flag disables BFCache, they are not counted as BFCache evidence.

## Remaining boundary

LIFE-07 remains **partial**. The local Chromium production-preview run now exercises an actual product BFCache restore, but WebKit BFCache is not demonstrated. These headless local tests do not simulate OS/process discard, abrupt termination, a physical browser/device, assistive technology, or deployed-service lifecycle. The product test checks viewport-canvas uniqueness and retained data; renderer unit tests remain the direct check for its single pending animation frame, while physical GPU/driver behavior remains unmeasured. Remote CI was not monitored.
