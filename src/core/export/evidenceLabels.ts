export const EVIDENCE_LABELS = [
  'candidate',
  'verified',
  'import-notes',
  'unsupported',
] as const;

export type EvidenceLabel = (typeof EVIDENCE_LABELS)[number];
export type VerificationCiConclusion = 'success' | 'failure' | 'cancelled' | 'unknown';

export const VERIFICATION_RECORD_FORMAT = 'chameleon-verification-record' as const;
export const VERIFICATION_RECORD_VERSION = '0.1.0' as const;

export interface VerificationScope {
  profile: string;
  targetName: string;
  targetVersion: string;
  fixtureId: string;
}

export interface StableVerificationRecord {
  format: typeof VERIFICATION_RECORD_FORMAT;
  version: typeof VERIFICATION_RECORD_VERSION;
  profile: string;
  label: EvidenceLabel;
  target: {
    name: string;
    version: string;
  };
  fixtureId: string;
  sourceCommit: string;
  fixtureHash: string;
  manifestHash: string;
  expected: string[];
  limitations: string[];
  evidenceRefs: string[];
}

export interface StableVerificationRecordInput {
  profile: string;
  label?: EvidenceLabel;
  target: {
    name: string;
    version: string;
  };
  fixtureId: string;
  sourceCommit: string;
  fixtureHash: string;
  manifestHash: string;
  expected: readonly string[];
  limitations: readonly string[];
  evidenceRefs: readonly string[];
}

export interface DynamicVerificationEvidence {
  scope: VerificationScope;
  sourceCommit: string;
  fixtureHash: string;
  manifestHash: string;
  completedChecks: string[];
  ciConclusion: VerificationCiConclusion;
  artifactRefs: string[];
  artifactDigests: string[];
  generatedAt?: string;
  runRef?: string;
}

function normalizeList(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`verification recordの${field}は空にできません。`);
  return normalized;
}

export function buildStableVerificationRecord(
  input: StableVerificationRecordInput,
): StableVerificationRecord {
  return {
    format: VERIFICATION_RECORD_FORMAT,
    version: VERIFICATION_RECORD_VERSION,
    profile: requireText(input.profile, 'profile'),
    label: input.label ?? 'candidate',
    target: {
      name: requireText(input.target.name, 'target.name'),
      version: requireText(input.target.version, 'target.version'),
    },
    fixtureId: requireText(input.fixtureId, 'fixtureId'),
    sourceCommit: requireText(input.sourceCommit, 'sourceCommit'),
    fixtureHash: requireText(input.fixtureHash, 'fixtureHash'),
    manifestHash: requireText(input.manifestHash, 'manifestHash'),
    expected: normalizeList(input.expected),
    limitations: normalizeList(input.limitations),
    evidenceRefs: normalizeList(input.evidenceRefs),
  };
}

export function validateStableVerificationRecord(
  record: StableVerificationRecord,
): string[] {
  const issues: string[] = [];
  if (record.format !== VERIFICATION_RECORD_FORMAT) issues.push('format');
  if (record.version !== VERIFICATION_RECORD_VERSION) issues.push('version');
  if (!EVIDENCE_LABELS.includes(record.label)) issues.push('label');
  for (const [field, value] of [
    ['profile', record.profile],
    ['target.name', record.target?.name],
    ['target.version', record.target?.version],
    ['fixtureId', record.fixtureId],
    ['sourceCommit', record.sourceCommit],
    ['fixtureHash', record.fixtureHash],
    ['manifestHash', record.manifestHash],
  ] as const) {
    if (typeof value !== 'string' || !value.trim()) issues.push(field);
  }
  for (const [field, value] of [
    ['expected', record.expected],
    ['limitations', record.limitations],
    ['evidenceRefs', record.evidenceRefs],
  ] as const) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
      issues.push(field);
    }
  }
  return issues;
}

export function verificationInvalidationReasons(
  stable: StableVerificationRecord,
  dynamic: DynamicVerificationEvidence,
): string[] {
  const reasons = validateStableVerificationRecord(stable).map((issue) => `invalid-stable:${issue}`);
  if (dynamic.scope.profile !== stable.profile) reasons.push('profile-changed');
  if (dynamic.scope.targetName !== stable.target.name) reasons.push('target-changed');
  if (dynamic.scope.targetVersion !== stable.target.version) reasons.push('target-version-changed');
  if (dynamic.scope.fixtureId !== stable.fixtureId) reasons.push('fixture-changed');
  if (dynamic.sourceCommit !== stable.sourceCommit) reasons.push('source-changed');
  if (dynamic.fixtureHash !== stable.fixtureHash) reasons.push('fixture-hash-changed');
  if (dynamic.manifestHash !== stable.manifestHash) reasons.push('manifest-hash-changed');
  const completedChecks = new Set(dynamic.completedChecks);
  for (const expected of stable.expected) {
    if (!completedChecks.has(expected)) reasons.push(`missing-check:${expected}`);
  }
  if (dynamic.ciConclusion !== 'success') reasons.push(`ci-${dynamic.ciConclusion}`);
  if (dynamic.artifactRefs.length === 0) reasons.push('artifact-reference-missing');
  if (dynamic.artifactDigests.length === 0) reasons.push('artifact-digest-missing');
  return reasons;
}

export function isVerificationCurrent(
  stable: StableVerificationRecord,
  dynamic: DynamicVerificationEvidence,
): boolean {
  return verificationInvalidationReasons(stable, dynamic).length === 0;
}

export function resolveEvidenceLabel(input: {
  stable: StableVerificationRecord;
  dynamic?: DynamicVerificationEvidence;
  importNotes?: boolean;
  unsupportedReason?: string;
}): EvidenceLabel {
  if (input.unsupportedReason?.trim()) return 'unsupported';
  if (input.importNotes) return 'import-notes';
  if (!input.dynamic || !isVerificationCurrent(input.stable, input.dynamic)) return 'candidate';
  return 'verified';
}
