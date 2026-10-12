# SAVE-05 cross-tab durable preservation — 2026-10-12

**Status: partial software-only browser evidence; not an acceptance pass.**

## Scope

The product E2E opens the same saved project in two pages sharing one browser context. The second page is initially read-only, explicitly takes over the writer lease, adds a box and renames the project, then saves revision 2. The first page subsequently makes a conflicting rename and attempts a save; its edits remain visible as dirty work and are saved through the product's separate-copy recovery path.

The test decodes backups from both outcomes. The rescued copy has a different project ID and retains the stale tab's project state. A third page then opens the original project while its current owner remains active, observes read-only state, and downloads a backup. Its full decoded project and blob map must equal the revision-2 backup captured from the current owner before the stale save attempt. This checks durable project identity/content independently of the two writer pages and verifies the stale writer did not silently replace the newer root.

Test: [`e2e/studio-entries.spec.ts`](../../../e2e/studio-entries.spec.ts) — `a second tab explicitly takes over while the old writer retains unsaved work for a copy`.

## Local verification

- The SAVE-05 product E2E passed in Chromium and WebKit-critical (1/1 per browser project).
- Full `studio-entries.spec.ts`: 10 passed; the 2 expected dev-server skips are the production-only graph test (covered by the production quality configuration).
- Unit tests: 185 files / 3,531 tests passed.
- `npm run format:check`: passed.
- `npm run lint`: 0 errors; one existing `NativeViewportPanel.tsx:205` React Hook warning.
- `npm run build`: app and H3 builds passed; existing >500 kB chunk advisory remains.

## Limits

This uses automated pages in one headless browser context. It does not test process/OS crash, clock skew, lease expiry timing, deployed runtime, physical storage exhaustion, or physical devices. SAVE-05, AC-06, and overall 3D acceptance remain partial/open; no acceptance pass is claimed.
