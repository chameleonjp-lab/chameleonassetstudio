# IMP-07 browser-injected worker startup failure — 2026-10-13

## Scope

A product-browser regression aborts the actual `assetIo.worker` module request during GLB import. It checks that the UI shows the fixed `[IO_WORKER]` recovery guidance without exposing the worker URL, selected filename, or browser network error; a before/after native backup comparison proves the project and blob map are unchanged, and no imported-GLB revision is published.

## Local evidence

- Focused browser case: Chromium 1/1; WebKit-critical 1/1.
- Complete `e2e/native-asset-io-product.spec.ts`: Chromium 22/22; WebKit-critical 22/22.
- Vitest: 3,543/3,543 across 186 files.
- ESLint: zero errors; one pre-existing `NativeViewportPanel.tsx:205` React Hook warning.
- Prettier check: passed.
- TypeScript and production builds: app and H3 passed. Existing >500 kB chunk advisory remains.
- CI-scope classification: 8/8 passed.

## Boundary

This verifies a browser-intercepted worker module startup-fetch failure, not a worker crash after successful startup, every browser-specific `ErrorEvent`, real network/OS/resource-exhaustion failures, production behavior, or physical-device acceptance. IMP-07 and overall acceptance remain partial/open. Remote CI was not monitored.
