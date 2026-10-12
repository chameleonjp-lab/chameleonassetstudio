# QA-04 rig attachment-reference guard — 2026-10-13

## Scope

This software-only partial slice hardens the existing explicit “remove unused rig joint” action. The command already protects hierarchy, skin and clip references; it now also refuses removal when a game anchor or collider references the joint. The rig panel names these protections, and the fixed dependency error maps to the existing bounded `[EDIT_RIG_DEPENDENCY]` guidance. A refused operation is atomic and leaves the saved project/asset backup unchanged.

## Local verification

The focused `authoring.test.ts` and `editingFailure.test.ts` suites passed 799 tests. The product backup/UI regression passed 2/2 across Chromium and WebKit-critical. `npm run lint` had zero errors and one pre-existing `NativeViewportPanel.tsx:205` React Hook warning; `npm run format:check`, TypeScript checks, app and H3 production builds, and `git diff --check` passed. The existing >500 kB chunk advisory remains.

The unit tests cover anchor, collider and clip references with no mutation; the product test restores a synthetic project with an anchor-only joint, invokes the real UI action, confirms the bounded failure and compares before/after project plus blobs.

## Acceptance limits

This does not implement the full QA-04 MUST: a pre-action loss/impact preview for automatic repair choices and coverage of every automatic correction path remain incomplete. The tested guard is for explicit unused-joint removal, and browser fixtures are synthetic. No external engine/runtime, GPU, deployed application, OS failure, or physical-device acceptance is claimed. QA-04 and overall acceptance therefore remain partial/open.
