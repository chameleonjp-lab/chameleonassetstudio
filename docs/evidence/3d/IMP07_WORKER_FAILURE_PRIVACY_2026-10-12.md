# IMP-07 worker failure payload privacy hardening — 2026-10-12

## Scope

This software-only slice hardens the 3D asset-I/O worker boundary. The worker never serializes an arbitrary exception string. It maps a bounded set of known GLB validation failures—required extension, external reference, sidecar/provenance mismatch, image, malformed format, and profile limit—to fixed typed codes; unrecognized failures remain `ASSET_IO_WORKER_FAILED`. The client maps only these allowlisted codes to fixed messages for the existing bounded Japanese failure formatter. Arbitrary worker-supplied message fields remain ignored, unknown codes are rejected, and worker construction, `postMessage`, and unclassified runtime failures retain generic safe guidance.

This preserves useful input-specific guidance without forwarding file paths, URLs, tokens, or other incidental exception text through the worker-response/UI boundary. No automatic telemetry or new external reporting was introduced.

## Local verification

- Focused unit tests (`assetIoClient.test.ts`, `assetIoWorkerFailure.test.ts`, `assetIoFailure.test.ts`): 3 files / 58 tests passed.
- `npm test -- --reporter=dot`: 186 files / 3,536 tests passed.
- Focused import regression set: 6/6 passed across Chromium and WebKit-critical.
- Full `e2e/native-asset-io-product.spec.ts`: passed in Chromium and WebKit-critical; Playwright reported no failed tests.
- A newly reached quality-worker startup E2E exposed an inherited stale assertion: the existing formatter/unit contract maps the sanitized `Asset worker failed; original project retained` error to `EDIT_QUALITY_WORKER`, while the E2E still expected `EDIT_UNKNOWN`. The E2E now checks the established bounded quality-worker message/action plus private-text exclusion and backup preservation; the targeted case passed 2/2 across Chromium and WebKit-critical.
- `npm run format:check`: passed before the final E2E assertion-only edit; the modified test was formatted with Prettier.
- `npm run lint`: zero errors; the pre-existing `NativeViewportPanel.tsx:205` React Hook warning remains.
- `npm run build`: `tsc --noEmit`, app build, and H3 build passed; the existing >500 kB chunk advisory remains.
- `git diff --check`: passed before the final E2E assertion-only edit.

The client tests inject arbitrary path/token text beside generic and categorized worker codes and confirm that only fixed messages are exposed. The worker classifier tests verify its bounded category allowlist and generic fallback. CI run #38254484612 passed `classify-changes` and `build-and-test`, then exposed only the stale quality-E2E assertion after the asset-I/O tests passed. The corrected focused test passes locally; a hosted run for this test-only correction is not yet claimed.

## Limits

This improves known import-failure categories only. Unclassified exceptions and genuine worker startup/crash/communication failures remain generic; cause- and stage-specific guidance across every import/export phase is still incomplete, so IMP-07 remains partial. No browser-injected worker crash E2E, external telemetry, deployed runtime, physical device, GPU behavior, OS crash/discard, real network/cache, or overall acceptance pass is claimed.
