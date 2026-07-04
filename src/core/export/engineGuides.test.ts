import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { buildGodotGuide, buildUnityGuide } from './engineGuides';

const asset = characterAsset as unknown as Asset;

describe('buildGodotGuide', () => {
  const guide = buildGodotGuide(asset);

  it('自動生成ではない旨の注意書きを含む', () => {
    expect(guide).toContain('自動生成するものではありません');
  });

  it('displayName を含む', () => {
    expect(guide).toContain(asset.displayName);
  });

  it('AtlasTexture への言及を含む', () => {
    expect(guide).toContain('AtlasTexture');
  });

  it('座標系の説明を含む', () => {
    expect(guide).toContain('左上');
    expect(guide).toContain('度');
  });
});

describe('buildUnityGuide', () => {
  const guide = buildUnityGuide(asset);

  it('自動生成ではない旨の注意書きを含む', () => {
    expect(guide).toContain('自動生成するものではありません');
  });

  it('displayName を含む', () => {
    expect(guide).toContain(asset.displayName);
  });

  it('canvasSize の実値を含む', () => {
    expect(guide).toContain(`${asset.canvasSize.width}`);
    expect(guide).toContain(`${asset.canvasSize.height}`);
  });

  it('Y 軸反転（1 - origin.y）への言及を含む', () => {
    expect(guide).toContain('1 - origin.y');
  });
});
