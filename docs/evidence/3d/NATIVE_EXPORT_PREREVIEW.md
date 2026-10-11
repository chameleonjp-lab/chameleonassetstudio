# Native export pre-review candidate

This local candidate addresses EXP-03 before GLB/sidecar/ZIP generation, based on 7fd1c94060a63cc9044e1589612dcd6515c4a9dd. It does not change encoding, schema, migration, source bytes or 2D behavior.

A bounded metadata-only report distinguishes original source, edited GLB, game.json, distribution ZIP and native backup. Known lossy/representational differences are shown before generation, including empty tracks versus empty clips, legacy alpha, standard-consumer visibility, loop/game/edit metadata, endpoint holds, normalized normals, root wrapper and image conversions. Original-only features are described as possible, not inspected facts. Hashes, actual images, unknown extensions and consumer behavior are explicitly unverified at this stage.

The UI requires an explicit acknowledgement for the exact session/project ID/revision with no report blocker. Generation rechecks the identity synchronously before beginning. Editing or closing invalidates consent, without modifying canonical data. Already-created results keep their captured-revision label. Repeated generation from the same acknowledged revision does not require redundant consent. Source/read/worker errors retain existing recovery behavior.

Existing product export specs are updated to explicitly acknowledge the new report. An additional browser case checks no worker before acknowledgement, unchanged canonical backup on confirmation, invalidation after edit, actual generation after re-acknowledgement and reset on close/reopen. Browser collection is not execution. No browser socket or artifact restriction is bypassed.

The cancelled rigid-candidate full unit run is not rerun or replaced by an alternate all-tests path. This candidate uses separate new-module focused tests and static/build checks only, with their results recorded independently. External publication remains held by the cancelled ancestor PR318 write. Final same-head CI, images and physical acceptance are still open.

## Local checkpoint

The new report passed 18 focused unit tests. Integrated TypeScript, targeted ESLint, Prettier and app build succeeded. Affected product/consumer/viewport specs collect 50 Chromium/WebKit cases; they were not executed. Independent read-only review found no additional P1/P2 in report/encoder alignment, unknown-data wording, bounded admission, consent identity, close/edit invalidation, import/download behavior or E2E waiting. No full-suite success is claimed after the earlier cancellation.
