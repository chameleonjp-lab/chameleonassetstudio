/**
 * レイヤーとパーツの操作（Phase 7）。
 * すべて元のアセットを変更せず、新しいアセットを返す純関数として実装する。
 */
import type { Asset } from './asset';
import type { Vec2 } from './common';
import { generateId } from './factories';
import type { Layer } from './layer';
import type { Part, PartType } from './part';

function touch(asset: Asset): Asset {
  return { ...asset, updatedAt: new Date().toISOString() };
}

function mapLayer(asset: Asset, layerId: string, update: (layer: Layer) => Layer): Asset {
  return touch({
    ...asset,
    layers: asset.layers.map((layer) => (layer.id === layerId ? update(layer) : layer)),
  });
}

export function renameLayer(asset: Asset, layerId: string, name: string): Asset {
  return mapLayer(asset, layerId, (layer) => ({ ...layer, name }));
}

export function setLayerVisibility(asset: Asset, layerId: string, visible: boolean): Asset {
  return mapLayer(asset, layerId, (layer) => ({ ...layer, visible }));
}

export function setLayerLocked(asset: Asset, layerId: string, locked: boolean): Asset {
  return mapLayer(asset, layerId, (layer) => ({ ...layer, locked }));
}

/**
 * 表示順を 1 段動かす。配列の先頭が最背面なので、
 * forward（前面へ）は index + 1、backward（背面へ）は index - 1。
 * 端にある場合は何もしない。
 */
export function moveLayerOrder(
  asset: Asset,
  layerId: string,
  direction: 'forward' | 'backward',
): Asset {
  const index = asset.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) {
    return asset;
  }
  const target = direction === 'forward' ? index + 1 : index - 1;
  if (target < 0 || target >= asset.layers.length) {
    return asset;
  }
  const layers = [...asset.layers];
  const [layer] = layers.splice(index, 1);
  layers.splice(target, 0, layer);
  return touch({ ...asset, layers });
}

/** レイヤーを削除する。パーツからの参照も外す（パーツ自体は残す）。 */
export function removeLayer(asset: Asset, layerId: string): Asset {
  return touch({
    ...asset,
    layers: asset.layers.filter((layer) => layer.id !== layerId),
    parts: asset.parts.map((part) =>
      part.layerIds.includes(layerId)
        ? { ...part, layerIds: part.layerIds.filter((id) => id !== layerId) }
        : part,
    ),
  });
}

/** ガイドレイヤーを最前面に追加する。 */
export function addGuideLayer(asset: Asset, name = 'ガイド'): Asset {
  const layer: Layer = {
    id: generateId('layer'),
    name,
    layerType: 'guide',
    visible: true,
    locked: false,
    opacity: 0.5,
    transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
  };
  return touch({ ...asset, layers: [...asset.layers, layer] });
}

export interface CreatePartOptions {
  name: string;
  partType: PartType;
  layerIds: string[];
  pivot?: Vec2;
}

/** 複数レイヤーをまとめるパーツを作る。存在しないレイヤー id は除外する。 */
export function createPart(asset: Asset, options: CreatePartOptions): Asset {
  const validIds = options.layerIds.filter((id) => asset.layers.some((layer) => layer.id === id));
  const part: Part = {
    id: generateId('part'),
    name: options.name,
    partType: options.partType,
    layerIds: validIds,
    ...(options.pivot ? { pivot: options.pivot } : {}),
  };
  return touch({ ...asset, parts: [...asset.parts, part] });
}

export function updatePart(
  asset: Asset,
  partId: string,
  patch: Partial<Pick<Part, 'name' | 'partType' | 'layerIds' | 'pivot'>>,
): Asset {
  return touch({
    ...asset,
    parts: asset.parts.map((part) => (part.id === partId ? { ...part, ...patch } : part)),
  });
}

export function removePart(asset: Asset, partId: string): Asset {
  return touch({ ...asset, parts: asset.parts.filter((part) => part.id !== partId) });
}

// ---- 原点、アンカー、当たり判定（Phase 8） ----

import type { Anchor, AnchorRole } from './anchor';
import type { Collider, ColliderCircle, ColliderPurpose, ColliderRect } from './collider';

/** 原点を設定する（キャンバス座標）。 */
export function setOrigin(asset: Asset, origin: Vec2): Asset {
  return touch({ ...asset, origin: { x: origin.x, y: origin.y } });
}

/** キャラクターの基本位置（下中央）へ原点を戻す（要件 11.6）。 */
export function resetOriginToBottomCenter(asset: Asset): Asset {
  return setOrigin(asset, {
    x: Math.round(asset.canvasSize.width / 2),
    y: asset.canvasSize.height,
  });
}

export interface AddAnchorOptions {
  role: AnchorRole;
  position: Vec2;
  name?: string;
}

export function addAnchor(asset: Asset, options: AddAnchorOptions): Asset {
  const anchor: Anchor = {
    id: generateId('anchor'),
    name: options.name ?? options.role,
    role: options.role,
    position: { x: options.position.x, y: options.position.y },
  };
  return touch({ ...asset, anchors: [...asset.anchors, anchor] });
}

export function updateAnchor(
  asset: Asset,
  anchorId: string,
  patch: Partial<Pick<Anchor, 'name' | 'role' | 'position'>>,
): Asset {
  return touch({
    ...asset,
    anchors: asset.anchors.map((anchor) =>
      anchor.id === anchorId ? { ...anchor, ...patch } : anchor,
    ),
  });
}

export function removeAnchor(asset: Asset, anchorId: string): Asset {
  return touch({ ...asset, anchors: asset.anchors.filter((anchor) => anchor.id !== anchorId) });
}

/** キャンバス中央に既定サイズの矩形当たり判定を追加する。 */
export function addRectCollider(asset: Asset, purpose: ColliderPurpose = 'body'): Asset {
  const { width, height } = asset.canvasSize;
  const collider: Collider = {
    id: generateId('col'),
    name: purpose,
    purpose,
    shape: 'rect',
    visible: true,
    rect: {
      x: Math.round(width / 4),
      y: Math.round(height / 4),
      width: Math.round(width / 2),
      height: Math.round(height / 2),
    },
  };
  return touch({ ...asset, colliders: [...asset.colliders, collider] });
}

/** キャンバス中央に既定サイズの円当たり判定を追加する。 */
export function addCircleCollider(asset: Asset, purpose: ColliderPurpose = 'body'): Asset {
  const { width, height } = asset.canvasSize;
  const collider: Collider = {
    id: generateId('col'),
    name: purpose,
    purpose,
    shape: 'circle',
    visible: true,
    circle: {
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      radius: Math.max(1, Math.round(Math.min(width, height) / 4)),
    },
  };
  return touch({ ...asset, colliders: [...asset.colliders, collider] });
}

export interface ColliderPatch {
  name?: string;
  purpose?: ColliderPurpose;
  visible?: boolean;
  rect?: Partial<ColliderRect>;
  circle?: Partial<ColliderCircle>;
}

export function updateCollider(asset: Asset, colliderId: string, patch: ColliderPatch): Asset {
  return touch({
    ...asset,
    colliders: asset.colliders.map((collider) => {
      if (collider.id !== colliderId) {
        return collider;
      }
      const base = {
        name: patch.name ?? collider.name,
        purpose: patch.purpose ?? collider.purpose,
        visible: patch.visible ?? collider.visible,
      };
      if (collider.shape === 'rect') {
        return { ...collider, ...base, rect: { ...collider.rect, ...patch.rect } };
      }
      return { ...collider, ...base, circle: { ...collider.circle, ...patch.circle } };
    }),
  });
}

export function removeCollider(asset: Asset, colliderId: string): Asset {
  return touch({
    ...asset,
    colliders: asset.colliders.filter((collider) => collider.id !== colliderId),
  });
}
