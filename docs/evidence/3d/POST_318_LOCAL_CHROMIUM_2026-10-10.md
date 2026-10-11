# Post-#318 local Chromium checkpoint — 2026-10-10

This follow-up uses fetched PR #318 head `7a4cf8e714b68beb49a9680fe36e163d0eb40779` as the user-requested planning baseline. It does **not** merge, push, or otherwise mutate PR #318. Work was performed on local branch `feat/b09-post-318-20261010`.

## Verification run

- Environment: Ubuntu 24.04 workspace; system executable `/usr/bin/chromium` reported Google Chrome for Testing `151.0.7922.34`; `@playwright/test` `1.61.1`.
- Same-head targeted browser run: **19/19 Chromium E2E tests passed** in approximately 75 seconds with four workers.
- Specs: `e2e/native-consumer.spec.ts`, `e2e/native-cross-domain-recovery.spec.ts`, `e2e/native-performance-evaluation.spec.ts`, `e2e/native-recovery-product.spec.ts`, and `e2e/native-viewport-evaluation.spec.ts`.
- Coverage included actual WebGL pixels and context-loss reconstruction; 20 repeated dispose/remount cycles; a capped 2000×2000 drawing buffer and resource-release estimate; Babylon 9.28 GLB+sidecar handoff, texture/alpha, hierarchy, skin and animation; quota-failure rollback/resident rescue; and the bounded 100-observation/60-second **isolated-renderer** measurement.
- Full software gates also passed on this checkout: TypeScript, ESLint, Prettier, application/H3/consumer builds, and **3,528 unit tests across 185 files**. ESLint reports one existing `react-hooks/exhaustive-deps` warning in `NativeViewportPanel.tsx`; Vite reports large-chunk warnings for the application/consumer bundles.

## Visual-evidence correction

Reviewing the first report exposed a test-evidence issue: the full handoff screenshot was taken after animation playback reached its translated endpoint, so the mesh moved outside its rest-pose framing. The E2E now scrubs the second clip back to time zero before attaching that screenshot. This is a test-only evidence correction; production playback and consumer camera behavior are unchanged. The edited test passed again, and the complete targeted 19-test set passed at that checkpoint, before the separate WebKit E2E follow-up below.

Selected screenshots are preserved under [`images/`](images/):

- [`post318-chromium-consumer-full-rest-pose.png`](images/post318-chromium-consumer-full-rest-pose.png) — edited project delivered to an independent consumer, captured at the readable rest pose.
- [`post318-chromium-consumer-texture.png`](images/post318-chromium-consumer-texture.png) — independent render of the uploaded color/alpha fixture.
- [`post318-chromium-binary-rescue.png`](images/post318-chromium-binary-rescue.png) — render-failure recovery screen with the explicit current-content backup action and editable diagnostics.
- [`post318-chromium-context-restore.png`](images/post318-chromium-context-restore.png) — viewport pixels after context restoration.

The earlier note that browser startup was blocked by `socket EPERM` describes the initial attempt only; this checkpoint succeeded by explicitly selecting the installed system Chromium executable.

## PR #318 WebKit CI follow-up

The [PR #318 Actions run](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/38037953730) reported six failures in the three 3D acceptance specs. They reproduced in local Linux Playwright WebKit. The causes were stale storage-error copy in an assertion, ambiguous project-button matching, and select locators that timed out despite the named comboboxes being present in WebKit's accessibility snapshot; the second-tab case also needed to open the enabled revision button from the saved-project list. The E2E now checks the stable `[EDIT_STORAGE]` category, scopes and names controls semantically, and follows the actual project-open flow. No production implementation changed in this follow-up.

The CI-equivalent WebKit acceptance command then passed **34/34 tests** in 1.4 minutes:

```sh
npx playwright test e2e/native-viewport-product.spec.ts e2e/native-editing-product.spec.ts e2e/native-texture-product.spec.ts --project=webkit-critical
```

The same three specs also passed **34/34 tests** in 1.0 minute on system Chromium 151.0.7922.34, selected via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.

The resident-binary rescue-owner correction associated with #318 was already present on its fetched head and is not duplicated here. This local Linux WebKit run does not substitute for physical Safari/iOS or assistive-technology review.

## Expanded native regression run (2026-10-10)

- Target: all `e2e/native-*.spec.ts` files selected by the Chromium and `webkit-critical` projects — **16 files / 132 tests**.
- Results: **132/132 passed** on Linux Playwright WebKit in 3.7 minutes and **132/132 passed** on system Chromium 151.0.7922.34 in 2.6 minutes.
- WebKit: `npx playwright test e2e/native-*.spec.ts --project=webkit-critical`
- Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test e2e/native-*.spec.ts --project=chromium`
- This includes the 87 native product tests and extends coverage to evaluation, consumer handoff, cross-domain recovery and measurement specs. The counts overlap the narrower 34-test and 87-test runs above and must not be added as distinct tests.
- The full 423-test Chromium project first exposed a strict-mode collision in `e2e/studio-entries.spec.ts`: a name-only locator matched both the saved-project open button and its backup button. The test now scopes to the `保存したプロジェクト` landmark and matches the name/revision open button. Its focused run passed **5 tests with 1 skipped**. The full Chromium run after this locator correction passed **422 tests with 1 skipped** in 9.0 minutes. The two later synchronization-only test edits below each passed targeted Chromium **1/1** and were included in the final full WebKit-critical run; no product implementation or skip behavior changed.
- The final configured WebKit-critical run covered **31 files / 236 tests** and passed **235 tests with 1 skipped** in 6.6 minutes. Two earlier full-suite attempts exposed E2E synchronization races, not application failures: the backup rescue test now waits for the injected save-error state before downloading; the cross-domain quota test now waits until revision 1 is acknowledged before taking its durable baseline. Focused WebKit repeats passed **5/5** and **3/3**; both updated cases also passed targeted Chromium **1/1**. The final WebKit-critical run includes these changes.
- After the semver-compatible development dependency refresh, the full configured Chromium project was rerun with system Chromium **151.0.7922.34** and passed **422 tests with 1 skipped** in 8.8 minutes. The first run under full parallel load exceeded the default five-second assertion timeout in the 64-file cancellation case in `frame-drawing.spec.ts`; three focused single-worker repeats passed **3/3** (2.2–4.6 seconds each). The test now allows up to 15 seconds for the in-flight image operation to reach its abort checkpoint before asserting that controls are restored. This adjusts only E2E synchronization, not product behavior. The post-refresh configured WebKit-critical run also passed **235 tests with 1 skipped**.

## Runtime dependency security follow-up (2026-10-10)

- The pre-fix full-tree audit matched PR317's recorded **11 findings**: 2 moderate, 7 high and 2 critical. `npm explain fast-uri` traced the only production advisory to `fast-uri@3.1.3` through root runtime `ajv@8.20.0`; Ajv permits `fast-uri` `^3.0.1`. The lockfile now resolves **`fast-uri@3.1.8`** within that existing range; `package.json` is unchanged for this runtime fix.
- After the runtime lockfile update, `npm audit --omit=dev` reported **0 vulnerabilities**. A non-forced `npm audit fix` refreshed semver-compatible transitive packages (21 package entries), resolving the seven non-Vitest finding groups. The remaining **3 development-tree findings** (1 moderate, 2 critical, 0 high) were through Vitest 3.2.7, `@vitest/mocker`, and Tinypool.
- Rather than move to Vitest 5.0.3, the available lowest patched Vitest major, this follow-up updates the test runner to **Vitest 4.1.11**. The official [GHSA-82fw-gwwq-j7x9 advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9) lists 4.1.11 as patched; Vitest 4 also replaces the vulnerable Tinypool dependency path. Vitest 4 requires Node.js >=20 and Vite >=6.0; CI uses Node 22 and the lockfile resolves Vite 6.4.3. The complete `npm audit --audit-level=low` now reports **0 vulnerabilities** (including the development tree), and the production-only audit also reports zero.
- The application schemas inspected use local fragment `$ref`s and have no `uri` or `uri-reference` format fields. This review found no direct user-supplied URI parsing path, but does not claim that a production dependency is unreachable in every runtime context.
- The pinned fast-uri BSD-3-Clause license bytes are unchanged (same SHA-256). Only the version pin, notice header and required terminal blank line changed; generated notice bytes match the source. The notice verifier and focused notice suite passed **31/31**.
- After the Vitest 4 update, ESLint completed with zero errors (the existing `NativeViewportPanel.tsx` hook warning remains), Prettier passed, TypeScript and application/H3 builds passed, the independent consumer build passed, `npm test` passed **3,528/3,528 across 185 files**, and `npm run test:ci-scope` passed **8/8**. The configured full Chromium and WebKit results after this update are recorded below; earlier 132-test native runs overlap and must not be added.

## Vitest 4 browser verification

- Full Chromium project on system Chromium 151.0.7922.34: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test --project=chromium` passed **422 tests with 1 skipped of 423** in 9.1 minutes.
- The first default-concurrency WebKit-critical run had **234 passed, 1 skipped and 1 timeout**. The timeout occurred in `native-cross-domain-recovery.spec.ts` while waiting for the 2D image-import preview dialog after setting a tiny PNG fixture; the captured page remained on the normal editor screen. The affected test passed alone with one worker (**1/1**, 14.7 seconds). A complete configured rerun with `--workers=2` passed **235 tests with 1 skipped of 236** in 9.8 minutes. The first timeout did not reproduce; its cause is not conclusively established, so it is retained here as a transient E2E synchronization/environment observation rather than silently dismissed.
- No production code changed during this Vitest update or the WebKit reruns. The successful rerun is Linux headless WebKit evidence, not physical Safari/iOS or assistive-technology acceptance.

## Acceptance boundary

These local headless results include the configured full Chromium project (**422 passed / 1 skipped of 423**) and the Vitest-4 configured WebKit-critical rerun (**235 passed / 1 skipped of 236**), plus—after the fast-uri lockfile update—the scoped 132-test native E2E set (**132/132 in each engine**). The broad project counts are recorded with their run order above; the post-update unit suite, builds and zero-finding dependency audit also pass. These are not final G05/G06 or physical-device acceptance. Quota errors are injected IndexedDB transaction failures, not actual disk exhaustion. Performance samples measure the isolated renderer and do not measure product input latency or declare a device tier. Still outstanding: formal CI/release sign-off; physical PC/iPad/iPhone/Android runs; physical Safari/iOS and assistive-technology review; OS suspend/kill/restart and real storage-pressure trials; real product-boundary input, import-first-draw, cancellation and autosave-window measurements; and the version-identified old/new application rehearsal. Do not mark these gates passed from the local results above.
