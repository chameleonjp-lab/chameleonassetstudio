import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import {
  assertFixedFpsAnimationExportSafe,
  findFixedFpsAnimationLosses,
  FixedFpsAnimationLossError,
} from './animationLoss';

function testAsset(): Asset {
  return structuredClone(characterAsset) as unknown as Asset;
}

describe('fixed fps animation loss preflight', () => {
  it('参照中Frameの個別時間をAnimation名・Frame名付きで検出する', () => {
    const asset = testAsset();
    asset.frames![0].durationMs = 180;

    const losses = findFixedFpsAnimationLosses(asset);
    expect(losses).toEqual([
      expect.objectContaining({
        kind: 'frame-duration',
        animationId: asset.animations[0].id,
        animationName: 'idle',
        frameIds: [asset.frames![0].id],
        frameNames: [asset.frames![0].name],
      }),
    ]);
    expect(() => assertFixedFpsAnimationExportSafe(asset)).toThrowError(FixedFpsAnimationLossError);
    expect(() => assertFixedFpsAnimationExportSafe(asset)).toThrow(/idle.*idle_0.*個別表示時間/);
  });

  it('Animationイベントを名前付きで検出する', () => {
    const asset = testAsset();
    asset.animations[0].events = [
      { id: 'event_hit', name: 'hit_start', frameId: asset.frames![0].id },
    ];

    expect(findFixedFpsAnimationLosses(asset)).toEqual([
      expect.objectContaining({
        kind: 'animation-events',
        animationName: 'idle',
        eventIds: ['event_hit'],
        eventNames: ['hit_start'],
      }),
    ]);
    expect(() => assertFixedFpsAnimationExportSafe(asset)).toThrow(/hit_start.*イベント/);
  });

  it('未参照FrameのoverrideとinformationalなAnimation.durationMsだけなら許可する', () => {
    const asset = testAsset();
    asset.frames!.push({
      id: 'unused',
      name: 'unused',
      durationMs: 400,
      layerStates: [],
    });
    asset.animations[0].durationMs = 1;

    expect(findFixedFpsAnimationLosses(asset)).toEqual([]);
    expect(() => assertFixedFpsAnimationExportSafe(asset)).not.toThrow();
  });
});
