# Explicit 2D PNG to 3D material copy

Local baseline: `feebe3da752bc11091f0160eb38eae0ab893dec8`. Source archive SHA-256: `c4855888164fd9f4678dee8601054bb0a06fb6aede29dbf24bd12632227a7cbd`.

COMPAT-06 scope: five paths. The existing PNG/JPEG picker receives a concise handoff explanation: export PNG in 2D, select the target 3D material, import explicitly, retain the 2D original, and repeat export/import for later changes. Existing 2,048px limits, original-source retention and explicit application remain in force. No shared runtime/storage/model service, new dependency or format is introduced.

## Added product regression

The existing native-texture product suite now includes a self-created 32×32 opaque-color fixture drawn and exported through the 2D UI. The actual downloaded PNG is checked for dimensions and RGBA values. Only that file crosses into a new, independent browser context where the existing 3D UV-quad fixture explicitly applies it to the selected material.

Assertions cover no material change before explicit application; source hash, exact exported bytes and declared rights; unchanged mesh/UV data; visible image-preview color; and a later different-color 2D export leaving the already-imported 3D source unchanged. A uniform color fixture is not an orientation, complex alpha, animation or model-conversion test.

## Verification status

Final TypeScript no-emit, targeted ESLint, Prettier and whitespace checks passed. Playwright collected 20 native-texture cases across Chromium/WebKit, including the new bridge case once per engine. Independent read-only review found no additional P1/P2. The committed-source build is recorded separately. Browser execution is not retried under the existing restriction. A collected test and explanatory UI copy do not establish a passed end-to-end bridge; physical interaction and the new regression remain unverified until an authorized browser/CI run executes them. The older fixed acceptance ledger is preserved unchanged.

This is a local, unpublished candidate; no remote/main completion is claimed.
