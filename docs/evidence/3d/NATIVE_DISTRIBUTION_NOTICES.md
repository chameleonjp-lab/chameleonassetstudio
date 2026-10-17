# Distribution notice preservation

Local baseline: `871d0d3cddf1b4faac68868da5b3b737bd528ee9`. Source archive SHA-256: `271e2ed1e83b2c46798147b160ed8224cad456046eec957150e6a28b710b118d`.

SEC-04: eleven paths preserve the package license/NOTICE originals in product and independent-consumer distribution artifacts. Source inspection found the product public directory retained Three's original license, while the observed product bundles referenced ten package names. The lockfile's complete production set contains eleven, including require-from-string; inclusion of its notice does not claim that its code executes in the browser. Babylon's source documentation already retained license/NOTICE text, but the independent consumer public output had no full-text notice asset.

No dependency version, runtime adoption, network policy, project schema, source asset or saved content changes. User-selected static same-origin links are separate from project-material rights. All optional decoder names in upstream notices are preserved without treating them as adopted runtime features. Existing Three/Babylon/validator evaluation-time originals remain intact.

## Verification and limits

A readonly checker and focused negative regressions verify pinned versions, original contents, production coverage and committed notice documents. The focused checker passed 31 tests; TypeScript and scoped lint passed. Product and consumer retained builds succeeded, and the read-only --dist checker matched three output files byte-for-byte (runtime notices, existing Three notice, Babylon notices). Source documents are 13,538 and 28,932 bytes. Browser collection discovered 22 diagnostic cases across two engines. Final clean-head build identity is recorded separately. Browser coverage checks that the product does not request the notice until the link is selected and serves the complete static body. No browser execution is claimed.

This is preservation and engineering provenance, not a legal compliance opinion, commercial-use guarantee, security audit or vulnerability remediation. The cancelled audit and full-suite execution remain unperformed. Publication remains held; this is a local candidate only.

Independent read-only review found no additional P1/P2 and independently confirmed the three distribution byte comparisons. The originals retain upstream notices even for optional components that this consumer does not activate.


## Browser and fresh-distribution follow-up — 2026-10-13 JST

The earlier statement that no browser execution was claimed described the initial evidence capture. The focused product notice route was subsequently exercised on tested source commit `b38adb721facafa910d4d65acfb450de7246328c` (the head of Draft PR #410), using the production-preview 3D entry.

| Check | Result |
| --- | --- |
| Product browser route | Chromium + WebKit: **2/2 passed**. The product does not request `runtime-notices.txt` before the user opens its license link. After activation, the popup uses the same origin and `/licenses/runtime-notices.txt` path, has no query string, and returns bytes identical to `public/licenses/runtime-notices.txt`. |
| Pinned notice checker | `npx vitest run tools/build/thirdPartyNotices.test.ts --reporter=dot`: **31/31 passed** after rebuilding. This includes byte-exact checks for product runtime notices, the Three MIT notice and the independent consumer Babylon notices. |
| Fresh distribution builds | `npm run build` (app + H3) and `npm run consumer:build`: passed. Existing Vite `>500 kB` chunk advisory remains. |

Reproduction command:

```sh
npx playwright test --config playwright.production.config.ts e2e/native-diagnostics-product.spec.ts --grep "bundled dependency notices open only on request" --project=chromium --project=webkit-critical --timeout=30000
```

The optional `vite-node --script ... --dist` helper was not installed; the in-repository 31-test suite supplied the retained-output byte checks without adding tooling. Remote CI was not queried. This follow-up verifies only the local product notice link and the generated notice artifacts. It is not a deployed-site/CDN check, a complete browser-regression run, a legal opinion or a guarantee of commercial-use compliance; SEC-04 remains `implemented-candidate / partial`.
