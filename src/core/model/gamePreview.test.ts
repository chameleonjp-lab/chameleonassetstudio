import { describe, expect, it } from 'vitest';
import characterAsset from '../samples/asset.character.json';
import type { Asset, Project } from '.';
import {
  buildGameImpact,
  buildGamePreviewProjection,
  initialGamePreviewSelection,
  inspectPreviewTextureReferences,
} from './gamePreview';

const baseAsset = characterAsset as unknown as Asset;
const project = {
  format: 'chameleon-project',
  version: '0.1.0',
  id: 'project_test',
  name: 'test',
  assets: [{ id: baseAsset.id, name: baseAsset.name, assetType: baseAsset.assetType }],
  createdAt: baseAsset.createdAt,
  updatedAt: baseAsset.updatedAt,
} satisfies Project;

describe('game preview projection', () => {
  it('Animationの先頭Frameを初期選択し、Frame適用を保存なしで投影する', () => {
    const selection = initialGamePreviewSelection(baseAsset);
    const projection = buildGamePreviewProjection(baseAsset, selection);

    expect(selection).toEqual({ animationId: 'anim_idle', frameId: 'frame_idle_0' });
    expect(projection.frame?.id).toBe('frame_idle_0');
    expect(projection.displayAsset).not.toBe(baseAsset);
    expect(projection.displayAsset.updatedAt).toBe(baseAsset.updatedAt);
    expect(projection.overlay.groundLineY).toBe(448);
  });

  it('Animationなしを選択したときは先頭Animationへ戻さず静止表示する', () => {
    const projection = buildGamePreviewProjection(baseAsset, {
      animationId: null,
      frameId: 'frame_idle_0',
    });

    expect(projection.animation).toBeNull();
    expect(projection.frame?.id).toBe('frame_idle_0');
  });

  it('不正なFrame colliderを自動修復せず理由へ変換する', () => {
    const invalid: Asset = {
      ...baseAsset,
      frames: [
        {
          ...(baseAsset.frames?.[0] ?? { id: 'frame', name: 'frame', layerStates: [] }),
          colliderOverrides: [{ colliderId: 'missing', visible: true }],
        },
      ],
    };
    const projection = buildGamePreviewProjection(invalid, {
      animationId: null,
      frameId: invalid.frames?.[0]?.id ?? null,
    });

    expect(projection.issues.some((item) => item.kind === 'dangling-reference')).toBe(true);
    expect(projection.displayAsset.colliders).toEqual(invalid.colliders);
  });

  it('Frame overrideは実効colliderへ投影するが、Assetの更新時刻を変更しない', () => {
    const frame = baseAsset.frames?.[0];
    const withOverride: Asset = {
      ...baseAsset,
      frames: [
        {
          ...frame!,
          colliderOverrides: [
            {
              colliderId: 'col_body',
              rect: { x: 200, y: 180, width: 140, height: 260 },
              visible: true,
            },
          ],
        },
      ],
    };
    const projection = buildGamePreviewProjection(withOverride, {
      animationId: null,
      frameId: frame?.id ?? null,
    });

    const bodyCollider = projection.displayAsset.colliders.find(
      (collider) => collider.id === 'col_body',
    );
    expect(bodyCollider?.shape).toBe('rect');
    if (bodyCollider?.shape === 'rect') {
      expect(bodyCollider.rect).toEqual({
        x: 200,
        y: 180,
        width: 140,
        height: 260,
      });
    }
    expect(projection.displayAsset.updatedAt).toBe(withOverride.updatedAt);
  });

  it('画像Blob不足とdecode失敗を別理由で表示する', () => {
    const issues = inspectPreviewTextureReferences(
      baseAsset,
      new Set(['tex_main']),
      new Set(['tex_main']),
    );
    const missing = inspectPreviewTextureReferences(baseAsset, new Set(), new Set());

    expect(issues.map((item) => item.kind)).toEqual(['decode-failure']);
    expect(issues[0]?.path).toBe('textures[id=tex_main]');
    expect(missing.map((item) => item.kind)).toEqual(['missing-blob']);
  });

  it('Impactは直接参照・可能性・未評価を混同しない', () => {
    const impact = buildGameImpact(baseAsset, project, [baseAsset]);

    expect(impact.some((item) => item.confidence === '確定')).toBe(true);
    expect(impact.some((item) => item.confidence === '可能性')).toBe(true);
    expect(impact.some((item) => item.confidence === '未評価')).toBe(true);
    expect(
      impact.find((item) => item.path === 'past export / verification record')?.confidence,
    ).toBe('未評価');
  });

  it('6素材種別の固有投影を共通の読み取り規則で組み立てる', () => {
    const candidates = [
      baseAsset,
      { ...baseAsset, id: 'item', assetType: 'item' as const },
      {
        ...baseAsset,
        id: 'background',
        assetType: 'background' as const,
        layers: [
          {
            ...baseAsset.layers[0],
            background: {
              role: 'mid' as const,
              parallaxSpeed: { x: 0.5, y: 0 },
              loopX: true,
              loopY: false,
            },
          },
        ],
      },
      {
        ...baseAsset,
        id: 'tile',
        assetType: 'tile' as const,
        tile: {
          tileSize: { width: 32, height: 32 },
          collisionType: 'solid' as const,
          visualType: 'floor',
        },
      },
      {
        ...baseAsset,
        id: 'gimmick',
        assetType: 'gimmick' as const,
        gimmick: { movementPreset: 'horizontal' },
      },
      {
        ...baseAsset,
        id: 'effect',
        assetType: 'effect' as const,
        effect: {
          effectType: 'spark' as const,
          durationMs: 500,
          loop: false,
          blendMode: 'add' as const,
        },
      },
    ];

    const projections = candidates.map((asset) =>
      buildGamePreviewProjection(asset, initialGamePreviewSelection(asset)),
    );
    expect(projections[0]?.overlay.groundLineY).toBe(448);
    expect(projections[1]?.overlay.groundLineY).toBeNull();
    expect(projections[2]?.overlay.background[0]?.loopX).toBe(true);
    expect(projections[3]?.overlay.tile).toMatchObject({
      tileWidth: 32,
      tileHeight: 32,
      collisionType: 'solid',
      cellCount: 9,
    });
    expect(projections[4]?.overlay.gimmickPreset).toBe('horizontal');
    expect(projections[5]?.overlay.effect).toMatchObject({ durationMs: 500, blendMode: 'add' });
  });

  it('不正な種別設定を推測せず、理由へ変換する', () => {
    const invalid = {
      ...baseAsset,
      assetType: 'tile' as const,
      origin: undefined,
      tile: {} as Asset['tile'],
    } as unknown as Asset;

    expect(() =>
      buildGamePreviewProjection(invalid, initialGamePreviewSelection(invalid)),
    ).not.toThrow();
    expect(
      buildGamePreviewProjection(invalid, initialGamePreviewSelection(invalid)).issues,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'tile-settings-unset', kind: 'unset' }),
      ]),
    );
  });
});
