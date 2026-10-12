# IMP-05 internal GLB URI no-fetch regression — 2026-10-13

## Scope

The existing product E2E rejected external HTTPS sentinel URIs in both GLB buffer and image declarations. This extension adds four remaining host cases: `http://localhost:4177` (buffer), `http://127.0.0.1:4177` (image), `http://192.168.1.50:4177` (RFC1918 buffer), and `http://169.254.169.254` (link-local image). Each uses a unique marker path. A browser-context route observes and aborts any matching request; the expected matching-request count is **zero**, proving no request attempt rather than merely an HTTP error.

All six cases (the two existing external-host cases and these four additions) are rejected at the product import-review boundary with the expected stable error category. The alert omits each raw hostname, and buffer rejection retains the no-external-fetch guidance. After every rejection, a fresh product backup confirms deep equality of both project and blob map, and no imported-GLB revision is adopted.

## Local verification

| Check | Result |
| --- | --- |
| Focused IMP-05 case | Chromium 1/1; WebKit 1/1; rerun at committed test head |
| Complete `native-asset-io-product.spec.ts` | Chromium 21/21; WebKit 21/21 |
| Unit tests | 3,543/3,543 across 186 files |
| Format | `npm run format:check` passed |
| Lint | Zero errors; existing `NativeViewportPanel.tsx:205` React Hook warning remains |
| Build | TypeScript, app, and H3 builds passed; existing >500 kB chunk advisory remains |
| CI-scope | 8/8 passed; test-only/non-publishing classification |
| Diff check | `git diff --check` passed |

The unit suite also emits an existing Babylon NullEngine skeletal uniform-capacity warning; it is not GPU acceptance evidence. Remote CI was not monitored.

## Limits and status

This is a local headless-browser test against four explicit URI host classes in GLB buffers/images. It does not establish all URI schemes/address families, DNS rebinding or proxy behavior, production network-egress policy, or real OS/browser-process isolation. Other code-bearing content classes are covered by separate cases, not this addition. IMP-05 and overall acceptance remain **implemented-candidate / partial**; no whole-gate security or production acceptance pass is claimed.
