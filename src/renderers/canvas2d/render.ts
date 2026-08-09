import type { Layer, Size } from '../../core/model';
import {
  colliderLineDash,
  colliderPurposeColor,
  isSelectedCollider,
} from '../../features/editor/colliderDisplay';
import { layerScreenCorners, worldToScreen, type ViewTransform, type Viewport } from './view';

export interface RenderLayer {
  layer: Layer;
  textureSize: Size | null;
  bitmap: CanvasImageSource | null;
}

export interface RenderOnionSkin {
  layers: RenderLayer[];
  color: string;
  opacity: number;
}

export interface RenderReferenceOverlay {
  layers: readonly RenderLayer[];
  opacity: number;
}

export interface RenderSceneOptions {
  view: ViewTransform;
  viewport: Viewport;
  canvasSize: Size;
  layers: RenderLayer[];
  referenceOverlay?: RenderReferenceOverlay;
  onionSkins?: readonly RenderOnionSkin[];
  selectedLayerId: string | null;
  /**
   * Game Check Mode専用の3×3実画。未指定時の通常Editor描画は従来どおり。
   * 中央セルを現在のviewに置き、周囲8セルをtileSize間隔で描く。
   */
  tileRepeat?: { tileSize: Size };
}

const CHECKER_CELL_PX = 12;
const CHECKER_LIGHT = '#e9e9e9';
const CHECKER_DARK = '#c9c9c9';
const CANVAS_BORDER = 'rgba(128, 128, 128, 0.9)';
const SELECTION_COLOR = '#3a86ff';
let tintScratchCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;

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

function tintedBitmap(
  bitmap: CanvasImageSource,
  textureSize: Size,
  color: string,
): CanvasImageSource | null {
  const width = Math.max(1, Math.round(textureSize.width));
  const height = Math.max(1, Math.round(textureSize.height));
  const canvas =
    tintScratchCanvas ??
    (typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : typeof document !== 'undefined'
        ? document.createElement('canvas')
        : null);
  if (!canvas) {
    return null;
  }
  tintScratchCanvas = canvas;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) {
    return null;
  }
  try {
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
  } catch {
    return null;
  }

  return canvas;
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  entry: RenderLayer,
  options: { color?: string; opacity?: number } = {},
): void {
  const { layer, textureSize, bitmap } = entry;
  if (!layer.visible || !bitmap || !textureSize) {
    return;
  }
  const source = options.color ? tintedBitmap(bitmap, textureSize, options.color) : bitmap;
  if (!source) {
    return;
  }
  const transform = layer.transform;
  const center = worldToScreen(view, {
    x: transform.position.x + textureSize.width / 2,
    y: transform.position.y + textureSize.height / 2,
  });
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity * (options.opacity ?? 1)));
  ctx.translate(center.x, center.y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale.x * view.scale, transform.scale.y * view.scale);
  try {
    ctx.drawImage(
      source,
      -textureSize.width / 2,
      -textureSize.height / 2,
      textureSize.width,
      textureSize.height,
    );
  } catch {
    // asset切り替え直後、直前のbitmapが読み込みeffectのcleanupでcloseされた直後の
    // 1フレームだけ発生し得る（新しいbitmapへの差し替えは次のrenderで反映される）。
    // 描画をskipするだけで安全なため、ここで握りつぶす。
  }
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

/** アセット座標系のグリッド線を描く（UI 補助のみ。データには影響しない）。 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  params: { view: ViewTransform; canvasSize: Size; gridSize: number },
): void {
  const { view, canvasSize, gridSize } = params;
  if (!Number.isFinite(gridSize) || gridSize <= 0) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(120,140,170,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= canvasSize.width; x += gridSize) {
    const top = worldToScreen(view, { x, y: 0 });
    const bottom = worldToScreen(view, { x, y: canvasSize.height });
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);
  }
  for (let y = 0; y <= canvasSize.height; y += gridSize) {
    const left = worldToScreen(view, { x: 0, y });
    const right = worldToScreen(view, { x: canvasSize.width, y });
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSceneContents(
  ctx: CanvasRenderingContext2D,
  options: Omit<RenderSceneOptions, 'viewport' | 'tileRepeat'>,
): void {
  const { view, canvasSize, layers, referenceOverlay, onionSkins, selectedLayerId } = options;
  drawCheckerboard(ctx, view, canvasSize);

  for (const entry of referenceOverlay?.layers ?? []) {
    drawLayer(ctx, view, entry, { opacity: referenceOverlay?.opacity });
  }

  for (const onionSkin of onionSkins ?? []) {
    for (const entry of onionSkin.layers) {
      drawLayer(ctx, view, entry, {
        color: onionSkin.color,
        opacity: onionSkin.opacity,
      });
    }
  }

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

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** 中央cellを現在viewに保ったまま、中央と周囲8cellの描画viewを返す。 */
export function tileRepeatViews(view: ViewTransform, tileSize: Size): ViewTransform[] {
  if (!finitePositive(tileSize.width) || !finitePositive(tileSize.height)) {
    return [view];
  }
  const views: ViewTransform[] = [];
  for (let row = -1; row <= 1; row += 1) {
    for (let column = -1; column <= 1; column += 1) {
      views.push({
        ...view,
        offsetX: view.offsetX + column * tileSize.width * view.scale,
        offsetY: view.offsetY + row * tileSize.height * view.scale,
      });
    }
  }
  return views;
}

/** 1 フレーム分の描画。イベント駆動で呼ぶ（常時ループはしない）。 */
export function renderScene(ctx: CanvasRenderingContext2D, options: RenderSceneOptions): void {
  const { view, viewport, tileRepeat } = options;
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  const tileSize = tileRepeat?.tileSize;
  if (!tileSize || !finitePositive(tileSize.width) || !finitePositive(tileSize.height)) {
    drawSceneContents(ctx, options);
    return;
  }

  for (const repeatedView of tileRepeatViews(view, tileSize)) {
    const topLeft = worldToScreen(repeatedView, { x: 0, y: 0 });
    const bottomRight = worldToScreen(repeatedView, {
      x: tileSize.width,
      y: tileSize.height,
    });

    // 各セルをtileSizeでclipし、隣接セルへはみ出した画素を推測補完しない。
    ctx.save();
    ctx.beginPath();
    ctx.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    ctx.clip();
    drawSceneContents(ctx, {
      ...options,
      view: repeatedView,
      canvasSize: tileSize,
    });
    ctx.restore();
  }
}

// ---- ゲーム用情報のオーバーレイ（Phase 8） ----

import { COLLIDER_PURPOSES, type Anchor, type Collider, type Vec2 } from '../../core/model';

const ORIGIN_COLOR = '#1f9d3a';
const ANCHOR_COLOR = '#ff8800';

/** 判定用途ごとの表示色。色だけに頼らないよう用途名も併記する。 */

export interface GameOverlayOptions {
  view: ViewTransform;
  /** invalid / unset時はnull。座標を推測して描画しない。 */
  origin: Vec2 | null;
  anchors: Anchor[];
  colliders: Collider[];
  /** origin の表示切替。ゲーム確認モードのUI状態であり、保存形式には含めない。 */
  showOrigin?: boolean;
  /** anchor の表示切替。ゲーム確認モードのUI状態であり、保存形式には含めない。 */
  showAnchors?: boolean;
  /** 判定の一括表示（要件 11.6「判定だけを表示・非表示にできる」）。 */
  showColliders: boolean;
  /** パネルで選択中の判定。保存形式には含めない UI 状態。 */
  selectedColliderId: string | null;
  /** 判定ツール使用中のみ true。選択中判定の操作ハンドルを描く。 */
  showColliderHandles?: boolean;
}

const COLLIDER_HANDLE_SIZE = 8;

function isFiniteVec2(value: unknown): value is Vec2 {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const point = value as { x?: unknown; y?: unknown };
  return (
    typeof point.x === 'number' &&
    Number.isFinite(point.x) &&
    typeof point.y === 'number' &&
    Number.isFinite(point.y)
  );
}

function isRenderableAnchor(value: unknown): value is Anchor {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const anchor = value as Partial<Anchor>;
  return (
    typeof anchor.id === 'string' &&
    typeof anchor.name === 'string' &&
    typeof anchor.role === 'string' &&
    isFiniteVec2(anchor.position)
  );
}

function isRenderableCollider(value: unknown): value is Collider {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const collider = value as Partial<Collider> & {
    rect?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
    circle?: { x?: unknown; y?: unknown; radius?: unknown };
  };
  if (
    typeof collider.id !== 'string' ||
    typeof collider.name !== 'string' ||
    typeof collider.visible !== 'boolean' ||
    typeof collider.purpose !== 'string' ||
    !COLLIDER_PURPOSES.includes(collider.purpose as Collider['purpose'])
  ) {
    return false;
  }
  if (collider.shape === 'rect') {
    return (
      isFiniteVec2(collider.rect) &&
      typeof collider.rect?.width === 'number' &&
      finitePositive(collider.rect.width) &&
      typeof collider.rect.height === 'number' &&
      finitePositive(collider.rect.height)
    );
  }
  if (collider.shape === 'circle') {
    return (
      isFiniteVec2(collider.circle) &&
      typeof collider.circle?.radius === 'number' &&
      finitePositive(collider.circle.radius)
    );
  }
  return false;
}

/** 判定の操作ハンドル 1 個を描く（画面座標基準の固定サイズ。view.scale に依存しない）。 */
function drawColliderHandle(ctx: CanvasRenderingContext2D, point: Vec2, color: string): void {
  const half = COLLIDER_HANDLE_SIZE / 2;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.fillRect(point.x - half, point.y - half, COLLIDER_HANDLE_SIZE, COLLIDER_HANDLE_SIZE);
  ctx.strokeRect(point.x - half, point.y - half, COLLIDER_HANDLE_SIZE, COLLIDER_HANDLE_SIZE);
  ctx.restore();
}

/** 選択中判定のハンドル（rect は四隅、circle は半径ハンドル）を描く。 */
function drawColliderHandles(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  collider: Collider,
): void {
  const color = colliderPurposeColor(collider.purpose);
  if (collider.shape === 'rect') {
    const { x, y, width, height } = collider.rect;
    const corners: Vec2[] = [
      { x, y },
      { x: x + width, y },
      { x, y: y + height },
      { x: x + width, y: y + height },
    ];
    for (const corner of corners) {
      drawColliderHandle(ctx, worldToScreen(view, corner), color);
    }
    return;
  }
  const { x, y, radius } = collider.circle;
  drawColliderHandle(ctx, worldToScreen(view, { x: x + radius, y }), color);
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.font = '10px sans-serif';
  const metrics = ctx.measureText(text);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fillRect(x - 1, y - 9, metrics.width + 2, 11);
  ctx.fillStyle = '#222222';
  ctx.fillText(text, x, y);
}

/** 原点・アンカー・当たり判定を screen 座標で描く。ズームに依存しない見た目にする。 */
export function drawGameOverlays(ctx: CanvasRenderingContext2D, options: GameOverlayOptions): void {
  const {
    view,
    origin,
    anchors,
    colliders,
    showOrigin = true,
    showAnchors = true,
    showColliders,
    selectedColliderId,
    showColliderHandles,
  } = options;

  if (showColliders) {
    for (const collider of colliders) {
      if (!isRenderableCollider(collider)) {
        continue;
      }
      if (!collider.visible) {
        continue;
      }
      const color = colliderPurposeColor(collider.purpose);
      const selected = isSelectedCollider(collider.id, selectedColliderId);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = `${color}26`; // 15% 程度の透明塗り
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.setLineDash(colliderLineDash(collider.purpose));
      if (collider.shape === 'rect') {
        const topLeft = worldToScreen(view, { x: collider.rect.x, y: collider.rect.y });
        const width = collider.rect.width * view.scale;
        const height = collider.rect.height * view.scale;
        if (selected) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 5;
          ctx.setLineDash([]);
          ctx.strokeRect(topLeft.x - 2, topLeft.y - 2, width + 4, height + 4);
          ctx.restore();
        }
        ctx.fillRect(topLeft.x, topLeft.y, width, height);
        ctx.strokeRect(topLeft.x, topLeft.y, width, height);
        drawLabel(ctx, collider.purpose, topLeft.x + 2, topLeft.y + 11);
      } else {
        const center = worldToScreen(view, { x: collider.circle.x, y: collider.circle.y });
        const radius = collider.circle.radius * view.scale;
        if (selected) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius + 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        drawLabel(ctx, collider.purpose, center.x - radius + 2, center.y - radius + 11);
      }
      ctx.restore();

      // 判定ツール使用中は、選択中の判定にだけ操作ハンドルを描く
      if (showColliderHandles && selected) {
        drawColliderHandles(ctx, view, collider);
      }
    }
  }

  if (showAnchors) {
    // アンカー（ひし形マーカー + 名前）
    for (const anchor of anchors) {
      if (!isRenderableAnchor(anchor)) {
        continue;
      }
      const point = worldToScreen(view, anchor.position);
      ctx.save();
      ctx.fillStyle = ANCHOR_COLOR;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 6);
      ctx.lineTo(point.x + 6, point.y);
      ctx.lineTo(point.x, point.y + 6);
      ctx.lineTo(point.x - 6, point.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawLabel(ctx, anchor.name, point.x + 8, point.y + 4);
      ctx.restore();
    }
  }

  if (showOrigin && isFiniteVec2(origin)) {
    // 原点（十字 + 円のガイド。接地感の基準として常に見えるようにする）
    const originScreen = worldToScreen(view, origin);
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(originScreen.x - 10, originScreen.y);
    ctx.lineTo(originScreen.x + 10, originScreen.y);
    ctx.moveTo(originScreen.x, originScreen.y - 10);
    ctx.lineTo(originScreen.x, originScreen.y + 10);
    ctx.stroke();
    ctx.strokeStyle = ORIGIN_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(originScreen.x - 10, originScreen.y);
    ctx.lineTo(originScreen.x + 10, originScreen.y);
    ctx.moveTo(originScreen.x, originScreen.y - 10);
    ctx.lineTo(originScreen.x, originScreen.y + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(originScreen.x, originScreen.y, 5, 0, Math.PI * 2);
    ctx.stroke();
    drawLabel(ctx, '原点', originScreen.x + 8, originScreen.y - 8);
    ctx.restore();
  }
}
