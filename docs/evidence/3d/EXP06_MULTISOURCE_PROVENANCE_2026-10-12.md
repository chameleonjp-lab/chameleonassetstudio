# EXP-06 multi-source provenance in final package — 2026-10-12

## Scope and observed behavior

A browser product test restores a generated native backup whose paired sidecar contains two distinct ancestor source records, each with different user-declared and embedded rights text. The current project also carries its reimported GLB and paired sidecar as separate sources with their own declarations. The product UI generates and downloads the final package; the test inspects actual `game.json` and `manifest.json` bytes.

The final sidecar preserves both current source records and both ancestor source records without collapsing their declarations, and retains `claims: "user-declared-not-verified"`. The manifest identifies the 3D asset package and its recorded byte lengths and SHA-256 values match the actual GLB and sidecar in the ZIP. This verifies a single paired-sidecar ancestry level with multiple source entries; it is not a legal clearance determination.

## Local evidence

- Focused product case: Chromium 1/1 and WebKit-critical 1/1.
- Full Chromium `native-asset-io-product.spec.ts`, serial run: 17 passed, 3 failed. The same three existing import-error cases receive generic `[IO_WORKER]` instead of the expected format-specific messages; they had also reproduced in an isolated serial run. The inherited worker failure path is unchanged by this EXP-06 slice. The full WebKit asset-I/O spec was not run; only the focused case is claimed.
- TypeScript, Prettier check, app/H3 production builds, and full Vitest suite: passed (3,534 tests across 185 files).
- ESLint: zero errors; existing `NativeViewportPanel.tsx:205` Hook warning remains. Build retains the existing non-blocking >500 kB chunk advisory.

## Limits

The sources and rights statements are synthetic. This checks metadata preservation for one ancestry level; it does not establish legal permission, source-byte availability for every ancestor, arbitrary multi-generation-chain behavior, all package consumers, production, or physical-device acceptance. EXP-06 and overall acceptance remain partial. CI was not monitored.
