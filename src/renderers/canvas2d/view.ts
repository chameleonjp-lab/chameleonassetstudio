import type { Layer, Size, Vec2 } from '../../core/model';

/** キャンバス表示のビュー変換。world（アセット座標）→ screen は一様スケール + 平行移動。 */
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

/** ズーム切り替え候補（要件 11.3 の 25% / 50% / 100% / 200%）。 */
export const ZOOM_PRESETS = [0.25, 0.5, 1, 2] as const;

export function clampZoom(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) {
    return 1;
  }
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

export function worldToScreen(view: ViewTransform, point: Vec2): Vec2 {
  return {
    x: point.x * view.scale + view.offsetX,
    y: point.y * view.scale + view.offsetY,
  };
}

export function screenToWorld(view: ViewTransform, point: Vec2): Vec2 {
  return {
    x: (point.x - view.offsetX) / view.scale,
    y: (point.y - view.offsetY) / view.scale,
  };
}

/** 指定スケールでアセットキャンバスをビューポート中央に置く。 */
export function centerView(viewport: Viewport, canvasSize: Size, scale: number): ViewTransform {
  const clamped = clampZoom(scale);
  return {
    scale: clamped,
    offsetX: (viewport.width - canvasSize.width * clamped) / 2,
    offsetY: (viewport.height - canvasSize.height * clamped) / 2,
  };
}

/** アセット全体が収まるようにフィットさせる（fit 表示）。 */
export function fitView(viewport: Viewport, canvasSize: Size, padding = 32): ViewTransform {
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const scale = Math.min(availableWidth / canvasSize.width, availableHeight / canvasSize.height);
  return centerView(viewport, canvasSize, scale);
}

/** 画面上の anchor 点を固定したままズームする。 */
export function zoomAt(view: ViewTransform, anchor: Vec2, nextScale: number): ViewTransform {
  const scale = clampZoom(nextScale);
  const world = screenToWorld(view, anchor);
  return {
    scale,
    offsetX: anchor.x - world.x * scale,
    offsetY: anchor.y - world.y * scale,
  };
}

export function panBy(view: ViewTransform, deltaX: number, deltaY: number): ViewTransform {
  return { ...view, offsetX: view.offsetX + deltaX, offsetY: view.offsetY + deltaY };
}

/** 値をグリッド（px）の最も近い倍数へ丸める（UI スナップ補助。座標単位は px のまま）。 */
export function snapToGrid(value: number, gridSize: number): number {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return Math.round(value);
  return Math.round(value / gridSize) * gridSize;
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * レイヤー変形の意味:
 * position はテクスチャ左上のアセット座標、scale / rotation はテクスチャ中心を基準に適用する。
 * world 座標の点をレイヤーのローカル座標（テクスチャ中心が原点）へ変換する。
 */
export function layerLocalPoint(layer: Layer, textureSize: Size, worldPoint: Vec2): Vec2 {
  const transform = layer.transform;
  const centerX = transform.position.x + textureSize.width / 2;
  const centerY = transform.position.y + textureSize.height / 2;
  const rad = -transform.rotation * DEG_TO_RAD;
  const dx = worldPoint.x - centerX;
  const dy = worldPoint.y - centerY;
  const rotatedX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const rotatedY = dx * Math.sin(rad) + dy * Math.cos(rad);
  const scaleX = transform.scale.x === 0 ? 1e-6 : transform.scale.x;
  const scaleY = transform.scale.y === 0 ? 1e-6 : transform.scale.y;
  return { x: rotatedX / scaleX, y: rotatedY / scaleY };
}

/** layerLocalPoint の逆変換。ローカル座標（テクスチャ中心が原点）を world 座標へ戻す。 */
export function layerWorldPoint(layer: Layer, textureSize: Size, localPoint: Vec2): Vec2 {
  const transform = layer.transform;
  const centerX = transform.position.x + textureSize.width / 2;
  const centerY = transform.position.y + textureSize.height / 2;
  const rad = transform.rotation * DEG_TO_RAD;
  const scaledX = localPoint.x * transform.scale.x;
  const scaledY = localPoint.y * transform.scale.y;
  return {
    x: centerX + scaledX * Math.cos(rad) - scaledY * Math.sin(rad),
    y: centerY + scaledX * Math.sin(rad) + scaledY * Math.cos(rad),
  };
}

export function hitTestLayer(layer: Layer, textureSize: Size, worldPoint: Vec2): boolean {
  const local = layerLocalPoint(layer, textureSize, worldPoint);
  return Math.abs(local.x) <= textureSize.width / 2 && Math.abs(local.y) <= textureSize.height / 2;
}

export interface LayerHitTarget {
  layer: Layer;
  textureSize: Size;
}

/**
 * 前面（配列の末尾）から順に当たり判定し、最初に当たったレイヤー id を返す。
 * 非表示・ロック中のレイヤーは選択しない。
 */
export function hitTestLayers(targets: LayerHitTarget[], worldPoint: Vec2): string | null {
  for (let i = targets.length - 1; i >= 0; i -= 1) {
    const { layer, textureSize } = targets[i];
    if (!layer.visible || layer.locked) {
      continue;
    }
    if (hitTestLayer(layer, textureSize, worldPoint)) {
      return layer.id;
    }
  }
  return null;
}

/** レイヤーの 4 隅を screen 座標で返す（選択枠の描画用）。 */
export function layerScreenCorners(view: ViewTransform, layer: Layer, textureSize: Size): Vec2[] {
  const transform = layer.transform;
  const centerX = transform.position.x + textureSize.width / 2;
  const centerY = transform.position.y + textureSize.height / 2;
  const rad = transform.rotation * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = (textureSize.width / 2) * transform.scale.x;
  const halfH = (textureSize.height / 2) * transform.scale.y;
  const localCorners: Vec2[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];
  return localCorners.map((corner) =>
    worldToScreen(view, {
      x: centerX + corner.x * cos - corner.y * sin,
      y: centerY + corner.x * sin + corner.y * cos,
    }),
  );
}
