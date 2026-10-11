# Product cancel-to-canonical-unchanged measurement — 2026-10-11

## Scope and boundary

Manual-only Playwright rehearsal against the local **Vite production preview** on headless Linux; this is product-UI evidence, not a CI or physical-device acceptance run. Each run begins with a canonical project backup, starts a numeric transform preview, and measures from the capture-phase click on **数値変形を取り消す** to the first subsequent `requestAnimationFrame` observation of the product cancellation notice.

At every completion the product revision is asserted unchanged. Outside the timed interval, the rehearsal downloads and decodes a `.cas3dproj` backup and checks the full canonical `project` object against the pre-draft baseline. All 20 samples per engine passed both checks. Backup download/ZIP work is deliberately excluded from the latency interval.

## Results

| Browser | Version | Samples | Median | Maximum | p95 | Window and state |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Chromium | 151.0.7922.34 | 20 | 12.7 ms | 15 ms | Not reported — fewer than 100 samples | 6,477 ms; foreground; no freeze observed |
| WebKit | 26.5 | 20 | 7 ms | 16 ms | Not reported — fewer than 100 samples | 10,435 ms; foreground; freeze state unknown |

Fixture SHA-256 (project JSON): Chromium `824797d6670bafb7220058abcaf8c33e525b6d68d89121a2964b2216fcdf115b`; WebKit `376f93781c0e1e6f023cf4e73132ce456863383c5f234377fbf825aaeac75172`. The browser runs used independently created projects, so these values are not a paired cross-engine comparison.

## Interpretation and limits

The metric ends at the next animation-frame poll that observes the UI notice; it is not GPU completion, compositor presentation, input-to-photon latency, or the duration of an IndexedDB write. The full-project equality check is a correctness assertion after timing, not a timed export. The records intentionally retain raw samples and withhold p95 because `n=20`. No numeric B09 budget or pass/fail verdict is set. `physicalAcceptance` is `false`.

Source commit recorded in both raw files: `e975f76c02088ab5fb5738c9d782e51a7b4bca3e`, with `dirty: true` because the local follow-up harness/package work was present. The product application source was not changed by this measurement branch.

## Evidence files

- [Chromium raw record](PRODUCT_CANCEL_CANONICAL_2026-10-11_chromium.json) · [final UI screenshot](PRODUCT_CANCEL_CANONICAL_2026-10-11_chromium.png)
- [WebKit raw record](PRODUCT_CANCEL_CANONICAL_2026-10-11_webkit.json) · [final UI screenshot](PRODUCT_CANCEL_CANONICAL_2026-10-11_webkit.png)
- Re-run with `npm run test:product-cancel-canonical`; optional controls: `PRODUCT_CANCEL_RUNS`, `PRODUCT_CANCEL_BROWSER`, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
