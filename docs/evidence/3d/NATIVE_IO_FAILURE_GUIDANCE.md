# Bounded GLB failure guidance and extension declarations

Local baseline: `87170b624341aba89b3707e4bafa3a91c56e0a5e`. Source archive SHA-256: `3611b420e079ceafde77724d9896017fcff19ca4065297c71f1664847a3aac30`.

IMP-07 / UX-01 / SEC-02 scope: eleven paths. Static inspection found that NativeAssetIoPanel forwarded raw worker exceptions, and preflight treated extensionsRequired only by its optional length and constructed a Set from unvalidated extensionsUsed. A string/object/oversized list was not explicitly checked as an extension declaration.

## Implemented boundaries

- Failure guidance is fixed Japanese text with operation target, reason, action, retry category and stable code. Recognition is bounded; unknown exception objects are not stringified, accessors/stack are not read for display, and private path/filename/URL text is not copied into guidance.
- Numeric Float32 overflow and key-time quantization are distinguished from general resource/profile overflow. Capacity failures recommend preservation before reopening; unsupported features do not promise that retry alone will succeed.
- Explicit optional-loss conversion remains a separate user confirmation. Its request list is a bounded JSON array and never truncated into approval. Independent review found that comma-delimited loss names could split or reject a legitimate extension name; the internal worker error transport now preserves punctuation, controls and Unicode exactly. This changes no file format. Required extensions remain unsupported regardless of a loss checkbox.
- [Khronos's glTF root schema](https://raw.githubusercontent.com/KhronosGroup/glTF/main/specification/2.0/schema/glTF.schema.json) defines present extension declaration properties as nonempty arrays of unique strings. The additional 64-declaration/128-UTF-16-unit caps are engineering admission limits, not glTF-wide specification limits. Names are not normalized or restricted to ASCII.
- Malformed declarations and count/name overflows fail before loss collection, preserving input bytes. Native schema, saved project data, output formats, decoder selection and external-network restrictions are unchanged.

## Verification

Focused classification/privacy/loss-request and preflight/profile regressions passed 106 tests across four files (50 guidance including the real adapter request round-trip, 50 preflight, two profile, four importer). TypeScript and scoped ESLint passed. Browser collection discovered 22 cases across Chromium/WebKit; collection is not execution. Formatting and a fixed-head build are checked after final integration and recorded separately. The product regression preserves the canonical backup while trying malformed and over-budget declarations; existing required-extension and mismatched-sidecar tests now assert the Japanese reason and specific corrective action.

Independent read-only review closed the ambiguous comma-separated loss-name P2 after the JSON-array correction; no additional P1/P2 findings remained.

Browser execution, physical-device behavior and the previously cancelled full-unit aggregate remain unverified/not rerun. A category is guidance, not automatic repair or a guarantee of the underlying external file's correctness. This is an unpublished local candidate.
