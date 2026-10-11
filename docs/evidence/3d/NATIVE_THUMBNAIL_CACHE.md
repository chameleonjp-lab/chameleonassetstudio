# Derived thumbnails and isolated cache cleanup

Local baseline: `031fb7de23062dcd698650dd0e0e53033c3c3c7c`. Source archive SHA-256: `ee6dabb25c0fe0d99e187c021a24c258ec480a1810b6b84608a3a1f522d9af9d`.

VIEW-06/SAVE-09 scope: fifteen paths. A separate fixed v1 cache database stores only bounded derived PNGs and metadata; canonical/legacy/2D databases, native schema and backup content are unchanged. No automatic eviction is introduced. Explicit cleanup discloses total count/size, excludes originals, requires acknowledgement of the observed generation, and aborts on concurrent changes or confirmation closure before mutation.

## Ownership and stale-result boundaries

- Save succeeds before the current canonical rest image is captured. Editing/pose capture guards remain authoritative. Cache tokens are observed before rendering, and a synchronous final-write fence checks the saved session/revision and cancellation.
- Resize targets at most 192 pixels; input permits at most 16 MiB, 4096-pixel edge and 4 Mi pixels. Decode/encode tickets survive cancellation until the real operation settles. Output bytes retain their own ticket through cache copying.
- Cache profile: 32 entries, 256 KiB per PNG, 256-pixel edges, 16 MiB total ceiling. The entry-count/per-image combination is stricter than the total ceiling. A full cache rejects a write without implicit deletion.
- Metadata reads are separate from PNG reads. Ten display owners at most borrow detached data through Blob copying and retain local URL/display tickets until closure. Actual image dimensions are checked on load; decode errors retire the source and owner.
- Same-revision and older-revision races are rejected with token/revision/generation checks. Clear checks recognized records before its generation-fenced mutation; unrecognized/corrupt content is not silently purged.
- An atomic cache write that has already started is retained after a late cancellation. Neither cancellation nor failure deletes original project data.

## Verification

Focused storage/image/preview tests passed 110/110 (33 cache, 19 image, 58 URL ownership); the affected release-note tests passed 10/10 separately. Final TypeScript no-emit, targeted ESLint and Prettier passed; ESLint retains one pre-existing NativeViewportPanel useLayoutEffect warning. Playwright collected 18 library-product cases across Chromium/WebKit, including four added scenarios per engine. Independent read-only review found no additional P1/P2. The final committed-source build is recorded separately. Added product scenarios cover creation, reopening, explicit cleanup, confirmation invalidation and save failure while preserving canonical data and original bytes. Synthetic/mocked unit evidence is not real PNG pixel QA or physical memory/quota acceptance.

Local browser execution, physical-device/OS eviction and real quota/decoder behavior remain unverified. The previously cancelled full-unit aggregate is not retried. This local feature candidate does not close whole-product acceptance or claim publication/main integration.
