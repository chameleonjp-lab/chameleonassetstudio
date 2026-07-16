import {
  applyOperation as applyLegacyOperation,
  ImageOperationError,
  operationLabel as legacyOperationLabel,
  type ImageOperation as LegacyImageOperation,
  type PixelBuffer,
  type PointLike,
  type ProgressCallback,
  type Rect,
  type RgbColor,
} from './operations';
import {
  clearSelectionPixels,
  drawRasterEllipse,
  drawRasterRect,
  floodFill,
  moveSelectionPixels,
  paintBrush,
  pasteSelectionPixels,
  type RasterSelection,
  type SelectionClipboard,
} from './rasterFoundation';

export type RasterFoundationOperation =
  | {
      type: 'paintBrush';
      points: PointLike[];
      radius: number;
      color: RgbColor;
      selection?: RasterSelection;
    }
  | {
      type: 'floodFill';
      start: PointLike;
      color: RgbColor;
      tolerance: number;
      selection?: RasterSelection;
    }
  | {
      type: 'rasterRect';
      rect: Rect;
      color: RgbColor;
      selection?: RasterSelection;
    }
  | {
      type: 'rasterEllipse';
      rect: Rect;
      color: RgbColor;
      selection?: RasterSelection;
    }
  | { type: 'selectionClear'; selection: RasterSelection }
  | { type: 'selectionPaste'; clipboard: SelectionClipboard; target: PointLike }
  | { type: 'selectionMove'; selection: RasterSelection; target: PointLike };

export type ImageOperation = LegacyImageOperation | RasterFoundationOperation;

export { ImageOperationError };
export type { PixelBuffer, ProgressCallback };

export function applyImageOperation(
  buffer: PixelBuffer,
  operation: ImageOperation,
  onProgress?: ProgressCallback,
): PixelBuffer {
  let result: PixelBuffer;
  switch (operation.type) {
    case 'paintBrush':
      result = paintBrush(
        buffer,
        operation.points,
        operation.radius,
        operation.color,
        operation.selection,
      );
      break;
    case 'floodFill':
      result = floodFill(
        buffer,
        operation.start,
        operation.color,
        operation.tolerance,
        operation.selection,
      );
      break;
    case 'rasterRect':
      result = drawRasterRect(buffer, operation.rect, operation.color, operation.selection);
      break;
    case 'rasterEllipse':
      result = drawRasterEllipse(buffer, operation.rect, operation.color, operation.selection);
      break;
    case 'selectionClear':
      result = clearSelectionPixels(buffer, operation.selection);
      break;
    case 'selectionPaste':
      result = pasteSelectionPixels(buffer, operation.clipboard, operation.target);
      break;
    case 'selectionMove':
      result = moveSelectionPixels(buffer, operation.selection, operation.target);
      break;
    default:
      return applyLegacyOperation(buffer, operation, onProgress);
  }
  onProgress?.(1);
  return result;
}

export function imageOperationLabel(operation: ImageOperation): string {
  switch (operation.type) {
    case 'paintBrush':
      return 'ブラシ';
    case 'floodFill':
      return '塗りつぶし';
    case 'rasterRect':
      return '矩形を画像化';
    case 'rasterEllipse':
      return '楕円を画像化';
    case 'selectionClear':
      return '選択範囲を消去';
    case 'selectionPaste':
      return '選択範囲を複製';
    case 'selectionMove':
      return '選択範囲を移動';
    default:
      return legacyOperationLabel(operation);
  }
}
