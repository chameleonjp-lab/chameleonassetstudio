import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { blobKeyFor } from '../../core/images/importImage';
import type { Asset, Size, Vec2 } from '../../core/model';
import { loadBlob } from '../../core/storage';
import { renderScene, type RenderLayer } from '../../renderers/canvas2d/render';
import {
  ZOOM_PRESETS,
  clampZoom,
  fitView,
  hitTestLayers,
  panBy,
  screenToWorld,
  zoomAt,
  type ViewTransform,
  type Viewport,
} from '../../renderers/canvas2d/view';

export type CanvasTool = 'select' | 'pan';

interface CanvasEditorProps {
  asset: Asset;
  tool: CanvasTool;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  /** ドラッグ移動の確定。before / next はアセットのスナップショット。 */
  onCommitAsset: (label: string, before: Asset, next: Asset) => void;
}

interface DragState {
  mode: 'move' | 'pan' | 'pinch';
  pointerId: number;
  startScreen: Vec2;
  startView: ViewTransform;
  layerId?: string;
  before?: Asset;
  /** ピンチ用: 2 本目のポインタ */
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
  onSelectLayer,
  onCommitAsset,
}: CanvasEditorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [view, setView] = useState<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [bitmaps, setBitmaps] = useState<Map<string, ImageBitmap>>(new Map());
  const [draftAsset, setDraftAsset] = useState<Asset | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pointersRef = useRef<Map<number, Vec2>>(new Map());
  const fittedAssetRef = useRef<string | null>(null);
  const bitmapsRef = useRef<Map<string, ImageBitmap>>(new Map());

  const displayAsset = draftAsset ?? asset;

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

  // レイヤーが参照するテクスチャの ImageBitmap を読み込む
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map = new Map<string, ImageBitmap>();
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
          map.set(textureId, await createImageBitmap(blob));
        } catch {
          // 読み込めないテクスチャは描画しない（枠だけ表示される）
        }
      }
      if (cancelled) {
        for (const bitmap of map.values()) {
          bitmap.close();
        }
        return;
      }
      for (const bitmap of bitmapsRef.current.values()) {
        bitmap.close();
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
      for (const bitmap of bitmapsRef.current.values()) {
        bitmap.close();
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
      bitmap: layer.textureId ? (bitmaps.get(layer.textureId) ?? null) : null,
    }));
    renderScene(ctx, {
      view,
      viewport,
      canvasSize: displayAsset.canvasSize,
      layers,
      selectedLayerId,
    });
  }, [viewport, view, displayAsset, bitmaps, selectedLayerId]);

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

    if (drag.mode === 'move' && drag.layerId && drag.before) {
      const worldDeltaX = deltaX / drag.startView.scale;
      const worldDeltaY = deltaY / drag.startView.scale;
      setDraftAsset(moveLayer(drag.before, drag.layerId, worldDeltaX, worldDeltaY));
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
        style={{ width: viewport.width, height: viewport.height, touchAction: 'none' }}
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
      </div>
    </div>
  );
}
