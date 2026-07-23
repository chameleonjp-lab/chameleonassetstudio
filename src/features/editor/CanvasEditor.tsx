import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { decodeImageSource, type DecodedImageSource } from '../../core/images/decodeImageSource';
import { blobKeyFor } from '../../core/images/importImage';
import type { ImageOperation } from '../../core/images/imageOperation';
import type { Rect, RgbColor } from '../../core/images/operations';
import type { RasterSelection, SelectionClipboard } from '../../core/images/rasterFoundation';
import type { Asset, Collider, Layer, Size, Vec2 } from '../../core/model';
import { loadBlob } from '../../core/storage';
import {
  drawGameOverlays,
  drawGrid,
  renderScene,
  type RenderLayer,
} from '../../renderers/canvas2d/render';
import {
  ZOOM_PRESETS,
  clampZoom,
  fitView,
  hitTestLayers,
  layerLocalPoint,
  layerWorldPoint,
  panBy,
  screenToWorld,
  snapToGrid,
  worldToScreen,
  zoomAt,
  type ViewTransform,
  type Viewport,
} from '../../renderers/canvas2d/view';

import { TOOL_CURSORS, type CanvasTool } from './canvasTools';
import {
  hitTestColliderHandle,
  hitTestColliders,
  moveColliderBy,
  resizeColliderRadius,
  resizeColliderRect,
  type ColliderHandle,
  type ColliderRectHandle,
} from './colliderEditing';

/** 汎用font family候補（契約 §5 A: 再編集不可・可搬性のため汎用candidateのみ）。 */
export type RasterTextFontFamily = 'sans-serif' | 'serif' | 'monospace';

/** raster text確定前の一時UI状態。Asset / Projectへは保存しない。 */
export interface RasterTextDraft {
  /** アンカー位置（テクスチャピクセル座標、左上原点）。 */
  anchor: Vec2;
  text: string;
  fontFamily: RasterTextFontFamily;
  size: number;
}

/** 貼り付けpreviewの一時UI状態。armしたclipboardと初期位置を保持する。 */
export interface PastePreviewState {
  clipboard: SelectionClipboard;
  origin: Vec2;
}

interface CanvasEditorProps {
  asset: Asset;
  tool: CanvasTool;
  selectedLayerId: string | null;
  /** 消しゴムの半径（テクスチャのピクセル単位）。 */
  eraserRadius: number;
  /** brushの半径（テクスチャのピクセル単位）。 */
  brushRadius: number;
  rasterColor: RgbColor;
  fillTolerance: number;
  onSelectLayer: (layerId: string | null) => void;
  /** ドラッグ移動の確定。before / next はアセットのスナップショット。 */
  onCommitAsset: (label: string, before: Asset, next: Asset) => void;
  /** bgpick / picker ツールでの色拾い。point はテクスチャ座標（左上原点）。 */
  onPickColor: (layerId: string, point: Vec2) => void;
  /** トリミング範囲の確定。rect はテクスチャ座標。 */
  onCropCommit: (layerId: string, rect: Rect) => void;
  /** 消しゴムストロークの確定。points はテクスチャ座標。 */
  onEraseCommit: (layerId: string, points: Vec2[]) => void;
  /** raster操作の確定。選択中のedit layerへ既存改訂保存経路で適用する。 */
  onRasterCommit: (operation: ImageOperation) => void;
  /** 単一layerのrectangular selection（一時UI状態）。Asset / Historyへは保存しない。 */
  selection: RasterSelection | null;
  /** ドラッグで新しいselectionを定義したときの確定。 */
  onSelectionCommit: (selection: RasterSelection) => void;
  /** selection内側をドラッグして移動したときの確定。元のselectionとテクスチャ座標の移動先を渡す。 */
  onSelectionMoveCommit: (selection: RasterSelection, target: Vec2) => void;
  /** paste preview（armされたcopy buffer）。ボタンでarmし、ドラッグで位置調整する。 */
  pastePreview: PastePreviewState | null;
  /** paste previewの現在位置をUI側へ都度ミラーする（ボタンからの確定に使う）。 */
  onPastePreviewMove: (position: Vec2) => void;
  /** paste previewの確定（pointer up）。 */
  onPasteCommit: (position: Vec2) => void;
  /** raster textの確定前preview状態。 */
  textDraft: RasterTextDraft | null;
  /** textツールでキャンバスをクリックしたときのアンカー確定。 */
  onTextAnchor: (point: Vec2) => void;
  /** 当たり判定オーバーレイの一括表示。 */
  showColliders: boolean;
  /** グリッド表示。UI 補助のみで保存形式には影響しない。 */
  gridEnabled: boolean;
  gridSize: number;
  gridSizeMode: '8' | '16' | '32' | 'custom';
  snapEnabled: boolean;
  onGridEnabledChange: (enabled: boolean) => void;
  onGridSizeChange: (size: number) => void;
  onGridSizeModeChange: (mode: '8' | '16' | '32' | 'custom') => void;
  onSnapEnabledChange: (enabled: boolean) => void;
  /** アンカーツールで空き場所をクリックしたときの追加。point は world 座標。 */
  onAddAnchor: (point: Vec2) => void;
  selectedColliderId: string | null;
  /** 判定ツールでの選択変更。 */
  onSelectCollider: (colliderId: string | null) => void;
}

interface DragState {
  mode:
    | 'move'
    | 'pan'
    | 'pinch'
    | 'crop'
    | 'erase'
    | 'brush'
    | 'raster-shape'
    | 'selection-new'
    | 'selection-move'
    | 'paste-move'
    | 'origin'
    | 'anchor-move'
    | 'collider-move'
    | 'collider-resize';
  pointerId: number;
  startScreen: Vec2;
  startView: ViewTransform;
  layerId?: string;
  anchorId?: string;
  before?: Asset;
  shapeTool?: 'rect' | 'ellipse';
  secondPointerId?: number;
  startDistance?: number;
  /** collider-move / collider-resize 用。 */
  colliderId?: string;
  colliderBefore?: Collider;
  colliderHandle?: ColliderHandle;
}

function textureSizeFor(asset: Asset, textureId: string | undefined): Size | null {
  if (!textureId) {
    return null;
  }
  const texture = asset.textures.find((tex) => tex.id === textureId);
  return texture ? texture.size : null;
}

function isPointInRect(point: Vec2, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function moveLayer(asset: Asset, layerId: string, deltaX: number, deltaY: number): Asset {
  return {
    ...asset,
    updatedAt: new Date().toISOString(),
    layers: asset.layers.map((layer) =>
      layer.id === layerId
        ? {
            ...layer,
            transform: {
              ...layer.transform,
              position: {
                x: layer.transform.position.x + deltaX,
                y: layer.transform.position.y + deltaY,
              },
            },
          }
        : layer,
    ),
  };
}

export function CanvasEditor({
  asset,
  tool,
  selectedLayerId,
  eraserRadius,
  brushRadius,
  rasterColor,
  fillTolerance,
  onSelectLayer,
  onCommitAsset,
  onPickColor,
  onCropCommit,
  onEraseCommit,
  onRasterCommit,
  selection,
  onSelectionCommit,
  onSelectionMoveCommit,
  pastePreview,
  onPastePreviewMove,
  onPasteCommit,
  textDraft,
  onTextAnchor,
  showColliders,
  gridEnabled,
  gridSize,
  gridSizeMode,
  snapEnabled,
  onGridEnabledChange,
  onGridSizeChange,
  onGridSizeModeChange,
  onSnapEnabledChange,
  onAddAnchor,
  selectedColliderId,
  onSelectCollider,
}: CanvasEditorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [view, setView] = useState<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [bitmaps, setBitmaps] = useState<Map<string, DecodedImageSource>>(new Map());
  const [draftAsset, setDraftAsset] = useState<Asset | null>(null);
  const [cropRectScreen, setCropRectScreen] = useState<{ start: Vec2; end: Vec2 } | null>(null);
  const [eraserStrokeScreen, setEraserStrokeScreen] = useState<Vec2[] | null>(null);
  const [brushStrokeScreen, setBrushStrokeScreen] = useState<Vec2[] | null>(null);
  const [shapeRectScreen, setShapeRectScreen] = useState<{
    start: Vec2;
    end: Vec2;
    tool: 'rect' | 'ellipse';
  } | null>(null);
  // 選択（rectangular selection）のドラッグ中preview。すべて一時UI状態で保存データへは含めない（契約 §6 / §10.4）。
  const [selectionRectScreen, setSelectionRectScreen] = useState<{
    start: Vec2;
    end: Vec2;
  } | null>(null);
  const [selectionMoveOffset, setSelectionMoveOffset] = useState<Vec2 | null>(null);
  const [pastePosition, setPastePosition] = useState<Vec2 | null>(null);
  const [pasteBitmap, setPasteBitmap] = useState<ImageBitmap | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const cropTexturePointsRef = useRef<{ start: Vec2; end: Vec2 } | null>(null);
  const eraseTexturePointsRef = useRef<Vec2[]>([]);
  const brushTexturePointsRef = useRef<Vec2[]>([]);
  const shapeTexturePointsRef = useRef<{
    start: Vec2;
    end: Vec2;
    tool: 'rect' | 'ellipse';
  } | null>(null);
  const selectionTexturePointsRef = useRef<{ start: Vec2; end: Vec2 } | null>(null);
  const selectionMoveStartTextureRef = useRef<Vec2 | null>(null);
  const pasteDragStartTextureRef = useRef<Vec2 | null>(null);
  const pasteDragBaseRef = useRef<Vec2 | null>(null);
  const pointersRef = useRef<Map<number, Vec2>>(new Map());
  const fittedAssetRef = useRef<string | null>(null);
  const bitmapsRef = useRef<Map<string, DecodedImageSource>>(new Map());

  const displayAsset = draftAsset ?? asset;
  const selectedLayer: Layer | null =
    asset.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedTextureSize = selectedLayer ? textureSizeFor(asset, selectedLayer.textureId) : null;

  // ビューポートサイズの追従
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setViewport({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height),
        });
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  // レイヤーが参照するテクスチャの画像を読み込む
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map = new Map<string, DecodedImageSource>();
      const textureIds = new Set(
        asset.layers.map((layer) => layer.textureId).filter((id): id is string => Boolean(id)),
      );
      for (const textureId of textureIds) {
        const texture = asset.textures.find((tex) => tex.id === textureId);
        if (!texture) {
          continue;
        }
        try {
          const blob = await loadBlob(blobKeyFor(asset.id, texture.path));
          if (!blob) {
            continue;
          }
          map.set(textureId, await decodeImageSource(blob));
        } catch {
          // 読み込めないテクスチャは描画しない（枠だけ表示される）
        }
      }
      if (cancelled) {
        for (const decoded of map.values()) {
          decoded.close();
        }
        return;
      }
      for (const decoded of bitmapsRef.current.values()) {
        decoded.close();
      }
      bitmapsRef.current = map;
      setBitmaps(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.textures, asset.layers]);

  useEffect(
    () => () => {
      for (const decoded of bitmapsRef.current.values()) {
        decoded.close();
      }
      bitmapsRef.current = new Map();
    },
    [],
  );

  // アセットを開いたら fit 表示にする
  useEffect(() => {
    if (viewport.width > 0 && viewport.height > 0 && fittedAssetRef.current !== asset.id) {
      fittedAssetRef.current = asset.id;
      setView(fitView(viewport, asset.canvasSize));
    }
  }, [viewport, asset.id, asset.canvasSize]);

  // paste previewがarmされたらclipboardをImageBitmapへ変換し、初期位置を局所stateへ写す。
  // clipboardはメモリ内一時データであり、Asset / Project / Historyへは保存しない（契約 §6）。
  useEffect(() => {
    let cancelled = false;
    let createdBitmap: ImageBitmap | null = null;
    if (!pastePreview) {
      setPastePosition(null);
      setPasteBitmap(null);
      return;
    }
    setPastePosition(pastePreview.origin);
    const imageData = new ImageData(
      new Uint8ClampedArray(pastePreview.clipboard.data),
      pastePreview.clipboard.width,
      pastePreview.clipboard.height,
    );
    void createImageBitmap(imageData)
      .then((bitmap) => {
        if (cancelled) {
          bitmap.close();
          return;
        }
        createdBitmap = bitmap;
        setPasteBitmap(bitmap);
      })
      .catch(() => {
        if (!cancelled) {
          setPasteBitmap(null);
        }
      });
    return () => {
      cancelled = true;
      createdBitmap?.close();
    };
  }, [pastePreview]);

  // 描画（イベント駆動）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width === 0 || viewport.height === 0) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = view.scale < 4;
    const layers: RenderLayer[] = displayAsset.layers.map((layer) => ({
      layer,
      textureSize: textureSizeFor(displayAsset, layer.textureId),
      bitmap: layer.textureId ? (bitmaps.get(layer.textureId)?.source ?? null) : null,
    }));
    renderScene(ctx, {
      view,
      viewport,
      canvasSize: displayAsset.canvasSize,
      layers,
      selectedLayerId,
    });

    if (gridEnabled) {
      drawGrid(ctx, { view, canvasSize: displayAsset.canvasSize, gridSize });
    }

    // ゲーム用情報（原点・アンカー・当たり判定）のオーバーレイ
    drawGameOverlays(ctx, {
      view,
      origin: displayAsset.origin,
      anchors: displayAsset.anchors,
      colliders: displayAsset.colliders,
      showColliders,
      selectedColliderId,
      showColliderHandles: tool === 'collider',
    });

    // ツールのオーバーレイ
    if (cropRectScreen) {
      const x = Math.min(cropRectScreen.start.x, cropRectScreen.end.x);
      const y = Math.min(cropRectScreen.start.y, cropRectScreen.end.y);
      const width = Math.abs(cropRectScreen.end.x - cropRectScreen.start.x);
      const height = Math.abs(cropRectScreen.end.y - cropRectScreen.start.y);
      ctx.save();
      ctx.fillStyle = 'rgba(58, 134, 255, 0.12)';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#3a86ff';
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, width, height);
      ctx.restore();
    }
    if (eraserStrokeScreen && selectedLayer) {
      const radiusScreen =
        eraserRadius * Math.abs(selectedLayer.transform.scale.x || 1) * view.scale;
      ctx.save();
      ctx.fillStyle = 'rgba(220, 60, 60, 0.35)';
      for (const point of eraserStrokeScreen) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(2, radiusScreen), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (brushStrokeScreen && selectedLayer) {
      const radiusScreen =
        brushRadius * Math.abs(selectedLayer.transform.scale.x || 1) * view.scale;
      ctx.save();
      ctx.fillStyle = `rgba(${rasterColor.r}, ${rasterColor.g}, ${rasterColor.b}, 0.35)`;
      for (const point of brushStrokeScreen) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(2, radiusScreen), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (shapeRectScreen) {
      const x = Math.min(shapeRectScreen.start.x, shapeRectScreen.end.x);
      const y = Math.min(shapeRectScreen.start.y, shapeRectScreen.end.y);
      const width = Math.abs(shapeRectScreen.end.x - shapeRectScreen.start.x);
      const height = Math.abs(shapeRectScreen.end.y - shapeRectScreen.start.y);
      ctx.save();
      ctx.fillStyle = `rgba(${rasterColor.r}, ${rasterColor.g}, ${rasterColor.b}, 0.2)`;
      ctx.strokeStyle = `rgb(${rasterColor.r}, ${rasterColor.g}, ${rasterColor.b})`;
      ctx.setLineDash([6, 4]);
      if (shapeRectScreen.tool === 'rect') {
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
      } else {
        ctx.beginPath();
        ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // ラスターselection・paste preview・raster textのオーバーレイ（すべて一時UI状態）
    if (selectedLayer && selectedTextureSize) {
      const toOverlayScreen = (texturePoint: Vec2): Vec2 => {
        const local = {
          x: texturePoint.x - selectedTextureSize.width / 2,
          y: texturePoint.y - selectedTextureSize.height / 2,
        };
        const world = layerWorldPoint(selectedLayer, selectedTextureSize, local);
        return worldToScreen(view, world);
      };

      if (selectionRectScreen) {
        const x = Math.min(selectionRectScreen.start.x, selectionRectScreen.end.x);
        const y = Math.min(selectionRectScreen.start.y, selectionRectScreen.end.y);
        const width = Math.abs(selectionRectScreen.end.x - selectionRectScreen.start.x);
        const height = Math.abs(selectionRectScreen.end.y - selectionRectScreen.start.y);
        ctx.save();
        ctx.strokeStyle = '#2bb673';
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x, y, width, height);
        ctx.restore();
      } else if (selection) {
        const rect = selectionMoveOffset
          ? {
              x: selection.rect.x + selectionMoveOffset.x,
              y: selection.rect.y + selectionMoveOffset.y,
              width: selection.rect.width,
              height: selection.rect.height,
            }
          : selection.rect;
        const topLeft = toOverlayScreen({ x: rect.x, y: rect.y });
        const bottomRight = toOverlayScreen({ x: rect.x + rect.width, y: rect.y + rect.height });
        ctx.save();
        ctx.strokeStyle = '#2bb673';
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(
          Math.min(topLeft.x, bottomRight.x),
          Math.min(topLeft.y, bottomRight.y),
          Math.abs(bottomRight.x - topLeft.x),
          Math.abs(bottomRight.y - topLeft.y),
        );
        ctx.restore();
      }

      if (pasteBitmap && pastePosition) {
        try {
          const topLeft = toOverlayScreen(pastePosition);
          const bottomRight = toOverlayScreen({
            x: pastePosition.x + pasteBitmap.width,
            y: pastePosition.y + pasteBitmap.height,
          });
          ctx.save();
          ctx.globalAlpha = 0.75;
          ctx.drawImage(
            pasteBitmap,
            Math.min(topLeft.x, bottomRight.x),
            Math.min(topLeft.y, bottomRight.y),
            Math.abs(bottomRight.x - topLeft.x),
            Math.abs(bottomRight.y - topLeft.y),
          );
          ctx.restore();
        } catch {
          // paste確定直後、pasteBitmapが別effectでcloseされた直後の1フレームだけ発生し得る。
          // 次のrenderでpasteBitmapがnullへ更新されるため、このframeの描画をskipするだけで安全。
        }
      }

      if (tool === 'text' && textDraft) {
        const screenPoint = toOverlayScreen(textDraft.anchor);
        const scaledSize = Math.max(
          1,
          textDraft.size * Math.abs(selectedLayer.transform.scale.x || 1) * view.scale,
        );
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = `rgb(${rasterColor.r}, ${rasterColor.g}, ${rasterColor.b})`;
        ctx.font = `${scaledSize}px ${textDraft.fontFamily}`;
        ctx.textBaseline = 'top';
        ctx.fillText(textDraft.text || '', screenPoint.x, screenPoint.y);
        ctx.restore();
      }
    }
  }, [
    viewport,
    view,
    displayAsset,
    bitmaps,
    selectedLayerId,
    cropRectScreen,
    eraserStrokeScreen,
    eraserRadius,
    brushStrokeScreen,
    brushRadius,
    shapeRectScreen,
    rasterColor,
    selectedLayer,
    selectedTextureSize,
    showColliders,
    selectedColliderId,
    gridEnabled,
    gridSize,
    tool,
    selection,
    selectionRectScreen,
    selectionMoveOffset,
    pasteBitmap,
    pastePosition,
    textDraft,
  ]);

  // ホイールズーム（passive: false で登録する必要がある）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setView((current) =>
        zoomAt(current, anchor, clampZoom(current.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2))),
      );
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  const toLocalPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Vec2 => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  /** 画面座標を選択レイヤーのテクスチャ座標（左上原点）へ変換する。 */
  const snapCoordinate = (value: number): number =>
    snapEnabled ? snapToGrid(value, gridSize) : Math.round(value);

  const toTexturePoint = (screenPoint: Vec2): Vec2 | null => {
    if (!selectedLayer || !selectedTextureSize) {
      return null;
    }
    const world = screenToWorld(view, screenPoint);
    const local = layerLocalPoint(selectedLayer, selectedTextureSize, world);
    return {
      x: local.x + selectedTextureSize.width / 2,
      y: local.y + selectedTextureSize.height / 2,
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = toLocalPoint(event);
    pointersRef.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);

    // 2 本目の指でピンチズームへ移行
    if (pointersRef.current.size === 2 && dragRef.current) {
      const [first, second] = [...pointersRef.current.entries()];
      dragRef.current = {
        mode: 'pinch',
        pointerId: first[0],
        secondPointerId: second[0],
        startScreen: first[1],
        startView: view,
        startDistance: Math.hypot(second[1].x - first[1].x, second[1].y - first[1].y),
      };
      setDraftAsset(null);
      setCropRectScreen(null);
      setEraserStrokeScreen(null);
      setBrushStrokeScreen(null);
      setShapeRectScreen(null);
      setSelectionRectScreen(null);
      setSelectionMoveOffset(null);
      brushTexturePointsRef.current = [];
      shapeTexturePointsRef.current = null;
      selectionTexturePointsRef.current = null;
      selectionMoveStartTextureRef.current = null;
      return;
    }

    if (tool === 'pan') {
      dragRef.current = {
        mode: 'pan',
        pointerId: event.pointerId,
        startScreen: point,
        startView: view,
      };
      return;
    }

    if (tool === 'origin') {
      const world = screenToWorld(view, point);
      dragRef.current = {
        mode: 'origin',
        pointerId: event.pointerId,
        startScreen: point,
        startView: view,
        before: asset,
      };
      setDraftAsset({
        ...asset,
        updatedAt: new Date().toISOString(),
        origin: { x: snapCoordinate(world.x), y: snapCoordinate(world.y) },
      });
      return;
    }

    if (tool === 'anchor') {
      // 既存アンカーの近く（10px 以内）ならドラッグ移動、そうでなければ追加
      const near = asset.anchors.find((anchor) => {
        const screen = worldToScreen(view, anchor.position);
        return Math.hypot(screen.x - point.x, screen.y - point.y) <= 10;
      });
      if (near) {
        dragRef.current = {
          mode: 'anchor-move',
          pointerId: event.pointerId,
          startScreen: point,
          startView: view,
          before: asset,
          anchorId: near.id,
        };
      } else {
        onAddAnchor(screenToWorld(view, point));
      }
      return;
    }

    if (tool === 'collider') {
      if (!showColliders) {
        // 判定を表示していないときは操作させず、select ツールの空クリックと同様にパン扱いにする
        dragRef.current = {
          mode: 'pan',
          pointerId: event.pointerId,
          startScreen: point,
          startView: view,
        };
        return;
      }
      const selected = selectedColliderId
        ? (asset.colliders.find((collider) => collider.id === selectedColliderId) ?? null)
        : null;
      const handle = selected ? hitTestColliderHandle(selected, point, view) : null;
      if (selected && handle) {
        dragRef.current = {
          mode: 'collider-resize',
          pointerId: event.pointerId,
          startScreen: point,
          startView: view,
          before: asset,
          colliderId: selected.id,
          colliderBefore: selected,
          colliderHandle: handle,
        };
        return;
      }
      const worldPoint = screenToWorld(view, point);
      const hitId = hitTestColliders(asset.colliders, worldPoint, selectedColliderId);
      if (hitId) {
        const hitCollider = asset.colliders.find((collider) => collider.id === hitId) ?? null;
        onSelectCollider(hitId);
        if (hitCollider) {
          dragRef.current = {
            mode: 'collider-move',
            pointerId: event.pointerId,
            startScreen: point,
            startView: view,
            before: asset,
            colliderId: hitId,
            colliderBefore: hitCollider,
          };
        }
      } else {
        onSelectCollider(null);
        // 何もない場所のドラッグはパンとして扱う
        dragRef.current = {
          mode: 'pan',
          pointerId: event.pointerId,
          startScreen: point,
          startView: view,
        };
      }
      return;
    }

    if (tool === 'bgpick' || tool === 'picker') {
      const texturePoint = toTexturePoint(point);
      if (selectedLayer && texturePoint) {
        onPickColor(selectedLayer.id, texturePoint);
      }
      return;
    }

    if (tool === 'crop') {
      const texturePoint = toTexturePoint(point);
      if (!selectedLayer || !texturePoint) {
        return;
      }
      cropTexturePointsRef.current = { start: texturePoint, end: texturePoint };
      setCropRectScreen({ start: point, end: point });
      dragRef.current = {
        mode: 'crop',
        pointerId: event.pointerId,
        startScreen: point,
        startView: view,
        layerId: selectedLayer.id,
      };
      return;
    }

    if (tool === 'eraser') {
      const texturePoint = toTexturePoint(point);
      if (!selectedLayer || !texturePoint) {
        return;
      }
      eraseTexturePointsRef.current = [texturePoint];
      setEraserStrokeScreen([point]);
      dragRef.current = {
        mode: 'erase',
        pointerId: event.pointerId,
        startScreen: point,
        startView: view,
        layerId: selectedLayer.id,
      };
      return;
    }

    if (tool === 'fill') {
      const texturePoint = toTexturePoint(point);
      if (selectedLayer && texturePoint) {
        onRasterCommit({
          type: 'floodFill',
          start: texturePoint,
          color: rasterColor,
          tolerance: fillTolerance,
          selection: selection ?? undefined,
        });
      }
      return;
    }

    if (tool === 'brush') {
      const texturePoint = toTexturePoint(point);
      if (!selectedLayer || !texturePoint) {
        return;
      }
      brushTexturePointsRef.current = [texturePoint];
      setBrushStrokeScreen([point]);
      dragRef.current = {
        mode: 'brush',
        pointerId: event.pointerId,
        startScreen: point,
        startView: view,
        layerId: selectedLayer.id,
      };
      return;
    }

    if (tool === 'rect' || tool === 'ellipse') {
      const texturePoint = toTexturePoint(point);
      if (!selectedLayer || !texturePoint) {
        return;
      }
      shapeTexturePointsRef.current = { start: texturePoint, end: texturePoint, tool };
      setShapeRectScreen({ start: point, end: point, tool });
      dragRef.current = {
        mode: 'raster-shape',
        pointerId: event.pointerId,
        startScreen: point,
        startView: view,
        layerId: selectedLayer.id,
        shapeTool: tool,
      };
      return;
    }

    if (tool === 'text') {
      const texturePoint = toTexturePoint(point);
      if (selectedLayer && texturePoint) {
        onTextAnchor(texturePoint);
      }
      return;
    }

    if (tool === 'selection') {
      const texturePoint = toTexturePoint(point);
      if (!selectedLayer || !texturePoint) {
        return;
      }

      // paste previewがarmされている間は、ドラッグで貼り付け位置を調整する
      if (pastePreview && pastePosition) {
        pasteDragStartTextureRef.current = texturePoint;
        pasteDragBaseRef.current = pastePosition;
        dragRef.current = {
          mode: 'paste-move',
          pointerId: event.pointerId,
          startScreen: point,
          startView: view,
          layerId: selectedLayer.id,
        };
        return;
      }

      // 有効なselectionの内側なら移動、それ以外は新規selectionのドラッグを開始する
      if (selection && isPointInRect(texturePoint, selection.rect)) {
        selectionMoveStartTextureRef.current = texturePoint;
        setSelectionMoveOffset({ x: 0, y: 0 });
        dragRef.current = {
          mode: 'selection-move',
          pointerId: event.pointerId,
          startScreen: point,
          startView: view,
          layerId: selectedLayer.id,
        };
        return;
      }

      selectionTexturePointsRef.current = { start: texturePoint, end: texturePoint };
      setSelectionRectScreen({ start: point, end: point });
      dragRef.current = {
        mode: 'selection-new',
        pointerId: event.pointerId,
        startScreen: point,
        startView: view,
        layerId: selectedLayer.id,
      };
      return;
    }

    // select ツール
    const worldPoint = screenToWorld(view, point);
    const targets = asset.layers.map((layer) => ({
      layer,
      textureSize: textureSizeFor(asset, layer.textureId) ?? { width: 0, height: 0 },
    }));
    const hitId = hitTestLayers(targets, worldPoint);
    if (hitId) {
      onSelectLayer(hitId);
      dragRef.current = {
        mode: 'move',
        pointerId: event.pointerId,
        startScreen: point,
        startView: view,
        layerId: hitId,
        before: asset,
      };
    } else {
      onSelectLayer(null);
      // 何もない場所のドラッグはパンとして扱う
      dragRef.current = {
        mode: 'pan',
        pointerId: event.pointerId,
        startScreen: point,
        startView: view,
      };
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const point = toLocalPoint(event);
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, point);
    }
    if (!drag) {
      return;
    }

    if (drag.mode === 'pinch') {
      const first = pointersRef.current.get(drag.pointerId);
      const second =
        drag.secondPointerId !== undefined ? pointersRef.current.get(drag.secondPointerId) : null;
      if (!first || !second || !drag.startDistance) {
        return;
      }
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      setView(
        zoomAt(drag.startView, midpoint, drag.startView.scale * (distance / drag.startDistance)),
      );
      return;
    }

    if (drag.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = point.x - drag.startScreen.x;
    const deltaY = point.y - drag.startScreen.y;

    if (drag.mode === 'pan') {
      setView(panBy(drag.startView, deltaX, deltaY));
      return;
    }

    if (drag.mode === 'crop') {
      const texturePoint = toTexturePoint(point);
      if (texturePoint && cropTexturePointsRef.current) {
        cropTexturePointsRef.current = { ...cropTexturePointsRef.current, end: texturePoint };
      }
      setCropRectScreen((current) => (current ? { ...current, end: point } : current));
      return;
    }

    if (drag.mode === 'erase') {
      const texturePoint = toTexturePoint(point);
      if (texturePoint) {
        eraseTexturePointsRef.current.push(texturePoint);
      }
      setEraserStrokeScreen((current) => (current ? [...current, point] : current));
      return;
    }

    if (drag.mode === 'brush') {
      const texturePoint = toTexturePoint(point);
      if (texturePoint) {
        brushTexturePointsRef.current.push(texturePoint);
      }
      setBrushStrokeScreen((current) => (current ? [...current, point] : current));
      return;
    }

    if (drag.mode === 'raster-shape') {
      const texturePoint = toTexturePoint(point);
      if (texturePoint && shapeTexturePointsRef.current) {
        shapeTexturePointsRef.current = { ...shapeTexturePointsRef.current, end: texturePoint };
      }
      setShapeRectScreen((current) => (current ? { ...current, end: point } : current));
      return;
    }

    if (drag.mode === 'selection-new') {
      const texturePoint = toTexturePoint(point);
      if (texturePoint && selectionTexturePointsRef.current) {
        selectionTexturePointsRef.current = {
          ...selectionTexturePointsRef.current,
          end: texturePoint,
        };
      }
      setSelectionRectScreen((current) => (current ? { ...current, end: point } : current));
      return;
    }

    if (drag.mode === 'selection-move') {
      const texturePoint = toTexturePoint(point);
      if (texturePoint && selectionMoveStartTextureRef.current) {
        setSelectionMoveOffset({
          x: texturePoint.x - selectionMoveStartTextureRef.current.x,
          y: texturePoint.y - selectionMoveStartTextureRef.current.y,
        });
      }
      return;
    }

    if (drag.mode === 'paste-move') {
      const texturePoint = toTexturePoint(point);
      if (texturePoint && pasteDragStartTextureRef.current && pasteDragBaseRef.current) {
        const next = {
          x: pasteDragBaseRef.current.x + (texturePoint.x - pasteDragStartTextureRef.current.x),
          y: pasteDragBaseRef.current.y + (texturePoint.y - pasteDragStartTextureRef.current.y),
        };
        setPastePosition(next);
        onPastePreviewMove(next);
      }
      return;
    }

    const snap = snapCoordinate;

    if (drag.mode === 'origin' && drag.before) {
      const world = screenToWorld(view, point);
      setDraftAsset({
        ...drag.before,
        updatedAt: new Date().toISOString(),
        origin: { x: snap(world.x), y: snap(world.y) },
      });
      return;
    }

    if (drag.mode === 'anchor-move' && drag.before && drag.anchorId) {
      const world = screenToWorld(view, point);
      setDraftAsset({
        ...drag.before,
        updatedAt: new Date().toISOString(),
        anchors: drag.before.anchors.map((anchor) =>
          anchor.id === drag.anchorId
            ? { ...anchor, position: { x: snap(world.x), y: snap(world.y) } }
            : anchor,
        ),
      });
      return;
    }

    if (drag.mode === 'collider-move' && drag.before && drag.colliderId && drag.colliderBefore) {
      const worldDelta = {
        x: deltaX / drag.startView.scale,
        y: deltaY / drag.startView.scale,
      };
      const next = moveColliderBy(drag.before, drag.colliderId, drag.colliderBefore, worldDelta, {
        enabled: snapEnabled,
        gridSize,
      });
      setDraftAsset(next);
      return;
    }

    if (
      drag.mode === 'collider-resize' &&
      drag.before &&
      drag.colliderId &&
      drag.colliderBefore &&
      drag.colliderHandle
    ) {
      const worldPoint = screenToWorld(view, point);
      const snapOptions = { enabled: snapEnabled, gridSize };
      if (drag.colliderBefore.shape === 'rect' && drag.colliderHandle !== 'radius') {
        const next = resizeColliderRect(
          drag.before,
          drag.colliderId,
          drag.colliderBefore,
          drag.colliderHandle as ColliderRectHandle,
          worldPoint,
          snapOptions,
        );
        setDraftAsset(next);
      } else if (drag.colliderBefore.shape === 'circle' && drag.colliderHandle === 'radius') {
        const next = resizeColliderRadius(
          drag.before,
          drag.colliderId,
          drag.colliderBefore,
          worldPoint,
          snapOptions,
        );
        setDraftAsset(next);
      }
      return;
    }

    if (drag.mode === 'move' && drag.layerId && drag.before) {
      const worldDeltaX = deltaX / drag.startView.scale;
      const worldDeltaY = deltaY / drag.startView.scale;
      const next = moveLayer(drag.before, drag.layerId, worldDeltaX, worldDeltaY);
      if (!snapEnabled) {
        setDraftAsset(next);
        return;
      }
      setDraftAsset({
        ...next,
        layers: next.layers.map((layer) =>
          layer.id === drag.layerId
            ? {
                ...layer,
                transform: {
                  ...layer.transform,
                  position: {
                    x: snapToGrid(layer.transform.position.x, gridSize),
                    y: snapToGrid(layer.transform.position.y, gridSize),
                  },
                },
              }
            : layer,
        ),
      });
    }
  };

  const endPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    if (drag.mode === 'pinch') {
      if (pointersRef.current.size < 2) {
        dragRef.current = null;
      }
      return;
    }
    if (drag.pointerId !== event.pointerId) {
      return;
    }

    if (drag.mode === 'crop' && drag.layerId) {
      const points = cropTexturePointsRef.current;
      cropTexturePointsRef.current = null;
      setCropRectScreen(null);
      dragRef.current = null;
      if (points) {
        const x = Math.min(points.start.x, points.end.x);
        const y = Math.min(points.start.y, points.end.y);
        const width = Math.abs(points.end.x - points.start.x);
        const height = Math.abs(points.end.y - points.start.y);
        if (width >= 2 && height >= 2) {
          onCropCommit(drag.layerId, { x, y, width, height });
        }
      }
      return;
    }

    if (drag.mode === 'erase' && drag.layerId) {
      const points = eraseTexturePointsRef.current;
      eraseTexturePointsRef.current = [];
      setEraserStrokeScreen(null);
      dragRef.current = null;
      if (points.length > 0) {
        onEraseCommit(drag.layerId, points);
      }
      return;
    }

    if (drag.mode === 'brush' && drag.layerId) {
      const points = brushTexturePointsRef.current;
      brushTexturePointsRef.current = [];
      setBrushStrokeScreen(null);
      dragRef.current = null;
      if (points.length > 0) {
        onRasterCommit({
          type: 'paintBrush',
          points,
          radius: brushRadius,
          color: rasterColor,
          selection: selection ?? undefined,
        });
      }
      return;
    }

    if (drag.mode === 'raster-shape' && drag.layerId) {
      const shape = shapeTexturePointsRef.current;
      shapeTexturePointsRef.current = null;
      setShapeRectScreen(null);
      dragRef.current = null;
      if (shape) {
        const rect = {
          x: Math.min(shape.start.x, shape.end.x),
          y: Math.min(shape.start.y, shape.end.y),
          width: Math.abs(shape.end.x - shape.start.x),
          height: Math.abs(shape.end.y - shape.start.y),
        };
        if (rect.width >= 1 && rect.height >= 1) {
          onRasterCommit(
            shape.tool === 'rect'
              ? { type: 'rasterRect', rect, color: rasterColor, selection: selection ?? undefined }
              : {
                  type: 'rasterEllipse',
                  rect,
                  color: rasterColor,
                  selection: selection ?? undefined,
                },
          );
        }
      }
      return;
    }

    if (drag.mode === 'selection-new' && drag.layerId) {
      const points = selectionTexturePointsRef.current;
      selectionTexturePointsRef.current = null;
      setSelectionRectScreen(null);
      dragRef.current = null;
      if (points) {
        const x = Math.min(points.start.x, points.end.x);
        const y = Math.min(points.start.y, points.end.y);
        const width = Math.abs(points.end.x - points.start.x);
        const height = Math.abs(points.end.y - points.start.y);
        if (width >= 1 && height >= 1) {
          onSelectionCommit({ rect: { x, y, width, height } });
        }
      }
      return;
    }

    if (drag.mode === 'selection-move' && drag.layerId && selection) {
      const offset = selectionMoveOffset;
      selectionMoveStartTextureRef.current = null;
      setSelectionMoveOffset(null);
      dragRef.current = null;
      if (offset && (offset.x !== 0 || offset.y !== 0)) {
        const target = { x: selection.rect.x + offset.x, y: selection.rect.y + offset.y };
        onSelectionMoveCommit(selection, target);
      }
      return;
    }

    if (drag.mode === 'paste-move' && drag.layerId) {
      const position = pastePosition;
      pasteDragStartTextureRef.current = null;
      pasteDragBaseRef.current = null;
      dragRef.current = null;
      if (position) {
        onPasteCommit(position);
      }
      return;
    }

    if (drag.mode === 'origin' && drag.before && draftAsset) {
      if (
        draftAsset.origin.x !== drag.before.origin.x ||
        draftAsset.origin.y !== drag.before.origin.y
      ) {
        onCommitAsset('原点変更', drag.before, draftAsset);
      }
      setDraftAsset(null);
      dragRef.current = null;
      return;
    }

    if (drag.mode === 'anchor-move' && drag.before && draftAsset) {
      if (JSON.stringify(draftAsset.anchors) !== JSON.stringify(drag.before.anchors)) {
        onCommitAsset('アンカー移動', drag.before, draftAsset);
      }
      setDraftAsset(null);
      dragRef.current = null;
      return;
    }

    if (drag.mode === 'collider-move' && drag.before && drag.colliderId && draftAsset) {
      const moved = draftAsset.colliders.find((collider) => collider.id === drag.colliderId);
      const original = drag.before.colliders.find((collider) => collider.id === drag.colliderId);
      const changed =
        (moved &&
          original &&
          moved.shape === 'rect' &&
          original.shape === 'rect' &&
          (moved.rect.x !== original.rect.x || moved.rect.y !== original.rect.y)) ||
        (moved &&
          original &&
          moved.shape === 'circle' &&
          original.shape === 'circle' &&
          (moved.circle.x !== original.circle.x || moved.circle.y !== original.circle.y));
      if (changed) {
        onCommitAsset('判定移動', drag.before, draftAsset);
      }
      setDraftAsset(null);
      dragRef.current = null;
      return;
    }

    if (drag.mode === 'collider-resize' && drag.before && drag.colliderId && draftAsset) {
      const moved = draftAsset.colliders.find((collider) => collider.id === drag.colliderId);
      const original = drag.before.colliders.find((collider) => collider.id === drag.colliderId);
      if (moved && original && moved.shape === 'rect' && original.shape === 'rect') {
        const changed =
          moved.rect.x !== original.rect.x ||
          moved.rect.y !== original.rect.y ||
          moved.rect.width !== original.rect.width ||
          moved.rect.height !== original.rect.height;
        if (changed) {
          onCommitAsset('判定リサイズ', drag.before, draftAsset);
        }
      } else if (moved && original && moved.shape === 'circle' && original.shape === 'circle') {
        if (moved.circle.radius !== original.circle.radius) {
          onCommitAsset('判定半径変更', drag.before, draftAsset);
        }
      }
      setDraftAsset(null);
      dragRef.current = null;
      return;
    }

    if (drag.mode === 'move' && drag.before && draftAsset) {
      const moved = draftAsset.layers.find((layer) => layer.id === drag.layerId);
      const original = drag.before.layers.find((layer) => layer.id === drag.layerId);
      if (
        moved &&
        original &&
        (moved.transform.position.x !== original.transform.position.x ||
          moved.transform.position.y !== original.transform.position.y)
      ) {
        onCommitAsset('レイヤー移動', drag.before, draftAsset);
      }
    }
    setDraftAsset(null);
    dragRef.current = null;
  };

  const zoomPercent = Math.round(view.scale * 100);
  const applyZoom = (scale: number) => {
    setView((current) => zoomAt(current, { x: viewport.width / 2, y: viewport.height / 2 }, scale));
  };

  return (
    <div className="canvas-editor" ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        className="canvas-editor-canvas"
        aria-label="アセットキャンバス"
        style={{
          width: viewport.width,
          height: viewport.height,
          touchAction: 'none',
          cursor: TOOL_CURSORS[tool],
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      />
      <div className="canvas-zoombar">
        {ZOOM_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={Math.abs(view.scale - preset) < 0.001}
            onClick={() => applyZoom(preset)}
          >
            {Math.round(preset * 100)}%
          </button>
        ))}
        <button type="button" onClick={() => setView(fitView(viewport, asset.canvasSize))}>
          全体表示
        </button>
        <span className="canvas-zoom-label">ズーム {zoomPercent}%</span>
        <label className="canvas-grid-control">
          <input
            type="checkbox"
            aria-label="グリッド表示"
            checked={gridEnabled}
            onChange={(event) => onGridEnabledChange(event.target.checked)}
          />
          グリッド
        </label>
        <select
          aria-label="グリッドサイズ"
          value={gridSizeMode}
          onChange={(event) => {
            const mode = event.target.value as '8' | '16' | '32' | 'custom';
            onGridSizeModeChange(mode);
            if (mode !== 'custom') {
              onGridSizeChange(Number(mode));
            }
          }}
        >
          <option value="8">8px</option>
          <option value="16">16px</option>
          <option value="32">32px</option>
          <option value="custom">カスタム</option>
        </select>
        {gridSizeMode === 'custom' && (
          <input
            type="number"
            aria-label="カスタムグリッドサイズ"
            min={2}
            max={256}
            value={gridSize}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) {
                onGridSizeChange(Math.min(256, Math.max(2, Math.round(next))));
              }
            }}
          />
        )}
        <label className="canvas-grid-control">
          <input
            type="checkbox"
            aria-label="スナップ"
            checked={snapEnabled}
            onChange={(event) => onSnapEnabledChange(event.target.checked)}
          />
          スナップ
        </label>
      </div>
    </div>
  );
}
