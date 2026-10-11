# Rig and animation failure guidance

Local baseline: `2cd84444dbdaaea4d8146a5dcac8ed0931d6aaa9`. Preserved source archive SHA-256: `6283ce063d2916e90a439e712a2f34f9c61459ee36fa2aa603acadc25a26a4ee`.

UX-01, ten paths. Ordinary UI entries can trigger Joint name must be nonempty, Cannot normalize zero weights and Invalid key time. The existing animation regression explicitly expected the English error. The two status-reason displays also use a separate bounded notice formatter: ordinary cancellation is not labeled a failed operation, known reasons remain Japanese, and unknown text is replaced with a neutral state-change notice. The shared bounded classifier now distinguishes these corrective actions with rig/animation target labels while retaining known Japanese validation reasons.

No implicit normalization, joint removal, key coalescing, interpolation change or retry. Canonical authoring rules, renderer, source bytes, history semantics and saved formats remain unchanged. Unknown exception text stays private; messages ask users to inspect current results before repeating an operation.

## Verification

Focused tests exercise actual core name/weight/key failures and unchanged canonical data. The product rig case covers empty and overlong names and zero-weight normalization. The animation case covers duplicate/negative/out-of-duration times. Full backups must remain equal across rejected actions. The prior English assertion is replaced with the specific Japanese time guidance and stable code, not weakened to mere alert existence.

The focused rig/animation/classifier set passed 462 tests across five files (374 classifier tests). Integration initially detected missing discriminated-union narrowing in five test assertions; explicit failure guards preserve the intended assertions and type safety. Final integration type/lint/format/build results are pinned in the accompanying validation JSON. Product browser collection contains 22 cases across the two affected files; collection is not execution. Independent read-only review found no additional P1/P2. Browser execution, physical-device verification and whole-app localization acceptance remain pending. Cancelled full-suite/audit/publication are not retried. This is a local unpublished candidate.
