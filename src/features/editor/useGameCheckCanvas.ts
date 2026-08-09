import { useEffect, useRef, useState, type RefObject } from 'react';
import { decodeImageSource, type DecodedImageSource } from '../../core/images/decodeImageSource';
import { blobKeyFor } from '../../core/images/importImage';
import type { Asset, GamePreviewOverlay } from '../../core/model';
import { loadBlob } from '../../core/storage';
import { drawGameOverlays, renderScene, type RenderLayer } from '../../renderers/canvas2d/render';
import { fitView, type ViewTransform, type Viewport } from '../../renderers/canvas2d/view';
import { buildGameCheckColliders, buildGameCheckRenderLayers } from './gameCheckContract';
import { drawGameCheckTypeOverlay } from './gameCheckRenderer';

interface UseGameCheckCanvasOptions {
  asset: Asset;
  overlay: GamePreviewOverlay;
  parallaxPosition: number;
  showOrigin: boolean;
  showAnchors: boolean;
  showColliders: boolean;
  showTypeOverlay: boolean;
}

export interface GameCheckCanvasState {
  wrapperRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  availableTextureIds: ReadonlySet<string>;
  decodeFailedTextureIds: ReadonlySet<string>;
}

/** Canvas表示と画像decodeだけを管理する。永続化APIは呼ばない。 */
export function useGameCheckCanvas({
  asset,
  overlay,
  parallaxPosition,
  showOrigin,
  showAnchors,
  showColliders,
  showTypeOverlay,
}: UseGameCheckCanvasOptions): GameCheckCanvasState {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapsRef = useRef<Map<string, DecodedImageSource>>(new Map());
  const [bitmaps, setBitmaps] = useState<Map<string, DecodedImageSource>>(new Map());
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [view, setView] = useState<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [availableTextureIds, setAvailableTextureIds] = useState<Set<string>>(new Set());
  const [decodeFailedTextureIds, setDecodeFailedTextureIds] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0) {
      return;
    }
    if (!overlay.tile) {
      setView(fitView(viewport, asset.canvasSize));
      return;
    }
    const fitted = fitView(viewport, {
      width: overlay.tile.tileWidth * 3,
      height: overlay.tile.tileHeight * 3,
    });
    setView({
      ...fitted,
      offsetX: fitted.offsetX + overlay.tile.tileWidth * fitted.scale,
      offsetY: fitted.offsetY + overlay.tile.tileHeight * fitted.scale,
    });
  }, [asset.canvasSize, overlay.tile, viewport]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map = new Map<string, DecodedImageSource>();
      const available = new Set<string>();
      const decodeFailed = new Set<string>();
      const textureIds = new Set(
        asset.layers
          .filter((layer) => layer.layerType === 'image' && layer.textureId)
          .map((layer) => layer.textureId as string),
      );
      for (const textureId of textureIds) {
        const texture = asset.textures.find((candidate) => candidate.id === textureId);
        if (!texture) {
          continue;
        }
        let blob: Blob | null = null;
        try {
          blob = await loadBlob(blobKeyFor(asset.id, texture.path));
        } catch {
          continue;
        }
        if (!blob) {
          continue;
        }
        try {
          map.set(textureId, await decodeImageSource(blob));
          available.add(textureId);
        } catch {
          decodeFailed.add(textureId);
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
      setAvailableTextureIds(available);
      setDecodeFailedTextureIds(decodeFailed);
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.layers, asset.textures]);

  useEffect(
    () => () => {
      for (const decoded of bitmapsRef.current.values()) {
        decoded.close();
      }
      bitmapsRef.current = new Map();
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width === 0 || viewport.height === 0) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = view.scale < 4;
    const baseLayers: RenderLayer[] = asset.layers.map((layer) => ({
      layer,
      textureSize: asset.textures.find((texture) => texture.id === layer.textureId)?.size ?? null,
      bitmap: layer.textureId ? (bitmaps.get(layer.textureId)?.source ?? null) : null,
    }));
    renderScene(context, {
      view,
      viewport,
      canvasSize: asset.canvasSize,
      layers: buildGameCheckRenderLayers(baseLayers, asset, overlay),
      selectedLayerId: null,
    });
    const runtimeOrigin = asset.origin as Asset['origin'] | undefined;
    drawGameOverlays(context, {
      view,
      origin: runtimeOrigin ?? { x: 0, y: 0 },
      anchors: asset.anchors ?? [],
      colliders: buildGameCheckColliders(asset, overlay),
      showColliders,
      showOrigin: showOrigin && Boolean(runtimeOrigin),
      showAnchors,
      selectedColliderId: null,
    });
    if (showTypeOverlay) {
      drawGameCheckTypeOverlay(context, {
        view,
        asset,
        overlay,
        parallaxPosition,
        showOrigin,
      });
    }
  }, [
    asset,
    bitmaps,
    overlay,
    parallaxPosition,
    showAnchors,
    showColliders,
    showOrigin,
    showTypeOverlay,
    view,
    viewport,
  ]);

  return { wrapperRef, canvasRef, availableTextureIds, decodeFailedTextureIds };
}
