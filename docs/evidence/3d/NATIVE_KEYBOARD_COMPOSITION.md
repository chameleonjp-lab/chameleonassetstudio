# Native composition key safety

Local baseline: `7259744ee2675027e6fcc2f62e9c3411bb6c3dfa`. Source archive SHA-256: `36fc92ccc860b5d9bf53f88b182a49c8ff7ef058d4dae1eadfd41694c775e587`.

## Finding and scope

UX-04/05 require command keys to remain separate from text composition. Static inspection found no IME guard on the new-project form's submit path, composition-ref-only protection on several action panels, an Enter propagation-only guard on numeric transform buttons, and missing key-code-229 checks on texture/clone Escape. Input-field Enter in panels without a form was not shown to commit by itself.

[MDN's keydown reference](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event) explains that composition-start/end ordering can leave a composition key event outside the tracked interval; key code 229 remains relevant alongside `isComposing`. This motivates event-level guarding, but does not constitute an observed failure on a physical IME.

Fourteen paths add a small shared helper, focused tests, local handlers in seven panels and the project form, three browser regression scenarios in the existing viewport suite, and guide/ownership/evidence documentation. No model, storage, schema, renderer, 2D, dependency or permission changes.

## Behavioral contract

- Tracked composition, native `isComposing`, or native key code 229 identifies a composition key.
- Only Enter/Escape are intercepted. Tab, normal Enter/Escape and other keys retain prior behavior.
- Composition Enter prevents button default activation, including a nested button target. Ordinary text input keeps its default; the new-project form specifically prevents implicit submission.
- Composition Escape stops propagation without cancelling its native default, preserving IME candidate dismissal. Existing explicit Escape cancellation is reached after composition ends.
- The form also rejects a submit while tracked composition remains active. No delay timer or later automatic command is introduced.
- Existing click handlers, permissions, selected revision and atomic command validation remain in control of actual changes. Inspection-panel and broader physical accessibility acceptance remain outside this focused change.

## Verification boundaries

Focused helper tests: 37/37 passed. TypeScript no-emit, targeted ESLint, targeted Prettier and whitespace checks passed. Vite production app build completed in 5.13 seconds with existing chunk-size warnings. Playwright collection found 24 viewport-suite cases across Chromium/WebKit, including the three added scenarios per engine; no browser cases were executed locally. Added browser scenarios inspect synthetic event cancellation/propagation, unchanged confirmation/focus and subsequent ordinary keyboard behavior. Synthetic keyboard dispatch is not proof of a trusted default click, physical IME ordering or mobile keyboard behavior. Browser execution and full-unit aggregate were not retried where previously blocked/cancelled.

This remains an unpublished local candidate; no main integration or whole-product acceptance is inferred.
