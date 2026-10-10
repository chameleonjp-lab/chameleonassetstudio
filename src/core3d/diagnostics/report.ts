/** Local-only, allowlisted diagnostics. This module never reads browser or project state. */
export const DIAGNOSTIC_LIMITS = Object.freeze({
  reproductionCharacters: 2000,
  reportCharacters: 16_384,
  userAgentCharacters: 2048,
});

export const DIAGNOSTIC_ERROR_IDS = [
  'none',
  'unknown',
  'editor-render-failed',
  'viewport-load-failed',
  'renderer-failed',
  'storage-open-failed',
  'save-failed',
  'backup-failed',
  'import-failed',
  'export-failed',
  'inspection-failed',
  'operation-failed',
] as const;
export type DiagnosticErrorId = (typeof DIAGNOSTIC_ERROR_IDS)[number];

export const DIAGNOSTIC_FEATURES = [
  'editor',
  'viewport',
  'storage',
  'backup',
  'import',
  'export',
  'inspection',
  'animation',
  'rig',
  'unknown',
] as const;
export type DiagnosticFeature = (typeof DIAGNOSTIC_FEATURES)[number];

const browserFamilies = [
  'Chrome',
  'Edge',
  'Firefox',
  'Safari',
  'Opera',
  'Samsung Internet',
  'unknown',
] as const;
export interface DiagnosticBrowser {
  readonly family: (typeof browserFamilies)[number];
  readonly majorVersion: number | null;
}

/** Only these application-owned values may be supplied by an editor or rescue boundary. */
export interface DiagnosticReportInput {
  appVersion: string;
  sourceRevision: string;
  /** Build working-tree status, never a project's unsaved state. */
  sourceDirty: boolean;
  schemaVersion: string;
  errorId?: DiagnosticErrorId;
  feature?: DiagnosticFeature;
  browser?: DiagnosticBrowser;
}

export interface DiagnosticReport {
  readonly reportVersion: 1;
  readonly appVersion: string;
  readonly sourceRevision: string;
  readonly sourceDirty: boolean | 'unknown';
  readonly schemaVersion: string;
  readonly errorId: DiagnosticErrorId;
  readonly feature: DiagnosticFeature;
  readonly browser: DiagnosticBrowser;
  /** Explicitly supplied user writing only; never inferred from an error or project. */
  readonly reproductionSteps?: string;
}

function ownValue(input: unknown, key: string): unknown {
  if (typeof input !== 'object' || input === null) return undefined;
  // Ignore prototypes, accessors and hostile objects instead of invoking their code/toString.
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function allowed<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && choices.includes(value as T) ? (value as T) : fallback;
}

function numericVersion(value: unknown): string {
  return typeof value === 'string' &&
    value.length <= 14 &&
    value.trim() === value &&
    /^(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d{0,3})$/.test(value)
    ? value
    : 'unknown';
}

function revision(value: unknown): string {
  return typeof value === 'string' &&
    (value.length === 40 || value.length === 64) &&
    value.trim() === value &&
    /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value)
    ? value.toLowerCase()
    : 'unknown';
}

function browserSummary(input: unknown): DiagnosticBrowser {
  const family = allowed(ownValue(input, 'family'), browserFamilies, 'unknown');
  const version = ownValue(input, 'majorVersion');
  return {
    family,
    majorVersion:
      family !== 'unknown' &&
      typeof version === 'number' &&
      Number.isInteger(version) &&
      version >= 1 &&
      version <= 999
        ? version
        : null,
  };
}

/** Coarse, best-effort identification. Full UA, OS, device/model and patch versions never survive. */
export function detectDiagnosticBrowser(userAgent: unknown): DiagnosticBrowser {
  if (typeof userAgent !== 'string' || userAgent.length > DIAGNOSTIC_LIMITS.userAgentCharacters)
    return { family: 'unknown', majorVersion: null };
  const signatures: readonly [DiagnosticBrowser['family'], RegExp][] = [
    ['Edge', /\b(?:Edg|EdgA|EdgiOS)\/(\d{1,3})(?=[.\s]|$)/],
    ['Opera', /\b(?:OPR|OPiOS)\/(\d{1,3})(?=[.\s]|$)/],
    ['Samsung Internet', /\bSamsungBrowser\/(\d{1,3})(?=[.\s]|$)/],
    ['Firefox', /\b(?:Firefox|FxiOS)\/(\d{1,3})(?=[.\s]|$)/],
    ['Chrome', /\b(?:Chrome|CriOS)\/(\d{1,3})(?=[.\s]|$)/],
    ['Safari', /\bVersion\/(\d{1,3})(?=[.\s]|$)/],
  ];
  for (const [family, pattern] of signatures) {
    if (family === 'Safari' && !/\bSafari\//.test(userAgent)) continue;
    const match = userAgent.match(pattern);
    if (match) return browserSummary({ family, majorVersion: Number(match[1]) });
  }
  return { family: 'unknown', majorVersion: null };
}

function userSteps(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Bound work before normalizing. Preserve ordinary user writing, never collect it implicitly.
  const bounded = value.slice(0, DIAGNOSTIC_LIMITS.reproductionCharacters);
  const result = Array.from(bounded)
    .filter((character) => {
      const point = character.codePointAt(0)!;
      return (
        (point >= 32 || point === 9 || point === 10 || point === 13) &&
        !(point >= 127 && point <= 159) &&
        !(point >= 0xd800 && point <= 0xdfff) &&
        !(point >= 0x200b && point <= 0x200f) &&
        !(point >= 0x202a && point <= 0x202e) &&
        !(point >= 0x2066 && point <= 0x2069) &&
        point !== 0xfeff
      );
    })
    .join('')
    .replace(/\r\n?/g, '\n')
    .trim();
  return result || undefined;
}

/**
 * Rebuild rather than spread/serialize the input. Unknown keys, errors, messages, stacks,
 * paths, URLs, IDs and material bytes cannot enter the automatically collected report.
 * User reproduction text is a separate opt-in argument and must be reviewed before sharing.
 */
export function buildDiagnosticReport(
  input: unknown,
  userReproductionSteps?: unknown,
): DiagnosticReport {
  const dirty = ownValue(input, 'sourceDirty');
  const reproductionSteps = userSteps(userReproductionSteps);
  return {
    reportVersion: 1,
    appVersion: numericVersion(ownValue(input, 'appVersion')),
    sourceRevision: revision(ownValue(input, 'sourceRevision')),
    sourceDirty: typeof dirty === 'boolean' ? dirty : 'unknown',
    schemaVersion: numericVersion(ownValue(input, 'schemaVersion')),
    errorId: allowed(ownValue(input, 'errorId'), DIAGNOSTIC_ERROR_IDS, 'unknown'),
    feature: allowed(ownValue(input, 'feature'), DIAGNOSTIC_FEATURES, 'unknown'),
    browser: browserSummary(ownValue(input, 'browser')),
    ...(reproductionSteps ? { reproductionSteps } : {}),
  };
}

/** The serializers revalidate fields, so an extended/forged report is not a raw JSON escape hatch. */
export function serializeDiagnosticReport(
  report: DiagnosticReport,
  format: 'text' | 'json' = 'text',
): string {
  const safe = buildDiagnosticReport(report, ownValue(report, 'reproductionSteps'));
  if (format === 'json') {
    return JSON.stringify(safe, null, 2).replace(
      /[<>&\u2028\u2029]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
  }
  return [
    'Asset Studio 3D / 問題報告用の診断情報',
    `診断形式: ${safe.reportVersion}`,
    `アプリ版: ${safe.appVersion}`,
    `ソース revision: ${safe.sourceRevision}`,
    `ビルド時のローカル変更: ${safe.sourceDirty === 'unknown' ? '不明' : safe.sourceDirty ? 'あり' : 'なし'}`,
    `3D保存形式の schema 版: ${safe.schemaVersion}`,
    `エラー ID: ${safe.errorId}`,
    `機能: ${safe.feature}`,
    `ブラウザー（推定）: ${safe.browser.family}${safe.browser.majorVersion === null ? '' : ` ${safe.browser.majorVersion}`}`,
    '',
    '再現手順（任意・自分で入力）:',
    safe.reproductionSteps ?? '',
  ].join('\n');
}
