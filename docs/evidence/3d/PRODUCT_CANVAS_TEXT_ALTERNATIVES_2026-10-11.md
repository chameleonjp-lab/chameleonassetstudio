# Headless viewport text alternatives smoke — 2026-10-11

## Scope

`e2e/native-viewport-product.spec.ts` adds `3D viewer and active-object selector expose text alternatives for canvas information`. The test creates a native box fixture and verifies that the viewport group exposes the project-specific accessible name `Native box workの3D表示`, links `aria-describedby` to visible Japanese guidance containing keyboard-operation instructions and the scope of PNG output, and that the `制作オブジェクト` selector links to a text description naming the current active box and ID. It also confirms that the visible `3D表示中` state is exposed through a `role="status"` element rather than color alone.

The covered text is limited to interaction guidance, selected-object identity, and the display status; it is not a full textual representation of the canvas geometry or scene hierarchy.

## Local verification

The targeted Playwright test passed in Chromium using `/usr/bin/chromium` through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and in WebKit-critical. Both runs used one worker.

## Boundaries

This verifies a narrow DOM accessibility relationship in headless desktop browsers. It does **not** test actual screen-reader speech, VoiceOver, TalkBack, physical devices/keyboards, touch, or whether a user can understand the complete visual scene without a canvas. This partial UX-05 smoke does not complete 3D-STAGE4-04 or close any physical accessibility gate.
