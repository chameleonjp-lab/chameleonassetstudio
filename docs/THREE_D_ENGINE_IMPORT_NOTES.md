# 3D external engine import notes

B07 emits canonical meter/Y-up/+Z-forward GLB and a hash-bound game.json. Preserve the pair. Unit/origin/forward fields are descriptive delivery metadata; apply conversion only once in a consumer that explicitly supports those fields. Anchors and colliders are not automatically physics bodies or application logic.

## Babylon.js

The B08 pinned, isolated harness loads actual exported bytes and applies stable-ID sidecar associations. Its fixture-specific evidence must include output hashes, package versions, source revision, tests and screenshots. It does not certify an arbitrary current project.

## Unity, Godot and Blender

These are integration notes only. No current-version native editor import or runtime execution is claimed. Use a supported GLB importer for the chosen engine/version, preserve the original GLB and sidecar, and verify coordinate conventions, materials/alpha, skin bind pose and palette, all clips and their loop settings, and exact anchor/collider transforms. Compare at rest, interior key times, just before/at/after the end, and after clip switches. Check units and forward direction before applying a conversion. Record the importer and engine versions with actual output hashes.

A successful GLB load or a validator pass is not sufficient evidence for skin deformation, animation behavior, game attachment use or physical-device performance. Engine-specific behavior remains unverified until those checks are executed.
