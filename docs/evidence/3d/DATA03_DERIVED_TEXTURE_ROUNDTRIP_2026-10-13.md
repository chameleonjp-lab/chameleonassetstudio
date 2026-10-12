# DATA-03 product-derived texture survives independent backup and re-export — 2026-10-13

## Scope

This software-only product E2E closes a distinct DATA-03 evidence gap between the existing texture-editing tests (which retain source bytes through undo/recovery) and the existing multi-source export-provenance case. It exercises one end-to-end path:

1. Create a product-authored 3D box, import the repository's self-authored 2×2 PNG fixture through the image/UV UI, and record a declared source note.
2. Create a derived base-color PNG by applying a red linear gain of `0.25`.
3. Download a `.cas3dproj` backup and verify that the original and derived files have different SHA-256 identities; the original exact bytes remain present; and the derived source records the original source ID/hash, operation `baseColor-linear-adjustment`, version `1`, settings, and inherited rights note.
4. Restore that backup in a new browser context. Verify that the source records and the exact original and derived bytes survive the independent restore.
5. Use the product UI to create and download the actual GLB and `game.json`. Verify that the GLB embeds the exact derived PNG bytes, the sidecar's model hash matches the GLB, and its provenance sources equal the restored project source records.
6. Load those exact downloaded GLB and sidecar bytes in a separate browser context running the repository's Babylon consumer. Verify Babylon.js `9.28.0`, a passing position oracle, a loaded 2×2 texture, and no external network requests.

The case is `e2e/native-consumer.spec.ts`, titled `DATA-03 product-derived texture preserves original bytes and lineage through independent backup, GLB export, and consumer`.

## Local evidence

- Focused final case: Chromium 1/1 and WebKit 1/1.
- Complete `native-consumer.spec.ts`: Chromium 14/14 and WebKit 14/14; the focused final case was rerun in both browsers after the lint-only guard correction.
- `npm run test`: 3,543 tests passed across 186 files.
- `npm run format:check`: passed.
- `npm run lint`: zero errors; one existing `NativeViewportPanel.tsx:205` React Hook warning remains.
- `npm run build`: TypeScript check, app build, and H3 build passed. The existing advisory for chunks larger than 500 kB remains.
- `npm run test:ci-scope`: 8/8 passed; classification remains test-only/non-publishing.
- `git diff --check`: passed.

Remote CI was not monitored.

## Limits and status

This is one small, self-authored PNG and one derived adjustment. It does not establish arbitrary image-format conversion, multi-generation derivation, preservation under every import/export route, an external third-party runtime, production deployment, physical-device behavior, OS/process recovery, GPU resource behavior, or whole-product acceptance. The Babylon consumer is the repository's separately served consumer build, not a claim of universal engine interoperability. The declared fixture rights string is test data, not a legal determination.

DATA-03 and overall acceptance remain **implemented-candidate / partial**. This evidence closes only the local derived-texture → independent-backup → actual-product-export → repository-consumer slice.
