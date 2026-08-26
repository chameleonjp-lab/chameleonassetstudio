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
    expect(evidence.flow.find((flow) => flow.id === 'preflight-fix-and-retry')?.status).toBe(
      'partial-coverage',
    );
    expect(evidence.flow.find((flow) => flow.id === 'preflight-fix-and-retry')?.missing).toMatch(
      /issue -> fix -> retry/,
    );
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
        'physical-device evidence',
        'Group 19 and Group 20 runtime decisions',
      ]),
    );
    expect(evidence.status).not.toBe('verified');
    expect(evidence.manualGate.status).not.toBe('passed');
  });
});
