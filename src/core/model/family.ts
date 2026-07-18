/**
 * Project-level Family / Variant additive contract（Slice A、
 * docs/future/2D_2_VARIANT_BATCH_PLAN.md accepted F1+C1+V1+T1）。
 *
 * 同じ素材の通常・色違い・左右向き・装備違い・解像度違いを、単なる独立コピーではなく
 * 追跡可能な派生として管理するための正本を Project 側へ optional・additive に置く（F1）。
 * `CURRENT_PROJECT_VERSION` は変えず、field 不在の既存 Project は全 Asset を
 * standalone として無変換で読む（C1、ADR-0015 の additive 原則）。
 *
 * 本ファイルは型・純関数のみを持つ。recipe の実際の再生成・fingerprint 算出・
 * batch 実行・UI は Slice B 以降で扱う。
 */
import type { IsoDateTimeString } from './common';
import type { Project } from './project';

/** palette 置換 1 件。色は #rrggbb または #rrggbbaa の16進文字列。 */
export interface PaletteReplacement {
  from: string;
  to: string;
}

/**
 * base 側の内部 ID → variant 側の内部 ID の対応表。
 * Asset IDとは名前空間を分離し、`.casproj` importでも付け替えない（V1）。
 */
export interface FamilyVariantIdMap {
  textures: Record<string, string>;
  layers: Record<string, string>;
  parts: Record<string, string>;
  anchors: Record<string, string>;
  colliders: Record<string, string>;
  frames: Record<string, string>;
  animations: Record<string, string>;
}

/**
 * recipe が変更し得る variant 側の内部要素と edit Blob の相対path。
 * 配列全体を1つの保護単位とし、対象外fieldとsource Blobは変更しない（V1）。
 */
export interface FamilyVariantWriteSet {
  textures: string[];
  layers: string[];
  parts: string[];
  anchors: string[];
  colliders: string[];
  frames: string[];
  animations: string[];
  /** TextureRef.path相当の相対path。Asset IDを含むBlob keyは保存しない。 */
  blobPaths: string[];
}

/**
 * `TextureRef.path` と同じ相対 path として安全に扱える形式。
 * Asset ID prefix、絶対 path、Windows separator、空 / `.` / `..` segment は許可しない。
 */
export const FAMILY_VARIANT_BLOB_PATH_PATTERN =
  /^(?!\/)(?!.*\\)(?!.*\/\/)(?!.*\/$)(?!\.{1,2}(?:\/|$))(?!.*\/\.{1,2}(?:\/|$))[\s\S]+$/u;

export function isFamilyVariantBlobPath(path: string): boolean {
  return (
    FAMILY_VARIANT_BLOB_PATH_PATTERN.test(path) &&
    [...path].every((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint > 0x1f && (codePoint < 0x7f || codePoint > 0x9f);
    })
  );
}

const FAMILY_VARIANT_ID_MAP_KEYS = [
  'textures',
  'layers',
  'parts',
  'anchors',
  'colliders',
  'frames',
  'animations',
] as const satisfies ReadonlyArray<keyof FamilyVariantIdMap>;

const FAMILY_VARIANT_WRITE_SET_KEYS = [
  ...FAMILY_VARIANT_ID_MAP_KEYS,
  'blobPaths',
] as const satisfies ReadonlyArray<keyof FamilyVariantWriteSet>;

/** linked mirror の永続recipe。実際のrefresh処理はSlice Cで実装する。 */
export interface MirrorFamilyVariantRecipe {
  type: 'mirror';
  idMap: FamilyVariantIdMap;
  writeSet: FamilyVariantWriteSet;
}

/** linked palette の永続recipe。対象base layerを明示し、全layerへ暗黙拡張しない。 */
export interface PaletteFamilyVariantRecipe {
  type: 'palette';
  idMap: FamilyVariantIdMap;
  baseLayerIds: string[];
  writeSet: FamilyVariantWriteSet;
  replacements: PaletteReplacement[];
  /** 既存palette処理と同じ0〜255。 */
  tolerance: number;
}

export type FamilyVariantRecipe = MirrorFamilyVariantRecipe | PaletteFamilyVariantRecipe;

/**
 * 最終同期時の決定的hash。Slice Cの新規生成値はsha256形式だが、
 * Slice A以前のportable dataとのforward compatibilityのためschema上はopaque文字列も読む。
 */
export interface FamilyVariantFingerprint {
  base: string;
  variant: string;
  syncedAt: IsoDateTimeString;
}

export const ASSET_FAMILY_VARIANT_KINDS = ['linked-mirror', 'linked-palette', 'manual'] as const;
export type AssetFamilyVariantKind = (typeof ASSET_FAMILY_VARIANT_KINDS)[number];

export interface LinkedMirrorAssetFamilyVariant {
  assetId: string;
  kind: 'linked-mirror';
  recipe: MirrorFamilyVariantRecipe;
  fingerprint: FamilyVariantFingerprint;
}

export interface LinkedPaletteAssetFamilyVariant {
  assetId: string;
  kind: 'linked-palette';
  recipe: PaletteFamilyVariantRecipe;
  fingerprint: FamilyVariantFingerprint;
}

export interface ManualAssetFamilyVariant {
  assetId: string;
  kind: 'manual';
  recipe?: never;
  fingerprint?: never;
}

export type AssetFamilyVariant =
  LinkedMirrorAssetFamilyVariant | LinkedPaletteAssetFamilyVariant | ManualAssetFamilyVariant;

/** Project-level の Family registry 1 件（F1）。1 base + 0 件以上の variant。 */
export interface AssetFamily {
  id: string;
  name: string;
  baseAssetId: string;
  variants: AssetFamilyVariant[];
}

function familyLabel(family: AssetFamily, index: number): string {
  return family.id ? family.id : `families[${index}]`;
}

function duplicateStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }
  return [...duplicates];
}

function validateRecipeMappings(
  familyLabelValue: string,
  variant: AssetFamilyVariant,
  errors: string[],
): void {
  // JSONなどの実行時入力はTypeScript unionを迂回できるため、意図的に広い形でも検査する。
  const runtimeVariant = variant as {
    assetId: string;
    kind: AssetFamilyVariantKind;
    recipe?: FamilyVariantRecipe;
    fingerprint?: FamilyVariantFingerprint;
  };

  if (runtimeVariant.kind === 'manual') {
    if (runtimeVariant.recipe !== undefined) {
      errors.push(
        `family(${familyLabelValue}) のmanual variant（${runtimeVariant.assetId}）はrecipeを持てません`,
      );
    }
    if (runtimeVariant.fingerprint !== undefined) {
      errors.push(
        `family(${familyLabelValue}) のmanual variant（${runtimeVariant.assetId}）はfingerprintを持てません`,
      );
    }
    return;
  }

  if (!runtimeVariant.fingerprint) {
    errors.push(
      `family(${familyLabelValue}) のlinked variant（${runtimeVariant.assetId}）にfingerprintがありません`,
    );
  }
  if (!runtimeVariant.recipe) {
    errors.push(
      `family(${familyLabelValue}) のlinked variant（${runtimeVariant.assetId}）にrecipeがありません`,
    );
    return;
  }
  if (runtimeVariant.kind === 'linked-mirror' && runtimeVariant.recipe.type !== 'mirror') {
    errors.push(
      `family(${familyLabelValue}) のvariant（${runtimeVariant.assetId}）はkind: linked-mirrorですがrecipeがmirrorではありません`,
    );
  }
  if (runtimeVariant.kind === 'linked-palette' && runtimeVariant.recipe.type !== 'palette') {
    errors.push(
      `family(${familyLabelValue}) のvariant（${runtimeVariant.assetId}）はkind: linked-paletteですがrecipeがpaletteではありません`,
    );
  }

  for (const kind of FAMILY_VARIANT_ID_MAP_KEYS) {
    const mapping = runtimeVariant.recipe.idMap[kind];
    const duplicateTargets = duplicateStrings(Object.values(mapping));
    if (duplicateTargets.length > 0) {
      errors.push(
        `family(${familyLabelValue}) のvariant（${runtimeVariant.assetId}）のidMap.${kind}でtarget IDが重複しています: ${duplicateTargets.join(', ')}`,
      );
    }
  }
  for (const kind of FAMILY_VARIANT_WRITE_SET_KEYS) {
    const ids = runtimeVariant.recipe.writeSet[kind];
    const duplicates = duplicateStrings(ids);
    if (duplicates.length > 0) {
      errors.push(
        `family(${familyLabelValue}) のvariant（${runtimeVariant.assetId}）のwriteSet.${kind}が重複しています: ${duplicates.join(', ')}`,
      );
    }
  }
  for (const kind of FAMILY_VARIANT_ID_MAP_KEYS) {
    const mappedTargetIds = new Set(Object.values(runtimeVariant.recipe.idMap[kind]));
    const unmappedWriteIds = runtimeVariant.recipe.writeSet[kind].filter(
      (id) => !mappedTargetIds.has(id),
    );
    if (unmappedWriteIds.length > 0) {
      errors.push(
        `family(${familyLabelValue}) のvariant（${runtimeVariant.assetId}）のwriteSet.${kind}にidMapのtargetではないIDがあります: ${unmappedWriteIds.join(', ')}`,
      );
    }
  }
  for (const path of runtimeVariant.recipe.writeSet.blobPaths) {
    if (!isFamilyVariantBlobPath(path)) {
      errors.push(
        `family(${familyLabelValue}) のvariant（${runtimeVariant.assetId}）のwriteSet.blobPathsが安全な相対pathではありません: ${path}`,
      );
    }
  }
  if (runtimeVariant.recipe.type === 'palette') {
    const duplicates = duplicateStrings(runtimeVariant.recipe.baseLayerIds);
    if (duplicates.length > 0) {
      errors.push(
        `family(${familyLabelValue}) のvariant（${runtimeVariant.assetId}）のbaseLayerIdsが重複しています: ${duplicates.join(', ')}`,
      );
    }
    const mappedBaseLayerIds = new Set(Object.keys(runtimeVariant.recipe.idMap.layers));
    const unmappedBaseLayerIds = runtimeVariant.recipe.baseLayerIds.filter(
      (id) => !mappedBaseLayerIds.has(id),
    );
    if (unmappedBaseLayerIds.length > 0) {
      errors.push(
        `family(${familyLabelValue}) のvariant（${runtimeVariant.assetId}）のbaseLayerIdsにidMap.layersのbaseではないIDがあります: ${unmappedBaseLayerIds.join(', ')}`,
      );
    }
  }
}

/**
 * `Project.families` の参照invariantを検査する純関数（F1）。
 * エラー理由の配列を返す（空配列 = 妥当）。`families` 不在・空配列は妥当。
 *
 * 検査内容:
 * - Project Asset IDとfamily IDが空でなくProject内で一意
 * - baseAssetId / variants[].assetIdが`project.assets`に実在する
 * - 1 Assetは高々1 Family・1役割
 *   （複数familyへの重複membership禁止、同一family内のvariant重複禁止、
 *   baseをvariantsに含めない = self reference / cycle禁止）
 * - linked variantはkindと一致するrecipe + fingerprint必須、manualは両方禁止
 * - recipe内部のtarget IDとwrite-set IDは種別内で一意
 */
export function validateProjectFamilies(project: Project): string[] {
  const errors: string[] = [];
  const assetIds = new Set<string>();
  for (const entry of project.assets) {
    if (assetIds.has(entry.id)) {
      errors.push(`Project内で同じAsset IDが重複しています: ${entry.id}`);
    } else {
      assetIds.add(entry.id);
    }
  }

  const families = project.families;
  if (!families || families.length === 0) {
    return errors;
  }

  const familyIds = new Set<string>();
  // asset id -> それを最初に占有したfamilyのlabel（base / variantを問わず1 Asset 1役割）
  const membership = new Map<string, string>();

  families.forEach((family, index) => {
    const label = familyLabel(family, index);

    if (!family.id) {
      errors.push(`family idが空です: ${label}`);
    } else if (familyIds.has(family.id)) {
      errors.push(`family idがProject内で重複しています: ${family.id}`);
    } else {
      familyIds.add(family.id);
    }

    if (!assetIds.has(family.baseAssetId)) {
      errors.push(`family(${label}) のbaseAssetIdがProjectに存在しません: ${family.baseAssetId}`);
    } else {
      const owner = membership.get(family.baseAssetId);
      if (owner) {
        errors.push(
          `Asset（${family.baseAssetId}）が複数Familyに重複して所属しています: ${owner} / ${label}`,
        );
      } else {
        membership.set(family.baseAssetId, label);
      }
    }

    const seenVariantAssetIds = new Set<string>();
    family.variants.forEach((variant) => {
      if (variant.assetId === family.baseAssetId) {
        errors.push(
          `family(${label}) のvariantがbase自身を参照しています（self reference禁止）: ${variant.assetId}`,
        );
      }

      const duplicateInFamily = seenVariantAssetIds.has(variant.assetId);
      if (duplicateInFamily) {
        errors.push(`family(${label}) 内で同じvariant assetIdが重複しています: ${variant.assetId}`);
      } else {
        seenVariantAssetIds.add(variant.assetId);
      }

      if (!assetIds.has(variant.assetId)) {
        errors.push(
          `family(${label}) のvariant assetIdがProjectに存在しません: ${variant.assetId}`,
        );
      } else if (variant.assetId !== family.baseAssetId && !duplicateInFamily) {
        const owner = membership.get(variant.assetId);
        if (owner) {
          errors.push(
            `Asset（${variant.assetId}）が複数Familyに重複して所属しています: ${owner} / ${label}`,
          );
        } else {
          membership.set(variant.assetId, label);
        }
      }

      validateRecipeMappings(label, variant, errors);
    });
  });

  return errors;
}

/**
 * `.casproj` importのID付替え時に使う。
 * Project直下のAsset参照だけを新Asset IDへ付け替え、Family ID、内部要素別idMap、
 * write-setの内部ID / 相対Blob path、fingerprintは値を変えず保持する。
 */
export function remapAssetFamilies(
  families: AssetFamily[],
  assetIdMap: Map<string, string>,
): AssetFamily[] {
  // 未知の参照 ID を黙って素通しすると付替え漏れが欠落参照として潜伏するため、
  // 対応が無い場合は即座に失敗させる（呼び出し元は remap 前に families を検証済みの前提）。
  const remapId = (id: string): string => {
    const mapped = assetIdMap.get(id);
    if (mapped === undefined) {
      throw new Error(`families の参照 Asset ID に対応する付替え先がありません: ${id}`);
    }
    return mapped;
  };

  return families.map((family) => ({
    ...structuredClone(family),
    baseAssetId: remapId(family.baseAssetId),
    variants: family.variants.map((variant) => ({
      ...structuredClone(variant),
      assetId: remapId(variant.assetId),
    })),
  }));
}
