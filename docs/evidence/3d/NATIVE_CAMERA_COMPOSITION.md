# Numeric-camera composition key safety

Baseline: `70495298a50400dac38adce9947e2784c52e5f7d`. Preserved source archive SHA-256: `6d006b2edcd955043f63419d9a2133cd9fc5a648f79a88358d487eb2379da656`.

UX-04 follow-up, five paths. The earlier `NATIVE_KEYBOARD_COMPOSITION.md` explicitly excluded Inspection. Static review found numeric-camera actions guarded only by compositionStart/end state, without native isComposing/keyCode229 keydown protection. No physical IME failure was reproduced.

The existing shared guard is now connected only to the numeric-camera fieldset capture handler. Composition Enter cancels button default activation, while input-field Enter keeps its default. Composition Escape stops editor propagation without cancelling its native candidate-dismissal default. Ordinary Enter/Escape and other keys retain prior behavior. No timers, automatic command, canonical edits, schema or storage changes.

## Verification boundary

The existing helper suite passed 37 tests; the related failure/source-contract suite passed 740 tests (777 tests across two focused files). TypeScript, scoped ESLint, Prettier and whitespace checks passed. Independent read-only review found no additional P1/P2. The new fixture browser case prepares native/229/ref-tracked Enter/Escape assertions, input defaults, focus retention, ordinary Enter camera activation, unchanged edit-binding state and unchanged canonical revision. It requires a real non-null edit binding, avoiding an empty-state comparison. Synthetic dispatch does not prove trusted default activation or physical IME ordering. The fixture has no repository/Undo stack, so it does not claim a runtime persisted-history comparison; the unchanged camera-only port path is a source-level boundary. Final type/lint/format/build/collection results are pinned separately. Actual browser/device/IME, full-suite/audit and publication remain held or unverified.
