import { expect, test } from '@playwright/test';

test('高DPR・8倍表示でも前後コマの赤と青を独立した25%で合成する', async ({ page }) => {
  await page.goto('/');
  const pixels = await page.evaluate(async () => {
    const renderPath = '/src/renderers/canvas2d/render.ts';
    const modelPath = '/src/core/model/index.ts';
    const { renderScene } = await import(renderPath);
    const { createImageAsset } = await import(modelPath);
    const asset = createImageAsset({
      name: 'onion',
      size: { width: 8, height: 8 },
      sourceMimeType: 'image/png',
      sourceExtension: 'png',
    });
    const image = document.createElement('canvas');
    image.width = image.height = 8;
    const imageContext = image.getContext('2d')!;
    imageContext.fillStyle = '#8e44ad';
    imageContext.fillRect(0, 0, 8, 8);
    const bitmap = await createImageBitmap(image);
    const output = document.createElement('canvas');
    output.width = 698;
    output.height = 388;
    const context = output.getContext('2d')!;
    context.setTransform(2, 0, 0, 2, 0, 0);
    const current = {
      ...asset.layers[0],
      transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
    };
    const ghost = { ...current, transform: { ...current.transform, position: { x: 4, y: 0 } } };
    const entry = { layer: ghost, bitmap, textureSize: { width: 8, height: 8 } };
    try {
      renderScene(context, {
        view: { scale: 8, offsetX: 142.5, offsetY: 103.5 },
        viewport: { width: 349, height: 194 },
        canvasSize: { width: 8, height: 8 },
        layers: [{ ...entry, layer: current }],
        onionSkins: [
          { color: '#d1434f', opacity: 0.25, layers: [entry] },
          { color: '#2563eb', opacity: 0.25, layers: [entry] },
        ],
        selectedLayerId: null,
      });
      return {
        composite: Array.from(context.getImageData(445, 271, 1, 1).data),
        source: Array.from(imageContext.getImageData(0, 0, 1, 1).data),
      };
    } finally {
      bitmap.close();
    }
  });
  const expected = [111, 85, 168, 112];
  for (let index = 0; index < 4; index++)
    expect(Math.abs(pixels.composite[index] - expected[index])).toBeLessThanOrEqual(2);
  expect(pixels.source).toEqual([142, 68, 173, 255]);
});
