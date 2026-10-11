# Authoring, assembly and texture failure guidance

Local baseline: `e01d9dbfec8c02a23926acf5fc3bd82414036d7f`. Preserved source archive SHA-256: `36082c8144d3ed05d740d43e4397b9359430548576889f375e7e6a64aff1ddf9`.

UX-01, eleven paths. Read-only inspection traced ordinary material inputs through addMaterial to canonical validation: out-of-range emissive/factors/alpha-cutoff errors were English and forwarded verbatim by the authoring panel. Assembly already had many specific Japanese errors, while its catch and all texture catches could still forward shared resource or unknown decoder exceptions.

The three panels now use bounded recognition and fixed Japanese target/reason/action/code. Existing authored Japanese validation literals remain available only through exact matching, rather than forwarding arbitrary Japanese or English exception text. Unknown paths, filenames, URLs, stacks and object stringifiers do not become messages. The classifier does not change validation, transactions, schema or input values. It does not claim all caught failures occurred before commit: users check the current target and result before retrying.

## Verification

Focused unit coverage includes real core material errors, resource-limit messages, authored Japanese specificity, unknown values and private-path/getter/stringifier boundaries. Product tests prepare three out-of-range material attempts with unchanged full backups, and an unknown image-file read failure with no path disclosure or partial image assignment. The final focused classifier file passed 229 tests, including 149 exact authored Japanese messages and producer-source coverage. TypeScript, scoped ESLint and formatting passed. Two product files collected 48 Chromium/WebKit cases. Independent read-only review found no additional P1/P2. Final clean-head build identity is recorded separately. Browser cases remain collected rather than executed.

This is not complete localization of all 3D panels. Rig/animation/viewport/session and other remaining paths are separate follow-up scope. Cancelled full-suite/audit/publication and blocked actual browser execution are not retried. This is an unpublished local candidate.
