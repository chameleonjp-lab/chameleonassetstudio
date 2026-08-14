import { mkdir, readFile, writeFile } from 'node:fs/promises';

const templatePath = 'docs/future/2D_5_EVIDENCE_LABELS_TEMPLATE.json';
const outputPath = 'test-results/group18-evidence-contract.json';
const stable = JSON.parse(await readFile(templatePath, 'utf8'));
const runId = process.env.GITHUB_RUN_ID ?? 'local';
const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
const repository = process.env.GITHUB_REPOSITORY ?? 'local/group18';
const runRef = process.env.GITHUB_RUN_ID
  ? `${serverUrl}/${repository}/actions/runs/${runId}`
  : `ci://group18/${runId}`;

const record = {
  stable,
  dynamic: {
    scope: {
      profile: stable.profile,
      targetName: stable.target.name,
      targetVersion: stable.target.version,
      fixtureId: stable.fixtureId,
    },
    sourceCommit: process.env.GITHUB_SHA ?? 'local',
    fixtureHash: stable.fixtureHash,
    manifestHash: stable.manifestHash,
    completedChecks: ['contract-template'],
    ciConclusion: 'success',
    artifactRefs: [runRef],
    artifactDigests: [],
    generatedAt: new Date().toISOString(),
    runRef,
  },
};

await mkdir('test-results', { recursive: true });
await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\\n`, 'utf8');
console.log(`Wrote ${outputPath} for ${runRef}`);
