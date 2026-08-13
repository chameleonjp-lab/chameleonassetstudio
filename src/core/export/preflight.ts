import type { Asset } from '../model';
import { DISTRIBUTION_PAGE_SIZE, scaleDistributionSize } from './atlas';
import { findFixedFpsAnimationLosses, formatFixedFpsAnimationLosses } from './animationLoss';
import { findColliderOverrideExportLosses } from './colliderOverrideLoss';
import { validateAssetForPersistence } from '../schema/validate';

export type DistributionPreflightSeverity = 'block' | 'warning';

export interface DistributionPreflightIssue {
  code: string;
  severity: DistributionPreflightSeverity;
  path: string;
  message: string;
}

export interface DistributionPreflightOptions {
  profile?: 'fixed-grid' | 'packed';
  padding?: number;
  scale?: number;
}

export interface DistributionPreflightResult {
  issues: DistributionPreflightIssue[];
  blocks: DistributionPreflightIssue[];
  warnings: DistributionPreflightIssue[];
  valid: boolean;
}

const SECRET_KEY_PATTERN =
  /(api[_-]?key|authorization|bearer|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERNS = [
  /^-----BEGIN [A-Z0-9 ]+-----[\s\S]+-----END [A-Z0-9 ]+-----$/,
  /^Bearer\s+\S+$/i,
  /^(?:sk|pk)_[A-Za-z0-9_-]{12,}$/,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function unsafePath(value: string): boolean {
  return (
    value.startsWith('/') ||
    value.startsWith('\\\\') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ||
    value.includes('\\') ||
    value.split('/').some((segment) => segment === '..') ||
    [...value].some((character) => character.charCodeAt(0) < 0x20 || character === '\u007f')
  );
}

function hasSecretLikeValue(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function pathFor(parent: string, key: string | number): string {
  return `${parent}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

function compareIssues(
  left: DistributionPreflightIssue,
  right: DistributionPreflightIssue,
): number {
  const severity = left.severity === right.severity ? 0 : left.severity === 'block' ? -1 : 1;
  return severity || left.code.localeCompare(right.code) || left.path.localeCompare(right.path);
}

function pushIssue(
  issues: DistributionPreflightIssue[],
  code: string,
  severity: DistributionPreflightSeverity,
  path: string,
  message: string,
): void {
  issues.push({ code, severity, path, message });
}

function inspectFiniteNumbers(
  value: unknown,
  path: string,
  issues: DistributionPreflightIssue[],
  seen: Set<unknown>,
): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      pushIssue(issues, 'PREFLIGHT-NONFINITE', 'block', path, '有限な数値ではありません。');
    }
    return;
  }
  if (!isRecord(value) && !Array.isArray(value)) return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectFiniteNumbers(item, pathFor(path, index), issues, seen));
    return;
  }
  Object.entries(value).forEach(([key, item]) =>
    inspectFiniteNumbers(item, pathFor(path, key), issues, seen),
  );
}

function inspectSecrets(
  value: unknown,
  path: string,
  issues: DistributionPreflightIssue[],
  seen: Set<unknown>,
): void {
  if (typeof value === 'string') {
    if (hasSecretLikeValue(value)) {
      pushIssue(
        issues,
        'PREFLIGHT-SECRET',
        'block',
        path,
        '秘密情報らしい値があるため、値を出力せずに停止しました。',
      );
    }
    return;
  }
  if (!isRecord(value) && !Array.isArray(value)) return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectSecrets(item, pathFor(path, index), issues, seen));
    return;
  }
  Object.entries(value).forEach(([key, item]) => {
    const childPath = pathFor(path, key);
    if (SECRET_KEY_PATTERN.test(key) && typeof item === 'string' && item.trim() !== '') {
      pushIssue(
        issues,
        'PREFLIGHT-SECRET',
        'block',
        childPath,
        '秘密情報らしい項目があるため、値を出力せずに停止しました。',
      );
      return;
    }
    inspectSecrets(item, childPath, issues, seen);
  });
}

function inspectSafeNames(
  values: Array<{ value: string; path: string }>,
  issues: DistributionPreflightIssue[],
  code: string,
): void {
  const seen = new Map<string, { value: string; path: string }>();
  for (const item of values) {
    if (unsafePath(item.value)) {
      pushIssue(
        issues,
        'PREFLIGHT-PATH',
        'block',
        item.path,
        '絶対path、親参照、URL scheme、制御文字、または逆向き区切りを含められません。',
      );
    }
    const key = item.value.normalize('NFC').toLocaleLowerCase('en-US');
    const previous = seen.get(key);
    if (previous) {
      pushIssue(
        issues,
        code,
        'block',
        item.path,
        `名前が衝突しています（${previous.path}）。自動修正せずに停止しました。`,
      );
    } else {
      seen.set(key, item);
    }
  }
}

function inspectNameCollisions(
  values: Array<{ value: string; path: string }>,
  issues: DistributionPreflightIssue[],
): void {
  const exact = new Map<string, { value: string; path: string }>();
  const folded = new Map<string, { value: string; path: string }>();
  const normalized = new Map<string, { value: string; path: string }>();
  for (const item of values) {
    if (unsafePath(item.value)) {
      pushIssue(
        issues,
        'PREFLIGHT-PATH',
        'block',
        item.path,
        '絶対path、親参照、URL scheme、制御文字、または逆向き区切りを含められません。',
      );
    }
    const exactPrevious = exact.get(item.value);
    const foldedKey = item.value.toLocaleLowerCase('en-US');
    const normalizedKey = item.value.normalize('NFC');
    const foldedPrevious = folded.get(foldedKey);
    const normalizedPrevious = normalized.get(normalizedKey);
    if (exactPrevious || foldedPrevious || normalizedPrevious) {
      const previous = exactPrevious ?? foldedPrevious ?? normalizedPrevious!;
      pushIssue(
        issues,
        'PREFLIGHT-COLLISION',
        'block',
        item.path,
        `名前が衝突しています（${previous.path}）。完全一致、ASCII大小文字、Unicode NFC同値を自動修正しません。`,
      );
    }
    exact.set(item.value, item);
    folded.set(foldedKey, item);
    normalized.set(normalizedKey, item);
  }
}

export function inspectDistributionPreflight(
  asset: unknown,
  options: DistributionPreflightOptions = {},
): DistributionPreflightResult {
  const issues: DistributionPreflightIssue[] = [];
  if (!isRecord(asset)) {
    pushIssue(issues, 'PREFLIGHT-SCHEMA', 'block', '/', 'Assetがobjectではありません。');
  } else {
    const validation = validateAssetForPersistence(asset);
    if (!validation.valid) {
      validation.errors.forEach((message) =>
        pushIssue(issues, 'PREFLIGHT-SCHEMA', 'block', '/', message),
      );
    }

    const typedAsset = asset as unknown as Asset;
    if (typeof typedAsset.name === 'string') {
      inspectSafeNames([{ value: typedAsset.name, path: '/name' }], issues, 'PREFLIGHT-COLLISION');
    }
    if (Array.isArray(typedAsset.textures)) {
      inspectSafeNames(
        typedAsset.textures.flatMap((texture, index) =>
          isRecord(texture) && typeof texture.path === 'string'
            ? [{ value: texture.path, path: `/textures/${index}/path` }]
            : [],
        ),
        issues,
        'PREFLIGHT-COLLISION',
      );
    }
    if (Array.isArray(typedAsset.frames)) {
      inspectNameCollisions(
        typedAsset.frames.flatMap((frame, index) =>
          isRecord(frame) && typeof frame.name === 'string'
            ? [{ value: frame.name, path: `/frames/${index}/name` }]
            : [],
        ),
        issues,
      );
    }
    if (Array.isArray(typedAsset.animations)) {
      inspectNameCollisions(
        typedAsset.animations.flatMap((animation, index) =>
          isRecord(animation) && typeof animation.name === 'string'
            ? [{ value: animation.name, path: `/animations/${index}/name` }]
            : [],
        ),
        issues,
      );
    }
    const finiteSeen = new Set<unknown>();
    inspectFiniteNumbers(typedAsset, '', issues, finiteSeen);
    const secretSeen = new Set<unknown>();
    inspectSecrets(typedAsset, '', issues, secretSeen);

    if (options.profile && options.profile !== 'fixed-grid' && options.profile !== 'packed') {
      pushIssue(issues, 'PREFLIGHT-PROFILE', 'block', '/profile', '未対応のprofileです。');
    }
    if (options.scale !== undefined && ![1, 2, 3].includes(options.scale)) {
      pushIssue(issues, 'PREFLIGHT-SCALE', 'block', '/scale', 'scaleは1、2、3のいずれかです。');
    }
    if (
      options.padding !== undefined &&
      (!Number.isInteger(options.padding) || options.padding < 0 || options.padding > 64)
    ) {
      pushIssue(
        issues,
        'PREFLIGHT-PADDING',
        'block',
        '/padding',
        'paddingは0以上64以下の整数です。',
      );
    }
    if (validation.valid && options.scale !== undefined) {
      const scaledSize = scaleDistributionSize(typedAsset.canvasSize, options.scale as 1 | 2 | 3);
      if (scaledSize.width > DISTRIBUTION_PAGE_SIZE || scaledSize.height > DISTRIBUTION_PAGE_SIZE) {
        pushIssue(
          issues,
          'PREFLIGHT-PAGE',
          'block',
          '/canvasSize',
          `1フレームがdistribution pageの上限 ${DISTRIBUTION_PAGE_SIZE}×${DISTRIBUTION_PAGE_SIZE} にscale ${options.scale}で収まりません。`,
        );
      }
    }

    if (validation.valid && Array.isArray(typedAsset.animations)) {
      const animationLosses = findFixedFpsAnimationLosses(typedAsset);
      if (animationLosses.length > 0) {
        pushIssue(
          issues,
          'PREFLIGHT-LOSS',
          'block',
          '/animations',
          formatFixedFpsAnimationLosses(animationLosses),
        );
      }
    }
    if (
      validation.valid &&
      Array.isArray(typedAsset.colliders) &&
      Array.isArray(typedAsset.frames)
    ) {
      const colliderLosses = findColliderOverrideExportLosses(typedAsset);
      if (colliderLosses.length > 0) {
        pushIssue(
          issues,
          'PREFLIGHT-LOSS',
          'block',
          '/frames',
          'distributionではFrame別collider overrideを保持できません。',
        );
      }
    }
  }

  const sorted = [...issues].sort(compareIssues);
  const blocks = sorted.filter((issue) => issue.severity === 'block');
  const warnings = sorted.filter((issue) => issue.severity === 'warning');
  return { issues: sorted, blocks, warnings, valid: blocks.length === 0 };
}

export class DistributionPreflightError extends Error {
  readonly issues: readonly DistributionPreflightIssue[];

  constructor(issues: readonly DistributionPreflightIssue[]) {
    super(
      `distribution preflightで停止しました: ${issues
        .map((issue) => `${issue.code} ${issue.path}: ${issue.message}`)
        .join(' / ')}`,
    );
    this.name = 'DistributionPreflightError';
    this.issues = issues;
  }
}

export function assertDistributionPreflight(
  asset: unknown,
  options: DistributionPreflightOptions = {},
): DistributionPreflightResult {
  const result = inspectDistributionPreflight(asset, options);
  if (!result.valid) throw new DistributionPreflightError(result.blocks);
  return result;
}
