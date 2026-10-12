# EXP-10 cross-format restore rejection — 2026-10-12

## Scope and observed behavior

The browser case builds a stored ZIP from the repository's v0.1.0 2D `.casproj` project, asset, and PNG fixtures, then selects those bytes through the native 3D `.cas3dproj` restore control. The same 2D fixture files are covered by the existing `storage.fixtures.test.ts` import/migration/round-trip contract. The test separately generates and reimports a valid native 3D backup, restores it through the 3D UI, and reloads so a saved project is present before the negative case.

The native backup parser rejects the 2D archive as `Unsupported backup path`. Storage-target error handling now maps that bounded known error (and the known unsupported-version/incomplete-backup variants) to the existing fixed `EDIT_STORAGE_BACKUP` guidance, which asks for a compatible `.cas3dproj`; unrelated editing targets remain unchanged. The browser confirms that guidance appears, the already-saved 3D project remains in the library, and the 2D fixture project is not created.

## Local evidence

- EXP-10 focused E2E: Chromium 1/1 and WebKit-critical 1/1.
- Full `native-legacy-backup-product.spec.ts`: Chromium 2/2 and WebKit-critical 2/2.
- New storage error-mapping unit: 1/1; full Vitest suite: 3,535 tests passed across 185 files.
- TypeScript, formatting check, app/H3 production builds: passed. ESLint: zero errors; existing `NativeViewportPanel.tsx:205` Hook warning remains. The build retains its existing non-blocking >500 kB chunk advisory.

## Limits

This covers one 2D legacy fixture sent to the 3D native-backup restore path. It does not verify all cross-format pairs (including 3D asset packages and manifest imports), every legacy version, all malformed inputs, external consumers, production, or device acceptance. EXP-10 and overall acceptance remain partial. CI was not monitored.
