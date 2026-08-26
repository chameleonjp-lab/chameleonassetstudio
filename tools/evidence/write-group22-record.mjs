import { mkdir, readFile, writeFile } from 'node:fs/promises';

const templatePath = 'docs/future/2D_6_REFERENCE_PROJECT_EVIDENCE.json';
const outputPath = 'test-results/group22-reference-project-evidence.json';
const stable = JSON.parse(await readFile(templatePath, 'utf8'));
const runId = process.env.GITHUB_RUN_ID ?? 'local';
const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
const repository = process.env.GITHUB_REPOSITORY ?? 'local/group22';
const runRef = process.env.GITHUB_RUN_ID
  ? `${serverUrl}/${repository}/actions/runs/${runId}`
  : `ci://group22/${runId}`;

const record = {
  stable,
  dynamic: {
    referenceId: stable.referenceId,
    sourceCommit: process.env.GITHUB_SHA ?? 'local',
    ciConclusion: 'success',
    artifactRefs: [runRef],
    generatedAt: new Date().toISOString(),
    runRef,
  },
};

await mkdir('test-results', { recursive: true });
await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outputPath} for ${runRef}`);
