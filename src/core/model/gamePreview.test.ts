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

    expect(selection).toEqual({
      animationId: 'anim_idle',
      frameId: 'frame_idle_0',
      occurrenceIndex: 0,
    });
    expect(projection.frame?.id).toBe('frame_idle_0');
    expect(projection.displayAsset).not.toBe(baseAsset);
    expect(projection.displayAsset.updatedAt).toBe(baseAsset.updatedAt);
    expect(projection.overlay.groundLineY).toBe(448);
  });

  it('Animationなしを選択したときは先頭Animationへ戻さず静止表示する', () => {
    const projection = buildGamePreviewProjection(baseAsset, {
      animationId: null,
      frameId: 'frame_idle_0',
      occurrenceIndex: null,
    });

    expect(projection.animation).toBeNull();
    expect(projection.frame?.id).toBe('frame_idle_0');
  });

  it('Frame未選択は明示状態として扱い、選択Animationの先頭Frameへfallbackしない', () => {
    const projection = buildGamePreviewProjection(baseAsset, {
      animationId: 'anim_idle',
      frameId: null,
      occurrenceIndex: null,
    });

    expect(projection.animation?.id).toBe('anim_idle');
    expect(projection.frame).toBeNull();
    expect(projection.frameIndex).toBeNull();
    expect(projection.displayAsset).toBe(baseAsset);
  });

  it('同じFrame IDの反復はoccurrenceIndexで区別し、未指定時に先頭へ推測しない', () => {
    const animation = baseAsset.animations[0]!;
    const repeated = {
      ...baseAsset,
      animations: [{ ...animation, frameIds: ['frame_idle_0', 'frame_idle_1', 'frame_idle_0'] }],
    } satisfies Asset;

    const selectedThird = buildGamePreviewProjection(repeated, {
      animationId: animation.id,
      frameId: 'frame_idle_0',
      occurrenceIndex: 2,
    });
    const occurrenceUnset = buildGamePreviewProjection(repeated, {
      animationId: animation.id,
      frameId: 'frame_idle_0',
      occurrenceIndex: null,
    });

    expect(selectedThird.frameIndex).toBe(2);
    expect(occurrenceUnset.frameIndex).toBeNull();
  });

  it('初期Animationの先頭Frameが空または参照切れでも後続Frameへfallbackしない', () => {
    const animation = baseAsset.animations[0]!;
    const dangling = {
      ...baseAsset,
      animations: [{ ...animation, frameIds: ['missing_frame', 'frame_idle_1'] }],
    } satisfies Asset;
    const empty = {
      ...baseAsset,
      animations: [{ ...animation, frameIds: [] }],
    } satisfies Asset;

    expect(initialGamePreviewSelection(dangling)).toEqual({
      animationId: animation.id,
      frameId: null,
      occurrenceIndex: null,
    });
    expect(initialGamePreviewSelection(empty)).toEqual({
      animationId: animation.id,
      frameId: null,
      occurrenceIndex: null,
    });

    const danglingProjection = buildGamePreviewProjection(
      dangling,
      initialGamePreviewSelection(dangling),
    );
    const emptyProjection = buildGamePreviewProjection(empty, initialGamePreviewSelection(empty));
    expect(danglingProjection.frame).toBeNull();
    expect(danglingProjection.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'animation-frame-dangling-reference',
          path: `animations[id=${animation.id}].frameIds`,
        }),
      ]),
    );
    expect(emptyProjection.frame).toBeNull();
    expect(emptyProjection.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'animation-empty', kind: 'unset' })]),
    );
  });

  it('参照切れAnimationを先頭Animationへ暗黙fallbackせず、Frameも推測しない', () => {
    const projection = buildGamePreviewProjection(baseAsset, {
      animationId: 'missing_animation',
      frameId: null,
      occurrenceIndex: null,
    });

    expect(projection.animation).toBeNull();
    expect(projection.frame).toBeNull();
    expect(projection.frameIndex).toBeNull();
    expect(projection.displayAsset).toBe(baseAsset);
    expect(projection.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'animation-dangling-reference',
          kind: 'dangling-reference',
          path: 'animations[id=missing_animation]',
        }),
      ]),
    );
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
      occurrenceIndex: null,
    });

    expect(projection.issues.some((item) => item.kind === 'dangling-reference')).toBe(true);
    expect(projection.displayAsset.colliders).toEqual(invalid.colliders);
    expect(projection.overlay.colliders).toEqual([]);
    expect(projection.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'effective-collider-unavailable',
          kind: 'invalid',
          path: 'colliders / frames[].colliderOverrides',
        }),
      ]),
    );
  });

  it('collider構造を検査できない場合も共通理由で実効colliderを空にする', () => {
    const malformed = {
      ...baseAsset,
      colliders: undefined,
    } as unknown as Asset;

    const projection = buildGamePreviewProjection(malformed, {
      animationId: null,
      frameId: null,
      occurrenceIndex: null,
    });

    expect(projection.overlay.colliders).toEqual([]);
    expect(projection.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'asset-collider-structure-invalid', kind: 'invalid' }),
        expect.objectContaining({
          code: 'effective-collider-unavailable',
          kind: 'invalid',
          path: 'colliders / frames[].colliderOverrides',
        }),
      ]),
    );
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
      occurrenceIndex: null,
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
    const overlayBodyCollider = projection.overlay.colliders.find(
      (collider) => collider.id === 'col_body',
    );
    expect(overlayBodyCollider).toEqual(bodyCollider);
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
    expect(issues[0]?.message).toContain('ゲーム風表示は未評価');
    expect(missing.map((item) => item.kind)).toEqual(['missing-blob']);
    expect(missing[0]?.message).toContain('ゲーム風表示は未評価');
  });

  it('空のanchor・colliderは推測せず未設定理由を返す', () => {
    const unset = { ...baseAsset, anchors: [], colliders: [] } satisfies Asset;
    const projection = buildGamePreviewProjection(unset, initialGamePreviewSelection(unset));

    expect(projection.overlay.anchors).toEqual([]);
    expect(projection.overlay.colliders).toEqual([]);
    expect(projection.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'asset-anchors-unset', kind: 'unset', path: 'anchors' }),
        expect.objectContaining({
          code: 'asset-colliders-unset',
          kind: 'unset',
          path: 'colliders',
        }),
      ]),
    );
  });

  it('Impactは直接参照・可能性・未評価を混同しない', () => {
    const impact = buildGameImpact(baseAsset, project, [baseAsset]);

    expect(impact.some((item) => item.confidence === '確定')).toBe(true);
    expect(impact.some((item) => item.confidence === '可能性')).toBe(true);
    expect(impact.some((item) => item.confidence === '未評価')).toBe(true);
    expect(
      impact.find((item) => item.path === 'past export / verification record')?.confidence,
    ).toBe('未評価');
    expect(
      impact.every((item) => item.state && item.checked && item.unchecked && item.recheck),
    ).toBe(true);
    expect(
      impact.find((item) => item.path === 'textures[id=tex_source,kind=source]'),
    ).toMatchObject({ kind: 'source-edit', confidence: '確定' });
    expect(impact.find((item) => item.path === 'textures[id=tex_main,kind=edit]')).toMatchObject({
      kind: 'source-edit',
      confidence: '確定',
    });
    expect(
      impact.find((item) => item.path === 'textures[kind=source] -> textures[kind=edit]'),
    ).toMatchObject({ kind: 'source-edit', confidence: '可能性' });
  });

  it('選択Animation・FrameとUI-only stateをImpactに反映し、行IDと入力を変更しない', () => {
    const context = {
      selection: { animationId: 'anim_idle', frameId: 'frame_idle_1', occurrenceIndex: 1 },
      uiState: { isPlaying: false, showOrigin: true, parallaxPosition: 0 },
    } as const;
    const assetBefore = structuredClone(baseAsset);
    const projectBefore = structuredClone(project);
    const contextBefore = structuredClone(context);

    const impact = buildGameImpact(baseAsset, project, [baseAsset], context);
    const changed = buildGameImpact(baseAsset, project, [baseAsset], {
      ...context,
      uiState: {
        ...context.uiState,
        showOrigin: false,
        selectedImpactId: 'ui-state:Game Check Mode.uiState:13',
      },
    });

    expect(impact.find((item) => item.path === 'animations[id=anim_idle]')).toMatchObject({
      kind: 'animation',
      confidence: '確定',
    });
    expect(impact.find((item) => item.path === 'frames[id=frame_idle_1]')).toMatchObject({
      kind: 'frame',
      confidence: '確定',
    });
    const uiImpact = impact.find((item) => item.kind === 'ui-state');
    const changedUiImpact = changed.find((item) => item.kind === 'ui-state');
    expect(uiImpact?.path).toBe('Game Check Mode.uiState');
    expect(uiImpact?.state).toContain('showOrigin=true');
    expect(changedUiImpact?.state).toContain('showOrigin=false');
    expect(changedUiImpact?.state).toContain('selectedImpactId=');
    expect(changedUiImpact?.id).toBe(uiImpact?.id);
    expect(baseAsset).toEqual(assetBefore);
    expect(project).toEqual(projectBefore);
    expect(context).toEqual(contextBefore);
  });

  it('参照切れの選択Animation・Frameは確定関係と扱わない', () => {
    const impact = buildGameImpact(baseAsset, project, [baseAsset], {
      selection: {
        animationId: 'missing_animation',
        frameId: 'missing_frame',
        occurrenceIndex: null,
      },
    });

    expect(impact.find((item) => item.path === 'animations[id=missing_animation]')).toMatchObject({
      kind: 'animation',
      confidence: '可能性',
    });
    expect(impact.find((item) => item.path === 'frames[id=missing_frame]')).toMatchObject({
      kind: 'frame',
      confidence: '可能性',
    });
  });

  it('Animationから各Frameへの保存済みdirect参照をIDと出現位置ごとに列挙する', () => {
    const animation = baseAsset.animations[0]!;
    const withDirectReferences = {
      ...baseAsset,
      animations: [
        {
          ...animation,
          frameIds: ['frame_idle_0', 'missing_frame', 'frame_idle_0'],
        },
        { ...animation, id: 'anim_empty', name: 'empty', frameIds: [] },
      ],
    } satisfies Asset;
    const impact = buildGameImpact(withDirectReferences, project, [withDirectReferences]);

    expect(
      impact.find((item) =>
        item.path.includes('animations[id=anim_idle].frameIds[0] -> frames[id=frame_idle_0]'),
      ),
    ).toMatchObject({ confidence: '確定', state: '直接参照・参照先あり' });
    expect(
      impact.find((item) =>
        item.path.includes('animations[id=anim_idle].frameIds[1] -> frames[id=missing_frame]'),
      ),
    ).toMatchObject({ confidence: '確定', state: '直接参照・参照先切れ' });
    expect(impact.find((item) => item.path === 'animations[id=anim_empty].frameIds')).toMatchObject(
      {
        confidence: '確定',
        state: 'Frame未設定（確認済み）',
      },
    );
  });

  it('assetType固有Game DataをImpactの直接pathとして列挙する', () => {
    const background = {
      ...baseAsset,
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
    } satisfies Asset;
    const tile = {
      ...baseAsset,
      assetType: 'tile' as const,
      tile: {
        tileSize: { width: 32, height: 32 },
        collisionType: 'solid' as const,
        visualType: 'floor',
      },
    } satisfies Asset;
    const gimmick = {
      ...baseAsset,
      assetType: 'gimmick' as const,
      gimmick: { movementPreset: 'horizontal' },
    } satisfies Asset;
    const effect = {
      ...baseAsset,
      assetType: 'effect' as const,
      effect: {
        effectType: 'spark' as const,
        durationMs: 500,
        loop: false,
        blendMode: 'add' as const,
      },
    } satisfies Asset;

    expect(
      buildGameImpact(background, project, [background]).some(
        (item) => item.path.startsWith('layers[id=') && item.path.endsWith('].background'),
      ),
    ).toBe(true);
    expect(buildGameImpact(tile, project, [tile]).some((item) => item.path === 'tile')).toBe(true);
    expect(
      buildGameImpact(gimmick, project, [gimmick]).some((item) => item.path === 'gimmick'),
    ).toBe(true);
    expect(buildGameImpact(effect, project, [effect]).some((item) => item.path === 'effect')).toBe(
      true,
    );
  });

  it('Variantの保存状態をI1確度とは別axisで表示し、現在同期状態は推測しない', () => {
    const syncedAt = '2026-08-09T00:00:00.000Z';
    const familyProject = {
      ...project,
      families: [
        {
          id: 'family_game_preview',
          name: 'Game Preview Family',
          baseAssetId: baseAsset.id,
          variants: [
            {
              assetId: 'asset_linked',
              kind: 'linked-mirror',
              recipe: {},
              fingerprint: {
                base: 'sha256:base-saved',
                variant: 'sha256:variant-saved',
                syncedAt,
              },
            },
            { assetId: 'asset_manual', kind: 'manual' },
          ],
        },
      ],
    } as unknown as Project;

    const impact = buildGameImpact(baseAsset, familyProject, [baseAsset]);
    const linked = impact.find((item) => item.path.includes('assetId=asset_linked'));
    const manual = impact.find((item) => item.path.includes('assetId=asset_manual'));

    expect(linked).toMatchObject({ kind: 'variant', confidence: '確定' });
    expect(linked?.state).toContain('base=sha256:base-saved');
    expect(linked?.state).toContain('variant=sha256:variant-saved');
    expect(linked?.state).toContain(`syncedAt=${syncedAt}`);
    expect(linked?.state).toContain('既存状態: 未評価');
    expect(manual).toMatchObject({
      kind: 'variant',
      confidence: '未評価',
      state: 'manual / 未評価',
    });

    const inspectedImpact = buildGameImpact(baseAsset, familyProject, [baseAsset], {
      variantStates: {
        asset_linked: { label: '更新候補（stale） [ready]', assessed: true },
      },
    });
    const inspectedLinked = inspectedImpact.find((item) => item.path.includes('asset_linked'));
    expect(inspectedLinked?.state).toContain('既存状態: 更新候補（stale） [ready]');
    expect(inspectedLinked?.checked).toContain('既存linked検査結果');
    expect(inspectedLinked?.confidence).toBe('確定');

    const checkingImpact = buildGameImpact(baseAsset, familyProject, [baseAsset], {
      variantStates: { asset_linked: { label: '状態を確認中', assessed: false } },
    });
    const checkingLinked = checkingImpact.find((item) => item.path.includes('asset_linked'));
    expect(checkingLinked?.state).toContain('既存状態: 状態を確認中');
    expect(checkingLinked?.checked).not.toContain('既存linked検査結果');
    expect(checkingLinked?.unchecked).toContain('up-to-date/stale');
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
        canvasSize: { width: 32, height: 32 },
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
    expect(projections.every((projection) => projection.overlay.origin?.y === 448)).toBe(true);
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

  it('tileSizeとcanvasSizeが不一致なら3×3反復をせずpath付き理由を返す', () => {
    const mismatch = {
      ...baseAsset,
      assetType: 'tile' as const,
      tile: {
        tileSize: { width: 32, height: 32 },
        collisionType: 'solid' as const,
        visualType: 'floor',
      },
    } satisfies Asset;

    const projection = buildGamePreviewProjection(mismatch, {
      animationId: null,
      frameId: null,
      occurrenceIndex: null,
    });

    expect(projection.overlay.tile).toBeNull();
    expect(projection.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'tile-size-canvas-mismatch',
          kind: 'invalid',
          path: 'tile.tileSize / canvasSize',
        }),
      ]),
    );
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
        expect.objectContaining({ code: 'asset-origin-invalid', kind: 'unset', path: 'origin' }),
      ]),
    );
  });

  it('6素材種別で不正originを推測せず、安全なnullと共通issueにする', () => {
    const assetTypes: Asset['assetType'][] = [
      'character',
      'item',
      'background',
      'tile',
      'gimmick',
      'effect',
    ];

    for (const assetType of assetTypes) {
      const invalid = {
        ...baseAsset,
        assetType,
        origin: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      } as Asset;
      const projection = buildGamePreviewProjection(invalid, {
        animationId: null,
        frameId: null,
        occurrenceIndex: null,
      });

      expect(projection.overlay.origin, assetType).toBeNull();
      expect(projection.overlay.groundLineY, assetType).toBeNull();
      expect(projection.issues, assetType).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'asset-origin-invalid',
            kind: 'invalid',
            path: 'origin',
          }),
        ]),
      );
    }
  });

  it('不正anchor・colliderをprojectionの検証済み配列から除外し、path付きissueを返す', () => {
    const validAnchor = baseAsset.anchors[0]!;
    const validCollider = baseAsset.colliders[0]!;
    const invalid = {
      ...baseAsset,
      assetType: 'item',
      frames: [],
      animations: [],
      anchors: [
        validAnchor,
        { ...validAnchor, id: 'invalid_anchor', position: { x: Number.NaN, y: 10 } },
      ],
      colliders: [
        validCollider,
        {
          ...validCollider,
          id: 'invalid_collider',
          shape: 'rect',
          rect: { x: 0, y: 0, width: 0, height: 20 },
        },
      ],
    } as unknown as Asset;

    const projection = buildGamePreviewProjection(invalid, {
      animationId: null,
      frameId: null,
      occurrenceIndex: null,
    });

    expect(projection.overlay.anchors).toEqual([validAnchor]);
    expect(projection.overlay.colliders).toEqual([validCollider]);
    expect(projection.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'asset-anchor-invalid', path: 'anchors[1]' }),
        expect.objectContaining({ code: 'asset-collider-invalid', path: 'colliders[1]' }),
      ]),
    );
  });
});
