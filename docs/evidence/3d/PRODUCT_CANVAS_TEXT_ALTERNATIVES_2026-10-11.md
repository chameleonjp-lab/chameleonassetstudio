# Headless viewport text alternatives smoke — 2026-10-11

## Scope

`e2e/native-viewport-product.spec.ts` adds `3D viewer and active-object selector expose text alternatives for canvas information`. The test creates a native box fixture and verifies that the viewport group exposes the project-specific accessible name `Native box workの3D表示`, links `aria-describedby` to visible Japanese guidance containing keyboard-operation instructions and the scope of PNG output, and that the `制作オブジェクト` selector links to a text description naming the current active box and ID. It also confirms that the visible `3D表示中` state is exposed through a `role="status"` element rather than color alone. The `3D部品の組立` region is checked for its heading, semantic list/list item, list-level `aria-describedby` target with selection-count guidance, and a checked, accessibly named active object entry exposing object ID and parent text. The linked selection-count paragraph is now also `role="status"` with `aria-live="polite"` and `aria-atomic="true"`; the keyboard-only Tab/Space test verifies the live region text changes on deselection and reselection.

The covered text is limited to interaction guidance, selected-object identity, selection count, immediate parent, and display status; the semantic assembly list is not a complete textual representation of canvas geometry or the full scene hierarchy.

## Local verification

The targeted Playwright test passed in Chromium using `/usr/bin/chromium` through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and in WebKit-critical. Both runs used one worker.

## Boundaries

This verifies DOM semantics and updated live-region text in headless desktop browsers, not that a screen reader actually speaks the update. It does **not** test actual screen-reader speech, VoiceOver, TalkBack, physical devices/keyboards, touch, or whether a user can understand the complete visual scene without a canvas. This partial UX-05 smoke does not complete 3D-STAGE4-04 or close any physical accessibility gate.


## Timeline key marker accessibility follow-up — 2026-10-12

`NativeAnimationPanel` now exposes the visible timeline markers as a named group whose accessible name includes the selected clip, target object name/ID, and animated property. Each marker button exposes its target, property, and time and reports selection through `aria-pressed`. The existing keyboard-only workflow tabs to a marker, activates it with Enter, verifies the pressed state, then continues to edit the key, save, and decode the backup to confirm the authored value and target ID are preserved.

The focused Playwright workflow passed locally in Chromium (1/1) and WebKit-critical (1/1). Formatting, lint, production build, and unit tests also passed; lint retains one pre-existing React Hook warning in `NativeViewportPanel.tsx`.

This is DOM and keyboard interaction evidence only. It does not verify actual screen-reader speech, complete text rendering of scene geometry, physical keyboards/devices, VoiceOver/TalkBack, or physical accessibility acceptance. UX-05 and the physical/assistive-technology gates remain partial/open.


## Combined focused UX-05 run — 2026-10-12

After the timeline follow-up, the existing scene-text/selection-status test and the keyboard-only timeline key test were run together on the updated tree. Both passed in Chromium (2/2) and WebKit-critical (2/2). The test set checks DOM semantics and keyboard operation only; it is not evidence of actual screen-reader speech or physical-device accessibility acceptance.


## Dynamic timeline-key context follow-up — 2026-10-12

The keyboard-only `keyboard-only Tab flow selects and edits an animation key` workflow now switches the key property from translation to scale, creates a scale key, and verifies that the timeline group and marker accessible names reflect the active property. Enter toggles the scale marker's `aria-pressed` state; switching back to translation makes its existing marker report `aria-pressed="false"` rather than retaining a stale selected state. The workflow then edits the translation key, saves, and decodes the backup to verify both track values.

The focused test passed in Chromium using `/usr/bin/chromium` with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (1/1) and in WebKit-critical (1/1). This verifies DOM names/states and keyboard behavior in headless desktop browsers only. It does not test screen-reader speech, VoiceOver, TalkBack, full scene text alternatives, physical devices/keyboards, touch, contrast, or actual browser/OS zoom; UX-05 and physical accessibility gates remain open.


## Timeline selection live-status follow-up — 2026-10-12

`NativeAnimationPanel` now exposes a dedicated polite, atomic status for the selected key context: clip name, target object name/ID, animated property, and selected key time (or `未選択`). Keyboard-only property changes and marker/key-list selection update this region. The continuously refreshed playback/time status explicitly uses `aria-live="off"`, so playback frames are not announced as a stream; discrete selection context is announced separately.

The keyboard-only timeline workflow asserts the status role semantics and its transitions for translation selection, scale-property switch/selection, return to translation, and clearing selection after applying an edit. It also verifies that the playback status is not a live announcement. The focused Playwright case passed in system Chromium with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` (1/1) and WebKit-critical (1/1); the full `native-animation-product.spec.ts` suite passed 7/7 in each browser, and `npm run test:ci-scope` passed 8/8. Full unit tests passed (3,530/3,530), lint had zero errors and one pre-existing React Hook warning in `NativeViewportPanel.tsx`, formatting passed, and the production build passed (with the existing non-blocking large-chunk advisory).

This verifies status markup and text updates in headless desktop browsers only. It does not establish that a screen reader actually speaks or presents the update correctly; VoiceOver, TalkBack, physical keyboards/devices, touch, contrast, actual browser/OS zoom, and full scene alternatives remain unverified. UX-05 and 3D-STAGE4-04 remain partial/open; no physical or assistive-technology acceptance is claimed.
