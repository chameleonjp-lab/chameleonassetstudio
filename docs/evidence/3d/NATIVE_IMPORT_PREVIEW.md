# GLB import preview before persistence

Local candidate for the remaining IMP-01 visual preview boundary, based on hierarchy clone `ee096dc9071a74d261026c88ecae13b23c04eff8`. Source baseline archive SHA-256: `5288ee95c387f98649a3248d90ed4fe65c253eb6bde1b5b80b4c867d891cb683`.

## Product contract

- Successful GLB/game.json validation creates an unsaved candidate, not a repository write. The existing source GLB, sidecar/hash and loss checks remain upstream.
- A separate readonly renderer previews converted rest geometry/material. It does not claim animation playback, source-only feature fidelity or external-consumer acceptance.
- Source hash, summary and loss information are visible before an explicit acknowledgement. Saving remains disabled until the current candidate has an accepted active preview and acknowledgement.
- Camera controls only change this candidate's view. Current canonical project, selection, undo history and original bytes remain unchanged.
- Apply uses the existing atomic new-copy callback. It never overwrites the current project. A late cancellation may leave the already committed new copy in the library; it never deletes that copy.
- Input/loss-permission change, close, Escape, cancel, origin revision/owner/permission change or background invalidates the review. Foreground return does not revive old acknowledgement.
- The candidate owns bounded JSON/structure/binary-copy estimates. View initialization, late texture decode and asynchronous persistence borrow ownership; disposal cannot release underlying admission before those borrowers settle. The accounting is an engineering estimate, not measured CPU/GPU heap or a physical-device guarantee.
- Renderer refusal/context loss keeps confirmation unavailable and the selected original intact. No fake saved revision or empty-scene successful preview substitutes for the actual candidate.

## Verification boundary

Focused owner/controller tests, static checks and browser case collection are recorded below when complete. The prior full-suite cancellation, local browser-launch rejection and inaccessible artifacts remain separate boundaries. No whole-suite replacement, browser bypass or external publication is part of this local candidate.

### Local verification checkpoint — 2026-10-10 JST

- New focused suites: **42 passed** (19 owner/admission, 23 preview lifetime). The source result from real `exportGlb` → paired game.json → `importGlb` is admitted with skin, clips, game metadata and original bytes intact.
- Deferred factory and real NativeTexturePreparer with a non-interruptible fake decoder retain their source owner until actual settlement. Twenty repeated cancellation cycles return the declared resource ledger to its baseline. Independent save borrowing survives review/view closure without clearing any original arrays.
- Readiness covers accepted geometry, prepared texture, fitted view and active callback/current port status. Reentrant observers, failure/refusal, context state changes and pre-factory disposal are covered.
- Four-file ESLint, Prettier and TypeScript checks passed. The integrated UI lint and application build were checked separately.
- Product browser collection: **18 cases in one file**, including new unsaved confirmation cancellation and unavailable-renderer cases. Existing successful import now explicitly waits for preview, acknowledges it and saves afterward. Close/Escape/focus, file and canonical changes, and synthetic freeze/resume invalidation are covered by prepared cases. **Browser cases were not executed here.** Synthetic events are not evidence of physical OS interruption.
- No full-suite or npm audit retry, browser workaround, inaccessible artifact retrieval, publication, main merge or deployment occurred.

### Final review correction — 06:04 JST

Independent review identified a P2 race: React-rendered readiness/acknowledgement could remain visible briefly after renderer failure. A synchronous confirmation gate now invalidates admission before scheduling UI updates, and Apply consults that exact candidate gate. Recovery from false to true never restores old acknowledgement.

Four focused regressions cover immediate failure, exact candidate identity, cancellation and disposed candidates. **Final focused total: 46 passed (23 review/gate + 23 preview)**. A prepared same-JavaScript-turn context-loss notification then save click adds a browser regression; **20 browser cases collected, not executed**. The reviewer confirmed the P2 closed with no remaining P1/P2. Final TypeScript/lint/application build passed (9.03 s Vite build); static success is not visual or physical-device acceptance.
