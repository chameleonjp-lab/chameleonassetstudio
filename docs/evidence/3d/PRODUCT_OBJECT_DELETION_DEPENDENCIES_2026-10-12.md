# DATA-07 object deletion dependency preview — 2026-10-12

**Status: partial software-only browser evidence; not an acceptance pass.**

## Scope

The product E2E now exercises the explicit descendant-deletion path on a dependency-rich project fixture: one box mesh, a two-joint skin, one animated track with two keys, one joint-following anchor, one node-following collider, one material, and retained image-source bytes. The user-visible confirmation is checked before applying deletion, and cancellation is verified to leave the full project unchanged.

After confirmation, the downloaded and decoded backup verifies that the four selected hierarchy nodes, last-used mesh and skin, related track, anchor, and collider are removed; the clip identity remains with an empty track list; material, source metadata, blob IDs, and exact original image bytes remain. Undo and Redo are compared against the complete original/deleted decoded project and blob maps, allowing only the expected revision value to differ.

Test: [`e2e/native-library-product.spec.ts`](../../../e2e/native-library-product.spec.ts) — `object deletion previews linked dependencies and preserves originals through cancel and Undo/Redo`.

## Local verification

- Full `native-library-product.spec.ts`: 28/28 across Chromium and WebKit-critical.
- Unit tests: 185 files / 3,531 tests passed.
- `npm run format:check`: passed.
- `npm run lint`: 0 errors; one existing `NativeViewportPanel.tsx:205` React Hook warning.
- `npm run build`: app and H3 builds passed; existing >500 kB chunk advisory remains.

## Limits

This is automated headless-browser evidence against generated fixtures. It does not establish user-created complex project coverage, deployed-runtime behavior, physical-device rendering, or human visual acceptance. DATA-07 and overall 3D acceptance remain partial/open; no acceptance pass is claimed.
