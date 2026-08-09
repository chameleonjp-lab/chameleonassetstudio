import type { Asset } from '../../core/model';
import type { GamePreviewOverlay } from '../../core/model/gamePreview';
import { worldToScreen, type ViewTransform } from '../../renderers/canvas2d/view';

interface GameCheckOverlayRenderOptions {
  view: ViewTransform;
  asset: Asset;
  overlay: GamePreviewOverlay;
  parallaxPosition: number;
  showOrigin: boolean;
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.font = '12px sans-serif';
  const width = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(20, 24, 32, 0.78)';
  ctx.fillRect(x - 4, y - 15, width + 8, 19);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: string,
): void {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - 10 * Math.cos(angle - Math.PI / 6),
    end.y - 10 * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    end.x - 10 * Math.cos(angle + Math.PI / 6),
    end.y - 10 * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCharacterGroundLine(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  asset: Asset,
  y: number,
): void {
  const left = worldToScreen(view, { x: 0, y });
  const right = worldToScreen(view, { x: asset.canvasSize.width, y });
  ctx.save();
  ctx.strokeStyle = '#2a9d8f';
  ctx.setLineDash([8, 5]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();
  ctx.setLineDash([]);
  drawLabel(ctx, '接地線（origin Y）', left.x + 8, left.y - 8);
  ctx.restore();
}

function drawTileRepeatGuide(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  asset: Asset,
  tileWidth: number,
  tileHeight: number,
): void {
  const center = worldToScreen(view, {
    x: asset.canvasSize.width / 2,
    y: asset.canvasSize.height / 2,
  });
  const width = tileWidth * 3 * view.scale;
  const height = tileHeight * 3 * view.scale;
  const left = center.x - width / 2;
  const top = center.y - height / 2;
  ctx.save();
  ctx.strokeStyle = '#457b9d';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(left, top, width, height);
  ctx.setLineDash([]);
  for (let column = 1; column < 3; column += 1) {
    const x = left + tileWidth * column * view.scale;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + height);
    ctx.stroke();
  }
  for (let row = 1; row < 3; row += 1) {
    const y = top + tileHeight * row * view.scale;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
    ctx.stroke();
  }
  drawLabel(ctx, 'tile 3×3（説明用）', left + 8, top + 18);
  ctx.restore();
}

function drawGimmickDirection(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  asset: Asset,
  preset: string,
): void {
  const center = worldToScreen(view, {
    x: asset.canvasSize.width / 2,
    y: asset.canvasSize.height / 2,
  });
  const color = '#e76f51';
  if (preset === 'horizontal') {
    drawArrow(ctx, { x: center.x - 36, y: center.y }, { x: center.x + 36, y: center.y }, color);
  } else if (preset === 'vertical') {
    drawArrow(ctx, { x: center.x, y: center.y - 36 }, { x: center.x, y: center.y + 36 }, color);
  } else if (preset === 'rotate' || preset === 'pendulum') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 36, preset === 'rotate' ? 0 : -Math.PI / 3, Math.PI * 1.35);
    ctx.stroke();
    drawArrow(
      ctx,
      { x: center.x + 26, y: center.y - 26 },
      { x: center.x + 36, y: center.y - 8 },
      color,
    );
    ctx.restore();
  }
  if (preset !== 'none') {
    drawLabel(ctx, `movementPreset: ${preset}`, center.x - 56, center.y + 58);
  }
}

/** Game Check Mode専用の説明用overlay。入力や保存経路を持たない。 */
export function drawGameCheckTypeOverlay(
  ctx: CanvasRenderingContext2D,
  options: GameCheckOverlayRenderOptions,
): void {
  const { view, asset, overlay, parallaxPosition, showOrigin } = options;
  if (showOrigin && overlay.groundLineY !== null) {
    drawCharacterGroundLine(ctx, view, asset, overlay.groundLineY);
  }
  if (overlay.tile) {
    drawTileRepeatGuide(ctx, view, asset, overlay.tile.tileWidth, overlay.tile.tileHeight);
  }
  if (overlay.gimmickPreset) {
    drawGimmickDirection(ctx, view, asset, overlay.gimmickPreset);
  }
  if (overlay.background.length > 0) {
    const center = worldToScreen(view, {
      x: asset.canvasSize.width / 2,
      y: Math.max(18, asset.canvasSize.height * 0.12),
    });
    drawArrow(
      ctx,
      { x: center.x - 28, y: center.y },
      { x: center.x + 28 + parallaxPosition / 8, y: center.y },
      '#457b9d',
    );
    drawLabel(ctx, `parallax位置: ${parallaxPosition}`, center.x - 60, center.y - 10);
  }
}
