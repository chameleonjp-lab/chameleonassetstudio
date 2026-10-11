# Product continuous-edit autosave checkpoints — 2026-10-11

## Scope and boundary

Manual-only Playwright rehearsal against the local **Vite production preview** on headless Linux. Each engine completed five bursts of 20 product numeric commits. Apply-click gaps were captured from the page and stayed below the configured 800 ms debounce in every burst, so autosave was exercised while edits continued rather than after an idle debounce interval.

The `autosave-window` samples start at the first animation-frame observation of `.editor3d-save-status.is-dirty` and end at the first durable persisted-revision change observed **before the last apply click** in that burst. This first checkpoint may lag the latest editing revision; in some trials it was one revision behind. It does not mean all later edits in the burst were already durable. After each burst, the harness separately waited for the final persisted revision and compared the downloaded current-project backup with the **保存済みの版をバックアップ** project. They matched at the canonical project-object level in every trial.

`ProjectAutosave` currently uses `delayMs=800` and `maxWaitMs=5000` by default (`src/core3d/commands/autosave.ts`). The measured first-dirty-to-first-checkpoint values include the max-wait timer, durable storage work, and product UI/frame observation. The configured 5,000 ms timer is not asserted as a hard end-to-end deadline.

## Results

| Browser | Version | Bursts | Commits per burst | Maximum apply gap | First dirty → first durable checkpoint (median / max) | Last edit → final durable ack (median / max) | State |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Chromium | 151.0.7922.34 | 5 | 20 | 550.1 ms | 5,044.8 / 5,132.1 ms | 864.8 / 965.2 ms | Foreground; no freeze observed |
| WebKit | 26.5 | 5 | 20 | 535 ms | 5,084 / 5,152 ms | 873 / 967 ms | Foreground; freeze state unknown |

All ten bursts recorded a durable checkpoint before the last edit, and all ten final saved backups matched their current-project backups. The `autosave-window` series has `n=5` per engine; p95 is withheld (`insufficient-samples`). These are descriptive observations, not a performance budget or pass/fail threshold. Fixture hashes differ across engines; do not treat the results as a paired browser comparison. `physicalAcceptance` is `false`.

## Method and limits

- Product path: numeric-transform panel, production bundle served by Vite preview.
- Input cadence: 20 actual **数値変形を適用** clicks per burst, with 200 ms requested spacing; the largest observed click-to-click gap was 550.1 ms in Chromium and 535 ms in WebKit.
- Persistence boundary: observed revision change in the editor's product save indicator, then a separate final-revision and backup-equality check after the burst.
- Environment: Linux headless desktop, 1280×720 CSS px. Chromium was launched using the installed system binary; WebKit used the configured Playwright runtime. No physical devices or screen readers were exercised.
- Chromium recorded `freeze: none-observed`; WebKit recorded `freeze: unknown`. Both runs remained foreground.
- The five observations per engine do not support p95. The measurement does not establish per-edit maximum loss age, OS-termination recovery, quota behavior, background-tab behavior, device performance tiers, physical-device acceptance, or release sign-off.
- The product save implementation and storage schema were not changed by this rehearsal.

## Related recovery-test diagnostic

A separate two-worker regression batch covering `native-recovery-product`, `native-cross-domain-recovery`, `native-library-product`, and `native-diagnostics-product`, with `--repeat-each=2`, passed **96/96** tests when Chromium was explicitly pointed at the installed system binary. The initial local attempt could not launch Chromium because the pinned Playwright executable was absent; that was an environment startup failure, not a test assertion. The earlier intermittent WebKit image-preview-dialog timeout did not reproduce in this batch, but its root cause remains **undetermined**. No wait condition, timeout, retry, or expectation in that test was changed.

## Evidence files

- [Chromium raw record](PRODUCT_CONTINUOUS_AUTOSAVE_2026-10-11_chromium.json) · [final UI screenshot](PRODUCT_CONTINUOUS_AUTOSAVE_2026-10-11_chromium.png)
- [WebKit raw record](PRODUCT_CONTINUOUS_AUTOSAVE_2026-10-11_webkit.json) · [final UI screenshot](PRODUCT_CONTINUOUS_AUTOSAVE_2026-10-11_webkit.png)
- Re-run with `npm run test:product-continuous-autosave`. Optional controls: `PRODUCT_CONTINUOUS_AUTOSAVE_RUNS`, `PRODUCT_CONTINUOUS_AUTOSAVE_COMMITS`, `PRODUCT_CONTINUOUS_AUTOSAVE_PAUSE_MS`, `PRODUCT_CONTINUOUS_AUTOSAVE_BROWSER`, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
