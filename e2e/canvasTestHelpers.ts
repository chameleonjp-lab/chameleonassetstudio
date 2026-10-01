import { type Locator } from '@playwright/test';

/** Convert asset coordinates through the actual rendered canvas view. */
export async function canvasWorldPoint(canvas: Locator, x = 32, y = 32) {
  await canvas.scrollIntoViewIfNeeded();
  const position = await canvas.evaluate(
    (element, point) => {
      const view = JSON.parse(element.getAttribute('data-view-transform')!) as {
        scale: number;
        offsetX: number;
        offsetY: number;
      };
      return { x: point.x * view.scale + view.offsetX, y: point.y * view.scale + view.offsetY };
    },
    { x, y },
  );
  const box = (await canvas.boundingBox())!;
  return { x: box.x + position.x, y: box.y + position.y };
}
