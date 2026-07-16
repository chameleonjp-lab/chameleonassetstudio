export type CanvasTool =
  | 'select'
  | 'pan'
  | 'crop'
  | 'eraser'
  | 'brush'
  | 'fill'
  | 'rect'
  | 'ellipse'
  | 'selection'
  | 'text'
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
  'selection',
  'text',
  'bgpick',
  'picker',
];

/**
 * 選択（rectangular selection）を維持したまま使えるツール。
 * これ以外へ切り替えると selection・copy buffer・preview は解除する（契約 §6 / §10.4）。
 */
export const SELECTION_AWARE_TOOLS: CanvasTool[] = [
  'selection',
  'brush',
  'fill',
  'rect',
  'ellipse',
  'text',
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
  selection: 'crosshair',
  text: 'text',
  bgpick: 'crosshair',
  picker: 'crosshair',
  origin: 'crosshair',
  anchor: 'crosshair',
  collider: 'default',
};
