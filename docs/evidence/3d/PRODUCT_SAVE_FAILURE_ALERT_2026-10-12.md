# Product save-failure alert semantics — 2026-10-12

## Scope

`e2e/native-library-product.spec.ts` extends the existing `failed project save refuses thumbnail creation without discarding unsaved edits` product test. The test injects a synthetic `QuotaExceededError` from `IDBObjectStore.put` only for the 3D project database, edits a project, and then verifies two distinct user-facing semantics:

- The save state is exposed through a visible `role="status"` message: `保存に失敗 · 未保存の変更をこのタブに保持中`.
- The actionable recovery guidance is exposed through a separate visible `role="alert"`: `保存に失敗しました。タブを閉じずに再試行するか、現在の内容をバックアップしてください。`.

The same scenario continues to verify that the failed save does not discard the editable project, the thumbnail action refuses to proceed, and the raw fixture error text is not shown in the viewport panel. No production code, persisted data, schema, or dependency changes are included.

## Verification

- Focused product E2E: `npx playwright test e2e/native-library-product.spec.ts --grep 'failed project save refuses thumbnail creation' --project=chromium --project=webkit-critical --workers=1 --reporter=list` — 2/2 passed.
- `npm run lint` — 0 errors; one existing React Hook warning remains at `NativeViewportPanel.tsx:205`.
- `npm run format:check` — passed.
- `npm test -- --reporter=dot` — 185 files, 3,530 tests passed.
- `npm run build` — app and H3 builds passed; the existing large-chunk advisory remains.
- `git diff --check` — passed.

## Boundaries

This is role/text evidence from a synthetic storage-failure path through the product UI in headless Chromium and WebKit-critical. It does not verify actual screen-reader speech, VoiceOver/TalkBack behavior, user comprehension, physical devices, actual browser/OS zoom, or contrast acceptance. UX-05/UX-08 and the physical/accessibility gates remain partial/open; no accessibility or release acceptance is claimed complete.
