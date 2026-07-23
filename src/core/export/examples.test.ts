import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { buildCanvasExample, buildPhaserExample, buildPixiExample } from './examples';

const asset = characterAsset as unknown as Asset;

describe('buildCanvasExample', () => {
  const html = buildCanvasExample(asset);

  it('atlas.json と spritesheet.png への相対参照を含む', () => {
    expect(html).toContain('../atlas/atlas.json');
    expect(html).toContain('../atlas/spritesheet.png');
  });

  it('displayName がタイトルに入る', () => {
    expect(html).toContain(`<title>${asset.displayName} - Canvas 2D サンプル</title>`);
  });

  it('外部 script を含まない', () => {
    expect(html).not.toMatch(/<script\s+src=/);
  });

  it('アニメーション名と fps が埋め込まれる', () => {
    expect(html).toContain('idle');
    expect(html).toContain('fps: 8');
  });

  it('デバッグ描画のキーワードを含む', () => {
    expect(html).toContain('原点');
    expect(html).toContain('アンカー');
    expect(html).toContain('当たり判定');
  });

  it('ローカルサーバーで開く旨の注意を含む', () => {
    expect(html).toContain('file://');
  });
});

describe('buildPixiExample', () => {
  const html = buildPixiExample(asset);

  it('atlas.json と spritesheet.png への相対参照を含む', () => {
    expect(html).toContain('../atlas/atlas.json');
    expect(html).toContain('../atlas/spritesheet.png');
  });

  it('displayName がタイトルに入る', () => {
    expect(html).toContain(`<title>${asset.displayName} - PixiJS サンプル</title>`);
  });

  it('pixi.js の CDN を読み込む', () => {
    expect(html).toContain('https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js');
  });

  it('アニメーション名と fps が埋め込まれる', () => {
    expect(html).toContain('idle');
    expect(html).toContain('fps: 8');
  });

  it('デバッグ描画のキーワードを含む', () => {
    expect(html).toContain('原点');
    expect(html).toContain('アンカー');
    expect(html).toContain('当たり判定');
  });
});

describe('buildPhaserExample', () => {
  const html = buildPhaserExample(asset);

  it('atlas.json と spritesheet.png への相対参照を含む', () => {
    expect(html).toContain('../atlas/atlas.json');
    expect(html).toContain('../atlas/spritesheet.png');
  });

  it('displayName がタイトルに入る', () => {
    expect(html).toContain(`<title>${asset.displayName} - Phaser サンプル</title>`);
  });

  it('phaser の CDN を読み込む', () => {
    expect(html).toContain('https://cdn.jsdelivr.net/npm/phaser@4.2.0/dist/phaser.min.js');
  });

  it('cellSize が埋め込まれ、spritesheet ローダーに渡される', () => {
    expect(html).toContain(
      `const CELL_SIZE = { width: ${asset.canvasSize.width}, height: ${asset.canvasSize.height} };`,
    );
    expect(html).toContain('frameWidth: CELL_SIZE.width');
  });

  it('アニメーション名と fps が埋め込まれる', () => {
    expect(html).toContain('idle');
    expect(html).toContain('fps: 8');
  });

  it('デバッグ描画のキーワードを含む', () => {
    expect(html).toContain('原点');
    expect(html).toContain('アンカー');
    expect(html).toContain('当たり判定');
  });
});

describe('fixed fps example loss guard', () => {
  it.each([buildCanvasExample, buildPixiExample, buildPhaserExample])(
    'Frame個別時間を表現できないexample生成を拒否する',
    (build) => {
      const withDuration = structuredClone(asset);
      withDuration.frames![0].durationMs = 160;
      expect(() => build(withDuration)).toThrow(/個別表示時間.*失われる/);
    },
  );
});
