import { describe, expect, it, vi } from 'vitest';
import type { Layer } from '../../core/model';
import { renderScene, type RenderLayer } from './render';

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
});
