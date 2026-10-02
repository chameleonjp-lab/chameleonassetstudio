# Distribution 0.2.0 browser helpers

The four standalone ESM files in `src/core/export/distribution{Runtime,Canvas,Pixi,Phaser}.js` require no transpilation or dependencies. Export them together under `helpers/`, preserving names and relative imports. The TypeScript builder modules reuse this exact JavaScript timing and projection implementation. Their accompanying `.d.ts` files are app-development declarations; they reference app model types and are not a standalone consumer type package.

## Loading and ownership

First validate and load distribution 0.2.0 through the package loader. Adapters receive a validated `manifest`, fully decoded `images` indexed by manifest page, and real engine objects supplied by the host. The loader owns decoded images and its disposal; adapter disposal releases only the textures it created. Dispose the adapter before disposing the loaded images. No engine is downloaded or installed by the helpers.

Serve packages and examples over HTTPS. The loader verifies image SHA-256 using WebCrypto, so plain HTTP from an iPhone to a LAN server cannot load the package. A PC's own localhost is also supported; it does not make the same server's LAN URL a secure context on the phone. The shipped examples explain this requirement before loading when WebCrypto is unavailable.

## Common API

- `createCanvasDistribution({manifest, images, context, animationId?, position?})`
- `createPixiDistribution({manifest, images, PIXI, sprite, animationId?, position?})`, targeting PixiJS 8.12.0
- `createPhaserDistribution({manifest, images, scene, sprite, keyPrefix, animationId?, position?})`, targeting Phaser 4.2.0

`position` is the desired world position of the asset origin, default `{x:0,y:0}`. IDs identify animations and frames, never display names. The first animation is used when `animationId` is omitted. With no animations, `start()` shows the first frame. Empty animations draw nothing. Use a fresh, unscaled, unrotated sprite without parent transforms for direct world-coordinate agreement. The adapters set its anchor/origin to zero and position the trimmed image corner using the shared projection. Application transforms can be applied deliberately by the host, with corresponding gameplay-coordinate handling.

Each adapter returns:

- `start()` resets elapsed time and includes time-zero events
- `advance(deltaMs)` uses actual elapsed milliseconds; never substitute frame counts or a fixed-fps loop
- `stop()` suppresses future event delivery until restart
- `isRunning()` reports playback state
- `drawFrame(frameId)` renders one frame without changing animation elapsed time
- `setPosition({x,y})` reprojects the last shown frame
- `dispose()` stops playback and releases owned resources, idempotently; other operations after disposal throw

`start()` and `advance()` return `{sample, events, projection}`. Projection provides world anchors and all resolved colliders. `visible:false` is debug visibility, not gameplay exclusion. Event payloads remain inert data: nothing evaluates them or maps event names to executable code. The host may inspect each returned event and opt into its own behavior. The host also owns canvas clearing, animation scheduling, and drawing debug geometry. A stopped player keeps its last image. Nonlooping playback holds its final image after completion.

Phaser `keyPrefix` must be unique per adapter instance in that scene's texture manager. Existing page keys cause failure before any texture registration. Packed frame indexes are used as Phaser frame names to avoid user IDs colliding with reserved engine names. Pixi creates dedicated image sources and cropped textures. Both adapters hide fully transparent zero-area frame content, preserve collider/event data, and release partial allocations on construction failure. Disposal restores the supplied sprite's prior texture if it still uses an adapter-owned texture; the host owns sprite lifetime and remaining transforms/visibility.

## Evidence and limits

`node --test tools/d3/distributionRuntime.test.mjs` imports the actual shipped JS directly. The Vitest wrapper runs this suite in normal CI. Tests cover 1/2/3x placement, crop rectangles, multiple pages, hidden colliders, variable duration, repeated frame IDs, loops/nonloops, initial and ordered events, long ticks, stop/restart, bounded catch-up, texture collisions and allocation cleanup. Existing timeline/geometry suites cover canonical builder semantics and precision boundaries.

These mock tests prove JavaScript importability and adapter calls, not actual PixiJS/Phaser rendering. Product-export-to-real-browser engine rendering and pixel/gameplay assertions are a separate integration verification requirement. The helpers do not replace the strict manifest/package loader's version, path, reference, bounds, HTTP/decode, integrity, or cancellation checks.

## 0.2 image-coordinate contract

`rect` is the frame box on its packed page. `contentRect` is relative to that box, so its x/y are zero when the renderer has trimmed and moved the pixels. `contentOffset` retains the trim displacement in the scaled source canvas, and `sourceSize` retains that whole canvas. Origin, anchors and colliders use scaled source-canvas coordinates. The exporter converts the packer's source crop into this sheet-relative representation; it must not add the source trim displacement a second time when sampling page pixels. Legacy 0.1 manifests are unchanged.
