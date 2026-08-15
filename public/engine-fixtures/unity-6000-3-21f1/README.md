# Group 19 Unity fixture

Target engine: **Unity 6000.3.21f1** (exact patch pin).

Status: `candidate` / `import-notes`. This fixture is not `verified`: licensed Unity editor is not available in current CI.

This engine-local fixture contains only Chameleon PNG/sheet/sidecar data and manual steps. It intentionally contains no native project, generated metadata, plugin, or dependency.

Runtime evidence must record exact version, import error 0, frame order, trim/content offset, scale, origin/pivot, anchor, rect/circle collider, animation, console/import log, and a separate artifact. Missing artifact fails the gate.
