# Independent native ground inspection candidate

VIEW-02 requires an independently controllable ground in addition to grid/axes/bounds. This candidate adds an optional backwards-compatible ephemeral view option, default false, with a bounded Y=0 plane outside the canonical project graph. Ground does not move the model, change game origin, create a collider, or add export geometry. It is a translucent unlit inspection surface independent of material/solid/wireframe modes, and included in PNG only when explicitly enabled like the other inspection helpers.

The renderer owns geometry/material lifetime, including replacement, pause, context loss, same-project reconstruction and final disposal. Invalid options reject atomically. No native format, database migration or dependency change is introduced. Source baseline is preserved separately at 812f85e2da28a7cc5e9c1893ddbeb18fc7e9fc12.

Browser evidence is prepared to compare actual PNG output with ground-only/grid-off, verify canonical backup equality and exact generated GLB equality before/after, then verify disabling ground returns the original PNG. Collection is not execution. Local Chromium socket EPERM, prior artifact 403 and physical acceptance remain unresolved and are not bypassed. This local candidate is not published because the dependent PR318 write cancellation remains pending.

## Reduced-motion adoption (UX-06 subset)

The 3D-only entry does not import the 2D stylesheet, so its previous CSS did not inherit the existing 2D reduced-motion media rule. This candidate adds a 3D-scoped rule and a disposable OS preference observer for animation preview. Enabling reduce pauses active preview; explicit user playback remains available for authoring, with a visible stop control. Returning to no-preference never starts playback. No canonical clip/key/loop value changes. Unavailable preference APIs are reported rather than inferred.

Unit coverage checks initial state, live changes, older listener compatibility, unavailable APIs and late callbacks after disposal. A prepared browser case checks active-loop pause on preference change, explicit restart/stop and exact canonical backup equality. This does not establish full UX-06 contrast, zoom, target size or physical assistive-technology acceptance.

## Local checkpoint

Integrated tests passed: 2244 unit tests / 171 files, TypeScript, targeted ESLint, Prettier, production app build and isolated evaluation build. Renderer tests include 170 cases and the preference observer has five. The affected browser specs collect 28 Chromium/WebKit cases, with the new ground and reduced-motion scenarios included; no browser run is claimed. Independent review found a stale-state-only E2E wait after restoring no-preference; the test now first waits for the matching preference text before asserting playback remains stopped.
