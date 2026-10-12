# 3D viewport target-size software smoke — 2026-10-12

## Scope

`e2e/native-viewport-product.spec.ts` measures every visible button in the 3D viewport action group and camera action group using `getBoundingClientRect()`. At each responsive viewport, the test asserts that both width and height are at least **44 CSS pixels**, and that the same number of controls remains visible:

| Viewport | Layout sample |
|---:|---|
| 320 × 568 CSS px | Narrow portrait |
| 390 × 844 CSS px | Portrait |
| 844 × 390 CSS px | Landscape |

A JSON measurement record is attached to the Playwright test result. The acceptance threshold comes from [`3D_UI_UX_SPEC.md` §6](../../future/3d/3D_UI_UX_SPEC.md) and [`THREE_D_PRODUCT_REQUIREMENTS_2026-10-03.md` §16, UX-06](../../THREE_D_PRODUCT_REQUIREMENTS_2026-10-03.md).

This supplements the existing phone-width checks for the zoom and image-import controls; it covers the complete visible set of viewport and camera action buttons. It does not change product code or activate the measured controls.

## Local verification

| Check | Result |
|---|---|
| New target-size case | 2/2 passed across Chromium and WebKit-critical |
| Full `e2e/native-viewport-product.spec.ts` | 44/44 passed across Chromium and WebKit-critical, one worker |
| `npm run lint` | 0 errors; one existing React Hook warning at `NativeViewportPanel.tsx:205` |
| `npm run format:check` | Passed |
| `npm run build` | App and H3 builds passed; existing large-chunk advisory remains |
| `npm test` | 3,530/3,530 passed across 185 files |
| `git diff --check` | Passed |

## Boundaries

This is software-only CSS geometry evidence from browser viewport emulation. It does not test physical touch accuracy, device pixel scaling, OS/browser zoom, screen readers, or any physical device. It covers only the viewport and camera action groups, not every editor control. Physical-device accessibility and UX-06 acceptance remain open; no device-level pass is claimed.
