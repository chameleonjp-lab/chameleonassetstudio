import type { Asset } from '../model';

export interface ColliderOverrideExportLoss {
  frameId: string;
  frameName: string;
  colliderIds: string[];
  colliderNames: string[];
  fields: string[];
}

/** Atlas 0.1.0では保持できないcanonical Frame collider overrideを列挙する。 */
export function findColliderOverrideExportLosses(asset: Asset): ColliderOverrideExportLoss[] {
  const colliderById = new Map(asset.colliders.map((collider) => [collider.id, collider]));
  return (asset.frames ?? []).flatMap((frame) => {
    const overrides = frame.colliderOverrides ?? [];
    if (overrides.length === 0) return [];
    return [
      {
        frameId: frame.id,
        frameName: frame.name || frame.id,
        colliderIds: overrides.map((override) => override.colliderId),
        colliderNames: overrides.map(
          (override) => colliderById.get(override.colliderId)?.name ?? override.colliderId,
        ),
        fields: [
          ...new Set(
            overrides.flatMap((override) => [
              ...(override.rect ? ['位置・サイズ（rect）'] : []),
              ...(override.circle ? ['位置・サイズ（circle）'] : []),
              ...(override.visible !== undefined ? ['Frame別表示状態'] : []),
            ]),
          ),
        ],
      },
    ];
  });
}

export function formatColliderOverrideExportLosses(
  losses: readonly ColliderOverrideExportLoss[],
): string {
  const details = losses.map(
    (loss) =>
      `Frame「${loss.frameName}」（${loss.frameId}）のcollider「${loss.colliderNames.join('、')}」（${loss.colliderIds.join('、')}）に${loss.fields.join('・')}があります`,
  );
  return `Atlas系の書き出しを中止しました。${details.join('。')}。Frame別の当たり判定情報がAtlas 0.1.0では失われるためです。情報を保持するasset.jsonまたは.casprojを書き出してください。PNG / WebPも引き続き書き出せます。`;
}

export class ColliderOverrideExportLossError extends Error {
  readonly losses: readonly ColliderOverrideExportLoss[];

  constructor(losses: readonly ColliderOverrideExportLoss[]) {
    super(formatColliderOverrideExportLosses(losses));
    this.name = 'ColliderOverrideExportLossError';
    this.losses = losses;
  }
}

/** Sprite Sheet / Atlas / 製品ZIPを、O1情報を落とす処理より前に拒否する。 */
export function assertColliderOverrideExportSafe(asset: Asset): void {
  const losses = findColliderOverrideExportLosses(asset);
  if (losses.length > 0) throw new ColliderOverrideExportLossError(losses);
}
