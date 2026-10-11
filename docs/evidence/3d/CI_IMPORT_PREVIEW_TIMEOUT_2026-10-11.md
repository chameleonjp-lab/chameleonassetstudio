# CI image-import preview timeout investigation — 2026-10-11

## Observed failure

The failed [PR #325 CI run](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/38104643906) used head SHA `5371fee124a2ca491e85beb966f3c32d2c1d6af8`. Its E2E job ran 48 tests with two workers: 47 passed and one WebKit-critical test failed after 120,000 ms. The failing test was `same-origin 2D rollback and 3D resident recovery preserve independent durable data across either quota failure` at `e2e/native-cross-domain-recovery.spec.ts:108`, where `confirmImageImport` waited for the `取り込み確定前preview` dialog after selecting a generated 8×8 PNG.

The archived error context showed the page still on the `Shared quota 2D` editor with no imported assets and no preview dialog. This establishes that the dialog never became observable by the deadline; it does not show why. The recovery-specific artifacts contain the error-context and screenshots but no recovery-test trace or video.

## Failed-versus-successful revision comparison

The later successful [PR #325 CI run](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/38112096311) used head SHA `9ed88626f0e1fe34e2c0999719f9d165792a79fb`. Comparing the failed and successful revisions shows three intervening commits: a 3D numeric-commit performance change, its evidence, and the merge of PR #326. The changed files are limited to 3D transform transaction/controls and related evidence; the 2D image-import flow, `confirmImageImport`, and the failing recovery test were unchanged.

Local isolated runs and a later two-worker regression repeat passed; the current PR #325 checks are green. These observations support an intermittent failure but do not establish a root cause. No retry-only fix or timeout increase is justified by the available evidence.

## Diagnostic follow-up

This follow-up adds failure-only diagnostics in `e2e/native-cross-domain-recovery.spec.ts`, attached immediately before the synthetic PNG input. If file selection or preview confirmation fails, the test error now includes up to 20 `pageerror`, `console.error`, and `requestfailed` events, each capped at 2,000 characters; when none were captured, that absence is stated explicitly. The existing helper, test timeout, and wait conditions remain unchanged. This is test instrumentation only; it does not change product runtime or storage behavior, and it is not a root-cause fix.
