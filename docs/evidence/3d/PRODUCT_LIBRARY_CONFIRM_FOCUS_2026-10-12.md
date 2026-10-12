# Product keyboard focus after library confirmation cancel — 2026-10-12

## Scope

The 3D project-library confirmation region previously disappeared after keyboard cancellation without moving focus to a surviving control. The product now remembers the button that opened the confirmation and returns focus to it after explicit cancellation. This applies to project trash/restore confirmations and recovery-copy confirmations; successful actions and unrelated panel refreshes do not request this focus change.

Two keyboard-only product E2Es cover cancellation from the project-list trash action and from a recovery candidate. Each uses Enter/Tab navigation, verifies focus returns to the initiating button, and checks the existing 3px visible focus outline. The recovery-copy test cancels before writing a copy; it is not another restore-copy failure test.

## Reproduction and verification

Before the product fix, the trash-confirmation test failed in both Chromium and WebKit-critical: after the confirmation region unmounted, the trigger was no longer focused. After adding explicit focus restoration, the focused check passed in both engines.

- Focused trash-confirmation test after the fix: Chromium and WebKit-critical, 2/2 passed.
- Complete `e2e/native-library-product.spec.ts` suite after both cancellation cases were added: Chromium and WebKit-critical, 26/26 passed.
- Production-preview focus checks using `playwright.production.config.ts`: 6/6 across Chromium and WebKit-critical, including both new cancellation cases and the existing object-deletion focus check.
- `git diff --check`: passed.

## Boundaries

This is headless browser evidence for keyboard activation, DOM focus, and computed outline width only. It does not establish actual screen-reader speech, VoiceOver/TalkBack behavior, physical keyboard or pointer behavior, physical-device acceptance, real browser/OS zoom, contrast acceptance, or WCAG conformance. UX-04/UX-05 and physical accessibility gates remain partial/open. No persistence format, schema, dependency, or data behavior changed.
