import { assertFrameGeometry } from './distributionRuntime.js';
export { projectDistributionFrame } from './distributionRuntime.js';
import type { Asset, Collider } from '../model';
import { resolveFrameColliders } from '../model/frameColliderOverrides';
import {
  normalizeDistributionScale,
  roundDistributionPixel,
  scaleDistributionPoint,
  scaleDistributionRect,
  type DistributionScale,
  type DistributionProfile,
  type DistributionSheetFrameLayout,
} from './atlas';

type Point = { x: number; y: number };

/** Game metadata uses scaled source-canvas coordinates; image rectangles use sheet coordinates. */
export interface DistributionFrameData extends DistributionSheetFrameLayout {
  origin: Point;
  anchors: Asset['anchors'];
  colliders: Collider[];
}

function scaledCollider(collider: Collider, scale: DistributionScale): Collider {
  const copy = structuredClone(collider);
  return copy.shape === 'rect'
    ? { ...copy, rect: { ...copy.rect, ...scaleDistributionRect(copy.rect, scale) } }
    : {
        ...copy,
        circle: {
          ...copy.circle,
          ...scaleDistributionPoint(copy.circle, scale),
          radius: roundDistributionPixel(copy.circle.radius, scale),
        },
      };
}

/** Layout has already been scaled by the packer; never scale image rectangles twice. */
export function buildDistributionFrameData(
  asset: Asset,
  layout: readonly DistributionSheetFrameLayout[],
  scale: DistributionScale,
  profile: DistributionProfile = 'fixed-grid',
): DistributionFrameData[] {
  normalizeDistributionScale(scale);
  const ids = new Set<string>();
  return layout.map((frame) => {
    if (ids.has(frame.id)) throw new Error('Duplicate distribution frame ID');
    ids.add(frame.id);
    // A still asset has one synthetic default frame; animated assets require real IDs.
    if ((asset.frames?.length ?? 0) > 0 && !asset.frames?.some((source) => source.id === frame.id))
      throw new Error('Distribution frame has no canonical source');
    const result = {
      ...structuredClone(frame),
      // The packer stores the crop in source-canvas coordinates. Packed pixels
      // are moved to rect.x/y, so the consumer's in-sheet crop starts at zero.
      contentRect:
        profile === 'packed' ? { ...frame.contentRect, x: 0, y: 0 } : { ...frame.contentRect },
      origin: scaleDistributionPoint(asset.origin, scale),
      anchors: asset.anchors.map((anchor) => ({
        ...structuredClone(anchor),
        position: scaleDistributionPoint(anchor.position, scale),
      })),
      colliders: resolveFrameColliders(asset, frame.id).map((collider) =>
        scaledCollider(collider, scale),
      ),
    };
    assertFrameGeometry(result);
    return result;
  });
}
