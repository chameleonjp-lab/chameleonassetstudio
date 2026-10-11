# Explicit rigid-part bone assignment candidate

RIG-03 requires an explicit rigid operation separate from smooth weight binding. This local candidate follows ba2dd24cc3d870c08c6cca734427949d90ee0df4. It adds leaf unskinned mesh parenting to a meshless guide/bone without changing project schema, Skin3D, inverse binds, vertex weights, original bytes or GLB format.

## Contract

- Explicit keep-world means preserving canonical rest placement; keep-local preserves local TRS and may move world placement. Exact decomposition rejects shear, singularity, overflow and meaningful precision loss atomically. Shared matrix utilities preserve existing assembly behavior.
- Source/old-ancestor animation rejects unsupported retargeting. An animated new target is permitted with explicit UI explanation that the part begins following that bone, not preserving previous animation. Existing target clips remain byte-for-byte canonical-equivalent. Detaching after the target becomes animated is consequently rejected; immediate Undo remains available.
- Source must be a leaf unskinned mesh and not a skin joint. Effective locks, cycles, missing targets, same-parent no-op and invalid modes reject before commit. Unrelated mesh instances and shared materials are unchanged.
- Confirmation is project/revision/selection/mode bound, shows one affected part, new local placement and inherited clip names, and uses one existing History transaction. Preflight clones are covered by a conservative shared resource reservation. Undo/Redo, autosave and complete backup reuse the existing session path.
- Manual pose eligibility includes meshless ancestors of an unskinned rigid part as well as existing skin-palette joints. It retains descendant locks, finite Float32 validation and the display-only/rest separation. Renderer implementation already supports ordinary Mesh children under Group or Bone and did not need a new rendering path.

## Evidence and limits

Core tests cover assignment/detachment, world/local semantics, negative scale, precision/shear rejection, locks, skin/clip invariance, Undo/Redo, save/reopen and source-byte backup restored into a separate database. Renderer tests exercise rigid children of both unbound Group and real skin-palette Bone, unchanged geometry buffers, no rebuild and return to rest.

A distinct integration test exports an authored rigid hierarchy, validates the actual GLB with Khronos gltf-validator, checks no skin/JOINTS_0/WEIGHTS_0 were fabricated, then loads the same bytes and sidecar into actual Babylon NullEngine. Hand-fixed rest/world positions and first vertex coordinates at 0/0.5/1 seconds independently verify inheritance. This is real CPU-runtime loading/evaluation, not browser pixels or physical GPU evidence, and does not replace the mixed-weight smooth-skin requirement.

The prepared product browser scenario covers explicit cancel/confirm, no-op, unbound-guide manual pose, source/rest preservation, Undo/Redo, narrow layout and separate-context backup restoration/re-edit. It has not run here. Publication remains held by the cancelled ancestor PR318 write, and Chromium EPERM/artifact403 are not bypassed. All physical-device and final same-head visual acceptance remains open.

## Local verification boundary

Focused core verification passed 284 related tests, manual-pose/transaction verification passed 29, and renderer plus Khronos/Babylon CPU delivery verification passed 173 (counts overlap and must not be summed). TypeScript, targeted ESLint and app build passed. Product rig browser specs collect eight cases only. The subsequent full unit run did not produce a final result: its wait operation returned “automatic approval review was cancelled” at 05:06 JST. It was not retried or replaced by another route. No full-suite pass is claimed for this candidate.
