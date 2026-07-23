import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { buildCanvasHelpers, buildPixiHelpers, buildPhaserHelpers } from './helpers';

const asset = characterAsset as unknown as Asset;

describe('buildCanvasHelpers', () => {
  const source = buildCanvasHelpers(asset);

  it('export 文を含む', () => {
    expect(source).toMatch(/export function/);
    expect(source).toMatch(/export async function/);
  });

  it('主要関数名を含む', () => {
    expect(source).toContain('loadChameleonAtlas');
    expect(source).toContain('getFrameRect');
    expect(source).toContain('applyOrigin');
    expect(source).toContain('getAnchorByRole');
    expect(source).toContain('getAnchorByName');
    expect(source).toContain('drawDebug');
    expect(source).toContain('createFrameAnimator');
  });

  it('座標系コメントを含む', () => {
    expect(source).toContain('左上');
    expect(source).toContain('度');
  });

  it('asset.name が埋め込まれる', () => {
    expect(source).toContain(asset.name);
  });
});

describe('buildPixiHelpers', () => {
  const source = buildPixiHelpers(asset);

  it('export 文を含む', () => {
    expect(source).toMatch(/export function/);
    expect(source).toMatch(/export async function/);
  });

  it('主要関数名を含む', () => {
    expect(source).toContain('loadChameleonPixi');
    expect(source).toContain('createPixiFrameTextures');
    expect(source).toContain('createPixiAnimatedSprite');
    expect(source).toContain('applyPixiOrigin');
    expect(source).toContain('drawPixiDebug');
  });

  it('座標系コメントを含む', () => {
    expect(source).toContain('左上');
    expect(source).toContain('度');
  });

  it('asset.name が埋め込まれる', () => {
    expect(source).toContain(asset.name);
  });
});

describe('buildPhaserHelpers', () => {
  const source = buildPhaserHelpers(asset);

  it('export 文を含む', () => {
    expect(source).toMatch(/export function/);
  });

  it('主要関数名を含む', () => {
    expect(source).toContain('preloadChameleonAsset');
    expect(source).toContain('registerChameleonSpritesheet');
    expect(source).toContain('createChameleonAnims');
    expect(source).toContain('getAnchorByRole');
    expect(source).toContain('readColliders');
    expect(source).toContain('applyPhaserOrigin');
  });

  it('座標系コメントを含む', () => {
    expect(source).toContain('左上');
    expect(source).toContain('度');
  });

  it('asset.name が埋め込まれる', () => {
    expect(source).toContain(asset.name);
  });
});

describe('fixed fps helper loss guard', () => {
  it.each([buildCanvasHelpers, buildPixiHelpers, buildPhaserHelpers])(
    'eventを表現できないhelper生成を拒否する',
    (build) => {
      const withEvent = structuredClone(asset);
      withEvent.animations[0].events = [
        { id: 'event_1', name: 'step', frameId: withEvent.frames![0].id },
      ];
      expect(() => build(withEvent)).toThrow(/イベント.*失われる/);
    },
  );
});
