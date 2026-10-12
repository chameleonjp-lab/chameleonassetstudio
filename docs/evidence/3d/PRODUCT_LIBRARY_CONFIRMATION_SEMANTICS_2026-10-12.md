# Product accessible naming and description for 3D library confirmations — 2026-10-12

## Scope

The inline project-library confirmation remains a non-modal `region`; it does not trap focus or change keyboard order. Its accessible name now comes from the action-specific question heading (`aria-labelledby`). The target project summary and the explanation of consequences/recovery are associated as its description (`aria-describedby`). This applies to moving a project to trash, restoring it, and opening a retained version as a separate recovery copy.

No persistence format, schema, dependency, project data, or operation behavior changed. Focus behavior and status announcements are outside this change.

## Verification

- A focused Chromium run against the prior static region label failed in the three exercised flows because the action-specific named region and description references were absent.
- After the change, the full `e2e/native-library-product.spec.ts` suite passed: 26 cases across Chromium and WebKit-critical. The browser checks resolve the accessible region name through its heading and assert the referenced target/details IDs contain the expected text for trash, restore, and recovery-copy confirmations.
- `src/features/editor3d/projectLibrary.test.ts`: 5/5 passed.
- `npm run test:ci-scope`: 8/8 passed.
- `npm run build`: passed. Vite emitted the existing >500 kB chunk-size advisory.
- Targeted ESLint and Prettier checks passed; `git diff --check` is recorded after final review.

## Boundaries

This is DOM/accessibility-tree semantics evidence from headless Chromium and WebKit-critical. It does not establish actual screen-reader speech, VoiceOver/TalkBack behavior, user comprehension, physical-device or keyboard acceptance, contrast acceptance, browser/OS zoom behavior, or WCAG conformance. Broader UX-05/UX-07 and physical accessibility acceptance remain partial/open.
