import type { Asset } from './asset';

export type PartLayerReplacementErrorCode =
  | 'target-part-missing'
  | 'target-part-ambiguous'
  | 'empty-selection'
  | 'duplicate-selection'
  | 'layer-missing'
  | 'layer-ambiguous'
  | 'layer-owned-by-other-part';

export interface PartLayerReplacementError {
  code: PartLayerReplacementErrorCode;
  message: string;
  layerIds?: string[];
  ownerPartIds?: string[];
}

export interface ValidPartLayerReplacement {
  ok: true;
  normalizedLayerIds: string[];
  changed: boolean;
}

export interface InvalidPartLayerReplacement {
  ok: false;
  error: PartLayerReplacementError;
}

export type PartLayerReplacementValidation =
  ValidPartLayerReplacement | InvalidPartLayerReplacement;

export type PartLayerConstraintViolationCode = 'empty' | 'duplicate' | 'missing' | 'shared';

export interface PartLayerConstraintViolation {
  code: PartLayerConstraintViolationCode;
  partIds: string[];
  layerIds: string[];
}

export class PartLayerConstraintError extends Error {
  readonly code = 'part-layer-constraint';
  readonly violations: PartLayerConstraintViolation[];

  constructor(message: string, violations: PartLayerConstraintViolation[]) {
    super(message);
    this.name = 'PartLayerConstraintError';
    this.violations = violations;
  }
}

function duplicateIds(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function uniqueInOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * P1 / H2=L1 の静的 Part 構成レイヤー差し替えを検証する。
 * 成功時だけ Asset.layers の並びへ正規化し、Asset 自体は変更しない。
 */
export function validatePartLayerReplacement(
  asset: Asset,
  partId: string,
  requestedLayerIds: readonly string[],
): PartLayerReplacementValidation {
  const matchingParts = asset.parts.filter((part) => part.id === partId);
  if (matchingParts.length === 0) {
    return {
      ok: false,
      error: {
        code: 'target-part-missing',
        message: '差し替え対象のパーツが見つかりません。',
      },
    };
  }
  if (matchingParts.length > 1) {
    return {
      ok: false,
      error: {
        code: 'target-part-ambiguous',
        message: '同じIDのパーツが複数あり、差し替え対象を一意に決められません。',
      },
    };
  }
  if (requestedLayerIds.length === 0) {
    return {
      ok: false,
      error: {
        code: 'empty-selection',
        message: '構成レイヤーを1件以上選択してください。',
      },
    };
  }

  const duplicates = duplicateIds(requestedLayerIds);
  if (duplicates.length > 0) {
    return {
      ok: false,
      error: {
        code: 'duplicate-selection',
        message: `同じレイヤーが重複しています: ${duplicates.join(', ')}`,
        layerIds: duplicates,
      },
    };
  }

  const layerCountById = new Map<string, number>();
  for (const layer of asset.layers) {
    layerCountById.set(layer.id, (layerCountById.get(layer.id) ?? 0) + 1);
  }

  const missing = requestedLayerIds.filter((layerId) => !layerCountById.has(layerId));
  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        code: 'layer-missing',
        message: `存在しないレイヤーは選択できません: ${missing.join(', ')}`,
        layerIds: missing,
      },
    };
  }

  const ambiguous = requestedLayerIds.filter((layerId) => (layerCountById.get(layerId) ?? 0) > 1);
  if (ambiguous.length > 0) {
    return {
      ok: false,
      error: {
        code: 'layer-ambiguous',
        message: `同じIDのレイヤーが複数あり、参照先を一意に決められません: ${ambiguous.join(', ')}`,
        layerIds: ambiguous,
      },
    };
  }

  const requested = new Set(requestedLayerIds);
  const ownerPartIds = uniqueInOrder(
    asset.parts
      .filter(
        (part) => part.id !== partId && part.layerIds.some((layerId) => requested.has(layerId)),
      )
      .map((part) => part.id),
  );
  if (ownerPartIds.length > 0) {
    const ownedLayerIds = asset.layers
      .filter(
        (layer) =>
          requested.has(layer.id) &&
          asset.parts.some((part) => part.id !== partId && part.layerIds.includes(layer.id)),
      )
      .map((layer) => layer.id);
    return {
      ok: false,
      error: {
        code: 'layer-owned-by-other-part',
        message: `別のパーツで使用中のレイヤーは選択できません: ${ownedLayerIds.join(', ')}`,
        layerIds: ownedLayerIds,
        ownerPartIds,
      },
    };
  }

  const normalizedLayerIds = asset.layers
    .filter((layer) => requested.has(layer.id))
    .map((layer) => layer.id);
  return {
    ok: true,
    normalizedLayerIds,
    changed: !sameIds(matchingParts[0].layerIds, normalizedLayerIds),
  };
}

/**
 * 既存Assetを変更せず、H2=L1違反を決定的な順序で列挙する。
 * 旧dataを自動修復・migrationするための関数ではない。
 */
export function inspectPartLayerConstraints(asset: Asset): PartLayerConstraintViolation[] {
  const violations: PartLayerConstraintViolation[] = [];
  const existingLayerIds = new Set(asset.layers.map((layer) => layer.id));

  for (const part of asset.parts) {
    if (part.layerIds.length === 0) {
      violations.push({ code: 'empty', partIds: [part.id], layerIds: [] });
    }

    const duplicates = duplicateIds(part.layerIds);
    if (duplicates.length > 0) {
      violations.push({
        code: 'duplicate',
        partIds: [part.id],
        layerIds: duplicates,
      });
    }

    const missing = uniqueInOrder(
      part.layerIds.filter((layerId) => !existingLayerIds.has(layerId)),
    );
    if (missing.length > 0) {
      violations.push({
        code: 'missing',
        partIds: [part.id],
        layerIds: missing,
      });
    }
  }

  for (const layer of asset.layers) {
    const owners = asset.parts.filter((part) => part.layerIds.includes(layer.id));
    if (owners.length > 1) {
      violations.push({
        code: 'shared',
        partIds: owners.map((part) => part.id),
        layerIds: [layer.id],
      });
    }
  }

  return violations;
}

function describeConstraintViolation(
  asset: Asset,
  violation: PartLayerConstraintViolation,
): string {
  const partNames = violation.partIds.map(
    (partId) => asset.parts.find((part) => part.id === partId)?.name ?? partId,
  );
  switch (violation.code) {
    case 'empty':
      return `パーツ「${partNames[0]}」に構成レイヤーがありません`;
    case 'duplicate':
      return `パーツ「${partNames[0]}」で同じレイヤーが重複しています: ${violation.layerIds.join(', ')}`;
    case 'missing':
      return `パーツ「${partNames[0]}」が存在しないレイヤーを参照しています: ${violation.layerIds.join(', ')}`;
    case 'shared':
      return `レイヤー「${violation.layerIds[0]}」が複数のパーツで使用されています: ${partNames.join(', ')}`;
  }
}

/**
 * P1で確定したH2=L1だけをbake前にも適用する狭いguard。
 * 有限値、座標、資源上限などSlice Bの共通bake preflightは扱わない。
 */
export function assertPartLayerConstraints(asset: Asset): void {
  const violations = inspectPartLayerConstraints(asset);
  if (violations.length === 0) {
    return;
  }
  throw new PartLayerConstraintError(
    `リグを焼き込めません。${violations
      .map((violation) => describeConstraintViolation(asset, violation))
      .join(' / ')}`,
    violations,
  );
}
