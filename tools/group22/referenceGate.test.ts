import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface ReferenceFlow {
  id: string;
  status: string;
  testFiles?: string[];
  fixturePaths?: string[];
  missing?: string;
}

interface ReferenceEvidence {
  format: string;
  version: string;
  referenceId: string;
  status: string;
  scope: {
    requiredData: string[];
    outputFixture: string;
    roundTripFormat: string;
  };
  flow: ReferenceFlow[];
  automatedEvidence: {
    sourcePullRequest: number;
    sourceHead: string;
    mergeCommit: string;
    workflow: {
      runNumber: number;
      actionsId: string;
      attempt: number;
      status: string;
      e2ePassed: number;
      h3Passed: number;
      pages: { open: number; closed: number };
    };
    artifacts: { genericWeb: string; playwright: string };
    fixedHeadReadOnlyReview: {
      status: string;
      count: number;
      scope: string;
      publicGitHubReview: string;
      reviewedHead: string;
      reviewedAt: string;
      reviews: {
        role: string;
        result: string;
        blocker: number;
        must: number;
        should: number;
        note: string;
      }[];
      recordedInHead: string;
    };
    artifactNotes: { genericWeb: string; playwright: string };
    artifactContentReview: { status: string; reason: string };
    previousHandoffVerification: {
      pullRequest: number;
      head: string;
      workflow: {
        runNumber: number;
        actionsId: string;
        status: string;
        jobs: { classifyChanges: string; buildAndTest: string; e2e: string };
        unit: { filesPassed: number; testsPassed: number };
      };
      artifact: string;
      e2eSkipReason: string;
      recordedScope: string;
    };
    handoffVerification: {
      pullRequest: number;
      head: string;
      workflow: {
        runNumber: number;
        actionsId: string;
        status: string;
        jobs: { classifyChanges: string; buildAndTest: string; e2e: string };
        unit: { filesPassed: number; testsPassed: number };
      };
      artifact: string;
      artifactName: string;
      artifactDigest: string;
      artifactSizeBytes: number;
      workflowHead: string;
      pullRequestMergeRef: string;
      e2eSkipReason: string;
      recordedScope: string;
    };
    latestBookkeepingVerification: {
      pullRequest: number;
      head: string;
      workflow: {
        runNumber: number;
        actionsId: string;
        status: string;
        jobs: { classifyChanges: string; buildAndTest: string; e2e: string };
        unit: { filesPassed: number; testsPassed: number };
      };
      artifact: string;
      artifactName: string;
      artifactDigest: string;
      artifactSizeBytes: number;
      workflowHead: string;
      pullRequestMergeRef: string;
      e2eSkipReason: string;
      recordedScope: string;
    };
  };
  documentation: { status: string; requiredPaths: string[] };
  manualGate: { status: string; requiredEnvironments: string[]; reason: string };
  promotion: { next: string; blockedUntil: string[] };
  limitations: string[];
}

const toolsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolsDirectory, '../..');
const evidencePath = resolve(repositoryRoot, 'docs/future/2D_6_REFERENCE_PROJECT_EVIDENCE.json');
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as ReferenceEvidence;

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
}

describe('Group 22 reference project evidence gate', () => {
  it('keeps the representative project manifest explicit and non-verified', () => {
    expect(evidence.format).toBe('chameleon-reference-project-evidence');
    expect(evidence.version).toBe('0.1.0');
    expect(evidence.referenceId).toBe('2d-pro-reference-001');
    expect(evidence.status).toBe('candidate');
    expect(evidence.scope.roundTripFormat).toBe('.casproj');
    expect(evidence.scope.outputFixture).toBe('public/generic-web-fixture');
    expect(evidence.scope.requiredData).toEqual(
      expect.arrayContaining([
        'frame',
        'animation',
        'origin',
        'anchor',
        'rect-or-circle-collider',
        'scale',
        'multiple-page-output',
      ]),
    );
    expect(evidence.manualGate.status).toBe('not-run');
    expect(evidence.manualGate.reason).toMatch(/PC is unavailable/);
    expect(evidence.promotion.next).toBe('2D Pro Gate human approval');
    expect(evidence.limitations.join('\n')).toMatch(/supporting evidence/);
    expect(evidence.automatedEvidence).toMatchObject({
      sourcePullRequest: 272,
      sourceHead: '6270e59abbb999d00d7c434ff66c76db5836b0fc',
      mergeCommit: '17d62c49792202ef411124df03e3809ded5f2d8c',
      workflow: {
        runNumber: 892,
        actionsId: '33248089842',
        attempt: 2,
        status: 'success',
        e2ePassed: 205,
        h3Passed: 1,
        pages: { open: 1, closed: 1 },
      },
      fixedHeadReadOnlyReview: {
        status: 'passed',
        count: 3,
        scope: 'contract, CI/E2E, and scope/Gate',
        publicGitHubReview: 'not-posted',
        reviewedHead: 'b961c2086c92b18a0df6e24688bf7ae48d428567',
        reviewedAt: '2026-08-31',
        reviews: [
          {
            role: 'contract/evidence',
            result: 'passed',
            blocker: 0,
            must: 0,
            should: 0,
            note: 'Run #898 content and Run #901 bookkeeping are explicitly separated; no stale assertion remains.',
          },
          {
            role: 'CI/reproducibility',
            result: 'passed',
            blocker: 0,
            must: 0,
            should: 0,
            note: 'Run #901 succeeded with 87 test files / 916 tests and the expected E2E skip.',
          },
          {
            role: 'scope/Gate',
            result: 'passed',
            blocker: 0,
            must: 0,
            should: 0,
            note: 'Nine docs/evidence/test files only; candidate boundaries and human Gate limits remain intact.',
          },
        ],
        recordedInHead:
          'this bookkeeping commit; the subsequent PR #274 CI run validates the recording commit separately.',
      },
      artifactContentReview: { status: 'not-run' },
      previousHandoffVerification: {
        pullRequest: 273,
        head: '2e3c5eed97cb7298c1032f091e783a46f71c0b98',
        workflow: {
          runNumber: 895,
          actionsId: '33347654457',
          status: 'success',
          jobs: {
            classifyChanges: 'success',
            buildAndTest: 'success',
            e2e: 'skipped',
          },
          unit: { filesPassed: 87, testsPassed: 916 },
        },
      },
      handoffVerification: {
        pullRequest: 274,
        head: '9a857574ba5eeffc6d87f242236d9127c3459f9a',
        workflow: {
          runNumber: 898,
          actionsId: '33349026436',
          status: 'success',
          jobs: {
            classifyChanges: 'success',
            buildAndTest: 'success',
            e2e: 'skipped',
          },
          unit: { filesPassed: 87, testsPassed: 916 },
        },
        artifact:
          'https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/33349026436/artifacts/9742974357',
        artifactName: 'group22-reference-project-evidence-33349026436-1',
        artifactDigest: 'sha256:194780f0d622a1102caa0f276d79f0a38d228820e3ab023916ed67c336ea3396',
        artifactSizeBytes: 2536,
        workflowHead: '9a857574ba5eeffc6d87f242236d9127c3459f9a',
        pullRequestMergeRef: 'e70eae246fe822ecb1016fd574f78e92eaea2606',
        e2eSkipReason:
          'The changed-file classification for the docs and Group 22 Gate test skipped E2E; representative-flow E2E evidence is recorded separately under PR #272 Run #892.',
        recordedScope:
          'PR #274 handoff correction content verified at this PR head; later bookkeeping-only commits require their own CI record.',
      },
      latestBookkeepingVerification: {
        pullRequest: 274,
        head: 'b961c2086c92b18a0df6e24688bf7ae48d428567',
        workflow: {
          runNumber: 901,
          actionsId: '33349818980',
          status: 'success',
          jobs: {
            classifyChanges: 'success',
            buildAndTest: 'success',
            e2e: 'skipped',
          },
          unit: { filesPassed: 87, testsPassed: 916 },
        },
        artifact:
          'https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/33349818980/artifacts/9743224756',
        artifactName: 'group22-reference-project-evidence-33349818980-1',
        artifactDigest: 'sha256:36d18def0c221a4d981508f09fd379ce2a5e916c269162d893758380caf20eb2',
        artifactSizeBytes: 2686,
        workflowHead: 'b961c2086c92b18a0df6e24688bf7ae48d428567',
        pullRequestMergeRef: '3954be5272649d9009905c3d62c8ee5b04eebcb0',
        e2eSkipReason:
          'The changed-file classification for the docs and Group 22 Gate test skipped E2E; representative-flow E2E evidence is recorded separately under PR #272 Run #892.',
        recordedScope:
          'PR #274 post-handoff test assertion/format bookkeeping at the reviewed head; the following ledger-recording commit is validated by its own CI.',
      },
    });
    expect(evidence.automatedEvidence.artifacts.genericWeb).toMatch(
      /actions\/runs\/33248089842\/artifacts\/9713610304$/,
    );
    expect(evidence.automatedEvidence.artifacts.playwright).toMatch(
      /actions\/runs\/33248089842\/artifacts\/9713609727$/,
    );
    expect(evidence.automatedEvidence.artifactNotes.genericWeb).toMatch(
      /not a Group 22-only artifact/,
    );
    expect(evidence.automatedEvidence.handoffVerification.artifact).toMatch(
      /actions\/runs\/33349026436\/artifacts\/9742974357$/,
    );
    expect(evidence.automatedEvidence.handoffVerification.e2eSkipReason).toMatch(/skipped E2E/);
    expect(evidence.automatedEvidence.previousHandoffVerification.pullRequest).toBe(273);
    expect(evidence.automatedEvidence.previousHandoffVerification.workflow.runNumber).toBe(895);
    expect(evidence.automatedEvidence.handoffVerification.artifactName).toBe(
      'group22-reference-project-evidence-33349026436-1',
    );
    expect(evidence.automatedEvidence.handoffVerification.workflowHead).toBe(
      '9a857574ba5eeffc6d87f242236d9127c3459f9a',
    );
    expect(evidence.automatedEvidence.handoffVerification.pullRequestMergeRef).toBe(
      'e70eae246fe822ecb1016fd574f78e92eaea2606',
    );
    expect(evidence.automatedEvidence.handoffVerification.artifactDigest).toBe(
      'sha256:194780f0d622a1102caa0f276d79f0a38d228820e3ab023916ed67c336ea3396',
    );
    expect(evidence.automatedEvidence.fixedHeadReadOnlyReview).toMatchObject({
      status: 'passed',
      count: 3,
      reviewedHead: 'b961c2086c92b18a0df6e24688bf7ae48d428567',
      reviewedAt: '2026-08-31',
      publicGitHubReview: 'not-posted',
    });
    expect(evidence.automatedEvidence.fixedHeadReadOnlyReview.reviews).toHaveLength(3);
    expect(evidence.automatedEvidence.latestBookkeepingVerification).toMatchObject({
      pullRequest: 274,
      head: 'b961c2086c92b18a0df6e24688bf7ae48d428567',
      workflow: {
        runNumber: 901,
        actionsId: '33349818980',
        status: 'success',
        jobs: {
          classifyChanges: 'success',
          buildAndTest: 'success',
          e2e: 'skipped',
        },
        unit: { filesPassed: 87, testsPassed: 916 },
      },
      artifactName: 'group22-reference-project-evidence-33349818980-1',
      artifactDigest: 'sha256:36d18def0c221a4d981508f09fd379ce2a5e916c269162d893758380caf20eb2',
      artifactSizeBytes: 2686,
      workflowHead: 'b961c2086c92b18a0df6e24688bf7ae48d428567',
      pullRequestMergeRef: '3954be5272649d9009905c3d62c8ee5b04eebcb0',
    });
  });

  it('references existing tests and fixtures without silently dropping a flow step', () => {
    const expectedFlowIds = [
      'create-or-import',
      'frame-and-animation',
      'game-data',
      'game-check',
      'preflight-fix-and-retry',
      'generic-web-http',
      'casproj-reopen-and-regenerate',
      'first-time-review',
    ];
    expect(evidence.flow.map((flow) => flow.id)).toEqual(expectedFlowIds);
    expect(new Set(evidence.flow.map((flow) => flow.id)).size).toBe(evidence.flow.length);
    for (const flow of evidence.flow) {
      for (const path of flow.testFiles ?? []) {
        expect(existsSync(resolve(repositoryRoot, path)), `${flow.id}: ${path}`).toBe(true);
      }
      for (const path of flow.fixturePaths ?? []) {
        expect(existsSync(resolve(repositoryRoot, path)), `${flow.id}: ${path}`).toBe(true);
      }
    }
    const preflightFlow = evidence.flow.find((flow) => flow.id === 'preflight-fix-and-retry');
    expect(preflightFlow?.status).toBe('automated-reference-flow');
    expect(preflightFlow?.testFiles).toContain('e2e/reference-project-gate.spec.ts');
    expect(preflightFlow?.missing).toMatch(/fixed-head CI artifact content review/);
    const genericWebFlow = evidence.flow.find((flow) => flow.id === 'generic-web-http');
    expect(genericWebFlow?.status).toBe('automated-http-and-closure');
    expect(genericWebFlow?.testFiles).toContain('tools/group23/genericWebPackageClosure.test.ts');
    const casprojFlow = evidence.flow.find((flow) => flow.id === 'casproj-reopen-and-regenerate');
    expect(casprojFlow?.status).toBe('automated-reference-flow');
    expect(casprojFlow?.testFiles).toContain('e2e/reference-project-gate.spec.ts');
    expect(casprojFlow?.missing).toMatch(/fixed-head CI artifact content review/);
    expect(evidence.flow.find((flow) => flow.id === 'first-time-review')?.status).toBe('not-run');
  });

  it('keeps documentation and release entry points present', () => {
    for (const path of evidence.documentation.requiredPaths) {
      expect(existsSync(resolve(repositoryRoot, path)), path).toBe(true);
    }
    expect(evidence.documentation.status).toBe('static-audit');

    const readme = readRepositoryFile('README.md');
    expect(readme).toContain('docs/future/2D_COMPLETION_ROADMAP.md');
    expect(readme).toContain('docs/USER_GUIDE.md');
    expect(readme).toContain('docs/RELEASE_CHECKLIST.md');

    const roadmap = readRepositoryFile('docs/future/2D_COMPLETION_ROADMAP.md');
    expect(roadmap).toContain('2D-6-REFERENCE');
    expect(roadmap).toContain('2D Pro Gate');
    const implementationPlan = readRepositoryFile('docs/IMPLEMENTATION_PLAN.md');
    expect(implementationPlan).toContain('2D-6-REFERENCE');
    const releaseChecklist = readRepositoryFile('docs/RELEASE_CHECKLIST.md');
    expect(releaseChecklist).toContain('Group 22');
  });

  it('does not allow this audit to declare runtime or 3D completion', () => {
    const roadmap = readRepositoryFile('docs/future/2D_COMPLETION_ROADMAP.md');
    expect(roadmap).toContain('3D を開始しない');
    expect(evidence.promotion.blockedUntil).toEqual(
      expect.arrayContaining([
        'fixed-head CI artifact content review for the representative flow',
        'physical-device evidence',
        'Group 19 and Group 20 runtime decisions',
      ]),
    );
    expect(evidence.status).not.toBe('verified');
    expect(evidence.manualGate.status).not.toBe('passed');
  });
});
