import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { decodeImageSource, type DecodedImageSource } from '../../core/images/decodeImageSource';
import { blobKeyFor } from '../../core/images/importImage';
import type { Rect } from '../../core/images/operations';
import type { Asset, Layer, Size, Vec2 } from '../../core/model';
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
  panBy,
  screenToWorld,
  snapToGrid,
  worldToScreen,
  zoomAt,
  type ViewTransform,
  type Viewport,
} from '../../renderers/canvas2d/view';

import { TOOL_CURSORS, type CanvasTool } from './canvasTools';

interface CanvasEditorProps {
  asset: Asset;
  tool: CanvasTool;
  selectedLayerId: string | null;
  /** 消しゴムの半径（テクスチャのピクセル単位）。 */
  eraserRadius: number;
  onSelectLayer: (layerId: string | null) => void;
  /** ドラッグ移動の確定。before / next はアセットのスナップショット。 */
  onCommitAsset: (label: string, before: Asset, next: Asset) => void;
  /** bgpick / picker ツールでの色拾い。point はテクスチャ座標（左上原点）。 */
  onPickColor: (layerId: string, point: Vec2) => void;
  /** トリミング範囲の確定。rect はテクスチャ座標。 */
  onCropCommit: (layerId: string, rect: Rect) => void;
  /** 消しゴムストロークの確定。points はテクスチャ座標。 */
  onEraseCommit: (layerId: string, points: Vec2[]) => void;
  /** 当たり判定オーバーレイの一括表示。 */
  showColliders: boolean;
  /** アンカーツールで空き場所をクリックしたときの追加。point は world 座標。 */
  onAddAnchor: (point: Vec2) => void;
}

interface DragState {
  mode: 'move' | 'pan' | 'pinch' | 'crop' | 'erase' | 'origin' | 'anchor-move';
  pointerId: number;
  startScreen: Vec2;
  startView: ViewTransform;
  layerId?: string;
  anchorId?: string;
  before?: Asset;
  secondPointerId?: number;
  startDistance?: number;
}

function textureSizeFor(asset: Asset, textureId: string | undefined): Size | null {
  if (!textureId) {
    return null;
  }
  const texture = asset.textures.find((tex) => tex.id === textureId);
  return texture ? texture.size : null;
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
  onSelectLayer,
  onCommitAsset,
  onPickColor,
  onCropCommit,
  onEraseCommit,
  showColliders,
  onAddAnchor,
}: CanvasEditorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [view, setView] = useState<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [gridEnabled, setGridEnabled] = useState(false);
  const [gridSize, setGridSize] = useState(16);
  const [gridSizeMode, setGridSizeMode] = useState<'8' | '16' | '32' | 'custom'>('16');
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [bitmaps, setBitmaps] = useState<Map<string, DecodedImageSource>>(new Map());
  const [draftAsset, setDraftAsset] = useState<Asset | null>(null);
  const [cropRectScreen, setCropRectScreen] = useState<{ start: Vec2; end: Vec2 } | null>(null);
  const [eraserStrokeScreen, setEraserStrokeScreen] = useState<Vec2[] | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const cropTexturePointsRef = useRef<{ start: Vec2; end: Vec2 } | null>(null);
  const eraseTexturePointsRef = useRef<Vec2[]>([]);
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
  }, [
    viewport,
    view,
    displayAsset,
    bitmaps,
    selectedLayerId,
    cropRectScreen,
    eraserStrokeScreen,
    eraserRadius,
    selectedLayer,
    showColliders,
    gridEnabled,
    gridSize,
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
        origin: { x: Math.round(world.x), y: Math.round(world.y) },
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

    const snap = (v: number) => (snapEnabled ? snapToGrid(v, gridSize) : Math.round(v));

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
            onChange={(event) => setGridEnabled(event.target.checked)}
          />
          グリッド
        </label>
        <select
          aria-label="グリッドサイズ"
          value={gridSizeMode}
          onChange={(event) => {
            const mode = event.target.value as '8' | '16' | '32' | 'custom';
            setGridSizeMode(mode);
            if (mode !== 'custom') {
              setGridSize(Number(mode));
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
            min={1}
            value={gridSize}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next > 0) {
                setGridSize(next);
              }
            }}
          />
        )}
        <label className="canvas-grid-control">
          <input
            type="checkbox"
            aria-label="スナップ"
            checked={snapEnabled}
            onChange={(event) => setSnapEnabled(event.target.checked)}
          />
          スナップ
        </label>
      </div>
    </div>
  );
}
