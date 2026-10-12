# QA-05 quality inspection background cancellation and late-result suppression — 2026-10-12

## Scope and evidence

The product-browser test in `e2e/native-quality-product.spec.ts` holds a completed inspection worker result, simulates `document.hidden`, dispatches `visibilitychange`, and verifies the quality panel reports cancellation without presenting an inspection revision. It then replays the held result after cancellation, confirms no stale report appears, restores the native Worker/visibility state, and verifies a fresh inspection succeeds.

The existing worker-startup failure case in the same spec was also updated for PR #371's fixed worker-error contract. It now expects `[EDIT_QUALITY_WORKER]` rather than the previous unknown-error classification while continuing to assert that the private path/message is not shown and the downloaded project/blob backup remains unchanged.

## Local verification

The full `native-quality-product.spec.ts` passed 12/12 across headless Chromium and WebKit-critical (six cases per project); the new background/late-result case passed 1/1 in each project. `npx tsc --noEmit`, focused ESLint, Prettier check, and `git diff --check` passed.

## Limits

This is browser-emulated visibility and a controlled delayed-result replay, not real OS app backgrounding, process suspension, browser freeze, physical-device behavior, or an external runtime. It does not measure GPU/OS resources or real network/cache recovery. QA-05 and overall 3D acceptance remain partial/open; final-head CI was not monitored.
