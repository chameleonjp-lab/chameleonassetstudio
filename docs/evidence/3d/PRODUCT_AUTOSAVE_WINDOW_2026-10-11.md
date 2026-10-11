# Product first-dirty-to-persisted measurement — 2026-10-11

## Scope and boundary

Manual-only Playwright rehearsal against the local **Vite production preview** on headless Linux. Each of 20 trials per engine applies one numeric transform to the product project. The start is the first animation-frame observation where `.editor3d-save-status` enters its dirty state. The end is the first frame where the accessible save label reports **保存済み · revision N** and the edited and persisted revision numbers match. This is the product-visible acknowledgment of `SaveQueue`'s durable commit revision, not merely the scheduling of autosave.

After the timed window, the harness compares the downloaded current-project backup with the separate **保存済みの版をバックアップ** output. They matched exactly at the canonical project-object level in both browser runs; the final persisted revision also matched the editor revision.

## Results

| Browser | Version | Samples | Median | Maximum | p95 | Window and state |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Chromium | 151.0.7922.34 | 20 | 866.7 ms | 916.6 ms | Not reported — fewer than 100 samples | 21,062 ms; foreground; no freeze observed |
| WebKit | 26.5 | 20 | 815 ms | 935 ms | Not reported — fewer than 100 samples | 22,907 ms; foreground; freeze state unknown |

Fixture SHA-256 (project JSON): Chromium `ccd1bf92daf4078523e457cf2c23af9e516ab0682c9eda80b6fe312e37ca1a1f`; WebKit `50f969a2bb1fc4664e85487795b4a5db90501c1d9439d02d573807a554d54bb3`. Each engine used an independently created project; do not treat this as a paired engine comparison.

## Interpretation and limits

The observed interval includes the product's autosave debounce, storage work, and the frame at which the durable revision is reflected in the accessible UI. It is consistent with, but does not independently establish, a performance target for the configured 800 ms autosave delay. p95 is withheld because `n=20`; no B09 numerical budget or pass/fail verdict is set. `physicalAcceptance` is `false`. This headless run does not cover backgrounding, OS termination, storage quota failure, physical-device latency, or the maximum unsaved-loss window during continuous edits.

Source commit recorded in both raw files: `e975f76c02088ab5fb5738c9d782e51a7b4bca3e`, with `dirty: true` because the local follow-up harness/package work was present. The product application source was not changed by this measurement branch.

## Evidence files

- [Chromium raw record](PRODUCT_AUTOSAVE_WINDOW_2026-10-11_chromium.json) · [final UI screenshot](PRODUCT_AUTOSAVE_WINDOW_2026-10-11_chromium.png)
- [WebKit raw record](PRODUCT_AUTOSAVE_WINDOW_2026-10-11_webkit.json) · [final UI screenshot](PRODUCT_AUTOSAVE_WINDOW_2026-10-11_webkit.png)
- Re-run with `npm run test:product-autosave-window`; optional controls: `PRODUCT_AUTOSAVE_WINDOW_RUNS`, `PRODUCT_AUTOSAVE_WINDOW_BROWSER`, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
