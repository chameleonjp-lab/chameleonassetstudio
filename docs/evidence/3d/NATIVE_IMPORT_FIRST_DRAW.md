# Import review first-draw boundary

Preparation baseline: `871d0d3cddf1b4faac68868da5b3b737bd528ee9`. The preserved source archive is SHA-256 `271e2ed1e83b2c46798147b160ed8224cad456046eec957150e6a28b710b118d`. Final integration base: `cce4db2db668fd1e302891a6745702e11e0de48b`; its archive SHA-256 is `62c998bce0ddd242d97c5241b74a173a6491680561c714bc54bfbe83209f059b`. The notices stage is retained.

IMP-07 / UX-01, nine paths. Source inspection and deterministic renderer tests establish that active status can precede the first scheduled RAF: after setProject/fitCamera, framesRendered is still zero. The previous preview controller could announce ready at that boundary. No actual browser failure reproduction is claimed.

The optional viewport port method renderInspectionFrame submits a synchronous draw and rejects an inactive runtime, failed draw, synchronous context loss, or generation replacement. The import preview requires that capability and success after fitting, before announcing readiness. Missing capability fails closed. A later inactive status permanently invalidates that candidate's draw acknowledgement; a restored active status alone does not reauthorize it. The user cancels and reimports rather than silently reusing a pre-interruption confirmation. Ordinary viewport consumers do not acquire a new required method. No PNG encoding/readback, project mutation, schema change, source replacement or network action is introduced.

## Verification

The prep's two focused files passed 205 tests (177 renderer, 28 preview controller), including zero-before-RAF/one-after-explicit-draw, failed/context-lost/replaced/hidden/frozen/empty/disposed runtime, absent capability, rejected draw and retired candidate. TypeScript/scoped ESLint passed; 24 asset-I/O browser cases were collected across Chromium/WebKit. The new product case injects a preview-only first draw failure and verifies confirmation never enables, no project is saved, and the original canonical backup remains unchanged. It has not been executed in a browser.

Draw submission is not GPU completion, display presentation, screenshot inspection or physical-device acceptance. Browser/full-suite/audit/publication holds remain unchanged. This is a local unpublished candidate. Final-head integrated checks are recorded separately; prep checks are not silently relabeled as final execution.

Independent review found that the negative browser fixture initially intercepted only indexed draws, while the native graph uses nonindexed geometry. The fixture now intercepts both drawArrays and drawElements only inside the preview host; ordinary canvas calls delegate unchanged. This P2 is corrected; actual browser execution remains pending.

After integration onto cce4db2, the focused controller/review/renderer set passed 228 tests across three files. Inactive-to-active transitions remain unconfirmed until a fresh import, preserving the interruption boundary. Final type/lint/format/collection and clean-head build identity are recorded in the separate validation artifact.
