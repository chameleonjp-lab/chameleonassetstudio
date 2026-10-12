# UX-04 / UX-05: keyboard and composition product-browser evidence

- **Date:** 2026-10-13
- **Test baseline:** `ef82625` (Draft PR #403 head)
- **Acceptance status:** Partial; selected keyboard-only and composition paths ran in product browsers, but physical IME, assistive technology, and the complete workflow matrix remain unverified.

## Selected product-browser scenarios

Ten existing product E2E cases were run against the production Vite preview in Chromium and Playwright WebKit (`webkit-critical`), with three repetitions per browser. All **60/60** executions passed.

| Scenario group | Cases × browser repetitions | Result |
| --- | --- | --- |
| New-project form, editor command-key composition guards, hierarchy-confirmation Escape/focus, invalid authoring draft/composition | 4 × 2 × 3 | 24/24 |
| Viewer camera shortcuts ignore native `isComposing`, key code 229, and browser-modified keys | 1 × 2 × 3 | 6/6 |
| Viewport keyboard orbit/zoom/fit and Tab/Shift+Tab order with a visible 3px focus outline | 2 × 2 × 3 | 12/12 |
| Keyboard-only create/select/numeric edit/save/backup; explicit numeric preview/apply; Escape cancellation and status | 3 × 2 × 3 | 18/18 |

The project-form test verifies that composition Enter does not submit, native `isComposing` and key code 229 remain guarded after composition ends, and ordinary Enter still creates the project. The other composition cases verify that tracked/native composition Enter does not activate authoring, rig, animation, and numeric-transform buttons; ordinary Enter still activates the expected button. Composition Escape does not reach the editor cancellation handler, preserving the hierarchy confirmation and focus, while ordinary Escape still cancels. An invalid authoring draft/composition does not advance the saved revision before composition ends.

The viewer-key test checks that IME and browser-modified events leave camera values and canonical project data unchanged. Keyboard-only editing cases create a project, select a part, edit numeric transforms, save, and inspect the backup; preview remains unsaved until explicit apply, and Escape cancels an in-progress edit. Viewport cases traverse actions in both Tab directions with the expected visible focus and exercise keyboard camera controls without changing the canonical project.

These results supplement the earlier [keyboard composition candidate](NATIVE_KEYBOARD_COMPOSITION.md) and [keyboard smoke](PRODUCT_KEYBOARD_TAB_SMOKE_2026-10-11.md). The standalone numeric-camera composition fixture remains collection-only; this run does not establish its repository/Undo comparison.

## Remaining boundary

IME-specific probes dispatch synthetic `KeyboardEvent` objects and inspect event cancellation/propagation. They do not prove trusted browser default activation or physical Japanese IME event ordering. Playwright keyboard input is not physical hardware input. No real mobile keyboard, screen reader, assistive technology, or exhaustive keyboard completion of every workflow was tested. Keep UX-04 **partial** and UX-05 **blocked/partial** pending the remaining workflow, device, and accessibility acceptance.

Remote CI was not monitored.
