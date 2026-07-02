export type CanvasTool =
  'select' | 'pan' | 'crop' | 'eraser' | 'bgpick' | 'picker' | 'origin' | 'anchor';

/** レイヤー上のクリック / ドラッグを必要とするツール。 */
export const LAYER_TOOLS: CanvasTool[] = ['crop', 'eraser', 'bgpick', 'picker'];

export const TOOL_CURSORS: Record<CanvasTool, string> = {
  select: 'default',
  pan: 'grab',
  crop: 'crosshair',
  eraser: 'crosshair',
  bgpick: 'crosshair',
  picker: 'crosshair',
  origin: 'crosshair',
  anchor: 'crosshair',
};
