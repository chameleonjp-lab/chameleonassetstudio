# Bundled native release notes

Local baseline: `ad1b1f70a2df20d6dbe9877b1f2c0f29e6323a80`. Source archive SHA-256: `93cd6416b1e174828c65bb78849d0c8e7fb2bbfd3e27a271d8a00d200e065777`.

## OPS-09 scope

Nine paths add fixed typed notes, a text-only current-tab component, its focused tests, integration into the existing version panel, browser regression scenarios, static guide/ownership/user documentation and this evidence. The note edition is 2026-10-10; it is not a public release date or evidence of main integration.

The component receives the current bundled build identity. Changes, save/output consequences, known and unverified limits, recovery steps and unadopted recommendations are shown together. The separately fetched deployed-build record never replaces the identity associated with these notes. A different source revision is not assumed to be newer or to have these same features.

No new network request, storage/schema change, auto reload, project-content read, data sharing, external link interpolation or HTML execution is introduced. The guide is fixed text and directs readers to the application's exact bundled revision.

## Checks and limits

Focused static rendering/data tests: 10/10 passed. TypeScript no-emit, targeted ESLint, targeted Prettier and whitespace checks passed. Production app build completed in 6.51 seconds with the existing chunk-size warning. Playwright collected 20 diagnostics-suite cases across Chromium/WebKit, including two added scenarios per engine; none were executed locally. Independent read-only review found no additional P1/P2. Browser scenarios distinguish the bundled notes from a mocked different deployment and exercise the guide's explanation; local execution remains unverified under the existing browser restriction. Whole-unit execution previously cancelled is not retried.

These notes explicitly retain physical-device/IME/OS-kill/memory/GPU and actual Unity/Godot/Blender acceptance gaps, migration downgrade limits, and deferred recommended features. They do not turn those gaps into completed requirements. Publication remains held with the dependent candidate chain.
