# B10 safe delivery candidate

## Implementation and compatibility

- App version, full source revision, local-dirty state and native schema are separate. A new bounded `native-build-info.json` is emitted without replacing the existing hub/2D/3D build-info contracts. Actual build output and a plugin regression test verify distinct names and legacy keys.
- Version checking is explicit, same-origin, no-redirect and capped at 8 KiB. It has a 15-second timeout, user cancellation and retry. A different revision is not described as necessarily newer and never triggers automatic reload.
- Explicit reload saves the latest state, checks dirty state and the captured current owner, then closes with the existing release guard. Failed save retains the current tab and rescue path. An old owner cannot reload a newer session.
- Diagnostics use a strict, bounded allowlist: versions, fixed error category, feature, coarse browser family/major and optional user-written reproduction text. No project/source/Error/stack is accepted. Preview is editable; explicit copy/download uses only its current text. Regeneration requires confirming replacement of edited text. No upload or telemetry is added.
- Clipboard permission is only queried; unavailable/ungranted clipboard access falls back to manual selection without requesting permission. Preview edits, hiding, collapse and unmount invalidate delayed copy. Downloads use temporary URLs with cleanup.
- Early 3D Shell import failures, viewport import failures and surviving editor rescue views have local diagnostic controls. The generic EntryBoundary has no new 3D dependency; hub/2D remain separate entries.
- This stage makes no project-schema or database change. Reverting code does not downgrade saved 0.3 projects. Preserve native backups and old-format copies before changing app versions.

The pinned test-only Khronos validator LICENSE and bundled NOTICES are preserved verbatim in `docs/licenses/gltf-validator-2.0.0-dev.3.10-LICENSE.txt` and `docs/licenses/gltf-validator-2.0.0-dev.3.10-NOTICES.txt`. Existing Three runtime and Babylon test-consumer notices remain in their prior locations. License retention does not establish absence of known vulnerabilities.

## Requirement evidence map

| Requirement | Candidate evidence | Remaining acceptance |
| --- | --- | --- |
| OPS-01 | Strict build metadata, explicit app/source/schema UI | Exact published artifact identity |
| OPS-02 / AC-14 | Current-owner save-before-reload; chunk failure and failed-save browser cases | Same-head browser execution and deployment/rollback rehearsal; no production rollback performed |
| OPS-03 | Generic entry boundary plus local early diagnostics; separate hub/2D browser case | Same-head full domain-isolation and browser gates |
| OPS-04 | Copy migration and rescue remain unchanged; user guide distinguishes app/data rollback | Full old/new compatibility matrix on final head |
| OPS-05 | Loaded editing/save/backup offline browser case; recoverable explicit metadata checks | Browser execution, interrupted uncached chunks and physical OS lifecycle |
| OPS-06 / OPS-08 / OPS-09 | User guide covers creation, storage, backup/transfer, provenance, limits, rescue, update and known restrictions | Human usability/readability acceptance |
| OPS-07 / AC-15 | Strict report unit cases; preview edit/download/late-copy/browser failure cases | Actual browser/clipboard/assistive-technology execution |
| OPS-10 | Existing pinned dependencies/adoption records retained; no new dependency in B10 | Current vulnerability audit is unverified: the attempted audit operation was cancelled and was not retried |
| OPS-11 | Existing rescue paths retained; release-blocking defects listed, no telemetry/check weakening | Full final regression and physical acceptance |

## Validation and independent review

Local baseline integration passed 2,131 unit tests across 163 files, TypeScript, lint, formatting and app build. Follow-up review found two P2 issues: duplicate metadata emission and unbounded update-check waiting. Both were corrected; the reviewer rechecked distinct native metadata, timeout/cancellation/retry, save/current-owner sequencing and delayed clipboard guards. A further build-metadata regression test was added. Final aggregate counts belong to the final candidate report, not this earlier checkpoint.

Browser tests cover privacy and editable download, delayed clipboard permission, different deployed revision/offline retry, failed-save reload rejection and retained backup, initial Shell failure with separate hub/2D, stalled check cancellation followed by the actual served metadata, and loaded offline editing/save/backup. The existing binary rescue case also checks its diagnostic error category without project-name leakage. These are collected tests, not reported browser passes: local Chromium cannot start because the environment returns socket EPERM. No alternate route was used to evade that restriction.

The public static 3D guide is served under `guide/3d/`, linked from both existing guide entries and the editor. It follows the actual product controls; the existing 2D guide body is retained. The earlier stale 0.2/current-0.3 wording and rig/GLB placeholder introduction are corrected.

The consumer integration suite additionally collects a single UI-authored workflow: modify a primitive vertex, apply an original PNG, manually bind 25/75 mixed weights, author two clips, save and back up, restore into an independent context, edit a key, then download the real GLB and sidecar. Those exact bytes are passed to Khronos validation and Babylon, with exact source/hash checks, hand-computed 0.75/1.875 metre deformations and actual playback-end observation. This extends the existing simple-box handoff; it has not yet run in a browser.

## Release gate remains open

B10 implementation does not complete G06. The same final head still needs all applicable browser/production gates, independent consumer rendering, physical PC/iPad/iPhone/Android measurements and interaction/accessibility acceptance, the final MUST/adopted-SHOULD/AC matrix, and current dependency review. Earlier PR/fixture passes are historical evidence, not a substitute for this candidate. Known data corruption, inaccessible rescue, repeated crash or 3D-to-2D failure propagation blocks release. No merge, production deployment or production rollback is performed by this candidate.
