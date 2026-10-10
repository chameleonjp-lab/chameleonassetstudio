# Read-only Undo budget guidance

Baseline: `1aebdd53b6882745cf9e6dc7f56021cfce5e2241`. Source archive SHA-256: `271dd904892a8aba9a5b54abce6aafe67c11c5e9d0881c4f4cfd80a165d2220c`.

EDIT-07 / UX-01: eight paths expose detached frozen history metadata and read-only product guidance. Serialized commit admission (32MiB by default; Undo + current + candidate) and retained structural ownership estimates (current + Undo + Redo + preview) have distinct labels and scopes. The preview flag describes only the snapshot owned by ProjectHistory, not the separately managed transform/rig/animation overlays. There is no percentage, remaining-edit count or physical-memory claim. Reading metadata does not clone project snapshots, serialize canonical content, mutate revision or schedule a save.

The existing Undo/Redo commands and their resource accounting remain unchanged. The budget failure explanation preserves the current content and prior history, and no automatic cleanup or new clear-history control is introduced. A normal backup does not preserve the full Undo/Redo stack; the UI therefore does not imply that clearing history could be reversed using that backup. Canonical data, source bytes, schema, format and storage remain unchanged.

## Verification

Focused core/session tests cover metadata across commands, previews, rejected edits and existing explicit clear operations. The product browser case checks guidance opening, saved backup equivalence, Undo/Redo counts and preservation across save. The three focused core/session/transform files passed 101 tests; TypeScript, scoped ESLint and formatting passed. Chromium/WebKit collection found 18 editing cases, including the new guidance case; these were not executed. A clean fixed-head build is recorded separately after commit. Browser execution, full-suite completion, long-running physical-device edits and whole-plan acceptance remain unverified. This is an unpublished local candidate.

Independent read-only review found the transform regression still expected the recognizable term “Undo予算”. The new explanation retains that term with its precise Japanese definition, and the unchanged transform regression passes alongside history/session tests. No further P1/P2 finding remained.
