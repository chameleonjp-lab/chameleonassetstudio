import { useEffect, useRef, useState } from 'react';
import { decodeImageSource, type DecodedImageSource } from '../../core/images/decodeImageSource';
import { blobKeyFor } from '../../core/images/importImage';
import type { Asset } from '../../core/model';
import { loadBlob } from '../../core/storage';

interface BackgroundPreviewProps {
  asset: Asset;
}

const PREVIEW_HEIGHT = 160;
const CAMERA_MAX = 1000;

/**
 * background アセットのパララックスプレビュー（Phase 14）。
 * カメラ位置スライダーを動かすと、各レイヤーの視差速度に応じてずれて見える。
 * アニメーション（rAF）は行わず、スライダー操作時のみ再描画する。
 */
export function BackgroundPreview({ asset }: BackgroundPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapsRef = useRef<Map<string, DecodedImageSource>>(new Map());
  const [bitmaps, setBitmaps] = useState<Map<string, DecodedImageSource>>(new Map());
  const [camera, setCamera] = useState(0);

  // 表示対象レイヤー（visible な image レイヤー）の画像を読み込む
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map = new Map<string, DecodedImageSource>();
      const visibleImageLayers = asset.layers.filter(
        (layer) => layer.layerType === 'image' && layer.visible && layer.textureId,
      );
      for (const layer of visibleImageLayers) {
        const texture = asset.textures.find((tex) => tex.id === layer.textureId);
        if (!texture) {
          continue;
        }
        try {
          const blob = await loadBlob(blobKeyFor(asset.id, texture.path));
          if (!blob) {
            continue;
          }
          map.set(layer.id, await decodeImageSource(blob));
        } catch {
          // 読み込めないレイヤーはプレビューに描画しない
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

  // カメラ位置 / bitmaps / asset が変わるたびに再描画する（rAF は使わない）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const width = canvas.clientWidth || 320;
    canvas.width = width;
    canvas.height = PREVIEW_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, width, PREVIEW_HEIGHT);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(0, 0, width, PREVIEW_HEIGHT);

    const scale = PREVIEW_HEIGHT / Math.max(1, asset.canvasSize.height);

    for (const layer of asset.layers) {
      if (layer.layerType !== 'image' || !layer.visible || !layer.textureId) {
        continue;
      }
      const decoded = bitmaps.get(layer.id);
      if (!decoded) {
        continue;
      }
      const parallaxX = layer.background?.parallaxSpeed.x ?? 0;
      const offsetX = layer.transform.position.x - camera * parallaxX;
      const drawWidth = decoded.width * scale;
      const drawHeight = decoded.height * scale;
      const y = layer.transform.position.y * scale;

      if (layer.background?.loopX && drawWidth > 0) {
        let startX = offsetX * scale;
        startX = ((startX % drawWidth) + drawWidth) % drawWidth;
        startX -= drawWidth;
        for (let x = startX; x < width; x += drawWidth) {
          ctx.drawImage(decoded.source, x, y, drawWidth, drawHeight);
        }
      } else {
        ctx.drawImage(decoded.source, offsetX * scale, y, drawWidth, drawHeight);
      }
    }
  }, [asset, bitmaps, camera]);

  return (
    <div className="background-preview">
      <canvas aria-label="背景プレビュー" ref={canvasRef} />
      <label className="editor-field">
        カメラ位置
        <input
          type="range"
          aria-label="カメラ位置"
          min={0}
          max={CAMERA_MAX}
          value={camera}
          onChange={(event) => setCamera(Number(event.target.value) || 0)}
        />
      </label>
    </div>
  );
}
