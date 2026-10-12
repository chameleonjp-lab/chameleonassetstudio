# 3D shared-workspace text contrast measurements — 2026-10-12

> **Status: measurement only.** The project has not selected a contrast acceptance threshold or the applicable conformance criterion for these controls. No contrast pass/fail judgment is made here.

## Scope and method

The `shared 3D workspace text contrast is measured without assuming an acceptance threshold` case in `e2e/native-viewport-product.spec.ts` reads the rendered 3D workspace CSS through browser `getComputedStyle`. It measures representative shared-shell text, link, eyebrow, button, disabled-button, error/success/dirty-save statuses, revision text, and empty-state text against the nearest solid computed background. Ratios use the WCAG relative-luminance calculation; the test records the measurements and checks only that the computed ratios are finite, not that they meet a conformance threshold.

The focused case passed in Chromium and WebKit-critical. Both engines returned the following same computed pairs and ratios:

| Sample | Foreground | Solid background | Measured ratio |
| --- | --- | --- | ---: |
| Base text | `rgb(32, 51, 43)` | `rgb(241, 245, 242)` | 12.1563:1 |
| Link | `rgb(21, 92, 68)` | `rgb(241, 245, 242)` | 7.2115:1 |
| Eyebrow | `rgb(65, 97, 79)` | `rgb(255, 255, 255)` | 6.8908:1 |
| Enabled button | `rgb(33, 75, 54)` | `rgb(241, 247, 243)` | 9.1033:1 |
| Disabled button | `rgb(104, 118, 110)` | `rgb(241, 243, 242)` | 4.2774:1 |
| Error status | `rgb(128, 51, 21)` | `rgb(255, 244, 237)` | 8.0822:1 |
| Success status | `rgb(23, 87, 54)` | `rgb(237, 247, 239)` | 7.8075:1 |
| Dirty save status | `rgb(119, 63, 15)` | `rgb(255, 244, 222)` | 7.6918:1 |
| Revision text | `rgb(83, 102, 90)` | `rgb(241, 245, 242)` | 5.5865:1 |
| Empty-state text | `rgb(83, 102, 90)` | `rgb(245, 247, 245)` | 5.7100:1 |

## Interpretation and limits

- The disabled-button measurement is **4.2774:1**. It is recorded without calling it a failure or a pass. The project must first choose its applicable contrast criterion and decide whether any inactive-control exception applies before this value is used for acceptance.
- No project-wide `4.5:1` standard was adopted, and no color was changed as part of this measurement-only follow-up.
- This is not an exhaustive audit: component-specific styles, non-text boundaries/icons, focus indicators, gradients, canvas/WebGL content, overlays, and visual perception are outside the measured sample set.
- Browser computed-style measurements do not establish real browser/OS zoom, screen-reader behavior, physical-device acceptance, or physical display contrast.
- UX-05, 3D-STAGE4-04, and the physical accessibility gates remain open. This record does not promote any acceptance status to pass.
