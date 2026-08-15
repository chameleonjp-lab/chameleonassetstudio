# Godot 4.7.1-stable import notes

Status: `import-notes` (runtime not executed in this PR).

1. Use exactly Godot 4.7.1-stable; do not substitute `latest` or another patch.
2. Import `textures/main.png` and read `manifest.json` plus `targets/godot-4-7-1-stable.json` as fixture-local metadata.
3. Recreate the two-frame `loop` animation and preserve trim/content offset, scale, origin/pivot, anchor, and rect/circle metadata.
4. Capture version, fixture hashes, import/console log, and a separate artifact. Missing artifact or any error is a failed gate.

Native project files (.meta, Prefab, Animator Controller, .tscn, Resource, plugin, addon) are out of scope.
