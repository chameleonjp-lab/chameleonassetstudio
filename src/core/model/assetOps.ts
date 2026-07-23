/**
 * レイヤーとパーツの操作（Phase 7）。
 * すべて元のアセットを変更せず、新しいアセットを返す純関数として実装する。
 */
import type { Animation, Frame } from './animation';
import type { Asset, AssetType, EffectSettings, GimmickSettings, TileSettings } from './asset';
import type { Vec2 } from './common';
import { createDefaultRectCollider, generateId } from './factories';
import type { BackgroundLayerSettings, Layer } from './layer';
import type { Part, PartPose, PartType } from './part';
import type { RigAnimation } from './rig';

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
 * レイヤーの左右反転（Phase 19-B, docs/future/FLIP_DESIGN.md）。
 * LayerTransform.scale.x の符号を反転する非破壊操作。画像ピクセルは変更せず、
 * 反転基準はレイヤー中心（描画側 render.ts / 書き出し側 exportAsset.ts が中心基準で
 * scale を適用するため）。asset.json の version は上げない。
 */
export function flipLayerHorizontal(asset: Asset, layerId: string): Asset {
  return mapLayer(asset, layerId, (layer) => ({
    ...layer,
    transform: {
      ...layer.transform,
      scale: { ...layer.transform.scale, x: layer.transform.scale.x * -1 },
    },
  }));
}

export interface LayerPositionUpdate {
  layerId: string;
  newPosition: Vec2;
}

/**
 * 複数レイヤーの position をまとめて更新する（align / distribute 用。2D-2-LAYER-ALIGN 契約 H1）。
 * position 以外（scale / rotation / opacity 等）は変更しない。存在しない layerId は無視する。
 */
export function applyLayerPositions(asset: Asset, updates: LayerPositionUpdate[]): Asset {
  const positionByLayerId = new Map(updates.map((update) => [update.layerId, update.newPosition]));
  return touch({
    ...asset,
    layers: asset.layers.map((layer) => {
      const newPosition = positionByLayerId.get(layer.id);
      if (!newPosition) {
        return layer;
      }
      return { ...layer, transform: { ...layer.transform, position: newPosition } };
    }),
  });
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
  // 値部分（id 以外）は factories.ts の createDefaultRectCollider と共有する
  // （2D-2-CREATE-01 の新規作成テンプレートも同じ関数を使い、計算式の重複を避けている）。
  const collider: Collider = {
    id: generateId('col'),
    ...createDefaultRectCollider(asset.canvasSize, purpose),
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

// ---- フレームとアニメーション（Phase 9） ----

/** 現在のレイヤー状態をフレームとして取り込む。 */
export function captureFrame(asset: Asset, name?: string): Asset {
  const frames = asset.frames ?? [];
  const frame: Frame = {
    id: generateId('frame'),
    name: name ?? `frame_${frames.length + 1}`,
    layerStates: asset.layers.map((layer) => ({
      layerId: layer.id,
      visible: layer.visible,
      transform: {
        position: { ...layer.transform.position },
        scale: { ...layer.transform.scale },
        rotation: layer.transform.rotation,
      },
      opacity: layer.opacity,
    })),
  };
  return touch({ ...asset, frames: [...frames, frame] });
}

export function renameFrame(asset: Asset, frameId: string, name: string): Asset {
  return touch({
    ...asset,
    frames: (asset.frames ?? []).map((frame) =>
      frame.id === frameId ? { ...frame, name } : frame,
    ),
  });
}

/**
 * フレームの並び順を 1 段動かす。moveLayerOrder と同様に、配列の並び＝再生順とする。
 */
export function moveFrameOrder(
  asset: Asset,
  frameId: string,
  direction: 'forward' | 'backward',
): Asset {
  const frames = asset.frames ?? [];
  const index = frames.findIndex((frame) => frame.id === frameId);
  if (index < 0) {
    return asset;
  }
  const target = direction === 'forward' ? index + 1 : index - 1;
  if (target < 0 || target >= frames.length) {
    return asset;
  }
  const next = [...frames];
  const [frame] = next.splice(index, 1);
  next.splice(target, 0, frame);
  return touch({ ...asset, frames: next });
}

/** フレームを複製して直後に挿入する。 */
export function duplicateFrame(asset: Asset, frameId: string): Asset {
  const frames = asset.frames ?? [];
  const index = frames.findIndex((frame) => frame.id === frameId);
  if (index < 0) {
    return asset;
  }
  const source = frames[index];
  const copy: Frame = {
    id: generateId('frame'),
    name: `${source.name}_copy`,
    ...(source.durationMs !== undefined ? { durationMs: source.durationMs } : {}),
    layerStates: source.layerStates.map((state) => ({
      ...state,
      transform: state.transform
        ? {
            position: { ...state.transform.position },
            scale: { ...state.transform.scale },
            rotation: state.transform.rotation,
          }
        : undefined,
    })),
  };
  const next = [...frames];
  next.splice(index + 1, 0, copy);
  return touch({ ...asset, frames: next });
}

/** Frame単位の表示時間を更新する。undefinedは参照先Animationのfpsへ戻す。 */
export function updateFrameDuration(
  asset: Asset,
  frameId: string,
  durationMs: number | undefined,
): Asset {
  return touch({
    ...asset,
    frames: (asset.frames ?? []).map((frame) => {
      if (frame.id !== frameId) {
        return frame;
      }
      if (durationMs === undefined) {
        const fallbackFrame = { ...frame };
        delete fallbackFrame.durationMs;
        return fallbackFrame;
      }
      return { ...frame, durationMs };
    }),
  });
}

/** フレームを削除する。アニメーションの frameIds からも除去する。 */
export function removeFrame(asset: Asset, frameId: string): Asset {
  return touch({
    ...asset,
    frames: (asset.frames ?? []).filter((frame) => frame.id !== frameId),
    animations: asset.animations.map((animation) =>
      animation.frameIds.includes(frameId)
        ? { ...animation, frameIds: animation.frameIds.filter((id) => id !== frameId) }
        : animation,
    ),
  });
}

export interface AddAnimationOptions {
  name: string;
  fps?: number;
  loop?: boolean;
  frameIds?: string[];
}

/** アニメーションを追加する。存在しないフレーム id は除外する。 */
export function addAnimation(asset: Asset, options: AddAnimationOptions): Asset {
  const frames = asset.frames ?? [];
  const frameIds = (options.frameIds ?? []).filter((id) => frames.some((frame) => frame.id === id));
  const animation: Animation = {
    id: generateId('anim'),
    name: options.name,
    fps: options.fps ?? 8,
    loop: options.loop ?? true,
    frameIds,
  };
  return touch({ ...asset, animations: [...asset.animations, animation] });
}

export function updateAnimation(
  asset: Asset,
  animationId: string,
  patch: Partial<Pick<Animation, 'name' | 'fps' | 'loop' | 'frameIds'>>,
): Asset {
  const frames = asset.frames ?? [];
  return touch({
    ...asset,
    animations: asset.animations.map((animation) => {
      if (animation.id !== animationId) {
        return animation;
      }
      const next = { ...animation, ...patch };
      if (patch.fps !== undefined) {
        next.fps = Math.min(240, Math.max(1, patch.fps));
      }
      if (patch.frameIds !== undefined) {
        next.frameIds = patch.frameIds.filter((id) => frames.some((frame) => frame.id === id));
      }
      return next;
    }),
  });
}

export function removeAnimation(asset: Asset, animationId: string): Asset {
  return touch({
    ...asset,
    animations: asset.animations.filter((animation) => animation.id !== animationId),
  });
}

/**
 * フレームの layerStates をレイヤーへ適用したアセットを返す（プレビュー用）。
 * frames や updatedAt は変更しない。layerStates に無いレイヤーはそのまま残す。
 */
export function applyFrameToAsset(asset: Asset, frameId: string): Asset {
  const frame = (asset.frames ?? []).find((f) => f.id === frameId);
  if (!frame) {
    return asset;
  }
  const stateByLayerId = new Map(frame.layerStates.map((state) => [state.layerId, state]));
  return {
    ...asset,
    layers: asset.layers.map((layer) => {
      const state = stateByLayerId.get(layer.id);
      if (!state) {
        return layer;
      }
      return {
        ...layer,
        visible: state.visible ?? layer.visible,
        opacity: state.opacity ?? layer.opacity,
        transform: state.transform ?? layer.transform,
      };
    }),
  };
}

// ---- 型別設定（Phase 14） ----

/** アセット種別を変更する。 */
export function setAssetType(asset: Asset, assetType: AssetType): Asset {
  return touch({ ...asset, assetType });
}

/** tile アセット用設定を設定する。undefined を渡すと削除する。 */
export function setTileSettings(asset: Asset, tile: TileSettings | undefined): Asset {
  const next = { ...asset };
  if (tile) {
    next.tile = tile;
  } else {
    delete next.tile;
  }
  return touch(next);
}

/** gimmick アセット用設定を設定する。undefined を渡すと削除する。 */
export function setGimmickSettings(asset: Asset, gimmick: GimmickSettings | undefined): Asset {
  const next = { ...asset };
  if (gimmick) {
    next.gimmick = gimmick;
  } else {
    delete next.gimmick;
  }
  return touch(next);
}

/** effect アセット用設定を設定する。undefined を渡すと削除する。 */
export function setEffectSettings(asset: Asset, effect: EffectSettings | undefined): Asset {
  const next = { ...asset };
  if (effect) {
    next.effect = effect;
  } else {
    delete next.effect;
  }
  return touch(next);
}

/** background アセットのレイヤー用設定を設定する。対象レイヤーが無ければそのまま返す。 */
export function setLayerBackground(
  asset: Asset,
  layerId: string,
  background: BackgroundLayerSettings | undefined,
): Asset {
  if (!asset.layers.some((layer) => layer.id === layerId)) {
    return asset;
  }
  return mapLayer(asset, layerId, (layer) => {
    const next = { ...layer };
    if (background) {
      next.background = background;
    } else {
      delete next.background;
    }
    return next;
  });
}

/** ゲーム属性を追加・更新する。 */
export function setGameAttribute(asset: Asset, key: string, value: unknown): Asset {
  return touch({ ...asset, gameAttributes: { ...asset.gameAttributes, [key]: value } });
}

/** ゲーム属性を削除する。 */
export function removeGameAttribute(asset: Asset, key: string): Asset {
  const gameAttributes = { ...asset.gameAttributes };
  delete gameAttributes[key];
  return touch({ ...asset, gameAttributes });
}

// ---- 簡易リグ（Phase 15） ----

/**
 * parts の parentId を辿った祖先チェーン（startId 自身を含む）に targetId が
 * 含まれるかどうかを調べる。訪問済みガードで循環データがあっても無限ループしない。
 */
function isPartAncestor(asset: Asset, startId: string, targetId: string): boolean {
  const visited = new Set<string>();
  let currentId: string | undefined = startId;
  while (currentId !== undefined && !visited.has(currentId)) {
    if (currentId === targetId) {
      return true;
    }
    visited.add(currentId);
    currentId = asset.parts.find((part) => part.id === currentId)?.parentId;
  }
  return false;
}

function mapPart(asset: Asset, partId: string, update: (part: Part) => Part): Asset {
  return touch({
    ...asset,
    parts: asset.parts.map((part) => (part.id === partId ? update(part) : part)),
  });
}

/**
 * パーツの親を設定する。parentId が partId 自身、または parentId の祖先チェーンに
 * partId が含まれる場合（循環になる場合）は変更せず asset をそのまま返す。
 */
export function setPartParent(asset: Asset, partId: string, parentId: string | undefined): Asset {
  if (parentId !== undefined && (parentId === partId || isPartAncestor(asset, parentId, partId))) {
    return asset;
  }
  return mapPart(asset, partId, (part) => {
    const next = { ...part };
    if (parentId !== undefined) {
      next.parentId = parentId;
    } else {
      delete next.parentId;
    }
    return next;
  });
}

/** パーツの基準ポーズ（バインドポーズ）を設定する。undefined を渡すと削除する。 */
export function setPartBindPose(
  asset: Asset,
  partId: string,
  bindPose: PartPose | undefined,
): Asset {
  return mapPart(asset, partId, (part) => {
    const next = { ...part };
    if (bindPose) {
      next.bindPose = bindPose;
    } else {
      delete next.bindPose;
    }
    return next;
  });
}

/** パーツの localRotation 可動域を設定する。undefined を渡すと削除する。 */
export function setPartRotationLimit(
  asset: Asset,
  partId: string,
  limit: { min: number; max: number } | undefined,
): Asset {
  return mapPart(asset, partId, (part) => {
    const next = { ...part };
    if (limit) {
      next.rotationLimit = limit;
    } else {
      delete next.rotationLimit;
    }
    return next;
  });
}

/** リグアニメーション一覧をまるごと置き換える。 */
export function setRigAnimations(asset: Asset, rigAnimations: RigAnimation[]): Asset {
  return touch({ ...asset, rigAnimations });
}
