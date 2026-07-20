import { describe, expect, it } from 'vitest';
import { buildAtlas, computeSheetLayout, type AtlasJson } from '../export/atlas';
import { INPUT_SAFETY_LIMITS } from '../input/inputSafety';
import { createImageAsset, type Asset } from '../model';
import {
  assertKnownAtlasJsonFile,
  assertKnownAtlasTextureSize,
  parseKnownAtlasJson,
} from './importAtlasBundle';

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function knownGoodAtlas(): AtlasJson {
  const base = createImageAsset({
    name: 'tiles',
    size: { width: 8, height: 8 },
    sourceMimeType: 'image/png',
    sourceExtension: 'png',
  });
  const frames = Array.from({ length: 5 }, (_, index) => ({
    id: `frame_${index + 1}`,
    name: `tile_${index + 1}`,
    layerStates: [],
  }));
  const asset: Asset = {
    ...base,
    assetType: 'tile',
    frames,
    animations: [
      {
        id: 'anim_walk',
        name: 'walk',
        fps: 12,
        loop: true,
        frameIds: [frames[0].id, frames[2].id, frames[4].id],
      },
    ],
    origin: { x: 4, y: 8 },
    anchors: [{ id: 'anchor_weapon', name: 'weapon', role: 'weapon', position: { x: 7, y: 3 } }],
    colliders: [
      {
        id: 'collider_body',
        name: 'body',
        purpose: 'body',
        shape: 'rect',
        visible: true,
        rect: { x: 1, y: 2, width: 6, height: 5 },
      },
      {
        id: 'collider_sensor',
        name: 'sensor',
        purpose: 'sensor',
        shape: 'circle',
        visible: false,
        circle: { x: 4, y: 4, radius: 2 },
      },
    ],
    tile: {
      tileSize: { width: 8, height: 8 },
      collisionType: 'solid',
      visualType: 'floor',
    },
  };
  return buildAtlas(
    asset,
    computeSheetLayout(
      frames.map((frame) => frame.id),
      8,
      8,
    ),
  );
}

function cloneAtlas(): AtlasJson & Record<string, unknown> {
  return JSON.parse(JSON.stringify(knownGoodAtlas())) as AtlasJson & Record<string, unknown>;
}

describe('parseKnownAtlasJson', () => {
  it('buildAtlasの5-frame canonical出力を厳格profileとして受け入れる', () => {
    const atlas = knownGoodAtlas();
    const parsed = parseKnownAtlasJson(bytes(atlas));
    expect(parsed).toEqual(atlas);
    expect(parsed.frames).toHaveLength(5);
    expect(parsed.frames.at(-1)).toMatchObject({ x: 8, y: 8 });
    expect(parsed.animations[0].frames).toEqual(['tile_1', 'tile_3', 'tile_5']);
  });

  it('外部形式・future version・未知field・誤ったfile pairを理由付き拒否する', () => {
    const external = cloneAtlas();
    external.format = 'phaser-atlas' as never;
    expect(() => parseKnownAtlasJson(bytes(external))).toThrow('Chameleon自形式');

    const future = cloneAtlas();
    future.version = '0.2.0' as never;
    expect(() => parseKnownAtlasJson(bytes(future))).toThrow('現行version');

    const unknown = cloneAtlas();
    unknown.externalUrl = 'https://example.invalid/sheet.png';
    expect(() => parseKnownAtlasJson(bytes(unknown))).toThrow('未対応field');

    expect(() => parseKnownAtlasJson(bytes(knownGoodAtlas()), 'phaser.json')).toThrow(
      'JSONファイル名',
    );
  });

  it('重複frame名・参照切れ・非canonical座標・tile/effect同居を拒否する', () => {
    const emptyName = cloneAtlas();
    emptyName.frames[0].name = '   ';
    expect(() => parseKnownAtlasJson(bytes(emptyName))).toThrow('空でない文字列');

    const duplicate = cloneAtlas();
    duplicate.frames[1].name = duplicate.frames[0].name;
    expect(() => parseKnownAtlasJson(bytes(duplicate))).toThrow('重複');

    const dangling = cloneAtlas();
    dangling.animations[0].frames[0] = 'missing';
    expect(() => parseKnownAtlasJson(bytes(dangling))).toThrow('存在しないframe');

    const displaced = cloneAtlas();
    displaced.frames[4].x = 16;
    expect(() => parseKnownAtlasJson(bytes(displaced))).toThrow('行優先配置');

    const both = cloneAtlas();
    both.effect = { effectType: 'spark', durationMs: 300, loop: false, blendMode: 'add' };
    expect(() => parseKnownAtlasJson(bytes(both))).toThrow('同時に含めることはできません');
  });

  it('malformed JSONとcollider union不整合を拒否する', () => {
    expect(() => parseKnownAtlasJson(new TextEncoder().encode('{'))).toThrow(
      '安全なJSONとして読めません',
    );

    const collider = cloneAtlas();
    (collider.colliders[0] as unknown as Record<string, unknown>).circle = {
      x: 1,
      y: 1,
      radius: 1,
    };
    expect(() => parseKnownAtlasJson(bytes(collider))).toThrow('未対応field');
  });
});

describe('assertKnownAtlasJsonFile', () => {
  it('exactなfile名だけを受け、4MiB超をbytes読込前に拒否する', () => {
    expect(() => assertKnownAtlasJsonFile({ name: 'atlas.json', size: 1024 })).not.toThrow();
    expect(() => assertKnownAtlasJsonFile({ name: 'Atlas.json', size: 1024 })).toThrow(
      'JSONファイル名',
    );
    expect(() =>
      assertKnownAtlasJsonFile({
        name: 'atlas.json',
        size: INPUT_SAFETY_LIMITS.maxJsonDocumentBytes + 1,
      }),
    ).toThrow('大きすぎます');
  });
});

describe('assertKnownAtlasTextureSize', () => {
  it('5-frameの3x2寸法だけを受け入れ、末尾空cellをframeとして要求しない', () => {
    const atlas = knownGoodAtlas();
    expect(() => assertKnownAtlasTextureSize(atlas, { width: 24, height: 16 })).not.toThrow();
    expect(() => assertKnownAtlasTextureSize(atlas, { width: 24, height: 24 })).toThrow(
      '24 x 16px',
    );
  });
});
