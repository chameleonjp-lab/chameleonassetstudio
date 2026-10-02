import { describe, expect, it } from 'vitest';
import {
  applyFrameToAsset,
  captureFrame,
  createImageAsset,
  duplicateFrame,
} from '../../core/model';
import { prepareFrameDrawing, frameDrawingLayerIsIndependent } from './frameDrawing';

function fixture() {
  const base = captureFrame(
    createImageAsset({
      name: 'test',
      size: { width: 64, height: 64 },
      sourceMimeType: 'image/png',
      sourceExtension: 'png',
    }),
  );
  return duplicateFrame(base, base.frames![0].id);
}

describe('independent frame drawing', () => {
  it('forks selected frame pixels and leaves the source, base and other frame unchanged', async () => {
    const before = fixture();
    const snapshot = structuredClone(before);
    const blob = new Blob(['pixels'], { type: 'image/png' });
    const target = before.frames![1];
    const result = await prepareFrameDrawing(before, target.id, async () => blob);
    expect(before).toEqual(snapshot);
    expect(result.blobs).toHaveLength(1);
    expect(await result.blobs[0].blob.text()).toBe('pixels');
    const layerId = result.layerIds[0];
    expect(frameDrawingLayerIsIndependent(result.asset, target.id, layerId)).toBe(true);
    expect(
      applyFrameToAsset(result.asset, target.id)
        .layers.filter((layer) => layer.visible)
        .map((layer) => layer.id),
    ).toEqual([layerId]);
    expect(
      applyFrameToAsset(result.asset, before.frames![0].id)
        .layers.filter((layer) => layer.visible)
        .map((layer) => layer.id),
    ).toEqual([before.layers[0].id]);
    expect(result.asset.textures.filter((texture) => texture.kind === 'source')).toEqual(
      before.textures.filter((texture) => texture.kind === 'source'),
    );
    expect(result.asset.layers.filter((layer) => layer.visible)).toEqual(before.layers);
  });

  it('reuses an exclusive frame and forks again after duplication shares it', async () => {
    const asset = fixture();
    const first = await prepareFrameDrawing(
      asset,
      asset.frames![1].id,
      async () => new Blob(['pixels']),
    );
    const repeated = await prepareFrameDrawing(first.asset, asset.frames![1].id, async () => {
      throw new Error('unexpected read');
    });
    expect(repeated.asset).toBe(first.asset);
    expect(repeated.blobs).toEqual([]);
    const duplicated = duplicateFrame(first.asset, asset.frames![1].id);
    const copy = duplicated.frames![2];
    const forked = await prepareFrameDrawing(duplicated, copy.id, async () => new Blob(['pixels']));
    expect(forked.layerIds[0]).not.toBe(first.layerIds[0]);
    expect(frameDrawingLayerIsIndependent(forked.asset, copy.id, forked.layerIds[0])).toBe(true);
    expect(
      frameDrawingLayerIsIndependent(forked.asset, asset.frames![1].id, first.layerIds[0]),
    ).toBe(true);
  });

  it('preserves layer order, frame timing, transforms and game information', async () => {
    const asset = fixture();
    const target = asset.frames![1];
    target.durationMs = 200;
    target.layerStates[0].transform = {
      position: { x: 3, y: 7 },
      scale: { x: 2, y: 2 },
      rotation: 15,
    };
    const result = await prepareFrameDrawing(asset, target.id, async () => new Blob(['pixels']));
    expect(result.asset.frames![1].durationMs).toBe(200);
    expect(
      applyFrameToAsset(result.asset, target.id).layers.find(
        (layer) => layer.id === result.layerIds[0],
      )!.transform,
    ).toEqual(target.layerStates[0].transform);
    expect(result.asset.origin).toEqual(asset.origin);
    expect(result.asset.anchors).toEqual(asset.anchors);
    expect(result.asset.colliders).toEqual(asset.colliders);
  });

  it('rejects missing pixels before exposing any changed asset', async () => {
    const asset = fixture();
    const snapshot = structuredClone(asset);
    await expect(prepareFrameDrawing(asset, asset.frames![1].id, async () => null)).rejects.toThrow(
      '画像が見つかりません',
    );
    expect(asset).toEqual(snapshot);
  });
});
