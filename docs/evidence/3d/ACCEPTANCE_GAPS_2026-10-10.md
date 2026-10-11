# Native acceptance follow-up candidate

This candidate follows local B10 commit `0fa318d2bc19684f45aa7f3f02e3b71b240d0d0e`. It is implementation and test preparation, not final G05/G06 acceptance. Its code can be reverted independently; the prior source archive is retained. It changes no project schema and performs no production rollback or database deletion.

## Shared-origin capacity failure

`e2e/native-cross-domain-recovery.spec.ts` opens real 2D and 3D entries in one browser context. It injects read/write transaction quota failure in each domain's tab in turn while the other domain edits and saves. It compares durable project/asset/snapshot/blob content, retains 3D resident backup, verifies that a failed 2D flush refuses to download a stale backup, then retries and validates final backups and original image bytes. Read-only comparisons include Blob/typed-array contents, not merely JSON placeholders.

This is an injected storage-failure acceptance case, not measured physical disk exhaustion or a cross-tab total-memory guarantee. At the time of this checkpoint, local browser startup was blocked by socket EPERM, so the case was not reported as passed; the later run is recorded in the post-#318 follow-up below.

## Explicit backup compatibility matrix

`src/core3d/backup/compatibility.test.ts` checks seven cases against the strict, frozen schema validators and the current backup reader:

| Input | Strict 0.1 validator | Strict 0.2 validator | Strict 0.3 validator | Current backup import |
| --- | --- | --- | --- | --- |
| 0.1.0 | accept | reject | reject | detached 0.3 copy + exact old archive |
| 0.2.0 | reject | accept | reject | detached 0.3 copy + exact old archive |
| 0.3.0 | reject | reject | accept | detached current copy |
| future archive 0.4.0 | not tested as old binary | not tested as old binary | not tested as old binary | reject, original unchanged |

These are schema-reader boundaries, not a claim that a historical application's entire import/migration UI is limited to its strict validator. Original project/source/archive bytes remain unchanged, current re-export remains 0.3, and all reservation counters return to baseline. Reverting application code does not convert data into an old schema.

The remaining AC-14 rehearsal should use separately preserved, version-identified app artifacts and isolated browser profiles: export current and pre-migration backups; record their hashes and app/source/schema identities; load only the appropriate copies in the old/new app; verify safe refusal/rescue for unsupported newer copies; verify both original databases remain unchanged. The known pre-B07 source is `910ed2d0d667c6fa5f30e68c74ecc0f52307ce21` (0.2 app), while PR317 head `6bd655787993ab33c5fbb82f570754a0e7405eb1` adds 0.3. Current frozen 0.1/0.2 validators are unit evidence; a historical 0.1 app artifact and actual browser rollback rehearsal are still unverified. No live deployment change is part of this procedure.

## Native measurement record and explicit collector

`tools/3d-evaluation/performanceRecord.ts` defines a bounded raw evidence format for source identity, fixture hash, declared environment, cold/warm state and six independent metrics. Unknown/unavailable/unexecuted values remain null/status values. It rejects extra fields, free-form device identifiers, nonfinite numbers, oversized input and altered summaries. Median/max retain small runs; nearest-rank p95 requires at least 100 samples and a 60-second foreground window with freeze observation available. Initial-draw repeats never claim p95 and explicitly report fewer than five runs.

`performanceCollector.ts` instruments explicit real operation boundaries, retains raw completed samples, rejects unknown/double-finished/pending tokens and limits concurrent/total observations. An observer installed with zero events differs from an observer never installed. Failed metrics remain failed; preceding raw samples are retained separately for diagnosis. The collector does not auto-send, persist, infer a physical device or declare a tier.

`performanceRunner.ts` connects this contract to the existing isolated native renderer: 100 numeric project commits over 60 seconds, measured from `setProject` to an actual `framesRendered` increment, with optional real long-task observation. It restores the original fixture and releases listeners/observers after success, failure or cancellation. Its wrapper explicitly says `isolated-native-renderer` and `productInputLatencyMeasured: false`. This is a renderer boundary measurement, not product input-dispatch latency. Animation-frame, import-first-draw, cancellation and autosave-window metrics remain not-measured until corresponding real boundaries are connected; they are not filled with zero.

`e2e/native-performance-evaluation.spec.ts` collects the actual raw record with source/fixture identity. It does not assert a device budget, frame rate or mobile readiness. The test is prepared for the isolated evaluation page in both browsers, not the production application entry. No measured numbers or physical-device results have been fabricated.

## Outstanding release evidence

The local follow-up evidence, including the Vitest-4 full Chromium-project run and configured WebKit-critical rerun, is recorded in [`POST_318_LOCAL_CHROMIUM_2026-10-10.md`](POST_318_LOCAL_CHROMIUM_2026-10-10.md), alongside the post-update 132/132 native runs in both engines. The first full WebKit rerun had one import-preview-dialog timeout; the same test passed alone and the complete suite passed on a two-worker rerun, with details retained in the evidence record. Formal CI/release sign-off; physical PC/iPad/iPhone/Android and physical Safari/assistive-technology acceptance; full product-path performance measurements; and the old/new app rehearsal remain outstanding. PR317 CI originally reported 11 npm vulnerabilities (2 moderate, 7 high, 2 critical); a fresh audit reproduced them and traced its only production finding to `fast-uri@3.1.3` under Ajv. The lockfile now resolves `fast-uri@3.1.8` within Ajv's existing range, and the production audit reports zero findings. A non-forced `npm audit fix` refreshed semver-compatible development dependencies; the remaining three Vitest/Tinypool findings were then addressed by updating to patched Vitest `4.1.11` rather than forcing Vitest 5.0.3. The full `npm audit --audit-level=low` now reports zero findings. The application schemas reviewed use local fragment references and no URI-format fields; this is not proof of universal unreachability. Zero audit findings and local headless tests do not substitute for the remaining release or physical-device gates.

## Local checkpoint

The integrated candidate passed 2,179 unit tests across 167 files, TypeScript, ESLint (zero errors; the existing viewport hook warning remains), formatting, app build and isolated evaluation build. Independent read-only review checked the quota and measurement contracts. It identified a missing independent geometry oracle in the full consumer workflow; the test now checks the edited vertex at `[-0.4, -0.5, -0.5]` in the backup and actual consumer positions, rather than only comparing two post-edit copies. At the time of this checkpoint, browser cases remained collected/unexecuted locally.

## Post-#318 local Chromium follow-up

See [`POST_318_LOCAL_CHROMIUM_2026-10-10.md`](POST_318_LOCAL_CHROMIUM_2026-10-10.md) for the 19/19 selected Chromium checkpoint, saved screenshots, 34/34 WebKit and Chromium follow-up, expanded and post-update all-native E2E runs at 132/132 in each browser, Vitest-4 full Chromium/WebKit results, the Vitest 4.1.11 remediation, and the fast-uri dependency review. After the Vitest update, the unit suite passed 3,528/3,528, app/H3 and consumer builds passed, and the full dependency audit reports zero findings. These are headless software evidence, not final release or physical-device acceptance.
