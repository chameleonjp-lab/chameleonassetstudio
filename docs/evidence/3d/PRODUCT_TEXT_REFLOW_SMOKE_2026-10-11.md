# Product narrow-viewport and enlarged-root-text smoke — 2026-10-11

## Scope

`e2e/native-viewport-product.spec.ts` adds `material panel reflows at 320 CSS px with 200% root text-size simulation`. It opens the material/UV panel at a 320 × 900 CSS-pixel viewport, sets only the document root font size to 200% (computed 32 px), and checks that the document and panel do not overflow horizontally, the panel and visible text-bearing controls stay within the viewport, and the import action remains at least 44 CSS pixels tall.

The test also checks that the image file input describes both its import guidance and a polite live status. It verifies the initial “画像ファイル未選択” text and the updated “選択中: sample-texture.png” text after Playwright selects a test file. The fixture bytes are not decoded or imported; the OS file-picker UI is not opened.

The production adjustments reduce narrow-screen editor/card and material-panel spacing, let the native authoring fields collapse to a single adaptive column, constrain the texture fieldset/file control, keep the picker button visible while avoiding a clipped browser-generated filename tail, and expose the selected filename separately through the linked live status.

## Verification

- Targeted test: Chromium 1/1 and WebKit-critical 1/1 passed.
- Final selected accessibility matrix: 18/18 passed across Chromium and WebKit-critical with one worker. This includes keyboard authoring/focus visibility, cancellation, animation-key editing, reduced-motion behavior, GLB export/import and preview cancellation, canvas text alternatives, and this reflow/status case.
- `npm run lint`: zero errors; one pre-existing warning remains in `NativeViewportPanel.tsx:195`.
- `npm run format:check`, `npm run build`, and `git diff --check`: passed.
- `npm test`: 3,530/3,530 passed.
- A temporary Chromium viewport capture during implementation was visually inspected after the picker/status adjustment; it is not a release or physical-device artifact.

## Boundaries

The 200% root-font-size emulation is not actual browser/page zoom, OS text scaling, or a complete WCAG reflow/zoom assessment. No contrast threshold was specified or measured. This does not verify screen-reader speech, native OS picker operation, mobile hardware, physical keyboards, assistive technology, or physical-device acceptance. It adds limited software evidence for UX-05/UX-06 and does not close those requirements or Stage 4-04.
