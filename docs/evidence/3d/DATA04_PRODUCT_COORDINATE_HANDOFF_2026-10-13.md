# DATA-04 product UI coordinate handoff — 2026-10-13

## Scope

The existing F07 browser case exported a fixed fixture directly and verified a hand-derived nonuniform-parent/mixed-skin result in Babylon. The separate product-UI handoff case used a default-transform project. The missing slice was connecting that known transform/skin oracle to the actual product restore and export path while carrying non-default descriptive coordinate metadata.

`e2e/native-consumer.spec.ts` adds `DATA-04 product UI preserves canonical nonuniform skin coordinates with descriptive origin metadata`:

1. Start with the self-authored F07 fixture: a nonuniform shared parent (translation `[-1, 2, 3]`, scale `[2, 3, 4]`), mixed skin, and animation. Set game delivery metadata to `unitMeters=0.01`, `forward=-X`, `origin=[1, 2, 3]`, `originMode=custom`, then encode a valid `.cas3dproj` archive.
2. Import that archive through the product UI, download it back, and verify the skin, clip, hierarchy, parent transform, and metadata survived the product restore path.
3. Use the product UI's actual GLB/sidecar export. Check the sidecar's canonical coordinate contract and that its model hash matches the downloaded GLB.
4. Load those exact bytes in a separate browser context running the independent Babylon.js 9.28.0 consumer. Verify right-handed mode, metadata preservation, and `coordinatesApplied=false`. Compare rest and animated world-space positions against the existing F07 hand-derived oracle: rest bounds `X=[2,4], Y=[0.5,3.5], Z=[1,5]`; at `move` time 1s, `Y=[2.75,5.75]`.

The fixture enters through the product's supported restore UI; the test does not claim that the current authoring UI can create this particular hierarchy/skin.

## Local verification

- Focused new DATA-04 case: Chromium 1/1 and WebKit 1/1; rerun at the committed test head.
- Complete `native-consumer.spec.ts`: Chromium 15/15 and WebKit 15/15.
- `npm run test`: 3,543 passed across 186 files.
- `npm run format:check`: passed.
- `npm run lint`: zero errors; the existing `NativeViewportPanel.tsx:205` React Hook warning remains.
- `npm run build`: TypeScript, app, and H3 builds passed; the existing >500 kB chunk advisory remains.
- `npm run test:ci-scope`: 8/8 passed; test-only/non-publishing classification.
- `git diff --check`: passed.

Remote CI was not monitored. The unit suite also emits an existing Babylon NullEngine skeletal uniform-capacity warning; the NullEngine test is not GPU acceptance evidence.

## Limits and status

This is one repository-authored fixture and one independent Babylon consumer under two headless browser engines. It does not establish arbitrary user-project transforms, additional runtimes/engines, production deployment, physical-device or target-GPU rendering, or a human visual review. DATA-04 and overall acceptance remain **implemented-candidate / partial**; no whole-gate acceptance pass is claimed.
