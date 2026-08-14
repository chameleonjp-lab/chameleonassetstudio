import { describe, expect, it } from 'vitest';
import {
  buildStableVerificationRecord,
  isVerificationCurrent,
  resolveEvidenceLabel,
  verificationInvalidationReasons,
  type DynamicVerificationEvidence,
} from './evidenceLabels';

const stable = buildStableVerificationRecord({
  profile: 'group18-example',
  target: { name: 'example-target', version: '1.2.3' },
  fixtureId: 'fixture:example-target:1.2.3',
  sourceCommit: 'source-head',
  fixtureHash: 'fixture-hash',
  manifestHash: 'manifest-hash',
  expected: ['runtime-check', 'fixture-scope', 'artifact-reference'],
  limitations: ['template-only until a target-specific runtime check exists'],
  evidenceRefs: ['ci://group18/example'],
});

const matchingDynamic: DynamicVerificationEvidence = {
  scope: {
    profile: stable.profile,
    targetName: stable.target.name,
    targetVersion: stable.target.version,
    fixtureId: stable.fixtureId,
  },
  sourceCommit: stable.sourceCommit,
  fixtureHash: stable.fixtureHash,
  manifestHash: stable.manifestHash,
  completedChecks: stable.expected,
  ciConclusion: 'success',
  artifactRefs: ['artifact://group18/example'],
  artifactDigests: ['sha256:example'],
  generatedAt: '2026-08-15T00:00:00.000Z',
  runRef: 'ci://run/18',
};

describe('Group 18 evidence labels', () => {
  it('builds a deterministic stable record without dynamic CI fields', () => {
    const first = buildStableVerificationRecord({
      ...stable,
      expected: [...stable.expected].reverse(),
      limitations: [...stable.limitations, 'a limitation'],
      evidenceRefs: [...stable.evidenceRefs, 'ci://group18/other'],
    });
    const second = buildStableVerificationRecord({
      ...stable,
      expected: [...stable.expected].reverse(),
      limitations: [...stable.limitations, 'a limitation'],
      evidenceRefs: [...stable.evidenceRefs, 'ci://group18/other'],
    });

    expect(first).toEqual(second);
    expect(first.expected).toEqual(['artifact-reference', 'fixture-scope', 'runtime-check']);
    expect(first).not.toHaveProperty('generatedAt');
    expect(first).not.toHaveProperty('ciConclusion');
    expect(first).not.toHaveProperty('browserVersion');
  });

  it('requires matching scope, hashes, checks, CI, and artifacts for verified', () => {
    expect(isVerificationCurrent(stable, matchingDynamic)).toBe(true);
    expect(verificationInvalidationReasons(stable, matchingDynamic)).toEqual([]);
    expect(resolveEvidenceLabel({ stable, dynamic: matchingDynamic })).toBe('verified');

    const changedFixture = {
      ...matchingDynamic,
      fixtureHash: 'changed-fixture-hash',
    };
    expect(isVerificationCurrent(stable, changedFixture)).toBe(false);
    expect(verificationInvalidationReasons(stable, changedFixture)).toContain('fixture-hash-changed');

    const failedCi = { ...matchingDynamic, ciConclusion: 'failure' as const };
    expect(verificationInvalidationReasons(stable, failedCi)).toContain('ci-failure');

    const missingArtifact = { ...matchingDynamic, artifactRefs: [], artifactDigests: [] };
    expect(verificationInvalidationReasons(stable, missingArtifact)).toEqual([
      'artifact-reference-missing',
      'artifact-digest-missing',
    ]);
  });

  it('falls back to candidate when any required check is stale or absent', () => {
    const missingCheck = {
      ...matchingDynamic,
      completedChecks: ['runtime-check'],
    };
    expect(resolveEvidenceLabel({ stable, dynamic: missingCheck })).toBe('candidate');
    expect(resolveEvidenceLabel({ stable })).toBe('candidate');
  });

  it('keeps import notes and unsupported reasons distinct from verified', () => {
    expect(resolveEvidenceLabel({ stable, importNotes: true })).toBe('import-notes');
    expect(
      resolveEvidenceLabel({ stable, dynamic: matchingDynamic, unsupportedReason: 'not in scope' }),
    ).toBe('unsupported');
  });
});
