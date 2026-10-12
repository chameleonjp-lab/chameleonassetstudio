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

`e2e/native-legacy-backup-product.spec.ts` also exercises a schema 0.1.0 `.cas3dproj` through the current product UI, then downloads and inspects the 0.3 copy: a new project identity/revision 0, retained content and image bytes, and the exact source archive in the separate `legacyBackups` store. Local headless Chromium and WebKit both passed 1/1 on 2026-10-11. The fixture archive was produced by the current test helper from the frozen 0.1 contract, not by a historical editor build. Historical schema-0.1 source commit `413ada0` has no `src/features/editor3d` tree, so a full old-app UI rollback rehearsal against that version remains unverified.

The local AC-14 rehearsal is recorded in [`ROLLBACK_REHEARSAL_2026-10-11.md`](ROLLBACK_REHEARSAL_2026-10-11.md). It uses the separately preserved 0.2 app and current 0.3 app in one isolated same-origin browser profile, verifying copy-upgrade, retained pre-migration recovery bytes, safe refusal of a 0.3 archive, and unchanged project-content stores in both databases. The known pre-B07 source is `910ed2d0d667c6fa5f30e68c74ecc0f52307ce21` (0.2 app), while PR317 head `6bd655787993ab33c5fbb82f570754a0e7405eb1` adds 0.3. Current frozen 0.1/0.2 validators are unit evidence; historical schema-0.1 application UI rollback and OS-level rollback/device lifecycle remain unverified. No live deployment change is part of this procedure.

## Native measurement record and explicit collector

`tools/3d-evaluation/performanceRecord.ts` defines a bounded raw evidence format for source identity, fixture hash, declared environment, cold/warm state and six independent metrics. Unknown/unavailable/unexecuted values remain null/status values. It rejects extra fields, free-form device identifiers, nonfinite numbers, oversized input and altered summaries. Median/max retain small runs; nearest-rank p95 requires at least 100 samples and a 60-second foreground window with freeze observation available. Initial-draw repeats never claim p95 and explicitly report fewer than five runs.

`performanceCollector.ts` instruments explicit real operation boundaries, retains raw completed samples, rejects unknown/double-finished/pending tokens and limits concurrent/total observations. An observer installed with zero events differs from an observer never installed. Failed metrics remain failed; preceding raw samples are retained separately for diagnosis. The collector does not auto-send, persist, infer a physical device or declare a tier.

`performanceRunner.ts` connects this contract to the existing isolated native renderer: 100 numeric project commits over 60 seconds, measured from `setProject` to an actual `framesRendered` increment, with optional real long-task observation. It restores the original fixture and releases listeners/observers after success, failure or cancellation. Its wrapper explicitly says `isolated-native-renderer` and `productInputLatencyMeasured: false`. This is a renderer boundary measurement, not product input-dispatch latency. Animation-frame, import-first-draw, cancellation and autosave-window metrics remain not-measured until corresponding real boundaries are connected; they are not filled with zero.

`e2e/native-performance-evaluation.spec.ts` collects the raw record with source/fixture identity and can persist raw JSON and a final screen capture to optional paths. The 2026-10-11 local headless Chromium/WebKit run is recorded in [`ISOLATED_RENDERER_PERFORMANCE_2026-10-11.md`](ISOLATED_RENDERER_PERFORMANCE_2026-10-11.md): each engine completed 100 numeric commits in a 60-second window. Chromium p95 is reportable under the collector contract; WebKit p95 is intentionally omitted because freeze state is unknown. This is isolated-renderer evidence, not product-entry input latency, a device-budget assertion, mobile readiness or physical acceptance.

## Outstanding release evidence

The local follow-up evidence, including the Vitest-4 full Chromium-project run and configured WebKit-critical rerun, is recorded in [`POST_318_LOCAL_CHROMIUM_2026-10-10.md`](POST_318_LOCAL_CHROMIUM_2026-10-10.md), alongside the post-update 132/132 native runs in both engines. The first full WebKit rerun had one import-preview-dialog timeout; the same test passed alone and the complete suite passed on a two-worker rerun, with details retained in the evidence record. Formal CI/release sign-off; physical PC/iPad/iPhone/Android and physical Safari/assistive-technology acceptance; remaining product performance boundaries and B09 performance-tier evidence (product numeric-input diagnostics are recorded in [`PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11.md`](PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11.md) and [`PRODUCT_INPUT_DIRECT_COMMIT_2026-10-11.md`](PRODUCT_INPUT_DIRECT_COMMIT_2026-10-11.md); isolated-renderer evidence is recorded in [`ISOLATED_RENDERER_PERFORMANCE_2026-10-11.md`](ISOLATED_RENDERER_PERFORMANCE_2026-10-11.md)); historical schema-0.1 application UI rollback; and physical rollback/device lifecycle remain outstanding. PR317 CI originally reported 11 npm vulnerabilities (2 moderate, 7 high, 2 critical); a fresh audit reproduced them and traced its only production finding to `fast-uri@3.1.3` under Ajv. The lockfile now resolves `fast-uri@3.1.8` within Ajv's existing range, and the production audit reports zero findings. A non-forced `npm audit fix` refreshed semver-compatible development dependencies; the remaining three Vitest/Tinypool findings were then addressed by updating to patched Vitest `4.1.11` rather than forcing Vitest 5.0.3. The full `npm audit --audit-level=low` now reports zero findings. The application schemas reviewed use local fragment references and no URI-format fields; this is not proof of universal unreachability. Zero audit findings and local headless tests do not substitute for the remaining release or physical-device gates.

## Local checkpoint

The integrated candidate passed 2,179 unit tests across 167 files, TypeScript, ESLint (zero errors; the existing viewport hook warning remains), formatting, app build and isolated evaluation build. Independent read-only review checked the quota and measurement contracts. It identified a missing independent geometry oracle in the full consumer workflow; the test now checks the edited vertex at `[-0.4, -0.5, -0.5]` in the backup and actual consumer positions, rather than only comparing two post-edit copies. At the time of this checkpoint, browser cases remained collected/unexecuted locally.

## Post-#318 local Chromium follow-up

See [`POST_318_LOCAL_CHROMIUM_2026-10-10.md`](POST_318_LOCAL_CHROMIUM_2026-10-10.md) for the 19/19 selected Chromium checkpoint, saved screenshots, 34/34 WebKit and Chromium follow-up, expanded and post-update all-native E2E runs at 132/132 in each browser, Vitest-4 full Chromium/WebKit results, the Vitest 4.1.11 remediation, and the fast-uri dependency review. After the Vitest update, the unit suite passed 3,528/3,528, app/H3 and consumer builds passed, and the full dependency audit reports zero findings. These are headless software evidence, not final release or physical-device acceptance.

## Product-path numeric input performance follow-up — 2026-10-11

[`PRODUCT_INPUT_PERFORMANCE_2026-10-11.md`](PRODUCT_INPUT_PERFORMANCE_2026-10-11.md) adds a manual-only headless product-UI measurement from the numeric-apply click to the next WebGL-drawing animation frame. Chromium and WebKit each completed 100 samples over approximately 60 seconds. Chromium reports median 157.2 ms and p95 194.2 ms; WebKit reports median 80.5 ms and maximum 147 ms, while its p95 is withheld because freeze state is unknown. These are diagnostic measurements, not a pass/fail threshold or a cross-browser ranking.

This closes only one product-path measurement boundary. Animation-frame, long-task, import-first-draw, cancel, and autosave-window remain `not-measured`; B09 performance tiers, input/accessibility acceptance, physical devices, and final release sign-off remain open. Headless browser evidence does not imply physical acceptance.

## Product main-thread long-task follow-up — 2026-10-11

[`PRODUCT_INPUT_LONG_TASK_2026-10-11.md`](PRODUCT_INPUT_LONG_TASK_2026-10-11.md) supersedes the input-only run's `long-task:not-measured` status: the observer measured 310 Chromium entries (median 116 ms, p95 150 ms, maximum 208 ms); WebKit records `unsupported: observer-unavailable`. In the Chromium run, all 100 input intervals overlapped at least one long-task interval (1–2 overlaps, median 2). This is temporal correlation, not causal attribution or a performance-budget verdict. The observer-enabled input values are a distinct run, not a before/after comparison with the input-only record.

Animation-frame, import-first-draw, cancel and autosave-window remain `not-measured`. No numeric B09 latency threshold is set; performance tiers, input/accessibility acceptance, physical-device gates and release sign-off remain open.

## Product measurement execution-mode correction and production preview — 2026-10-11

The earlier product measurements at commits `afd50ca` and `9553615` inherited `npm run dev` from the general Playwright config; a CPU trace showed the React `jsxDEV` runtime. Treat those earlier figures as **development-server diagnostics only**, not production performance evidence. [`PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11.md`](PRODUCT_INPUT_PRODUCTION_PREVIEW_2026-10-11.md) supersedes them for the local production bundle: its dedicated config builds the app and serves `vite preview` with `reuseExistingServer: false`.

The clean production-preview run completed 100 Chromium and 100 WebKit product edits over approximately 60 seconds each. Chromium input median/p95/max is 61.45/89.6/106.4 ms; 101 long-task entries have median/p95/max 125/174/264 ms. WebKit input median/max is 61/108 ms, but p95 remains withheld because freeze state is unknown; its long-task observer is unsupported. All 100 Chromium input intervals overlap at least one long-task entry (1–2, median 1). This timing relationship is diagnostic only, not causal attribution, a threshold verdict, deployed-service evidence, or physical-device acceptance.

Animation-frame, import-first-draw, cancel and autosave-window remain `not-measured`; WebKit long-task remains unsupported. B09 thresholds/performance tiers, input/accessibility acceptance, physical-device gates and release sign-off remain open.


## Product direct numeric-commit follow-up — 2026-10-11

[`PRODUCT_INPUT_DIRECT_COMMIT_2026-10-11.md`](PRODUCT_INPUT_DIRECT_COMMIT_2026-10-11.md) records one clean production-preview run at commit `42ae13efb240e8561cdc19d75fd3ddf40596f8dc`, compared with the earlier single run at `4a41b16e4dbe027f721ef81e064cf2f9ab5bf9c3`. Each run exercised 100 product numeric commits over approximately 60 seconds per engine. Chromium input median/p95/max changed from 61.45/89.6/106.4 ms to 57.75/71.4/88.2 ms, and long-task median/p95/max from 125/174/264 ms (101 entries) to 117/137/167 ms (100 entries). All 100 follow-up Chromium input intervals still overlap one long task. WebKit median/max changed from 61/108 ms to 51/71 ms; p95 remains withheld because freeze state is unknown, and long-task observation remains unsupported.

These are independent single runs with differing fixture hashes, not a paired benchmark. The observed reductions do not establish that the direct-commit change caused them, set a pass/fail threshold, or imply physical acceptance. Product numeric-apply input is now measured on a local production preview; animation-frame playback, import-first-draw, cancel, autosave-window, physical-device, accessibility, B09 performance-tier, and release-approval gates remain open.

## Product active-animation playback frame intervals — 2026-10-11

[`PRODUCT_ANIMATION_FRAME_2026-10-11.md`](PRODUCT_ANIMATION_FRAME_2026-10-11.md) adds a manual-only production-preview measurement of consecutive RAF callbacks that issue WebGL draw calls from the actual product viewport during a looping animation. Chromium completed 3,597 samples over 60,040 ms (median 16.7 ms, p95 17.1 ms, max 65.9 ms; foreground, no freeze observed). WebKit completed 807 samples over 60,042 ms (median 73 ms, max 123 ms); p95 is withheld because freeze state is unknown.

This is callback/draw-call cadence, not GPU completion, compositor presentation, input-to-photon latency, a threshold verdict, or physical-device acceptance. The product animation-frame boundary is now measured in headless preview; import-first-draw, cancel, and autosave-window remain `not-measured`. No numeric B09 frame budget is set, and B09 performance tiers, accessibility/input acceptance, physical-device gates, rollback/device lifecycle, and release sign-off remain open.


## Product backup import-to-first-draw follow-up — 2026-10-11

[`PRODUCT_IMPORT_FIRST_DRAW_2026-10-11.md`](PRODUCT_IMPORT_FIRST_DRAW_2026-10-11.md) closes the local headless product-UI `import-first-draw:not-measured` gap: each engine completed five warm copy-restores from the `.cas3dproj` file-input change through the success notice, explicit **3D表示を開く** action, and first successful WebGL draw on a different viewport canvas. Chromium median/maximum is 266.3/277.3 ms; WebKit is 361/461 ms. The metric contract intentionally reports median/max only, not p95.

This remains diagnostic headless evidence—not GPU completion, presentation latency, a B09 threshold verdict, or physical acceptance. `physicalAcceptance` is `false`; WebKit freeze is unknown. Cancel and autosave-window remain `not-measured`; B09 performance tiers, accessibility/input acceptance, physical-device and rollback lifecycle gates, and release sign-off remain open.


## Latest product-path measurement status — 2026-10-11

The earlier `not-measured` statements above are dated checkpoints and are superseded by the following local production-preview evidence:

Separately, [`CI_IMPORT_PREVIEW_TIMEOUT_2026-10-11.md`](CI_IMPORT_PREVIEW_TIMEOUT_2026-10-11.md) records the historical PR #325 WebKit preview-dialog timeout and the follow-up failure-only browser diagnostics. The test wait and timeout remain unchanged; the root cause is still undetermined.

- [`PRODUCT_CANCEL_CANONICAL_2026-10-11.md`](PRODUCT_CANCEL_CANONICAL_2026-10-11.md) records 20 cancellation trials per engine. Median/max was 12.7/15 ms in Chromium and 7/16 ms in WebKit. Every trial preserved the editor revision and passed a full decoded canonical-project backup equality check. p95 is withheld (`n=20`); this is a UI-notice boundary, not an autosave or GPU/display timing result.
- [`PRODUCT_AUTOSAVE_WINDOW_2026-10-11.md`](PRODUCT_AUTOSAVE_WINDOW_2026-10-11.md) records 20 first-dirty-to-durable-revision trials per engine. Median/max was 866.7/916.6 ms in Chromium and 815/935 ms in WebKit. The saved-version backup matched the current-project backup after timing. p95 is withheld (`n=20`); no numeric target or pass/fail threshold is established.
- [`PHYSICAL_DEVICE_ACCESSIBILITY_GATES_2026-10-11.md`](PHYSICAL_DEVICE_ACCESSIBILITY_GATES_2026-10-11.md) prepares the physical PC/iPad/iPhone/Android and assistive-technology runbook. It is a plan; every physical and assistive-technology gate remains **not run**.
- [`PRODUCT_KEYBOARD_TAB_SMOKE_2026-10-11.md`](PRODUCT_KEYBOARD_TAB_SMOKE_2026-10-11.md) records one headless Chromium/WebKit-only UX-04 slice: Tab/Enter and keyboard text entry reach project/box creation; Tab/Enter opens the assembly list and Tab/Space deselects/reselects the object while selection-count guidance and active-item text update; numeric transform, save, and backup follow. When Tab reaches the numeric X input, the test verifies the existing solid 3 px focus outline and 3 px offset. The decoded backup contains the expected `[1.25, 0, 0]` translation. This does not close contrast review, the complete keyboard workflow, screen-reader acceptance, or any physical gate.
- [`PRODUCT_KEYBOARD_ANIMATION_KEY_2026-10-11.md`](PRODUCT_KEYBOARD_ANIMATION_KEY_2026-10-11.md) records one headless Chromium/WebKit-only ANIM-04/UX-04 slice: keyboard selection of a timeline key followed by editing its time and numeric value, applying, saving, and verifying the decoded backup. This does not establish touch selection or close screen-reader, full keyboard-workflow, or physical accessibility acceptance.
- [`PRODUCT_KEYBOARD_EXPORT_SMOKE_2026-10-11.md`](PRODUCT_KEYBOARD_EXPORT_SMOKE_2026-10-11.md) records one headless Chromium/WebKit-only UX-04 slice: Tab/Space/Enter from project creation through export acknowledgement, GLB package creation, ZIP download, and decoded package verification. This does not establish physical-device, touch, screen-reader, or complete accessibility acceptance.
- [`PRODUCT_KEYBOARD_IMPORT_GAMEDATA_EXPORT_2026-10-11.md`](PRODUCT_KEYBOARD_IMPORT_GAMEDATA_EXPORT_2026-10-11.md) records one headless Chromium/WebKit-only Stage 4-04/UX-04 slice: Tab/Enter activates the file input, then keyboard preview inspection, acknowledgement and copy-save, saved-project open, GameData edit, and GLB package export. A related preview-cancellation test reaches its acknowledgement checkbox by Tab, sends Escape, and verifies the preview closes with focus returned to its launch button. Playwright injects fixture bytes through the chooser event, so native OS dialog UI/keyboard selection remains untested; this does not close the full workflow, screen-reader, or physical acceptance.
- [`PRODUCT_KEYBOARD_CANCEL_STATUS_2026-10-11.md`](PRODUCT_KEYBOARD_CANCEL_STATUS_2026-10-11.md) records one headless Chromium/WebKit-only UX-04/UX-05 slice: Escape cancels a numeric draft, the edit and cancellation notices expose polite `role="status"` live regions, the editor/persisted revision is unchanged, and the full decoded project object from the post-cancel backup equals the pre-edit baseline. This verifies DOM semantics, not actual screen-reader speech, and does not close full keyboard or physical acceptance.
- [`PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md`](PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md) records a headless Chromium/WebKit-only UX-05 slice: the viewport group links its accessible project name to visible keyboard/PNG guidance; the active-object selector links to the current object name/ID; display state is available in `role="status"` text; and the `3D部品の組立` region exposes a heading, semantic list/list item, a resolved list-level `aria-describedby` selection summary, and a checked active-object entry with ID/parent text. The selection summary is now also a polite, atomic `role="status"` live region; the keyboard-only Tab/Space test verifies its text updates as selection count changes. These headless checks do not establish actual screen-reader speech, complete text rendering of the 3D scene, or physical acceptance.
- [`PRODUCT_REDUCED_MOTION_SOFTWARE_2026-10-11.md`](PRODUCT_REDUCED_MOTION_SOFTWARE_2026-10-11.md) records a headless Chromium/WebKit-only UX-06 slice: emulated `prefers-reduced-motion` yields 0.01 ms editor animation/transition durations, a single iteration, and `scroll-behavior: auto`; the animation preview returns to its stop pose without changing the saved project. OS preference, perceptual, zoom, contrast, and physical checks remain open.
- [`PRODUCT_TEXT_REFLOW_SMOKE_2026-10-11.md`](PRODUCT_TEXT_REFLOW_SMOKE_2026-10-11.md) records a 320 CSS px viewport with a 200% root-font-size simulation (computed 32 px), no measured horizontal document/panel overflow, in-viewport visible control bounds, a 44 CSS px import button, and a texture-file status linked by `aria-describedby` and updated through `aria-live="polite"`. The targeted Chromium/WebKit cases passed 2/2 and the final selected accessibility matrix passed 18/18. This is not actual browser/OS zoom, a contrast assessment, screen-reader speech, native file-picker acceptance, or a physical-device result; UX-05/UX-06 and Stage 4-04 remain partial/open.
- [`PRODUCT_CONTINUOUS_AUTOSAVE_2026-10-11.md`](PRODUCT_CONTINUOUS_AUTOSAVE_2026-10-11.md) records five 20-commit bursts per engine with apply gaps below the 800 ms debounce. Every burst durably advanced a saved revision before its last edit, then the final saved backup matched the current project. First-dirty-to-first-checkpoint median/max was 5,044.8/5,132.1 ms in Chromium and 5,084/5,152 ms in WebKit; p95 is withheld (`n=5`). This is a max-wait diagnostic, not a hard end-to-end deadline or per-edit loss-age guarantee. A two-worker recovery regression repeat passed 96/96; the earlier WebKit dialog timeout did not reproduce, but its root cause remains undetermined and its wait conditions were not changed.

The six collector metrics now have product/renderer evidence recorded across the preceding sections; WebKit long-task observation is explicitly unsupported. This does **not** close B09 performance tiers or numeric budgets, physical-device/accessibility acceptance, rollback lifecycle on physical devices, or final release sign-off. The local runs are diagnostic headless evidence only, and the records deliberately retain insufficient-sample/unavailable states rather than fabricating p95 values.


## Product timeline key-marker accessibility follow-up — 2026-10-12

[`PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md`](PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md) now also records the keyboard-only timeline marker follow-up: the marker group is named with clip, object name/ID, and property context; each key button includes target/property/time and exposes its selected state; keyboard activation proceeds through key edit, save, and decoded-backup verification. The focused Chromium and WebKit-critical cases each passed 1/1, alongside format, lint, build, and 3,530 unit tests. These are software-only DOM/browser checks. Actual screen-reader speech, complete scene text alternatives, and physical device/assistive-technology acceptance remain unverified; UX-05 and the physical gates remain open.


The combined focused UX-05 scene-text/selection-status and timeline-key checks then passed 2/2 in Chromium and 2/2 in WebKit-critical on the updated tree. This remains software-only keyboard/DOM evidence; screen-reader speech and physical device acceptance are still unverified.


## Dynamic timeline-key context follow-up — 2026-10-12

[`PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md`](PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md) now also records a keyboard-only check that switches the animation key property from translation to scale and back. The timeline group and marker names update with the active property; Enter changes the scale marker's `aria-pressed` state, and returning to translation clears the stale selected state. The decoded saved backup retains both authored tracks and their values. The focused Chromium run using `/usr/bin/chromium` and WebKit-critical run each passed 1/1. This is software-only DOM/keyboard evidence; actual screen-reader speech, complete scene alternatives, and physical-device/assistive-technology acceptance remain open.


## Timeline selection-context announcement follow-up — 2026-10-12

A focused UX-05 software slice adds a separate `aria-live="polite"` selection status for the active clip, target object name/ID, property and selected key time. Property changes, key selection and selection clearing update the status. The continuously refreshed playback/time status is explicitly `aria-live="off"` to avoid per-frame announcements. The focused keyboard-only test passed in system Chromium and WebKit-critical (1/1 each); the complete `native-animation-product.spec.ts` suite passed 7/7 in each browser, and `npm run test:ci-scope` passed 8/8. All 3,530 unit tests, lint (zero errors; one existing viewport Hook warning), formatting, and the production build passed.

This is DOM/status evidence, not actual screen-reader speech or assistive-technology acceptance. VoiceOver/TalkBack, physical-device/keyboard/touch, contrast and real browser/OS zoom remain unverified. UX-05, 3D-STAGE4-04 and physical accessibility gates remain open; this follow-up does not change any acceptance status to pass.


## Timeline key-action announcement follow-up — 2026-10-12

[`PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md`](PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md) now records a separate polite, atomic live status for successful timeline-key add, edit, duplicate, and delete actions. Each message includes clip, target name/ID, property, and affected time(s); existing error output remains a `role="alert"`, with no success announcement on failure. The continuously updated playback/time status remains `aria-live="off"`.

The keyboard-only workflow verifies all four action messages, updated key-list content, revision changes and saved-backup values. The complete animation product E2E suite passed 7/7 in system Chromium and 7/7 in WebKit-critical. Full unit tests passed 3,530/3,530, CI-scope classification passed 8/8, formatting and production build passed, and lint had zero errors plus the existing `NativeViewportPanel.tsx:195` Hook warning. The build retains its existing non-blocking >500 kB chunk advisory.

A follow-up failure-path assertion rejects a keyboard duplicate at an already occupied key time. It verifies the existing alert guidance, cleared success-status text, unchanged revision, and retained key marker. This is still DOM/headless-browser evidence only; no assistive-technology acceptance is implied.

This adds headless DOM/status evidence only. Actual screen-reader speech, VoiceOver/TalkBack, full scene alternatives, physical keyboard/device/touch, contrast and real browser/OS zoom remain unverified. UX-05, 3D-STAGE4-04, and physical accessibility gates remain partial/open; no acceptance status is promoted.


## Timeline-key update-collision recovery follow-up — 2026-10-12

[`PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md`](PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md) records the focused keyboard E2E extension: after recovering from a failed duplicate, updating a selected key onto another occupied time must restore the alert without success text or a revision change, while both original keys and the selected-key state remain intact. The focused workflow passed in Chromium and WebKit-critical (1/1 per project). This is software-only headless evidence; actual screen-reader speech, assistive technology, and physical-device acceptance remain open.


## Viewport camera shortcut IME/modifier regression follow-up — 2026-10-12

[`PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md`](PRODUCT_CANVAS_TEXT_ALTERNATIVES_2026-10-11.md) records five synthetic keyboard-event probes for `isComposing`, legacy key code 229, and Ctrl/Meta/Alt modifiers. Each remains unprevented, leaves the camera unchanged, and preserves the decoded project backup; the focused run passed 2/2 across Chromium and WebKit-critical, and the full viewport product E2E passed 38/38. This is a software-only DOM check, not trusted physical input or real OS/IME behavior. Actual screen-reader speech, assistive technology, contrast, real browser/OS zoom, and physical-device acceptance remain unverified; UX-05 and 3D-STAGE4-04 remain partial/open.


## Shared 3D workspace text-contrast measurements — 2026-10-12

[`PRODUCT_CONTRAST_MEASUREMENTS_2026-10-12.md`](PRODUCT_CONTRAST_MEASUREMENTS_2026-10-12.md) records computed foreground/background pairs and relative-luminance ratios for ten representative shared-shell text styles in Chromium and WebKit-critical. The disabled-button text measured 4.2774:1 against its background. The repository does not define an acceptance threshold or settle the applicability of an inactive-control exception, so this is measurement only: no pass/fail judgment, project-wide 4.5:1 standard, or product color change is claimed. The focused browser probes passed in both engines; UX-05, 3D-STAGE4-04, contrast acceptance, and physical accessibility gates remain open.


## Project-library confirmation focus return — 2026-10-12

[`PRODUCT_LIBRARY_CONFIRM_FOCUS_2026-10-12.md`](PRODUCT_LIBRARY_CONFIRM_FOCUS_2026-10-12.md) records a keyboard-only UX-04 follow-up: cancelling the inline project-library confirmation now returns focus to its initiating trash/restore or recovery-candidate button, with the existing 3px focus outline intact. Before the fix, the new trash-confirmation test failed in both Chromium and WebKit-critical because the removed confirmation button left focus inactive. The complete `native-library-product.spec.ts` product suite passed 26/26 across both engines after adding cancellation checks for both entry points.

This is headless DOM-focus evidence only, not actual screen-reader speech, VoiceOver/TalkBack, physical keyboard/pointer/device use, browser/OS zoom, contrast acceptance, or WCAG conformance. UX-04/UX-05 and physical accessibility gates remain partial/open; no acceptance status is promoted.


## Project-library focus return in production preview — 2026-10-12

The two keyboard cancellation flows were also exercised against the production preview using `playwright.production.config.ts`; 6/6 selected checks passed across Chromium and WebKit-critical, including both new library cases and the existing object-deletion focus case. This remains browser-emulated DOM-focus evidence. Screen-reader speech, physical keyboard/pointer/device behavior, actual browser/OS zoom, contrast acceptance, and WCAG conformance remain unverified; UX-04/UX-05 and physical accessibility gates remain partial/open.


## AC-07 product viewport owner release repeat — 2026-10-12

[`AC07_PRODUCT_VIEWPORT_LIFETIME_2026-10-12.md`](AC07_PRODUCT_VIEWPORT_LIFETIME_2026-10-12.md) records a new product-UI browser slice aligned with `LIFE-04` and the 20-cycle browser portion of `PERF-06`: two saved works are alternated 20 times, with one viewport canvas after each open and an API-level WebGL2 context-creation / explicit-loss-request count. The focused case passed 1/1 in system Chromium and 1/1 in WebKit-critical; the complete viewport product spec passed 46/46 across both projects. The full unit suite passed 3,531/3,531; formatting, build and lint (zero errors; one existing Hook warning) passed.

This confirms browser API calls only. It does not measure GPU-driver memory, render-loop/worker/Object URL accumulation, import/export cancellation, product context-loss recovery/latest-revision resume, or background/OS discard. AC-07, LIFE-04 and PERF-06 remain partial/open; no acceptance pass is claimed.


## AC-13 product update chunk failure retry — 2026-10-12

[`AC13_UPDATE_CHUNK_RECOVERY_2026-10-12.md`](AC13_UPDATE_CHUNK_RECOVERY_2026-10-12.md) records the missing combined product-browser slice: after a changed build is reported, a dirty project is saved by the explicit update reload, the reloaded `Editor3DShell` chunk receives a synthetic HTTP 404, and a manual retry reopens the same saved project with its changed name and persisted revision. Focused cases passed in Chromium and WebKit-critical on the dev server (1/1 each) and Chromium production preview (1/1); the full diagnostics product spec passed 24/24 across Chromium and WebKit-critical. Unit tests passed 3,531/3,531; format, lint (zero errors; one existing Hook warning), and build passed.

The 404 is Playwright-injected, not an actual stale CDN/HTML deployment. Service Worker/browser/CDN cache residue, real offline-to-network reconnection, OS discard and physical-device recovery remain untested. AC-13 and B10 remain partial/open; no acceptance pass is claimed.


## DATA-07 product object deletion dependency preview — 2026-10-12

[`PRODUCT_OBJECT_DELETION_DEPENDENCIES_2026-10-12.md`](PRODUCT_OBJECT_DELETION_DEPENDENCIES_2026-10-12.md) adds a dependency-rich product-browser check for the explicit descendant deletion flow. The confirmation reports four nodes, one last-used mesh and skin, one animation track/two keys, one anchor and one collider; cancellation leaves the decoded project unchanged. After confirmation, the track is removed while the clip identity remains, and material/source metadata/original image bytes are preserved. Full decoded project and blob-map comparisons cover Undo/Redo. The focused library product suite passed 28/28 across Chromium and WebKit-critical; unit 3,531/3,531, formatting, lint (zero errors; one existing Hook warning) and app/H3 build passed.

This is automated headless evidence against generated fixtures only. DATA-07 remains partial: no human review, deployed-runtime, physical-device, or broader real-project acceptance is claimed.


## SAVE-05 / AC-06 product cross-tab durable preservation — 2026-10-12

[`SAVE05_CROSS_TAB_DURABLE_PRESERVATION_2026-10-12.md`](SAVE05_CROSS_TAB_DURABLE_PRESERVATION_2026-10-12.md) strengthens the product-level lease-takeover case. The new owner adds geometry and saves revision 2; the stale page's conflicting rename is rejected without losing its dirty state and is saved as a separate project ID. A third page opens the original read-only and its downloaded full project/blob backup equals the new owner's pre-conflict durable backup, independently checking that the original root was not silently overwritten. The focused test passed 1/1 in Chromium and WebKit-critical; the full spec had 10 passes and 2 existing project skips. Unit 3,531/3,531, formatting, lint (zero errors; one existing Hook warning), and app/H3 build passed.

This is headless same-context browser evidence only. Process/OS crash, clock skew, lease-expiry timing, physical storage failure and devices remain unverified; SAVE-05/AC-06 and overall acceptance remain partial/open.


## IMP-07 worker failure payload privacy hardening — 2026-10-12

[`IMP07_WORKER_FAILURE_PRIVACY_2026-10-12.md`](IMP07_WORKER_FAILURE_PRIVACY_2026-10-12.md) records the finite safe worker-error categories, 6/6 focused import regression E2Es, full asset-I/O product E2E success in Chromium/WebKit-critical, and full unit 3,536/3,536. The first hosted run on the implementation commit passed build-and-test and asset-I/O E2E but reached two stale quality-worker E2E expectations: the existing formatter/unit contract returns bounded `EDIT_QUALITY_WORKER`, while that older test still expected `EDIT_UNKNOWN`. The E2E now checks the established safe code/message/action, excludes private text, and verifies backup preservation; the exact two-browser case passed 2/2 locally. Hosted CI for this expectation correction is pending. Formatting, lint (zero errors; one existing Hook warning), typecheck, and app/H3 build passed; existing chunk advisory remains.

IMP-07 and overall acceptance remain partial: unclassified exceptions and genuine worker startup/crash/communication failures remain generic, and full cause/stage-specific guidance is incomplete. No browser-injected worker crash, external telemetry, deployed runtime, physical device, GPU, OS crash/discard, real network/cache, or overall acceptance pass is claimed. Do not infer a hosted rerun pass from the local E2E.

## QA-05 product quality inspection background / late result — 2026-10-12

[`QA05_QUALITY_BACKGROUND_LATE_RESULT_2026-10-12.md`](QA05_QUALITY_BACKGROUND_LATE_RESULT_2026-10-12.md) records a product-browser test that holds a completed inspection worker result, simulates the hidden-page event, verifies cancellation, replays the old result without showing a stale report, then restores visibility and confirms a fresh inspection succeeds. The complete quality-product spec passed 12/12 across Chromium and WebKit-critical (six per project); the focused case passed in both. TypeScript, focused lint, formatting, and diff checks passed. The existing worker-startup case now expects PR #371's fixed `[EDIT_QUALITY_WORKER]` guidance while still proving path/message suppression and project/blob backup preservation.

This is synthetic browser visibility/result-delay evidence, not OS-level backgrounding, freeze/suspension, or physical-device verification. QA-05 and overall acceptance remain partial/open; no real external runtime, GPU, OS-crash, real network/cache, or final-head CI result is claimed, and CI was not monitored.


## GAME-02 product-authored animated anchor consumer handoff — 2026-10-12

[`GAME02_PRODUCT_ANIMATED_ANCHOR_CONSUMER_2026-10-12.md`](GAME02_PRODUCT_ANIMATED_ANCHOR_CONSUMER_2026-10-12.md) adds a product-UI-to-export-to-independent-consumer check. A bone-following anchor authored with local offset `[0.25, 0.5, 0]` is verified at world `[0.25, 1.5, 0]` at rest and `[1.25, 1.5, 0]` at the one-second animation endpoint after downloading the actual GLB and sidecar. The focused product handoff test passed 1/1 in Chromium and WebKit-critical; existing mixed-skin and rigid attachment checks remain active. TypeScript, focused lint, formatting, and diff checks passed.

This covers the repository's Babylon CPU consumer only, not every external engine/runtime, GPU rendering, deployed runtime, or physical device. GAME-02 and overall acceptance remain partial/open; CI was not monitored.
