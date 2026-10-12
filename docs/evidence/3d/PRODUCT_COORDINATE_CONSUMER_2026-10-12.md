# GAME-01: product-authored delivery coordinates in an independent consumer

## Bounded software evidence

A synthetic native project with a box mesh is configured through the product UI and exported three times, selecting `feet`, `center`, and `custom` origins. The delivery settings use `unitMeters = 0.01` and `forward = -X`; the custom origin is `[1, -2, 3]` m. For `feet` and `center`, the test derives the expected origin from the independent consumer's canonical mesh bounds and checks the exported sidecar values.

Each GLB and `game.json` pair is loaded in a separate browser context using Babylon.js 9.28.0. The test verifies the handedness / coordinate-basis contract, model hash, unit, forward axis, origin mode, and saved origin. It also checks the pinned sidecar statement that GLB geometry is canonical meters and delivery metadata is descriptive. The consumer reports `coordinatesApplied: false` for all three loads. GLB hashes and decoded mesh positions remain identical across the settings changes, while sidecar hashes change. This demonstrates the product UI-to-package-to-consumer metadata path and that origin, unit, and forward are not baked into GLB geometry.

## Local verification

The new product-authored coordinate case passed **2/2** in Chromium and WebKit; the full `e2e/native-consumer.spec.ts` passed **28/28** across both projects. Vitest passed **185 files / 3,530 tests**. `npm run build`, `npm run format:check`, and `npm run test:ci-scope` passed; the latter was **8/8**. Lint reported 0 errors and one existing React Hook warning at `NativeViewportPanel.tsx:205`; the build retains its existing large-chunk advisory. The independent consumer page blocks external requests. Source/runtime/export schema were not changed; this is E2E and evidence-only.

## Acceptance boundary

This does **not** prove a downstream engine applies origin, unit, and forward conversion exactly once: the consumer deliberately reports that it has not applied the delivery conversion. It does not validate engine-specific axis conventions, Unity/Godot/Blender integration, physics, imported real-world assets, or physical devices. Keep GAME-01 partial until an explicitly configured runtime/engine consumer demonstrates the downstream conversion behavior; do not infer full acceptance from this metadata-only bridge.
