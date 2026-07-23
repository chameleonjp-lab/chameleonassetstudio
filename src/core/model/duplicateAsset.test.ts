import { describe, expect, it } from 'vitest';
import type { Asset } from './asset';
import { duplicateAsset } from './duplicateAsset';
import characterAsset from '../samples/asset.character.json';

describe('duplicateAsset', () => {
  it('全内部IDと参照を再採番した独立copyを作る', () => {
    const source = structuredClone(characterAsset) as unknown as Asset;
    const layer = source.layers[0];
    const texture = source.textures[0];
    const layerTextureIndex = source.textures.findIndex(
      (candidate) => candidate.id === layer.textureId,
    );
    source.parts = [
      {
        id: 'part_parent',
        name: 'parent',
        partType: 'body',
        layerIds: [layer.id],
        pivot: { x: 1, y: 2 },
        bindPose: { localPosition: { x: 3, y: 4 }, localScale: { x: 1, y: 1 } },
      },
      {
        id: 'part_child',
        name: 'child',
        partType: 'arm_left',
        layerIds: [layer.id],
        parentId: 'part_parent',
      },
    ];
    source.frames = [
      {
        id: 'frame_source',
        name: 'frame',
        durationMs: 125,
        layerStates: [{ layerId: layer.id, transform: structuredClone(layer.transform) }],
      },
    ];
    source.animations = [
      {
        id: 'animation_source',
        name: 'idle',
        fps: 12,
        loop: true,
        frameIds: ['frame_source'],
        events: [
          {
            id: 'event_source',
            name: 'hand_left_attack',
            frameId: 'frame_source',
            payload: { power: 2 },
          },
        ],
      },
    ];
    source.rigAnimations = [
      {
        id: 'rig_source',
        name: 'rig',
        fps: 12,
        loop: true,
        durationMs: 100,
        keyframes: [
          {
            time: 0,
            poses: { part_child: { localRotation: 10 } },
          },
        ],
      },
    ];

    const copy = duplicateAsset(source, { now: new Date('2026-07-16T00:00:00.000Z') });

    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe(`${source.name}_copy`);
    expect(copy.displayName).toBe(`${source.displayName} (コピー)`);
    expect(copy.textures[0].id).not.toBe(texture.id);
    expect(copy.textures[0].path).toBe(texture.path);
    expect(copy.layers[0].id).not.toBe(layer.id);
    expect(layerTextureIndex).toBeGreaterThanOrEqual(0);
    expect(copy.layers[0].textureId).toBe(copy.textures[layerTextureIndex].id);
    expect(copy.parts[0].layerIds).toEqual([copy.layers[0].id]);
    expect(copy.parts[1].parentId).toBe(copy.parts[0].id);
    expect(copy.frames?.[0].id).not.toBe('frame_source');
    expect(copy.frames?.[0].durationMs).toBe(125);
    expect(copy.frames?.[0].layerStates[0].layerId).toBe(copy.layers[0].id);
    expect(copy.animations[0].frameIds).toEqual([copy.frames?.[0].id]);
    expect(copy.animations[0].events?.[0]).toMatchObject({
      name: 'hand_left_attack',
      frameId: copy.frames?.[0].id,
      payload: { power: 2 },
    });
    expect(copy.animations[0].events?.[0].id).not.toBe('event_source');
    expect(Object.keys(copy.rigAnimations?.[0].keyframes[0].poses ?? {})).toEqual([
      copy.parts[1].id,
    ]);
    expect(copy.createdAt).toBe('2026-07-16T00:00:00.000Z');

    const copiedPayload = copy.animations[0].events?.[0].payload as { power: number };
    copiedPayload.power = 99;
    expect(source.animations[0].events?.[0].payload).toEqual({ power: 2 });
  });

  it('copy側の入れ子を変更しても元Assetを変更しない', () => {
    const source = structuredClone(characterAsset) as unknown as Asset;
    source.gameAttributes = { nested: { value: 1 } };
    const copy = duplicateAsset(source);

    copy.canvasSize.width = 999;
    copy.layers[0].transform.position.x = 999;
    (copy.gameAttributes.nested as { value: number }).value = 999;

    expect(source.canvasSize.width).not.toBe(999);
    expect(source.layers[0].transform.position.x).not.toBe(999);
    expect(source.gameAttributes).toEqual({ nested: { value: 1 } });
  });

  it('texture IDの再採番に合わせてprovenance参照を更新し、未知fieldも独立copyする', () => {
    const source = structuredClone(characterAsset) as unknown as Asset;
    const sourceTextureId = source.textures.find((texture) => texture.kind === 'source')!.id;
    source.provenance = [
      {
        sourceFileName: 'hero.png',
        mimeType: 'image/png',
        byteLength: 3,
        hash: `sha256:${'a'.repeat(64)}`,
        importedAt: '2026-07-20T00:00:00.000Z',
        textureId: sourceTextureId,
        future: { preserved: true },
      },
    ];

    const copy = duplicateAsset(source);
    const copiedRecord = copy.provenance?.[0];
    expect(copiedRecord?.textureId).not.toBe(sourceTextureId);
    expect(copy.textures.some((texture) => texture.id === copiedRecord?.textureId)).toBe(true);
    expect(copy.textures.find((texture) => texture.id === copiedRecord?.textureId)?.kind).toBe(
      'source',
    );

    (copiedRecord?.future as { preserved: boolean }).preserved = false;
    expect(source.provenance[0].future).toEqual({ preserved: true });
  });
});
