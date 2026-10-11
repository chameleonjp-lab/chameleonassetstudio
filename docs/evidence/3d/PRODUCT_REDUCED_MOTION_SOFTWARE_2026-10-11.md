# Headless reduced-motion software smoke — 2026-10-11

## Scope

`e2e/native-animation-product.spec.ts` emulates `prefers-reduced-motion: reduce` and verifies the computed styles of the 3D editor root: animation and transition duration are each 0.01 ms, animation iteration count is 1, and scroll behavior is `auto`. The same test starts an animation preview, changes the preference to reduced motion, confirms the preview returns to its stop pose without mutating the decoded project, verifies explicit playback can still be requested, then stops it. The project backup remains equal to the baseline.

## Local verification

- Chromium: passed (5.0 s in the final 16-run matrix).
- WebKit-critical: passed (5.3 s in the same matrix).
- Both were one-worker Playwright runs using `page.emulateMedia`.

## Boundaries

This verifies the editor's CSS media rule and runtime preference handler in headless browsers; it does not validate an actual OS/browser preference setting, perceptual smoothness, every page outside `.editor3d`, contrast, zoom/text enlargement, touch, or screen-reader output. UX-06 and Stage 4-04 remain partial/blocked pending the remaining manual and physical accessibility evidence.
