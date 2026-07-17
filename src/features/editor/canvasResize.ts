/**
 * Asset canvas resize / game data追従の純関数。
 * 正本: docs/future/2D_2_CANVAS_RESIZE_PLAN.md（B1+P1+G1+O1+V1+H1）。
 */
import type { Asset, LayerTransform, Size, Vec2 } from '../../core/model';
import { validateBlankCanvasSize } from './blankAsset';
import { layerWorldBounds, type AABB } from './layerAlign';

export type CanvasResizeAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export interface CanvasResizeOverflowCounts {
  layers: number;
  frameStates: number;
  origin: number;
  anchors: number;
  colliders: number;
  partPivots: number;
  total: number;
}

function axisOffset(difference: number, placement: 'leading' | 'center' | 'trailing'): number {
  if (placement === 'leading') {
    return 0;
  }
  if (placement === 'center') {
    return Math.trunc(difference / 2);
  }
  return difference;
}

/**
 * 旧canvasを新canvasの9点anchorへ配置する移動量。中央の奇数差分はtruncし、
 * 余り1pxを右 / 下側へ置く（縮小時は右 / 下側から除く）。
 */
export function canvasResizeOffset(
  oldSize: Size,
  nextSize: Size,
  anchor: CanvasResizeAnchor,
): Vec2 {
  const horizontal =
    anchor.endsWith('left') || anchor === 'left'
      ? 'leading'
      : anchor.endsWith('right') || anchor === 'right'
        ? 'trailing'
        : 'center';
  const vertical =
    anchor.startsWith('top') || anchor === 'top'
      ? 'leading'
      : anchor.startsWith('bottom') || anchor === 'bottom'
        ? 'trailing'
        : 'center';
  return {
    x: axisOffset(nextSize.width - oldSize.width, horizontal),
    y: axisOffset(nextSize.height - oldSize.height, vertical),
  };
}

function translatePoint(point: Vec2, offset: Vec2): Vec2 {
  return { x: point.x + offset.x, y: point.y + offset.y };
}

function translateTransform(transform: LayerTransform, offset: Vec2): LayerTransform {
  return {
    ...transform,
    position: translatePoint(transform.position, offset),
  };
}

/**
 * canvasSizeとcanvas座標を持つ保存データを同じdx/dyで原子的に移動する。
 * texture / pixel / scale / rotation / local poseなどの非対象データは変更しない。
 * 同じsizeは参照同一のno-opを返す。
 */
export function resizeAssetCanvas(
  asset: Asset,
  nextSize: Size,
  anchor: CanvasResizeAnchor,
  now: Date = new Date(),
): Asset {
  const validationError = validateBlankCanvasSize(nextSize);
  if (validationError) {
    throw new Error(validationError);
  }
  if (asset.canvasSize.width === nextSize.width && asset.canvasSize.height === nextSize.height) {
    return asset;
  }

  const offset = canvasResizeOffset(asset.canvasSize, nextSize, anchor);
  return {
    ...asset,
    canvasSize: { ...nextSize },
    layers: asset.layers.map((layer) => ({
      ...layer,
      transform: translateTransform(layer.transform, offset),
    })),
    frames: asset.frames?.map((frame) => ({
      ...frame,
      layerStates: frame.layerStates.map((state) =>
        state.transform
          ? { ...state, transform: translateTransform(state.transform, offset) }
          : state,
      ),
    })),
    origin: translatePoint(asset.origin, offset),
    anchors: asset.anchors.map((anchorEntry) => ({
      ...anchorEntry,
      position: translatePoint(anchorEntry.position, offset),
    })),
    colliders: asset.colliders.map((collider) =>
      collider.shape === 'rect'
        ? {
            ...collider,
            rect: {
              ...collider.rect,
              x: collider.rect.x + offset.x,
              y: collider.rect.y + offset.y,
            },
          }
        : {
            ...collider,
            circle: {
              ...collider.circle,
              x: collider.circle.x + offset.x,
              y: collider.circle.y + offset.y,
            },
          },
    ),
    parts: asset.parts.map((part) =>
      part.pivot ? { ...part, pivot: translatePoint(part.pivot, offset) } : part,
    ),
    updatedAt: now.toISOString(),
  };
}

function pointOutsideCanvas(point: Vec2, canvasSize: Size): boolean {
  return point.x < 0 || point.y < 0 || point.x > canvasSize.width || point.y > canvasSize.height;
}

function boundsOutsideCanvas(bounds: AABB, canvasSize: Size): boolean {
  return (
    bounds.minX < 0 ||
    bounds.minY < 0 ||
    bounds.maxX > canvasSize.width ||
    bounds.maxY > canvasSize.height
  );
}

/** 変更後Assetについて、canvas外へ出る保存データを種類別に数える。 */
export function inspectCanvasResizeOverflow(asset: Asset): CanvasResizeOverflowCounts {
  const layerById = new Map(asset.layers.map((layer) => [layer.id, layer]));
  const textureSizeById = new Map(asset.textures.map((texture) => [texture.id, texture.size]));
  const layerTextureSize = (layerId: string) => {
    const textureId = layerById.get(layerId)?.textureId;
    return textureId ? textureSizeById.get(textureId) : undefined;
  };

  const layers = asset.layers.filter((layer) => {
    const textureSize = layer.textureId ? textureSizeById.get(layer.textureId) : undefined;
    return (
      textureSize !== undefined &&
      boundsOutsideCanvas(layerWorldBounds(layer.transform, textureSize), asset.canvasSize)
    );
  }).length;

  const frameStates = (asset.frames ?? []).reduce(
    (count, frame) =>
      count +
      frame.layerStates.filter((state) => {
        if (!state.transform) {
          return false;
        }
        const textureSize = layerTextureSize(state.layerId);
        return (
          textureSize !== undefined &&
          boundsOutsideCanvas(layerWorldBounds(state.transform, textureSize), asset.canvasSize)
        );
      }).length,
    0,
  );

  const origin = pointOutsideCanvas(asset.origin, asset.canvasSize) ? 1 : 0;
  const anchors = asset.anchors.filter((anchor) =>
    pointOutsideCanvas(anchor.position, asset.canvasSize),
  ).length;
  const colliders = asset.colliders.filter((collider) => {
    if (collider.shape === 'circle') {
      return (
        collider.circle.x - collider.circle.radius < 0 ||
        collider.circle.y - collider.circle.radius < 0 ||
        collider.circle.x + collider.circle.radius > asset.canvasSize.width ||
        collider.circle.y + collider.circle.radius > asset.canvasSize.height
      );
    }
    const right = collider.rect.x + collider.rect.width;
    const bottom = collider.rect.y + collider.rect.height;
    return (
      Math.min(collider.rect.x, right) < 0 ||
      Math.min(collider.rect.y, bottom) < 0 ||
      Math.max(collider.rect.x, right) > asset.canvasSize.width ||
      Math.max(collider.rect.y, bottom) > asset.canvasSize.height
    );
  }).length;
  const partPivots = asset.parts.filter(
    (part) => part.pivot && pointOutsideCanvas(part.pivot, asset.canvasSize),
  ).length;

  return {
    layers,
    frameStates,
    origin,
    anchors,
    colliders,
    partPivots,
    total: layers + frameStates + origin + anchors + colliders + partPivots,
  };
}
