# S04 GLB adoption candidate

## Implementation and independent validation

The native basic profile uses a bounded direct GLB2 encoder/parser in adapters3d/gltf, not a scene copier or GLTFLoader success as validation. The canonical graph is renderer-free. Existing Three 0.186.1 is used only for matrix decomposition in the format adapter; existing fflate makes the distribution ZIP. A worker owns synchronous encoder/parser allocations and cancellation terminates that worker.

Independent tests use the official Khronos gltf-validator 2.0.0-dev.3.10, Apache-2.0, tests-only. The npm package is compiled JavaScript, not WASM, has no install scripts or dependency packages, and is excluded from the product bundle.
- https://github.com/KhronosGroup/glTF-Validator
- https://registry.npmjs.org/gltf-validator/2.0.0-dev.3.10
- Registry integrity: sha512-odJ4k0tRkGXiDGn78yDBg+fBbAIvBnXxh3RwAta0emSxGtyagFE8B4xELB1oYe3S5RD8Ci3uZAsZaascH2LAEQ==

Validator acceptance is errors=0 and non-truncated reports; warnings remain visible in test failures and distribution conversion notes. Validator success is not independent runtime playback verification (B08).

## Fixed semantics and tests

GLB UV (0,0) denotes top-left. Native UV (0,0) denotes bottom-left. The adapter flips V exactly once per direction, retains embedded PNG/JPEG bytes and does not also flip image rows. The original four-corner RGBA PNG fixture is generated locally; red/green are its top row, blue/translucent white its bottom row.

Canonical inverse binds are joint-rest inverses with an independent mesh bind matrix. Export multiplies inverseBind by that instance's restMeshWorld. Import multiplies GLB inverseBind by inverse(restMeshWorld), treating omitted GLB matrices as identity. Per-node skin instances receive separate editable meshes. An identity asset root supplies a common hierarchy for independent joint roots; palette order is preserved.

Seconds are checked after Float32 conversion: strict order, no collisions, absolute error at most 1e-6. Sparse endpoint holds are explicit conversion notes. Empty clips remain sidecar-only. Duration and loop are restored from the hash-matched sidecar. Final node/mesh/clip/channel IDs and indexes are checked after encoding; names are not identity.

Unknown required extensions and external URI input reject. Unsupported optional properties require explicit loss acceptance before an editable copy. Hidden nodes remain in GLB with a warning that standard consumers do not implement application visibility. Non-unit normals are direction-normalized only in the derivative and reported; zero normals and absent UV on textured primitives reject.

## Codec and lifetime gate

PNG/JPEG input is bounded by existing metadata and orientation checks. The product worker verifies actual decoding before retaining the original encoded bytes; pure Node serializer tests do not substitute for this browser codec gate. Pixel estimates are reserved before decoding. WebP conversion uses a worker OffscreenCanvas, with VP8/VP8L/VP8X dimensions and animation/EXIF/color-metadata rejection before createImageBitmap. Unsupported worker/codec capability fails without a main-thread blocking fallback or mutation of sources.

The profile bounds source/JSON/depth/value counts, expanded skin-instance geometry, decoded accessors, joints, keys, unique image pixels and combined memory estimates. These are engineering guards, not physical-device measurements. Existing image tickets and new I/O tickets share a combined peak cap.

Local unit/validator tests and independent read-only review are executable evidence. Product worker encoding/cancel, actual color/alpha screenshots, Chromium/WebKit and production builds are separate CI evidence and remain pending until the submitted run completes. Local browser launch is blocked by socket EPERM before product startup; it is not a browser pass.

The planned GLTFExporter route was replaced by the bounded direct encoder so that rest graph, skin bind multiplication, inclusion, time precision, mappings and termination do not depend on implicit exporter normalization or pruning. This is a candidate implementation choice with explicit validator and product-worker gates; it is not permission to omit a feature or weaken cancellation.
