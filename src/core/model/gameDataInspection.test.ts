import { describe, expect, it } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import type { Asset } from './asset';
import { createBlankAsset } from './factories';
import { inspectAsset, type InspectionFinding } from './gameDataInspection';

const baseAsset = characterAsset as unknown as Asset;

function codes(findings: InspectionFinding[]): string[] {
  return findings.map((finding) => finding.code);
}

describe('inspectAsset (2D-3-GAMEDATA-01)', () => {
  it('sample character asset (consistent) yields 0 findings', () => {
    const findings = inspectAsset(baseAsset);
    expect(findings).toEqual([]);
  });

  it('does not mutate the asset (deep-equal before/after call)', () => {
    const before = JSON.parse(JSON.stringify(baseAsset)) as Asset;
    inspectAsset(baseAsset);
    expect(baseAsset).toEqual(before);
  });

  it('frame.layerStates[].layerId missing from asset.layers is reference/error', () => {
    const broken: Asset = {
      ...baseAsset,
      frames: [
        {
          id: 'frame_broken',
          name: 'broken',
          layerStates: [{ layerId: 'layer_missing', visible: true }],
        },
      ],
    };
    const findings = inspectAsset(broken);
    const finding = findings.find((f) => f.code === 'reference.frameLayerMissing');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
    expect(finding!.category).toBe('reference');
    expect(finding!.target).toEqual({ kind: 'frame', id: 'frame_broken' });
  });

  it('animation.frameIds[] missing from asset.frames is reference/error (including undefined frames)', () => {
    const withoutFrames: Asset = {
      ...baseAsset,
      frames: undefined,
      animations: [
        { id: 'anim_broken', name: 'broken', fps: 8, loop: true, frameIds: ['frame_x'] },
      ],
    };
    const findings = inspectAsset(withoutFrames);
    const finding = findings.find((f) => f.code === 'reference.animationFrameMissing');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
    expect(finding!.target).toEqual({ kind: 'animation', id: 'anim_broken' });
  });

  it('layer.textureId missing from asset.textures is reference/error', () => {
    const broken: Asset = {
      ...baseAsset,
      layers: baseAsset.layers.map((layer) =>
        layer.id === 'layer_body' ? { ...layer, textureId: 'tex_missing' } : layer,
      ),
    };
    const findings = inspectAsset(broken);
    const finding = findings.find((f) => f.code === 'reference.layerTextureMissing');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
    expect(finding!.category).toBe('reference');
  });

  it('part.layerIds[] missing from asset.layers is reference/error', () => {
    const broken: Asset = {
      ...baseAsset,
      parts: [{ id: 'part_broken', name: 'broken', partType: 'body', layerIds: ['layer_missing'] }],
    };
    const findings = inspectAsset(broken);
    const finding = findings.find((f) => f.code === 'reference.partLayerMissing');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
  });

  it('duplicate collider id is error', () => {
    const broken: Asset = {
      ...baseAsset,
      colliders: [baseAsset.colliders[0], { ...baseAsset.colliders[0], name: 'other' }],
    };
    const findings = inspectAsset(broken);
    const finding = findings.find((f) => f.code === 'collider.duplicateId');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('error');
    expect(finding!.category).toBe('collider');
  });

  it('duplicate collider name is warning', () => {
    const broken: Asset = {
      ...baseAsset,
      colliders: [
        { ...baseAsset.colliders[0], id: 'col_a', name: 'body' },
        { ...baseAsset.colliders[0], id: 'col_b', name: 'body' },
      ],
    };
    const findings = inspectAsset(broken);
    const finding = findings.find((f) => f.code === 'collider.duplicateName');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
    expect(finding!.category).toBe('collider');
  });

  it('duplicate frame name is warning (atlas export keys frames by name)', () => {
    const broken: Asset = {
      ...baseAsset,
      frames: [
        { id: 'frame_a', name: 'idle_0', layerStates: [] },
        { id: 'frame_b', name: 'idle_0', layerStates: [] },
      ],
    };
    const findings = inspectAsset(broken);
    const finding = findings.find((f) => f.code === 'frame.duplicateName');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
    expect(finding!.category).toBe('frame');
  });

  it('empty animation.frameIds is warning', () => {
    const withEmptyAnimation: Asset = {
      ...baseAsset,
      animations: [{ id: 'anim_empty', name: 'empty', fps: 8, loop: true, frameIds: [] }],
    };
    const findings = inspectAsset(withEmptyAnimation);
    const finding = findings.find((f) => f.code === 'animation.empty');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('warning');
    expect(finding!.target).toEqual({ kind: 'animation', id: 'anim_empty' });
  });

  it('character with no body collider is info', () => {
    const noBody: Asset = {
      ...baseAsset,
      colliders: baseAsset.colliders.filter((c) => c.purpose !== 'body'),
    };
    const findings = inspectAsset(noBody);
    const finding = findings.find((f) => f.code === 'collider.characterBodyMissing');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
  });

  it('non-character asset without body collider does not raise the info', () => {
    const item = createBlankAsset({
      name: 'blank_item',
      assetType: 'item',
      canvasSize: { width: 64, height: 64 },
    });
    const findings = inspectAsset(item);
    expect(findings.some((f) => f.code === 'collider.characterBodyMissing')).toBe(false);
  });

  it('character with empty anchors is info', () => {
    const noAnchors: Asset = { ...baseAsset, anchors: [] };
    const findings = inspectAsset(noAnchors);
    const finding = findings.find((f) => f.code === 'anchor.characterAnchorsEmpty');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
  });

  it('origin outside canvasSize bounds is info', () => {
    const outOfBounds: Asset = { ...baseAsset, origin: { x: -10, y: 600 } };
    const findings = inspectAsset(outOfBounds);
    const finding = findings.find((f) => f.code === 'origin.outOfBounds');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('info');
    expect(finding!.category).toBe('origin');
  });

  it('origin exactly on the boundary (0 and canvasSize) counts as in-bounds', () => {
    const edge: Asset = { ...baseAsset, origin: { x: 0, y: baseAsset.canvasSize.height } };
    const findings = inspectAsset(edge);
    expect(findings.some((f) => f.code === 'origin.outOfBounds')).toBe(false);
  });

  it('findings sort by severity descending: error, then warning, then info', () => {
    const messy: Asset = {
      ...baseAsset,
      origin: { x: -1, y: -1 }, // info
      animations: [{ id: 'anim_empty', name: 'empty', fps: 8, loop: true, frameIds: [] }], // warning
      colliders: [
        { ...baseAsset.colliders[0], id: 'col_dup' },
        { ...baseAsset.colliders[0], id: 'col_dup' }, // error (duplicate id)
      ],
    };
    const findings = inspectAsset(messy);
    const ranks = { error: 0, warning: 1, info: 2 } as const;
    const severities = findings.map((f) => f.severity);
    for (let i = 1; i < severities.length; i += 1) {
      expect(ranks[severities[i]]).toBeGreaterThanOrEqual(ranks[severities[i - 1]]);
    }
    expect(codes(findings)).toContain('collider.duplicateId');
    expect(codes(findings)).toContain('animation.empty');
    expect(codes(findings)).toContain('origin.outOfBounds');
  });

  it('finding ids are unique', () => {
    const messy: Asset = {
      ...baseAsset,
      colliders: [
        { ...baseAsset.colliders[0], id: 'col_a', name: 'body' },
        { ...baseAsset.colliders[0], id: 'col_b', name: 'body' },
      ],
    };
    const findings = inspectAsset(messy);
    const ids = findings.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
