import type { Asset } from './asset';
import { generateId } from './factories';
import type { PartPose } from './part';

export interface DuplicateAssetOptions {
  now?: Date;
  name?: string;
  displayName?: string;
}

function clonePose(pose: PartPose): PartPose {
  return {
    ...(pose.localPosition ? { localPosition: { ...pose.localPosition } } : {}),
    ...(pose.localRotation !== undefined ? { localRotation: pose.localRotation } : {}),
    ...(pose.localScale ? { localScale: { ...pose.localScale } } : {}),
  };
}

/**
 * 元Assetとの同期関係を持たない独立copyを作る。
 *
 * Asset自身と内部参照をすべて再採番し、元とcopyの一方を編集・削除しても他方へ
 * 影響しない構造にする。Texture pathは維持するがTextureRef IDを再採番するため、
 * 呼び出し側は各Blobを新しいAsset ID配下へcopyする。
 */
export function duplicateAsset(asset: Asset, options: DuplicateAssetOptions = {}): Asset {
  const iso = (options.now ?? new Date()).toISOString();
  const textureIdMap = new Map(
    asset.textures.map((texture) => [texture.id, generateId('texture')]),
  );
  const layerIdMap = new Map(asset.layers.map((layer) => [layer.id, generateId('layer')]));
  const partIdMap = new Map(asset.parts.map((part) => [part.id, generateId('part')]));
  const frameIdMap = new Map((asset.frames ?? []).map((frame) => [frame.id, generateId('frame')]));

  return {
    ...asset,
    id: generateId('asset'),
    name: options.name ?? `${asset.name}_copy`,
    displayName: options.displayName ?? `${asset.displayName} (コピー)`,
    canvasSize: { ...asset.canvasSize },
    origin: { ...asset.origin },
    textures: asset.textures.map((texture) => ({
      ...texture,
      id: textureIdMap.get(texture.id)!,
      size: { ...texture.size },
    })),
    layers: asset.layers.map((layer) => ({
      ...layer,
      id: layerIdMap.get(layer.id)!,
      ...(layer.textureId
        ? { textureId: textureIdMap.get(layer.textureId) ?? layer.textureId }
        : {}),
      transform: {
        position: { ...layer.transform.position },
        scale: { ...layer.transform.scale },
        rotation: layer.transform.rotation,
      },
      ...(layer.background
        ? {
            background: {
              ...layer.background,
              parallaxSpeed: { ...layer.background.parallaxSpeed },
            },
          }
        : {}),
    })),
    parts: asset.parts.map((part) => ({
      ...part,
      id: partIdMap.get(part.id)!,
      layerIds: part.layerIds.map((id) => layerIdMap.get(id) ?? id),
      ...(part.pivot ? { pivot: { ...part.pivot } } : {}),
      ...(part.parentId ? { parentId: partIdMap.get(part.parentId) ?? part.parentId } : {}),
      ...(part.bindPose ? { bindPose: clonePose(part.bindPose) } : {}),
      ...(part.rotationLimit ? { rotationLimit: { ...part.rotationLimit } } : {}),
    })),
    anchors: asset.anchors.map((anchor) => ({
      ...anchor,
      id: generateId('anchor'),
      position: { ...anchor.position },
    })),
    colliders: asset.colliders.map((collider) =>
      collider.shape === 'rect'
        ? { ...collider, id: generateId('col'), rect: { ...collider.rect } }
        : { ...collider, id: generateId('col'), circle: { ...collider.circle } },
    ),
    frames: asset.frames?.map((frame) => ({
      ...frame,
      id: frameIdMap.get(frame.id)!,
      layerStates: frame.layerStates.map((state) => ({
        ...state,
        layerId: layerIdMap.get(state.layerId) ?? state.layerId,
        ...(state.transform
          ? {
              transform: {
                position: { ...state.transform.position },
                scale: { ...state.transform.scale },
                rotation: state.transform.rotation,
              },
            }
          : {}),
      })),
    })),
    animations: asset.animations.map((animation) => ({
      ...animation,
      id: generateId('anim'),
      frameIds: animation.frameIds.map((id) => frameIdMap.get(id) ?? id),
      ...(animation.events
        ? {
            events: animation.events.map((event) => ({
              ...structuredClone(event),
              id: generateId('event'),
              frameId: frameIdMap.get(event.frameId) ?? event.frameId,
            })),
          }
        : {}),
    })),
    provenance: asset.provenance?.map((record) => {
      const copy = structuredClone(record);
      if (typeof copy.textureId === 'string') {
        copy.textureId = textureIdMap.get(copy.textureId) ?? copy.textureId;
      }
      return copy;
    }),
    rigAnimations: asset.rigAnimations?.map((animation) => ({
      ...animation,
      id: generateId('riganim'),
      keyframes: animation.keyframes.map((keyframe) => ({
        ...keyframe,
        poses: Object.fromEntries(
          Object.entries(keyframe.poses).map(([partId, pose]) => [
            partIdMap.get(partId) ?? partId,
            clonePose(pose),
          ]),
        ),
      })),
    })),
    tags: [...asset.tags],
    gameAttributes: structuredClone(asset.gameAttributes),
    ...(asset.tile ? { tile: { ...asset.tile, tileSize: { ...asset.tile.tileSize } } } : {}),
    ...(asset.gimmick ? { gimmick: { ...asset.gimmick } } : {}),
    ...(asset.effect ? { effect: { ...asset.effect } } : {}),
    createdAt: iso,
    updatedAt: iso,
  };
}
