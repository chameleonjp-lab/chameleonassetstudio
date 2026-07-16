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
