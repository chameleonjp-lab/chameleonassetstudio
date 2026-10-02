import { applyFrameToAsset, generateId, type Asset, type Layer } from '../../core/model';
import { blobKeyFor } from '../../core/images/importImage';

export interface PreparedFrameDrawing {
  asset: Asset;
  layerIds: string[];
  blobs: Array<{ key: string; blob: Blob }>;
}

/** Fork shared editable pixels using the existing frame layer-state contract. */
export async function prepareFrameDrawing(
  asset: Asset,
  frameId: string,
  readBlob: (key: string) => Promise<Blob | null>,
): Promise<PreparedFrameDrawing> {
  const frame = asset.frames?.find((entry) => entry.id === frameId);
  if (!frame) throw new Error('描くコマが見つかりません。');
  if (asset.rigAnimations?.length)
    throw new Error('リグの動きは先にコマへ焼き込んでから描き直してください。');
  const displayed = applyFrameToAsset(asset, frameId);
  const visible = displayed.layers.filter((layer) => layer.visible && layer.layerType === 'image');
  if (!visible.length) throw new Error('描くコマに画像レイヤーがありません。');
  const otherFrames = (asset.frames ?? [])
    .filter((entry) => entry.id !== frameId)
    .map((entry) => applyFrameToAsset(asset, entry.id));
  const replacements = new Map<string, Layer>();
  const textures = [...asset.textures];
  const blobs: PreparedFrameDrawing['blobs'] = [];
  const layerIds: string[] = [];
  for (const layer of visible) {
    const original = asset.layers.find((entry) => entry.id === layer.id)!;
    const texture = asset.textures.find((entry) => entry.id === layer.textureId);
    if (texture?.kind !== 'edit') throw new Error('編集用の画像レイヤーを選んでください。');
    const shared =
      original.visible ||
      otherFrames.some((other) =>
        other.layers.some((entry) => entry.visible && entry.textureId === texture.id),
      ) ||
      displayed.layers.some((entry) => entry.id !== layer.id && entry.textureId === texture.id);
    if (!shared) {
      layerIds.push(layer.id);
      continue;
    }
    const blob = await readBlob(blobKeyFor(asset.id, texture.path));
    if (!blob) throw new Error(`「${layer.name}」の画像が見つかりません。`);
    const textureId = generateId('tex');
    const path = `edit/${textureId}.png`;
    const copy: Layer = {
      ...structuredClone(layer),
      id: generateId('layer'),
      visible: false,
      textureId,
      name: `${frame.name}: ${layer.name}`,
    };
    replacements.set(layer.id, copy);
    textures.push({ ...texture, id: textureId, path });
    blobs.push({ key: blobKeyFor(asset.id, path), blob });
    layerIds.push(copy.id);
  }
  if (!replacements.size) return { asset, layerIds, blobs };
  // Insert next to its source so compositing order stays unchanged.
  const layers = asset.layers.flatMap((layer) => {
    const copy = replacements.get(layer.id);
    return copy ? [layer, copy] : [layer];
  });
  const frames = asset.frames!.map((entry) => {
    const states = new Map(
      entry.layerStates.map((state) => [state.layerId, structuredClone(state)]),
    );
    for (const [sourceId, copy] of replacements) {
      states.set(copy.id, {
        layerId: copy.id,
        visible: entry.id === frameId,
        transform: structuredClone(copy.transform),
        opacity: copy.opacity,
      });
      if (entry.id === frameId)
        states.set(sourceId, { ...states.get(sourceId), layerId: sourceId, visible: false });
    }
    return { ...entry, layerStates: [...states.values()] };
  });
  return {
    asset: { ...asset, layers, textures, frames, updatedAt: new Date().toISOString() },
    layerIds,
    blobs,
  };
}

export function frameDrawingLayerIsIndependent(asset: Asset, frameId: string, layerId: string) {
  const layer = applyFrameToAsset(asset, frameId).layers.find((entry) => entry.id === layerId);
  if (!layer?.visible || !layer.textureId) return false;
  if (asset.layers.some((entry) => entry.visible && entry.textureId === layer.textureId))
    return false;
  return !(asset.frames ?? []).some(
    (frame) =>
      frame.id !== frameId &&
      applyFrameToAsset(asset, frame.id).layers.some(
        (entry) => entry.visible && entry.textureId === layer.textureId,
      ),
  );
}
