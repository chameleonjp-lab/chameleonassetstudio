# EXP-03 pre-export unused-vertex disclosure — 2026-10-12

## Scope and observed behavior

`e2e/native-asset-io-product.spec.ts` now restores a generated native-box backup containing one extra vertex that no face references. Before export, the product review names the exact loss (`unused-vertices-omitted`) and states that the editable vertex structure remains in the native backup while `game.json` does not carry geometry. The export acknowledgement starts unchecked, the package button is disabled, and no asset-I/O worker starts before acknowledgement. After acknowledgement, the test decodes the actual GLB position accessor and confirms that `[4, 5, 6]` is omitted; a downloaded native backup still contains the exact vertex ID and position.

This extends existing generic acknowledgement coverage with one concrete, byte-level loss case. It does not claim every export transformation or every warning is fully summarized.

## Local evidence

- Focused loss case: Chromium 1/1 and WebKit-critical 1/1.
- Full Chromium `native-asset-io-product.spec.ts`: 16 passed, 3 failed. The three failures expect format-specific import messages but receive the inherited generic `[IO_WORKER]` fallback. The same three cases failed again when run serially with `--workers=1`, so this was not reported as parallel-only flakiness. The current worker wrapper posts one fixed failure code for caught worker errors; this EXP-03 change does not modify that path. The chained run stopped before the complete WebKit asset-I/O suite, so that suite is **not reported as passed**.
- TypeScript, Prettier check, app/H3 production builds: passed.
- ESLint: zero errors; the existing `NativeViewportPanel.tsx:205` Hook warning remains. The build retains its existing non-blocking >500 kB chunk advisory.
- Full Vitest suite: 3,534 tests across 185 files passed.

## Limits

The fixture is synthetic, and this proves only the reported unused-vertex omission path. Complete loss coverage—including byte-dependent image/alpha outcomes, every exporter transformation, and the distinction between all outputs—remains open. Actual external runtimes, production, and physical-device acceptance are not covered. EXP-03 and overall acceptance remain partial. CI was not monitored.
