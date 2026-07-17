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
 * linked variant の再生成 recipe（V1）。
 * 作成時に固定した base 側 ID → variant 側 ID の対応を正本として持ち、
 * refresh のたびに再採番しない。recipe が書き換える範囲が保護単位になる。
 */
export type FamilyVariantRecipe =
  | {
      type: 'mirror';
      /** base 側 ID → variant 側 ID の対応表。refresh で再採番しない（V1）。 */
      idMap: Record<string, string>;
    }
  | {
      type: 'palette';
      /** base 側 ID → variant 側 ID の対応表。refresh で再採番しない（V1）。 */
      idMap: Record<string, string>;
      replacements: PaletteReplacement[];
      tolerance?: number;
    };

/**
 * 最終同期時の決定的 hash。
 * アルゴリズムは Slice C で確定するため、ここでは値の形だけを固定する文字列ホルダー。
 */
export interface FamilyVariantFingerprint {
  base: string;
  variant: string;
  syncedAt: IsoDateTimeString;
}

export const ASSET_FAMILY_VARIANT_KINDS = ['linked-mirror', 'linked-palette', 'manual'] as const;
export type AssetFamilyVariantKind = (typeof ASSET_FAMILY_VARIANT_KINDS)[number];

export interface AssetFamilyVariant {
  assetId: string;
  kind: AssetFamilyVariantKind;
  /** linked-* のみ持つ。manual では持たない。 */
  recipe?: FamilyVariantRecipe;
  fingerprint?: FamilyVariantFingerprint;
}

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

/**
 * `Project.families` の参照 invariant を検査する純関数（F1）。
 * エラー理由の配列を返す（空配列 = 妥当）。`families` 不在・空配列は妥当。
 *
 * 検査内容:
 * - family id が空でなく Project 内で一意
 * - baseAssetId / variants[].assetId が `project.assets` に実在する
 * - 1 Asset は高々 1 Family・1 役割
 *   （複数 family への重複 membership 禁止、同一 family 内の variant 重複禁止、
 *   base を variants に含めない = self reference 禁止）
 * - kind と recipe の整合
 *   （linked-mirror ⇔ recipe.type 'mirror'、linked-palette ⇔ 'palette'、manual は recipe なし）
 */
export function validateProjectFamilies(project: Project): string[] {
  const families = project.families;
  if (!families || families.length === 0) {
    return [];
  }

  const errors: string[] = [];
  const assetIds = new Set(project.assets.map((entry) => entry.id));
  const familyIds = new Set<string>();
  // asset id -> それを最初に占有した family の label（base / variant を問わず 1 Asset 1 役割）
  const membership = new Map<string, string>();

  families.forEach((family, index) => {
    const label = familyLabel(family, index);

    if (!family.id) {
      errors.push(`family id が空です: ${label}`);
    } else if (familyIds.has(family.id)) {
      errors.push(`family id が Project 内で重複しています: ${family.id}`);
    } else {
      familyIds.add(family.id);
    }

    if (!assetIds.has(family.baseAssetId)) {
      errors.push(
        `family(${label}) の baseAssetId が Project に存在しません: ${family.baseAssetId}`,
      );
    } else {
      const owner = membership.get(family.baseAssetId);
      if (owner) {
        errors.push(
          `Asset（${family.baseAssetId}）が複数 Family に重複して所属しています: ${owner} / ${label}`,
        );
      } else {
        membership.set(family.baseAssetId, label);
      }
    }

    const seenVariantAssetIds = new Set<string>();
    family.variants.forEach((variant) => {
      if (variant.assetId === family.baseAssetId) {
        errors.push(
          `family(${label}) の variant が base 自身を参照しています（self reference 禁止）: ${variant.assetId}`,
        );
      }

      if (seenVariantAssetIds.has(variant.assetId)) {
        errors.push(
          `family(${label}) 内で同じ variant assetId が重複しています: ${variant.assetId}`,
        );
      } else {
        seenVariantAssetIds.add(variant.assetId);
      }

      if (!assetIds.has(variant.assetId)) {
        errors.push(
          `family(${label}) の variant assetId が Project に存在しません: ${variant.assetId}`,
        );
      } else if (variant.assetId !== family.baseAssetId) {
        const owner = membership.get(variant.assetId);
        if (owner) {
          errors.push(
            `Asset（${variant.assetId}）が複数 Family に重複して所属しています: ${owner} / ${label}`,
          );
        } else {
          membership.set(variant.assetId, label);
        }
      }

      if (variant.kind === 'linked-mirror' && variant.recipe?.type !== 'mirror') {
        errors.push(
          `family(${label}) の variant（${variant.assetId}）は kind: linked-mirror ですが recipe が mirror ではありません`,
        );
      } else if (variant.kind === 'linked-palette' && variant.recipe?.type !== 'palette') {
        errors.push(
          `family(${label}) の variant（${variant.assetId}）は kind: linked-palette ですが recipe が palette ではありません`,
        );
      } else if (variant.kind === 'manual' && variant.recipe) {
        errors.push(
          `family(${label}) の variant（${variant.assetId}）は kind: manual ですが recipe を持っています`,
        );
      }
    });
  });

  return errors;
}

/**
 * `.casproj` import の ID 付替え時に使う。families 内の baseAssetId / variants[].assetId /
 * recipe.idMap の両側を、同じ assetIdMap（旧 Asset ID → 新 Asset ID）で一貫して付替える。
 *
 * assetIdMap に無い ID（recipe.idMap が参照する layer / part / frame 等の内部要素 ID）は
 * 付替え対象ではないためそのまま保持する（`assetIdMap.get(id) ?? id`）。
 */
export function remapAssetFamilies(
  families: AssetFamily[],
  assetIdMap: Map<string, string>,
): AssetFamily[] {
  const remapId = (id: string): string => assetIdMap.get(id) ?? id;
  const remapIdMap = (idMap: Record<string, string>): Record<string, string> =>
    Object.fromEntries(
      Object.entries(idMap).map(([key, value]) => [remapId(key), remapId(value)]),
    );

  return families.map((family) => ({
    ...family,
    baseAssetId: remapId(family.baseAssetId),
    variants: family.variants.map((variant) => ({
      ...variant,
      assetId: remapId(variant.assetId),
      ...(variant.recipe
        ? { recipe: { ...variant.recipe, idMap: remapIdMap(variant.recipe.idMap) } }
        : {}),
    })),
  }));
}
