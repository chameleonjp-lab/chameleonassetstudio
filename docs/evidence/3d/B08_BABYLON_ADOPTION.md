# B08 independent Babylon consumer adoption

## Scope

Babylon is a development-only independent consumer of the actual model.glb and hash-bound game.json emitted by B07. It is not the editor renderer, a converter, a physics engine, or proof that an arbitrary user's current asset works in every engine.

Pinned npm packages are @babylonjs/core 9.28.0, @babylonjs/loaders 9.28.0, babylonjs-gltf2interface 9.28.0. Registry tarball integrity was checked during review; exact lockfile records are retained. All three use Apache-2.0; license and bundled notices are preserved in docs/licenses/babylon-9.28.0.txt. No serializer, Draco, meshopt, Basis, CDN decoder, or external asset is adopted.

## Separation

The test-only tools/3d-consumer entry uses its own Vite build and browser context at port 4177. App build ownership checks reject Babylon modules in hub/2D/3D application chunks. The consumer imports neither the editor renderer nor its pose/preflight/sidecar application code. Only basic GLB loading and inert extras metadata are registered. Network requests outside the local consumer origin are denied in browser tests; the loader also rejects external resource resolution.

The consumer opts into right-handed coordinates and no automatic animation start. Stable IDs and exact indices are checked against actual loaded runtime associations. It resets rest transforms on clip change, starts/pauses a group before seeking in seconds at a pinned 60 fps, distinguishes scrub end from playback wrap, and restores rest for empty clips. Metadata is composed once after the referenced node's current world transform. Collider inspection does not execute game physics.

## Acceptance gates

- Exact model/sidecar hash pairing, stable mappings, geometry/material/skin/clip/game information.
- F01–F07 original fixtures, including duplicate names, nonuniform parent transforms, mixed weights, sparse endpoint holds, STEP, single keys, empty clips and quaternion sign.
- A separate glTF arithmetic oracle plus fixed hand-computed world bounds; agreement only with an exporter-derived oracle is insufficient.
- Actual independent color/UV/alpha rendering, Chromium and WebKit, repeated load/dispose, and unexpected network request rejection.
- Same actual bytes pass the pinned Khronos validator without errors or truncated reports.

Local unit/build checks and browser CI results are recorded separately in B08_CONSUMER_INSPECTION.md. Package installation or a NullEngine check alone does not satisfy browser acceptance.
