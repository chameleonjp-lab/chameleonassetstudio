# IMP-07 worker failure payload privacy hardening — 2026-10-12

## Scope

This software-only slice hardens the 3D asset-I/O worker boundary. The worker now emits a fixed, typed `ASSET_IO_WORKER_FAILED` code rather than serializing an exception message. The client ignores arbitrary worker-supplied message text, exposes only a fixed safe failure for the recognized code, and replaces worker construction / `postMessage` exceptions with the same fixed failure. This prevents raw exception strings from carrying file paths, URLs, tokens, or other incidental data through the worker-response/UI error boundary.

The existing UI failure formatter maps the fixed worker failure to its bounded Japanese `IO_WORKER` guidance. No automatic telemetry or new external reporting was introduced.

## Local verification

- `npx vitest run src/adapters3d/gltf/assetIoClient.test.ts src/features/editor3d/assetIoFailure.test.ts --reporter=dot`: 2 files / 55 tests passed.
- `npm test -- --reporter=dot`: 185 files / 3,533 tests passed.
- `npm run format:check`: passed.
- `npm run lint`: zero errors; the existing `NativeViewportPanel.tsx:205` React Hook warning remains.
- `npm run build`: app and H3 builds passed; the existing >500 kB chunk advisory remains.
- `git diff --check`: passed.

The new client tests inject a worker error carrying a private file URI/token and confirm only the fixed safe failure is exposed; they also verify worker-construction and `postMessage` exceptions are sanitized. The exact tested candidate commit/tree is reported in the associated Draft PR description.

## Limits

This closes only the raw worker-error payload path. Failures are deliberately summarized as a generic worker failure, so operation-stage and cause-specific guidance across every import/export phase is still incomplete; IMP-07 remains partial. The new failure protocol was verified with unit tests and the production build, not a browser-injected worker crash E2E or external telemetry service. No claim is made about physical devices, external runtimes, GPU behavior, OS crash/discard, deployed runtime, real network/cache, or final-head CI. CI was not monitored.
