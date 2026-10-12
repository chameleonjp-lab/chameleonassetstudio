# VIEW-06 same-revision saved-rest thumbnail pixel match — 2026-10-13

## Scope

The existing product library E2E already covered thumbnail creation, list/reopen, explicit cache cleanup, invalidation, and save-failure preservation. The remaining software-only gap was that the real cached PNG was only checked for successful loading and bounded dimensions—not compared to the saved-rest capture from the same revision.

`e2e/native-library-product.spec.ts` adds `VIEW-06 cached thumbnail pixels match the same-revision saved rest PNG`:

1. Restore the repository's synthetic `Library original` project and read its canonical backup revision.
2. Open the product 3D view and download its actual `PNG画像を保存` output before any edit.
3. Create the derived thumbnail with the product UI, open the thumbnail/cache list, and assert that both the entry label and list explanation identify the same saved revision/rest image.
4. Fetch the actual PNG blob displayed by the cache list, verify its PNG signature and expected ≤192-pixel dimensions, then decode it alongside the captured source PNG. In the browser, resize the source with the same canvas dimensions and `drawImage` path used by thumbnail generation and compare every decoded RGBA pixel.
5. Require exactly zero differing pixels, zero maximum channel delta, and more than eight distinct colors. Attach the actual cached PNG and a JSON comparison record to the Playwright test result.
6. Download the canonical backup again and verify that the project and original image bytes remain unchanged.

## Local verification

- Focused new product case: Chromium 1/1 and WebKit 1/1.
- Complete `native-library-product.spec.ts`: Chromium 15/15 and WebKit 15/15.
- `npm run test`: 3,543 tests passed across 186 files.
- `npm run format:check`: passed.
- `npm run lint`: zero errors; the existing `NativeViewportPanel.tsx:205` React Hook warning remains.
- `npm run build`: TypeScript check, app build, and H3 build passed. The existing >500 kB chunk advisory remains.
- `npm run test:ci-scope`: 8/8 passed; test-only/non-publishing classification.
- `git diff --check`: passed.

Remote CI was not monitored.

## Limits and status

This is deterministic headless comparison for one repository fixture and two browser engines. Pixel identity establishes that the cached image is the same saved-rest capture after the declared downscale; it does not judge aesthetic quality, broader project visibility, every overlay/lighting state, screen-reader behavior, physical devices, real quota/decoder/OS eviction, or production deployment. A human visual review is still outstanding.

VIEW-06 and overall acceptance remain **implemented-candidate / partial**; no whole-gate acceptance pass is claimed.
