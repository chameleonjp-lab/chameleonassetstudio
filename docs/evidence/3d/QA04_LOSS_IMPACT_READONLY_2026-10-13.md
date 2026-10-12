# QA-04 loss-impact reporting remains read-only — 2026-10-13

## Scope

This software-only acceptance slice exercises the existing product quality-inspection route for a material using the compatibility `LEGACY_AUTO` alpha mode. Before any separate edit is made, the report identifies that GLB output converts the mode to an explicit transparency mode and advises the user to check opaque, masked or blended output. The inspection offers the impact and remedy text; it does not silently choose a correction.

The product E2E downloads and imports the saved project immediately before and after inspection and compares the complete project plus blob map. The same test then verifies that navigation to the material editor does not overwrite an unsaved roughness draft. Backup/import logic is shared with the worker-failure preservation test to avoid duplicating setup.

## Local verification

The focused warning test passed 1/1 in Chromium and 1/1 in WebKit-critical. The complete `e2e/native-quality-product.spec.ts` passed 6/6 in Chromium and 6/6 in WebKit-critical. The assertions cover the exact impact/remedy text and byte-level backup equality around inspection.

## Acceptance limits

This is one existing output-conversion warning path, not a preflight for every import/export loss or every correction action. No automatic optimizer, destructive repair, or new product behavior was introduced. QA-03 automatic optimization remains deferred; QA-04 and overall product acceptance remain partial/open. No deployed-service, external-engine, GPU, operating-system interruption, assistive-technology, or physical-device acceptance is claimed.
