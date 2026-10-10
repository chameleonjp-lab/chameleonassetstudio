# Native architecture source and document audit

Local source baseline: `a91d9f7851783fb6c8f49fe67b4cae36b7a26ad0`. Source archive SHA-256: `8ab66833c15c39c379f62bf79bc8653af25e9c6cccd1a66096a5a6affd3b2fa8`.

Purpose: DOC-03 / DOC-05 / DOC-06. Seven architecture documents now distinguish the current local candidate from initial E/P plans and old review results. Main integration, publication, runtime/network behavior and physical-device acceptance are not inferred from source presence.

## Scope

- Two new developer-only files: `tools/build/nativeArchitecture.ts` and its focused test file.
- Existing architecture index, entries, ownership, dataflow, lifecycle, traceability and review.
- This evidence file. No product source, schema, dependency package or runtime setting changes.

## Reproducible checks

The audit reads TypeScript source and the seven documents without external requests or writes. It classifies static/runtime/type/literal dynamic import and worker URL edges, checks existing relative targets and prohibited domain directions, and reports cycles with runtime/type/diagram roles separated.

Mermaid checking covers the documented small flowchart subset and declared node/edge integrity. Lifecycle feedback is intentional and remains informational. This is not the official Mermaid parser, rendered-diagram QA or a replacement for the prior fixed-head GitHub rendering observation. Unsupported syntax is reported rather than silently accepted.

Relative document links check target existence, including directory links. Anchor targets and external URL availability are reported as unverified unless specifically tested. A source graph is not a Rollup chunk/network graph: keep `tools/build/domainBoundary.ts` and actual browser/network acceptance separate.

Use the read-only CLI from the repository root:

```sh
node --experimental-strip-types tools/build/nativeArchitecture.ts --json
npx vitest run tools/build/nativeArchitecture.test.ts
```

The final local checks below cover the documented source candidate. The original 169 requirement IDs, priorities, main stages, fixture/test mappings and deferred adoption decisions are preserved. The fixed earlier acceptance ledger is not rewritten as a newer pass record.


## Local checks (2026-10-10 JST)

- Focused Vitest: 74/74 passed. Negative fixtures cover unresolved and unsupported edges, shared-descendant domain leakage, runtime versus type cycles, malformed diagrams, undeclared/duplicate nodes and missing document targets.
- TypeScript no-emit, targeted ESLint, targeted Prettier and whitespace checks passed.
- Read-only CLI: exit 0; 101 source files (55 core, 9 adapter, 32 editor, 2 entry, 3 independent consumer).
- 489 classified edges: 310 runtime, 166 type, 1 worker and 12 asset; 433 relative edges. Mixed type/runtime imports have separate classified edges, so this is not an import-statement count.
- Seven documents, 398 relative links (395 files and 3 directories), and 16 diagrams checked.
- No unresolved/unsupported findings, prohibited domain directions or source-cycle groups were reported for this input.
- Six heading anchors remain explicitly unverified. The lifecycle feedback component (`LC_ACTIVE`, `LC_CHECK`, `LC_HIDDEN`, `LC_SUSPEND`) is informational, not a source-cycle failure.
- All original 169 requirement rows were compared with the baseline and retained unchanged. New local-candidate navigation does not change their acceptance status.

The full unit aggregate and browser/physical-device checks were not rerun for this developer-tool/document change. These focused checks do not establish whole-product acceptance. This local candidate is not yet published or integrated into main.

Independent read-only review found and closed the same-realm wording discrepancy. It also identified qualified worker traversal and the existing 2D canvas renderer prefix as missing static cases; both now have fail-closed regression coverage. These findings demonstrate the tool’s bounded scope rather than a guarantee about every possible JavaScript expression.
