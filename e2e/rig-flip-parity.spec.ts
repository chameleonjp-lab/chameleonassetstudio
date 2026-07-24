import { expect, test } from '@playwright/test';

test('同じCanvas rendererで全Frameのtransform / RGBA parityを満たす', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const rigModulePath = '/src/core/rig/rig.ts';
    const flipModulePath = '/src/core/model/flipCopy.ts';
    const renderModulePath = '/src/renderers/canvas2d/render.ts';
    const [{ bakeRigAnimation }, { flipCopyAsset }, { renderScene }] = await Promise.all([
      import(rigModulePath),
      import(flipModulePath),
      import(renderModulePath),
    ]);

    const source = {
      format: 'chameleon-asset',
      version: '0.2.0',
      id: 'asset_pixel_parity',
      assetType: 'character',
      name: 'pixel_left',
      displayName: 'Pixel Left',
      canvasSize: { width: 96, height: 72 },
      origin: { x: 48, y: 64 },
      textures: [
        {
          id: 'texture_pixel',
          kind: 'edit',
          name: 'pixel',
          mimeType: 'image/png',
          size: { width: 19, height: 13 },
          path: 'textures/pixel.png',
        },
      ],
      layers: [
        {
          id: 'layer_root',
          name: 'body',
          layerType: 'image',
          visible: true,
          locked: false,
          opacity: 0.73,
          transform: {
            position: { x: 14, y: 28 },
            scale: { x: -1.3, y: 0.7 },
            rotation: 11,
          },
          textureId: 'texture_pixel',
        },
        {
          id: 'layer_mid',
          name: 'arm_left',
          layerType: 'image',
          visible: true,
          locked: false,
          opacity: 0.85,
          transform: {
            position: { x: 39, y: 24 },
            scale: { x: 0.6, y: -1.4 },
            rotation: -18,
          },
          textureId: 'texture_pixel',
        },
        {
          id: 'layer_leaf',
          name: 'hand_left',
          layerType: 'image',
          visible: true,
          locked: false,
          opacity: 0.65,
          transform: {
            position: { x: 65, y: 18 },
            scale: { x: -0.5, y: 1.8 },
            rotation: 7,
          },
          textureId: 'texture_pixel',
        },
      ],
      parts: [
        {
          id: 'part_root',
          name: 'root',
          partType: 'body',
          layerIds: ['layer_root'],
          pivot: { x: 28, y: 42 },
          bindPose: {
            localPosition: { x: 2, y: -1 },
            localRotation: 4,
            localScale: { x: 1.1, y: 0.9 },
          },
          rotationLimit: { min: -25, max: 35 },
        },
        {
          id: 'part_mid',
          name: 'arm_left',
          partType: 'arm_left',
          layerIds: ['layer_mid'],
          parentId: 'part_root',
          pivot: { x: 49, y: 32 },
          bindPose: {
            localPosition: { x: 3, y: 2 },
            localRotation: -8,
            localScale: { x: -0.8, y: 1.2 },
          },
          rotationLimit: { min: -40, max: 20 },
        },
        {
          id: 'part_leaf',
          name: 'hand_left',
          partType: 'other',
          layerIds: ['layer_leaf'],
          parentId: 'part_mid',
          pivot: { x: 72, y: 24 },
          bindPose: {
            localPosition: { x: -2, y: 1 },
            localScale: { x: 1.3, y: -0.7 },
          },
        },
      ],
      anchors: [],
      colliders: [],
      frames: [],
      animations: [],
      tags: [],
      gameAttributes: {},
      rigAnimations: [
        {
          id: 'rig_pixel_left',
          name: 'wave_left',
          fps: 3,
          loop: false,
          durationMs: 1000,
          keyframes: [
            {
              time: 0,
              poses: {
                part_root: { localRotation: 10 },
                part_mid: { localPosition: { x: 4, y: -2 } },
              },
            },
            {
              time: 0.5,
              poses: {
                part_mid: {
                  localRotation: 17,
                  localScale: { x: -1.2, y: 0.6 },
                },
              },
            },
            {
              time: 1,
              poses: {
                part_root: { localRotation: -15 },
                part_leaf: { localRotation: 33, localPosition: { x: 5, y: 3 } },
              },
            },
          ],
        },
      ],
      createdAt: '2026-07-24T00:00:00.000Z',
      updatedAt: '2026-07-24T00:00:00.000Z',
    };

    const flippedAfterBake = flipCopyAsset(bakeRigAnimation(source, source.rigAnimations[0]), {
      now: new Date('2026-07-24T00:00:00.000Z'),
    });
    const flippedRig = flipCopyAsset(source, {
      now: new Date('2026-07-24T00:00:00.000Z'),
    });
    const bakedAfterFlip = bakeRigAnimation(flippedRig, flippedRig.rigAnimations[0]);

    const bitmap = document.createElement('canvas');
    bitmap.width = 19;
    bitmap.height = 13;
    const bitmapContext = bitmap.getContext('2d')!;
    bitmapContext.clearRect(0, 0, bitmap.width, bitmap.height);
    bitmapContext.fillStyle = 'rgba(231, 76, 60, 0.9)';
    bitmapContext.fillRect(1, 1, 7, 11);
    bitmapContext.fillStyle = 'rgba(52, 152, 219, 0.55)';
    bitmapContext.fillRect(8, 2, 10, 5);
    bitmapContext.fillStyle = 'rgba(46, 204, 113, 0.8)';
    bitmapContext.fillRect(12, 8, 4, 3);

    type RuntimeTransform = {
      position: { x: number; y: number };
      scale: { x: number; y: number };
      rotation: number;
    };
    type RuntimeLayerState = {
      layerId: string;
      visible?: boolean;
      opacity?: number;
      transform?: RuntimeTransform;
    };
    type RuntimeAsset = {
      canvasSize: { width: number; height: number };
      textures: Array<{ id: string; size: { width: number; height: number } }>;
      layers: Array<{
        id: string;
        textureId?: string;
        visible: boolean;
        opacity: number;
        transform: RuntimeTransform;
      }>;
    };
    type RuntimeFrame = { layerStates: RuntimeLayerState[] };

    const renderFrame = (asset: RuntimeAsset, frame: RuntimeFrame): Uint8ClampedArray => {
      const states = new Map<string, RuntimeLayerState>(
        frame.layerStates.map((state: RuntimeLayerState) => [state.layerId, state]),
      );
      const canvas = document.createElement('canvas');
      canvas.width = asset.canvasSize.width;
      canvas.height = asset.canvasSize.height;
      const context = canvas.getContext('2d')!;
      renderScene(context, {
        view: { scale: 1, offsetX: 0, offsetY: 0 },
        viewport: asset.canvasSize,
        canvasSize: asset.canvasSize,
        layers: asset.layers.map((layer) => {
          const state = states.get(layer.id);
          const texture = asset.textures.find(({ id }) => id === layer.textureId)!;
          return {
            layer: {
              ...layer,
              visible: state?.visible ?? layer.visible,
              opacity: state?.opacity ?? layer.opacity,
              transform: state?.transform ?? layer.transform,
            },
            textureSize: texture.size,
            bitmap,
          };
        }),
        selectedLayerId: null,
      });
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };

    let maxTransformDifference = 0;
    let maxAlphaDifference = 0;
    let maxVisibleRgbDifference = 0;
    for (const [frameIndex, leftFrame] of flippedAfterBake.frames.entries()) {
      const rightFrame = bakedAfterFlip.frames[frameIndex];
      for (const [stateIndex, leftState] of leftFrame.layerStates.entries()) {
        const rightState = rightFrame.layerStates[stateIndex];
        const left = leftState.transform;
        const right = rightState.transform;
        const rotationDifference =
          ((((left.rotation - right.rotation + 180) % 360) + 360) % 360) - 180;
        maxTransformDifference = Math.max(
          maxTransformDifference,
          Math.abs(left.position.x - right.position.x),
          Math.abs(left.position.y - right.position.y),
          Math.abs(left.scale.x - right.scale.x),
          Math.abs(left.scale.y - right.scale.y),
          Math.abs(rotationDifference),
        );
      }

      const leftPixels = renderFrame(flippedAfterBake, leftFrame);
      const rightPixels = renderFrame(bakedAfterFlip, rightFrame);
      for (let index = 0; index < leftPixels.length; index += 4) {
        const leftAlpha = leftPixels[index + 3];
        const rightAlpha = rightPixels[index + 3];
        maxAlphaDifference = Math.max(maxAlphaDifference, Math.abs(leftAlpha - rightAlpha));
        if (leftAlpha > 0 || rightAlpha > 0) {
          maxVisibleRgbDifference = Math.max(
            maxVisibleRgbDifference,
            Math.abs(leftPixels[index] - rightPixels[index]),
            Math.abs(leftPixels[index + 1] - rightPixels[index + 1]),
            Math.abs(leftPixels[index + 2] - rightPixels[index + 2]),
          );
        }
      }
    }

    return {
      frameCount: flippedAfterBake.frames.length,
      rightFrameCount: bakedAfterFlip.frames.length,
      maxTransformDifference,
      maxAlphaDifference,
      maxVisibleRgbDifference,
    };
  });

  expect(result.frameCount).toBe(3);
  expect(result.rightFrameCount).toBe(result.frameCount);
  expect(result.maxTransformDifference).toBeLessThanOrEqual(1e-6);
  expect(result.maxAlphaDifference).toBeLessThanOrEqual(1);
  expect(result.maxVisibleRgbDifference).toBeLessThanOrEqual(1);
});
