import type { Layer, Size } from '../../core/model';
import { layerScreenCorners, worldToScreen, type ViewTransform, type Viewport } from './view';

export interface RenderLayer {
  layer: Layer;
  textureSize: Size | null;
  bitmap: CanvasImageSource | null;
}

export interface RenderSceneOptions {
  view: ViewTransform;
  viewport: Viewport;
  canvasSize: Size;
  layers: RenderLayer[];
  selectedLayerId: string | null;
}

const CHECKER_CELL_PX = 12;
const CHECKER_LIGHT = '#e9e9e9';
const CHECKER_DARK = '#c9c9c9';
const CANVAS_BORDER = 'rgba(128, 128, 128, 0.9)';
const SELECTION_COLOR = '#3a86ff';

/** 透明背景の市松模様（要件 11.3）。アセットキャンバスの矩形内に描く。 */
function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  canvasSize: Size,
): void {
  const topLeft = worldToScreen(view, { x: 0, y: 0 });
  const bottomRight = worldToScreen(view, { x: canvasSize.width, y: canvasSize.height });
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;

  ctx.save();
  ctx.beginPath();
  ctx.rect(topLeft.x, topLeft.y, width, height);
  ctx.clip();

  ctx.fillStyle = CHECKER_LIGHT;
  ctx.fillRect(topLeft.x, topLeft.y, width, height);

  ctx.fillStyle = CHECKER_DARK;
  const startCol = Math.floor(topLeft.x / CHECKER_CELL_PX);
  const endCol = Math.ceil(bottomRight.x / CHECKER_CELL_PX);
  const startRow = Math.floor(topLeft.y / CHECKER_CELL_PX);
  const endRow = Math.ceil(bottomRight.y / CHECKER_CELL_PX);
  for (let row = startRow; row < endRow; row += 1) {
    for (let col = startCol; col < endCol; col += 1) {
      if (((row + col) & 1) === 0) {
        ctx.fillRect(
          col * CHECKER_CELL_PX,
          row * CHECKER_CELL_PX,
          CHECKER_CELL_PX,
          CHECKER_CELL_PX,
        );
      }
    }
  }
  ctx.restore();
}

function drawLayer(ctx: CanvasRenderingContext2D, view: ViewTransform, entry: RenderLayer): void {
  const { layer, textureSize, bitmap } = entry;
  if (!layer.visible || !bitmap || !textureSize) {
    return;
  }
  const transform = layer.transform;
  const center = worldToScreen(view, {
    x: transform.position.x + textureSize.width / 2,
    y: transform.position.y + textureSize.height / 2,
  });
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity));
  ctx.translate(center.x, center.y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale.x * view.scale, transform.scale.y * view.scale);
  ctx.drawImage(
    bitmap,
    -textureSize.width / 2,
    -textureSize.height / 2,
    textureSize.width,
    textureSize.height,
  );
  ctx.restore();
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  layer: Layer,
  textureSize: Size,
): void {
  const corners = layerScreenCorners(view, layer, textureSize);
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i += 1) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();
  ctx.stroke();
  // 角のハンドル（表示のみ。操作は今後のフェーズ）
  ctx.fillStyle = SELECTION_COLOR;
  for (const corner of corners) {
    ctx.fillRect(corner.x - 3, corner.y - 3, 6, 6);
  }
  ctx.restore();
}

/** 1 フレーム分の描画。イベント駆動で呼ぶ（常時ループはしない）。 */
export function renderScene(ctx: CanvasRenderingContext2D, options: RenderSceneOptions): void {
  const { view, viewport, canvasSize, layers, selectedLayerId } = options;
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  drawCheckerboard(ctx, view, canvasSize);

  for (const entry of layers) {
    drawLayer(ctx, view, entry);
  }

  // アセットキャンバスの枠
  const topLeft = worldToScreen(view, { x: 0, y: 0 });
  const bottomRight = worldToScreen(view, { x: canvasSize.width, y: canvasSize.height });
  ctx.save();
  ctx.strokeStyle = CANVAS_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    topLeft.x - 0.5,
    topLeft.y - 0.5,
    bottomRight.x - topLeft.x + 1,
    bottomRight.y - topLeft.y + 1,
  );
  ctx.restore();

  if (selectedLayerId) {
    const selected = layers.find((entry) => entry.layer.id === selectedLayerId);
    if (selected?.textureSize && selected.layer.visible) {
      drawSelection(ctx, view, selected.layer, selected.textureSize);
    }
  }
}
