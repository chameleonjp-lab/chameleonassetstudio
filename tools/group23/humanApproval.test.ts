import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const baselinePath = 'docs/future/3d/reports/3D_GATE_BASELINE.md';
const baseline = readFileSync(resolve(root, baselinePath), 'utf8');

describe('Group 23 human acceptance provenance and 3D-0 boundary', () => {
  it('records the latest human acceptance without manufacturing test evidence', () => {
    const json = baseline.match(/```json\n([\s\S]*?)\n```/)?.[1];
    expect(json).toBeDefined();
    const decision: unknown = JSON.parse(json!);
    expect(decision).toEqual({
      recordId: 'ADR-2026-09-27-037',
      decisionSource: 'user-report',
      gateDecision: 'approved',
      authorization: '3D-0-investigation',
      acceptedAreas: [
        'artifact-content-review',
        'first-time-user-review',
        'physical-PC-iPhone-iPad-Android',
        'runtime-Unity-RPG-Maker-MZ',
        '2D-Pro-Gate',
      ],
      userTestedRevision: null,
      evidenceDetailStatus: 'not-supplied',
      recordedAgainstMain: '4d1ed9dfed9fcfda82cebc9d2286722f53771bda',
      historicalEvidencePolicy: 'preserve',
      compatibilityPromotion: false,
      productionDependencyApproval: false,
      fourStagePlanApproval: false,
    });
  });

  it.each([
    'README.md',
    'docs/IMPLEMENTATION_PLAN.md',
    'docs/RELEASE_CHECKLIST.md',
    'docs/USER_GUIDE.md',
    'docs/future/README.md',
    'docs/future/2D_COMPLETION_ROADMAP.md',
    'docs/future/2D_PRO_GATE_AUDIT.md',
    'docs/future/2D_6_REFERENCE_DOCS_GATE_PLAN.md',
    'docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md',
    'docs/future/DECISION_LOG.md',
    'docs/future/3d/README.md',
  ])('keeps the current decision reachable from %s', (path) => {
    const content = readFileSync(resolve(root, path), 'utf8');
    const links = [...content.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
    expect(
      links.some((link) => resolve(root, dirname(path), link) === resolve(root, baselinePath)),
    ).toBe(true);
  });
});
