# GAME-03: product-authored collider dimensions in an independent consumer

## Scope

This records a bounded, software-only GAME-03 acceptance path. A synthetic native project is authored through the product UI, exported as GLB plus `game.json`, and loaded in a separate browser context by the pinned Babylon.js 9.28.0 consumer. The product schema, runtime, export implementation, and collider metadata contract are unchanged.

The browser test creates three colliders through the UI:

- **Box**: size `[2, 3, 4]` m; position `[1.25, 2.5, -0.75]`; Z rotation `90°`; scale `[1.25, 0.75, 1.5]`. The independent consumer checks the exported dimensions, position, and hand-derived world matrix.
- **Sphere**: radius `0.75` m; position `[-2, 0.5, 1]`.
- **Capsule**: radius `0.3` m; cylindrical section length `1.4` m; position `[0.25, 0.5, 2]`. The exported consumer values give total height `1.4 + 2 × 0.3 = 2.0` m.

The consumer verifies the GLB hash, all three shape records and purposes, collider transforms, and its independent node/position oracles. The consumer browser page blocks requests outside the local consumer origin.

## Local verification

- `e2e/native-consumer.spec.ts`: **26 passed** across Chromium and WebKit, including the new product-authored collider case.
- Vitest: **185 files / 3,530 tests passed**.
- `npm run build`: passed; the existing large-chunk advisory remains.
- `npm run format:check`: passed.
- `npm run lint`: 0 errors; one pre-existing React Hook warning in `NativeViewportPanel.tsx:205`.
- `npm run test:ci-scope`: **8/8 passed**; this existing consumer E2E target already receives browser checks.

## Limits

This is not full GAME-03 acceptance. The fixture is synthetic and browser-based. The consumer reads metadata; it does **not** simulate collisions or prove a game engine's physics behavior. Unity, Godot, Blender, other consumers, imported real-world assets, physical devices, and manual engine-side collision review remain unverified. In particular, engine-specific interpretation of non-uniform scale on collider shapes is not covered. Keep GAME-03 and overall release acceptance partial.
