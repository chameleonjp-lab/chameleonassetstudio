/** Fixture results are never evidence about an arbitrary user's asset. */
export interface RuntimeEvidence {
  scope:
    { kind: 'fixture'; fixtureId: string } | { kind: 'asset'; projectId: string; revision: number };
  modelHash: string;
  sidecarHash: string;
  runtime: string;
  runtimeVersion: string;
  importer: string;
  importerVersion: string;
  profileId: string;
  sourceCommit: string;
  evidencePath: string;
  result: 'passed' | 'failed' | 'not-run';
  checks: { geometry: boolean; material: boolean; skin: boolean; clip: boolean; sidecar: boolean };
}
export interface RuntimeEvidenceTarget {
  projectId: string;
  revision: number;
  modelHash: string;
  sidecarHash: string;
  runtime: string;
  runtimeVersion: string;
  importer: string;
  importerVersion: string;
  profileId: string;
}
export function hasMatchingRuntimeEvidence(
  evidence: RuntimeEvidence,
  target: RuntimeEvidenceTarget,
): boolean {
  return (
    evidence.scope.kind === 'asset' &&
    evidence.scope.projectId === target.projectId &&
    evidence.scope.revision === target.revision &&
    evidence.result === 'passed' &&
    /^[a-f0-9]{64}$/.test(evidence.modelHash) &&
    /^[a-f0-9]{64}$/.test(evidence.sidecarHash) &&
    /^[a-f0-9]{40}$/.test(evidence.sourceCommit) &&
    !!evidence.evidencePath.trim() &&
    (
      [
        'modelHash',
        'sidecarHash',
        'runtime',
        'runtimeVersion',
        'importer',
        'importerVersion',
        'profileId',
      ] as const
    ).every((key) => !!evidence[key] && evidence[key] === target[key]) &&
    (['geometry', 'material', 'skin', 'clip', 'sidecar'] as const).every(
      (key) => evidence.checks[key] === true,
    )
  );
}
