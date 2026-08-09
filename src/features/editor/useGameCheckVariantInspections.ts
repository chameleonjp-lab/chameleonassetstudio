import { useEffect, useState } from 'react';
import { blobKeyFor } from '../../core/images/importImage';
import {
  inspectLinkedVariant,
  type Asset,
  type LinkedAssetFamilyVariant,
  type Project,
} from '../../core/model';
import { loadBlob } from '../../core/storage';
import type { GameCheckVariantInspectionView } from './gameCheckContract';

async function loadInspectionBlobs(asset: Asset): Promise<Map<string, Blob>> {
  const entries = await Promise.all(
    asset.textures.map(async (texture) => {
      const blob = await loadBlob(blobKeyFor(asset.id, texture.path));
      if (!blob) {
        throw new Error(`画像Blobが見つかりません: ${asset.displayName} / ${texture.path}`);
      }
      return [texture.path, blob] as const;
    }),
  );
  return new Map(entries);
}

/** 既存のfingerprint検査だけを読み取り専用で実行し、Impactへ渡す。 */
export function useGameCheckVariantInspections(
  asset: Asset,
  project: Project,
  projectAssets: readonly Asset[],
): Record<string, GameCheckVariantInspectionView> {
  const [inspections, setInspections] = useState<
    Record<string, GameCheckVariantInspectionView>
  >({});

  useEffect(() => {
    let cancelled = false;
    const family = project.families?.find(
      (candidate) =>
        candidate.baseAssetId === asset.id ||
        candidate.variants.some((variant) => variant.assetId === asset.id),
    );
    const linkedVariants = family
      ? family.variants.filter(
          (variant): variant is LinkedAssetFamilyVariant =>
            variant.kind !== 'manual' &&
            (family.baseAssetId === asset.id || variant.assetId === asset.id),
        )
      : [];

    if (!family || linkedVariants.length === 0) {
      setInspections({});
      return () => {
        cancelled = true;
      };
    }

    setInspections(
      Object.fromEntries(
        linkedVariants.map((variant) => [variant.assetId, { state: 'checking' as const }]),
      ),
    );
    void Promise.all(
      linkedVariants.map(async (variant) => {
        const base = projectAssets.find((candidate) => candidate.id === family.baseAssetId);
        const variantAsset = projectAssets.find((candidate) => candidate.id === variant.assetId);
        if (!base || !variantAsset) {
          return [
            variant.assetId,
            {
              state: 'error' as const,
              error: `Familyのbaseまたはvariant Assetが見つかりません: ${family.baseAssetId} / ${variant.assetId}`,
            },
          ] as const;
        }
        try {
          const [baseBlobs, variantBlobs] = await Promise.all([
            loadInspectionBlobs(base),
            loadInspectionBlobs(variantAsset),
          ]);
          const inspection = await inspectLinkedVariant({
            base,
            variantAsset,
            variant,
            baseBlobs,
            variantBlobs,
          });
          return [variant.assetId, { state: 'ready' as const, inspection }] as const;
        } catch (error) {
          return [
            variant.assetId,
            {
              state: 'error' as const,
              error: error instanceof Error ? error.message : String(error),
            },
          ] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) {
        setInspections(Object.fromEntries(entries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [asset.id, project.families, projectAssets]);

  return inspections;
}
