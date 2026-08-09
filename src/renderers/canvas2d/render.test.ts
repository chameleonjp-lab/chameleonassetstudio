import { describe, expect, it, vi } from 'vitest';
import type { Layer } from '../../core/model';
import { drawGameOverlays, renderScene, tileRepeatViews, type RenderLayer } from './render';

function renderLayer(id: string, bitmap: CanvasImageSource, opacity = 1): RenderLayer {
  const layer: Layer = {
    id,
    name: id,
    layerType: 'image',
    visible: true,
    locked: false,
    opacity,
    transform: {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    },
  };
  return { layer, textureSize: { width: 1, height: 1 }, bitmap };
}

function recordingContext() {
  const draws: Array<{ source: CanvasImageSource; alpha: number }> = [];
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    drawImage(this: { globalAlpha: number }, source: CanvasImageSource) {
      draws.push({ source, alpha: this.globalAlpha });
    },
  } as unknown as CanvasRenderingContext2D;
  return { context, draws };
}

describe('renderScene frame alignment reference', () => {
  it('基準を無着色・半透明で先に描き、対象を通常表示で後に描く', () => {
    const referenceBitmap = { role: 'reference' } as unknown as CanvasImageSource;
    const targetBitmap = { role: 'target' } as unknown as CanvasImageSource;
    const { context, draws } = recordingContext();

    renderScene(context, {
      view: { scale: 1, offsetX: 0, offsetY: 0 },
      viewport: { width: 1, height: 1 },
      canvasSize: { width: 1, height: 1 },
      referenceOverlay: {
        opacity: 0.5,
        layers: [renderLayer('reference', referenceBitmap, 0.8)],
      },
      layers: [renderLayer('target', targetBitmap, 0.8)],
      selectedLayerId: null,
    });

    expect(draws).toEqual([
      { source: referenceBitmap, alpha: 0.4 },
      { source: targetBitmap, alpha: 0.8 },
    ]);
  });

  it('tileRepeat指定時は中央と周囲8セルへ実画し、clearは1回だけにする', () => {
    const bitmap = { role: 'tile' } as unknown as CanvasImageSource;
    const { context, draws } = recordingContext();

    renderScene(context, {
      view: { scale: 1, offsetX: 1, offsetY: 1 },
      viewport: { width: 3, height: 3 },
      canvasSize: { width: 1, height: 1 },
      layers: [renderLayer('tile', bitmap)],
      selectedLayerId: null,
      tileRepeat: { tileSize: { width: 1, height: 1 } },
    });

    expect(draws).toHaveLength(9);
    expect(draws.every((draw) => draw.source === bitmap)).toBe(true);
    expect(context.clearRect).toHaveBeenCalledTimes(1);
  });

  it('tile画像とoverlayで共有する3×3 viewに中央と周囲8セルを含める', () => {
    const views = tileRepeatViews(
      { scale: 2, offsetX: 100, offsetY: 200 },
      { width: 10, height: 20 },
    );

    expect(views).toHaveLength(9);
    expect(views).toContainEqual({ scale: 2, offsetX: 100, offsetY: 200 });
    expect(views).toContainEqual({ scale: 2, offsetX: 80, offsetY: 160 });
    expect(views).toContainEqual({ scale: 2, offsetX: 120, offsetY: 240 });
  });

  it('不正なorigin・anchor・colliderをCanvas APIへ渡さず安全に未描画にする', () => {
    const { context } = recordingContext();

    expect(() =>
      drawGameOverlays(context, {
        view: { scale: 1, offsetX: 0, offsetY: 0 },
        origin: { x: Number.NaN, y: 0 },
        anchors: [
          { id: 'bad-anchor', name: 'bad', role: 'custom', position: undefined },
        ] as unknown as Parameters<typeof drawGameOverlays>[1]['anchors'],
        colliders: [
          {
            id: 'bad-collider',
            name: 'bad',
            purpose: 'body',
            visible: true,
            shape: 'rect',
            rect: { x: 0, y: 0, width: Number.NaN, height: 10 },
          },
        ],
        showColliders: true,
        selectedColliderId: null,
      }),
    ).not.toThrow();
    expect(context.arc).not.toHaveBeenCalled();
    expect(context.fillText).not.toHaveBeenCalled();
  });
});
