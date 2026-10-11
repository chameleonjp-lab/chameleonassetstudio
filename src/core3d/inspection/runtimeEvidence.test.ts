import { describe, expect, it } from 'vitest';
import {
  hasMatchingRuntimeEvidence,
  type RuntimeEvidence,
  type RuntimeEvidenceTarget,
} from './runtimeEvidence';
const target: RuntimeEvidenceTarget = {
  projectId: 'p',
  revision: 3,
  modelHash: 'a'.repeat(64),
  sidecarHash: 'b'.repeat(64),
  runtime: 'Babylon',
  runtimeVersion: '9.28.0',
  importer: 'glTF',
  importerVersion: '9.28.0',
  profileId: 'basic',
};
const evidence = (): RuntimeEvidence => ({
  ...target,
  scope: { kind: 'asset', projectId: 'p', revision: 3 },
  sourceCommit: 'c'.repeat(40),
  evidencePath: 'evidence/result.json',
  result: 'passed',
  checks: { geometry: true, material: true, skin: true, clip: true, sidecar: true },
});
describe('runtime evidence identity', () => {
  it('requires exact asset, revision, output hashes and runtime versions', () => {
    expect(hasMatchingRuntimeEvidence(evidence(), target)).toBe(true);
    for (const key of [
      'projectId',
      'modelHash',
      'sidecarHash',
      'runtime',
      'runtimeVersion',
      'importer',
      'importerVersion',
      'profileId',
    ] as const)
      expect(hasMatchingRuntimeEvidence(evidence(), { ...target, [key]: 'other' })).toBe(false);
    expect(hasMatchingRuntimeEvidence(evidence(), { ...target, revision: 4 })).toBe(false);
  });
  it('never upgrades a fixture result into current asset verification', () => {
    expect(
      hasMatchingRuntimeEvidence(
        { ...evidence(), scope: { kind: 'fixture', fixtureId: 'F01' } },
        target,
      ),
    ).toBe(false);
  });
  it('requires complete executed checks and traceable evidence', () => {
    for (const key of ['geometry', 'material', 'skin', 'clip', 'sidecar'] as const)
      expect(
        hasMatchingRuntimeEvidence(
          { ...evidence(), checks: { ...evidence().checks, [key]: false } },
          target,
        ),
      ).toBe(false);
    expect(hasMatchingRuntimeEvidence({ ...evidence(), result: 'not-run' }, target)).toBe(false);
    expect(hasMatchingRuntimeEvidence({ ...evidence(), sourceCommit: '' }, target)).toBe(false);
    expect(hasMatchingRuntimeEvidence({ ...evidence(), evidencePath: ' ' }, target)).toBe(false);
  });
});
