# Group 19 Godot fixture

Target engine: **Godot 4.7.1-stable** (exact patch pin).

Status: `candidate` / `import-notes`. This fixture is not `verified`: pinned Godot binary is not available in current CI.

This engine-local fixture contains only Chameleon PNG/sheet/sidecar data and manual steps. It intentionally contains no native project, generated metadata, plugin, or dependency.

The candidate sheet contains two visually distinct frames and non-zero trim/pivot metadata; runtime evidence must record exact version, import error 0, frame order, trim/content offset, scale, origin/pivot, anchor, rect/circle collider, animation, console/import log, and a separate artifact. Missing artifact fails the gate.
