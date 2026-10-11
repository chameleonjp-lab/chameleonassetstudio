# Versioned old/new app rollback rehearsal — 2026-10-11

## Result

**PASS — one isolated Chromium browser rehearsal.** The historical application at `910ed2d0d667c6fa5f30e68c74ecc0f52307ce21` (app `0.1.0`, project/backup schema `0.2.0`) imported and exported a fixture. The current application at `728d571cba22c207ae56a7a866123f3c416ffe6a` (app `0.1.0`, native schema `0.3.0`) discovered that saved project in the old IndexedDB namespace, created an upgraded copy, and retained a verified pre-migration recovery archive. The historical app then rejected a `0.3.0` backup without changing either database's project-content stores.

## Reproduce

From this commit, with the repository's Node dependencies installed and system Chromium available:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:versioned-rollback
```

The runner materializes the pinned old source from Git history in a temporary directory, verifies its archived tree, runs `npm ci`, and builds both app versions to temporary output directories. A small local static server mounts them at separate paths on the same origin (`/rollback-old` and `/rollback-new`). Playwright uses a fresh browser context; no deployed service or real user data is touched. Temporary build directories are removed on success and retained after a failure for diagnosis. The test writes machine-readable output and a refusal-state screenshot under `test-results/versioned-rollback-rehearsal/`.

## Assertions and evidence

- Seed backup and historical-app export both identify as schema `0.2.0`; the current migration export identifies as `0.3.0` and retains the source image bytes.
- The current app creates the new project as a copy and records a readable, hash-verified `0.2.0` pre-migration archive in its recovery store.
- Old IndexedDB project-content stores (all stores except the transient writer-lease store) have the same SHA-256 before and after migration: `2eb1eb800832d981461fccd7d9ed1e0c7291251e08bba19408b82bdeadfea993`.
- Current IndexedDB project-content stores have the same SHA-256 before and after the historical app rejects the new backup: `a874c23d09fb22bb7ff7a41ceddc6363a07306574d0ae09293343cd4176e3031`.
- The historical app displays `Unsupported backup format/version` and says it is keeping the current content.
- The retained legacy archive SHA-256 is `2d5b9818b7f657f3528777353d97d00c767b86c6719f8291c34b252aa4e8d73b`.

Full run metadata and all recorded hashes are in [`ROLLBACK_REHEARSAL_2026-10-11.json`](ROLLBACK_REHEARSAL_2026-10-11.json). The final rejection state is captured in [`ROLLBACK_REHEARSAL_2026-10-11.png`](ROLLBACK_REHEARSAL_2026-10-11.png).

## Scope limits

This is a local browser rehearsal of the web application and IndexedDB namespaces. It does **not** prove an installed desktop/mobile application's OS-level downgrade, filesystem/profile behavior, release packaging, production rollout, physical-device recovery, or formal release acceptance. Those B10 gates remain open.
