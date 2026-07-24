import { describe, expect, it } from 'vitest';
import type { Asset, AssetType } from './asset';
import type { Collider } from './collider';
import { createBlankAsset } from './factories';
import { inspectAsset, type InspectionIssue } from './assetInspection';

const NOW = new Date('2026-07-16T00:00:00.000Z');

function blank(assetType: AssetType): Asset {
  return createBlankAsset({
    name: `test_${assetType}`,
    displayName: `test ${assetType}`,
    assetType,
    canvasSize: { width: 64, height: 64 },
    now: NOW,
  });
}

function collider(id: string, purpose: Collider['purpose']): Collider {
  return {
    id,
    name: purpose,
    purpose,
    shape: 'rect',
    visible: true,
    rect: { x: 8, y: 8, width: 48, height: 48 },
  };
}

function codes(issues: InspectionIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

describe('inspectAsset (A+B+X)', () => {
  it('does not mutate the asset and returns deterministic issue ids', () => {
    const asset = blank('character');
    const before = JSON.parse(JSON.stringify(asset)) as Asset;

    const first = inspectAsset(asset);
    const second = inspectAsset(asset);

    expect(asset).toEqual(before);
    expect(first.map((issue) => issue.id)).toEqual(second.map((issue) => issue.id));
  });

  it('reports shared reference failures and part parent cycles as errors', () => {
    const asset = blank('item');
    const broken: Asset = {
      ...asset,
      layers: asset.layers.map((layer) => ({ ...layer, textureId: 'missing_texture' })),
      parts: [
        {
          id: 'part_a',
          name: 'A',
          partType: 'body',
          layerIds: ['missing_layer'],
          parentId: 'part_b',
        },
        {
          id: 'part_b',
          name: 'B',
          partType: 'head',
          layerIds: [],
          parentId: 'part_a',
        },
      ],
    };

    const issues = inspectAsset(broken);

    expect(codes(issues)).toEqual(
      expect.arrayContaining([
        'reference.layerTextureMissing',
        'reference.partLayerMissing',
        'reference.partParentCycle',
      ]),
    );
    expect(
      issues
        .filter((issue) => issue.code.startsWith('reference.'))
        .every((issue) => issue.severity === 'error'),
    ).toBe(true);
  });

  it('Part構成のempty・duplicate・missing・sharedをread-onlyで決定的に報告する', () => {
    const source = blank('item');
    const layerId = source.layers[0].id;
    const unusedLayer = { ...source.layers[0], id: 'layer_unused', name: 'unused' };
    const broken: Asset = {
      ...source,
      layers: [...source.layers, unusedLayer],
      parts: [
        {
          id: 'part_empty',
          name: 'empty',
          partType: 'other',
          layerIds: [],
        },
        {
          id: 'part_a',
          name: 'A',
          partType: 'body',
          layerIds: [layerId, layerId, 'layer_missing'],
        },
        {
          id: 'part_b',
          name: 'B',
          partType: 'head',
          layerIds: [layerId],
        },
      ],
    };
    const before = structuredClone(broken);

    const first = inspectAsset(broken).filter((issue) =>
      [
        'reference.partLayerEmpty',
        'reference.partLayerDuplicate',
        'reference.partLayerMissing',
        'reference.partLayerShared',
      ].includes(issue.code),
    );
    const second = inspectAsset(broken).filter((issue) =>
      issue.code.startsWith('reference.partLayer'),
    );

    expect(first.map((issue) => issue.code)).toEqual([
      'reference.partLayerDuplicate',
      'reference.partLayerEmpty',
      'reference.partLayerMissing',
      'reference.partLayerShared',
    ]);
    expect(first.every((issue) => issue.severity === 'error')).toBe(true);
    expect(first.map((issue) => issue.id)).toEqual(second.map((issue) => issue.id));
    expect(first.some((issue) => issue.reason.includes('layer_unused'))).toBe(false);
    expect(broken).toEqual(before);
  });

  it('provenanceのdangling参照とsource以外への正式参照をerrorとして報告する', () => {
    const asset = blank('item');
    const sourceTexture = asset.textures.find((texture) => texture.kind === 'source')!;
    const editTexture = asset.textures.find((texture) => texture.kind === 'edit')!;
    const withProvenance: Asset = {
      ...asset,
      provenance: [
        {
          sourceFileName: 'valid.png',
          mimeType: 'image/png',
          byteLength: 1,
          hash: `sha256:${'a'.repeat(64)}`,
          importedAt: '2026-07-20T00:00:00.000Z',
          textureId: sourceTexture.id,
        },
        { textureId: 'missing_texture' },
        {
          sourceFileName: 'wrong.png',
          mimeType: 'image/png',
          byteLength: 1,
          hash: `sha256:${'b'.repeat(64)}`,
          importedAt: '2026-07-20T00:00:00.000Z',
          textureId: editTexture.id,
        },
        { origin: 'ai' },
      ],
    };

    const referenceIssues = inspectAsset(withProvenance).filter((issue) =>
      issue.code.startsWith('reference.provenance'),
    );
    expect(referenceIssues.map((issue) => issue.code)).toEqual([
      'reference.provenanceTextureMissing',
      'reference.provenanceTextureNotSource',
    ]);
    expect(referenceIssues.every((issue) => issue.severity === 'error')).toBe(true);
  });

  it('character separates recommended body, animation and anchor findings from required errors', () => {
    const asset: Asset = {
      ...blank('character'),
      colliders: [],
    };

    const issues = inspectAsset(asset);

    expect(codes(issues)).toEqual(
      expect.arrayContaining([
        'character.bodyColliderRecommended',
        'character.animationRecommended',
        'character.anchorRecommended',
      ]),
    );
    expect(issues.every((issue) => issue.severity !== 'error')).toBe(true);
  });

  it('item recommends a pickup collider and game metadata, then clears both when supplied', () => {
    const asset = blank('item');
    expect(codes(inspectAsset(asset))).toEqual(
      expect.arrayContaining(['item.pickupColliderRecommended', 'item.gameMetadataRecommended']),
    );

    const ready: Asset = {
      ...asset,
      colliders: [collider('pickup', 'pickup')],
      tags: ['item'],
    };
    expect(inspectAsset(ready)).toEqual([]);
  });

  it('background recommends layer settings and accepts configured parallax or loop data', () => {
    const asset = blank('background');
    expect(codes(inspectAsset(asset))).toContain('background.layerSettingsRecommended');

    const ready: Asset = {
      ...asset,
      layers: asset.layers.map((layer) => ({
        ...layer,
        background: {
          role: 'mid',
          parallaxSpeed: { x: 0.5, y: 0 },
          loopX: true,
          loopY: false,
        },
      })),
    };
    expect(inspectAsset(ready)).toEqual([]);
  });

  it('tile requires settings and accepts a valid 32px grid on a 64px canvas', () => {
    const asset = blank('tile');
    const missing = inspectAsset(asset).find((issue) => issue.code === 'tile.settingsMissing');
    expect(missing?.severity).toBe('error');

    const ready: Asset = {
      ...asset,
      tile: {
        tileSize: { width: 32, height: 32 },
        collisionType: 'solid',
        visualType: 'floor',
      },
    };
    expect(inspectAsset(ready)).toEqual([]);
  });

  it('gimmick requires settings and treats movement, collider and tags as recommendations', () => {
    const asset = blank('gimmick');
    expect(codes(inspectAsset(asset))).toEqual(
      expect.arrayContaining([
        'gimmick.settingsMissing',
        'gimmick.colliderRecommended',
        'gimmick.tagRecommended',
      ]),
    );

    const ready: Asset = {
      ...asset,
      gimmick: { movementPreset: 'horizontal' },
      colliders: [collider('sensor', 'sensor')],
      tags: ['platform'],
    };
    expect(inspectAsset(ready)).toEqual([]);
  });

  it('effect requires settings and accepts aligned duration, loop, animation and anchor data', () => {
    const asset = blank('effect');
    const missing = inspectAsset(asset).find((issue) => issue.code === 'effect.settingsMissing');
    expect(missing?.severity).toBe('error');

    const frameId = 'effect_frame';
    const ready: Asset = {
      ...asset,
      effect: {
        effectType: 'hit',
        durationMs: 500,
        loop: false,
        blendMode: 'add',
      },
      frames: [
        {
          id: frameId,
          name: 'hit_0',
          layerStates: [{ layerId: asset.layers[0].id }],
        },
      ],
      animations: [
        {
          id: 'effect_animation',
          name: 'hit',
          fps: 2,
          loop: false,
          frameIds: [frameId],
        },
      ],
      anchors: [
        {
          id: 'effect_anchor',
          name: '発生位置',
          role: 'damage_effect',
          position: { x: 32, y: 32 },
        },
      ],
    };
    expect(inspectAsset(ready)).toEqual([]);
  });

  it('Frame時間、event ID重複、eventのdangling Frame参照を報告する', () => {
    const asset = blank('character');
    const broken: Asset = {
      ...asset,
      frames: [{ id: 'frame_1', name: 'frame', durationMs: 0, layerStates: [] }],
      animations: [
        {
          id: 'animation_1',
          name: 'attack',
          fps: 8,
          loop: false,
          frameIds: ['frame_1'],
          events: [
            { id: 'event_same', name: 'start', frameId: 'missing' },
            { id: 'event_same', name: 'sound', frameId: 'frame_1' },
          ],
        },
      ],
    };

    expect(codes(inspectAsset(broken))).toEqual(
      expect.arrayContaining([
        'reference.animationEventsDuplicateId',
        'reference.animationEventFrameMissing',
        'animation.frameDurationInvalid',
      ]),
    );
  });

  it('共通rig preflightの時刻重複・非有限pose・unsafe Frame数を素材検査へ表示する', () => {
    const asset = blank('character');
    const layerId = asset.layers[0].id;
    const partId = 'part_rig';
    const inspected: Asset = {
      ...asset,
      parts: [
        {
          id: partId,
          name: 'rig',
          partType: 'body',
          layerIds: [layerId],
        },
      ],
      rigAnimations: [
        {
          id: 'rig_invalid',
          name: 'invalid',
          fps: Number.MAX_VALUE,
          loop: false,
          durationMs: Number.MAX_VALUE,
          keyframes: [
            { time: 0, poses: { [partId]: { localRotation: Number.NaN } } },
            { time: 0, poses: {} },
          ],
        },
      ],
    };
    const before = structuredClone(inspected);

    const issues = inspectAsset(inspected);

    expect(codes(issues)).toEqual(
      expect.arrayContaining([
        'rig.preflight.non-finite-number',
        'rig.preflight.frame-count-unsafe',
        'rig.preflight.rig-keyframe-time-duplicate',
      ]),
    );
    expect(
      issues
        .filter((issue) => issue.code.startsWith('rig.preflight.'))
        .every((issue) => issue.severity === 'error' && issue.target.panel === 'parts'),
    ).toBe(true);
    expect(inspected).toEqual(before);
  });

  it('effect時間検査はAnimation.durationMsを無視してFrameの実効時間を使う', () => {
    const asset = blank('effect');
    const frameId = 'effect_frame';
    const inspected: Asset = {
      ...asset,
      effect: {
        effectType: 'hit',
        durationMs: 500,
        loop: false,
        blendMode: 'add',
      },
      frames: [{ id: frameId, name: 'hit', durationMs: 200, layerStates: [] }],
      animations: [
        {
          id: 'effect_animation',
          name: 'hit',
          fps: 2,
          loop: false,
          frameIds: [frameId],
          durationMs: 500,
        },
      ],
      anchors: [
        {
          id: 'effect_anchor',
          name: '発生位置',
          role: 'damage_effect',
          position: { x: 32, y: 32 },
        },
      ],
    };

    expect(codes(inspectAsset(inspected))).toContain('effect.durationMismatch');
  });

  it('sorts required errors before recommendations and supplies reason, action and target', () => {
    const asset: Asset = {
      ...blank('tile'),
      canvasSize: { width: 0, height: 64 },
    };

    const issues = inspectAsset(asset);
    const ranks = { error: 0, warning: 1, info: 2 } as const;

    for (let index = 1; index < issues.length; index += 1) {
      expect(ranks[issues[index].severity]).toBeGreaterThanOrEqual(
        ranks[issues[index - 1].severity],
      );
    }
    expect(
      issues.every(
        (issue) =>
          issue.reason.length > 0 &&
          issue.action.length > 0 &&
          issue.target.path.length > 0 &&
          issue.target.label.length > 0,
      ),
    ).toBe(true);
  });
});
