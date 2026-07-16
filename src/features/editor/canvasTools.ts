export type CanvasTool =
  | 'select'
  | 'pan'
  | 'crop'
  | 'eraser'
  | 'brush'
  | 'fill'
  | 'rect'
  | 'ellipse'
  | 'bgpick'
  | 'picker'
  | 'origin'
  | 'anchor'
  | 'collider';

/** レイヤー上のクリック / ドラッグを必要とするツール。 */
export const LAYER_TOOLS: CanvasTool[] = [
  'crop',
  'eraser',
  'brush',
  'fill',
  'rect',
  'ellipse',
  'bgpick',
  'picker',
];

export const TOOL_CURSORS: Record<CanvasTool, string> = {
  select: 'default',
  pan: 'grab',
  crop: 'crosshair',
  eraser: 'crosshair',
  brush: 'crosshair',
  fill: 'crosshair',
  rect: 'crosshair',
  ellipse: 'crosshair',
  bgpick: 'crosshair',
  picker: 'crosshair',
  origin: 'crosshair',
  anchor: 'crosshair',
  collider: 'default',
};
