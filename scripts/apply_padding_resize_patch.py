from pathlib import Path

path = Path('src/features/editor/EditorScreen.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, got {count}')
    text = text.replace(old, new, 1)


replace_once(
    "import { type AlphaInspection } from '../../core/images/layerRepair';",
    """import {
  MAX_LAYER_IMAGE_EDGE,
  type AlphaInspection,
  type LayerImagePadding,
  type LayerResizeInterpolation,
} from '../../core/images/layerRepair';""",
    'layerRepair import',
)

replace_once(
    """  type AssetType,
  type Project,
  type Vec2,""",
    """  type AssetType,
  type Layer,
  type Project,
  type Size,
  type Vec2,""",
    'model type imports',
)

replace_once(
    """function roundValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function syncProjectAssetSummary""",
    """function roundValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function repairedLayerPosition(
  layer: Layer,
  oldSize: Size,
  operation: ImageOperation,
  nextSize: Size,
): Vec2 {
  if (operation.type === 'crop' || operation.type === 'padLayerImage') {
    const sourceX =
      operation.type === 'crop'
        ? Math.max(0, Math.floor(operation.rect.x))
        : -operation.padding.left;
    const sourceY =
      operation.type === 'crop'
        ? Math.max(0, Math.floor(operation.rect.y))
        : -operation.padding.top;
    const localCenter = {
      x: sourceX + nextSize.width / 2 - oldSize.width / 2,
      y: sourceY + nextSize.height / 2 - oldSize.height / 2,
    };
    const worldCenter = layerWorldPoint(layer, oldSize, localCenter);
    return {
      x: worldCenter.x - nextSize.width / 2,
      y: worldCenter.y - nextSize.height / 2,
    };
  }
  if (operation.type === 'resizeLayerImage') {
    return {
      x: layer.transform.position.x + (oldSize.width - nextSize.width) / 2,
      y: layer.transform.position.y + (oldSize.height - nextSize.height) / 2,
    };
  }
  return layer.transform.position;
}

function layerExtendsOutsideCanvas(
  layer: Layer,
  position: Vec2,
  textureSize: Size,
  canvasSize: Size,
): boolean {
  const previewLayer: Layer = {
    ...layer,
    transform: { ...layer.transform, position },
  };
  const corners = [
    { x: -textureSize.width / 2, y: -textureSize.height / 2 },
    { x: textureSize.width / 2, y: -textureSize.height / 2 },
    { x: textureSize.width / 2, y: textureSize.height / 2 },
    { x: -textureSize.width / 2, y: textureSize.height / 2 },
  ].map((point) => layerWorldPoint(previewLayer, textureSize, point));
  return corners.some(
    (point) =>
      point.x < 0 ||
      point.y < 0 ||
      point.x > canvasSize.width ||
      point.y > canvasSize.height,
  );
}

function syncProjectAssetSummary""",
    'repair helpers',
)

replace_once(
    """  const [alphaInspection, setAlphaInspection] = useState<AlphaInspectionState | null>(null);
  const [alphaInspecting, setAlphaInspecting] = useState(false);""",
    """  const [alphaInspection, setAlphaInspection] = useState<AlphaInspectionState | null>(null);
  const [alphaInspecting, setAlphaInspecting] = useState(false);
  const [layerPadding, setLayerPadding] = useState<LayerImagePadding>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  const [layerResizeWidth, setLayerResizeWidth] = useState(1);
  const [layerResizeHeight, setLayerResizeHeight] = useState(1);
  const [layerResizeInterpolation, setLayerResizeInterpolation] =
    useState<LayerResizeInterpolation>('nearest');""",
    'repair state',
)

replace_once(
    """  const selectedAnimation =
    selectedAsset?.animations.find((animation) => animation.id === selectedAnimationId) ?? null;""",
    """  useEffect(() => {
    if (!selectedTextureSize) {
      return;
    }
    setLayerResizeWidth(selectedTextureSize.width);
    setLayerResizeHeight(selectedTextureSize.height);
  }, [selectedTextureSize?.height, selectedTextureSize?.width]);

  const paddingOutputSize = selectedTextureSize
    ? {
        width: selectedTextureSize.width + layerPadding.left + layerPadding.right,
        height: selectedTextureSize.height + layerPadding.top + layerPadding.bottom,
      }
    : null;
  const paddingOutputValid =
    !!paddingOutputSize &&
    paddingOutputSize.width >= 1 &&
    paddingOutputSize.height >= 1 &&
    paddingOutputSize.width <= MAX_LAYER_IMAGE_EDGE &&
    paddingOutputSize.height <= MAX_LAYER_IMAGE_EDGE;
  const paddingHasChange = Object.values(layerPadding).some((value) => value > 0);
  const paddingPreviewPosition =
    selectedLayer && selectedTextureSize && paddingOutputSize && paddingOutputValid
      ? repairedLayerPosition(
          selectedLayer,
          selectedTextureSize,
          { type: 'padLayerImage', padding: layerPadding },
          paddingOutputSize,
        )
      : null;
  const paddingExtendsOutside =
    !!selectedAsset &&
    !!selectedLayer &&
    !!paddingOutputSize &&
    !!paddingPreviewPosition &&
    layerExtendsOutsideCanvas(
      selectedLayer,
      paddingPreviewPosition,
      paddingOutputSize,
      selectedAsset.canvasSize,
    );

  const resizeOutputSize = { width: layerResizeWidth, height: layerResizeHeight };
  const resizeOutputValid =
    Number.isInteger(layerResizeWidth) &&
    Number.isInteger(layerResizeHeight) &&
    layerResizeWidth >= 1 &&
    layerResizeHeight >= 1 &&
    layerResizeWidth <= MAX_LAYER_IMAGE_EDGE &&
    layerResizeHeight <= MAX_LAYER_IMAGE_EDGE;
  const resizeHasChange =
    !!selectedTextureSize &&
    (layerResizeWidth !== selectedTextureSize.width ||
      layerResizeHeight !== selectedTextureSize.height);
  const resizePreviewPosition =
    selectedLayer && selectedTextureSize && resizeOutputValid
      ? repairedLayerPosition(
          selectedLayer,
          selectedTextureSize,
          {
            type: 'resizeLayerImage',
            width: layerResizeWidth,
            height: layerResizeHeight,
            interpolation: layerResizeInterpolation,
          },
          resizeOutputSize,
        )
      : null;
  const resizeExtendsOutside =
    !!selectedAsset &&
    !!selectedLayer &&
    !!resizePreviewPosition &&
    resizeOutputValid &&
    layerExtendsOutsideCanvas(
      selectedLayer,
      resizePreviewPosition,
      resizeOutputSize,
      selectedAsset.canvasSize,
    );

  const selectedAnimation =
    selectedAsset?.animations.find((animation) => animation.id === selectedAnimationId) ?? null;""",
    'repair previews',
)

replace_once(
    """      let nextLayers = before.layers;
      if (operation.type === 'crop') {
        // 残った領域の見た目の位置を維持する
        const clampedX = Math.max(0, Math.floor(operation.rect.x));
        const clampedY = Math.max(0, Math.floor(operation.rect.y));
        const localCenter = {
          x: clampedX + afterBuffer.width / 2 - texture.size.width / 2,
          y: clampedY + afterBuffer.height / 2 - texture.size.height / 2,
        };
        const worldCenter = layerWorldPoint(selectedLayer, texture.size, localCenter);
        nextLayers = before.layers.map((layer) =>
          layer.id === selectedLayer.id
            ? {
                ...layer,
                transform: {
                  ...layer.transform,
                  position: {
                    x: worldCenter.x - afterBuffer.width / 2,
                    y: worldCenter.y - afterBuffer.height / 2,
                  },
                },
              }
            : layer,
        );
      }""",
    """      let nextLayers = before.layers;
      if (
        operation.type === 'crop' ||
        operation.type === 'padLayerImage' ||
        operation.type === 'resizeLayerImage'
      ) {
        const nextPosition = repairedLayerPosition(selectedLayer, texture.size, operation, {
          width: afterBuffer.width,
          height: afterBuffer.height,
        });
        nextLayers = before.layers.map((layer) =>
          layer.id === selectedLayer.id
            ? {
                ...layer,
                transform: { ...layer.transform, position: nextPosition },
              }
            : layer,
        );
      }""",
    'position adjustment',
)

replace_once(
    """                  )}
                </fieldset>

                <label className="editor-field">
                  背景透過の許容量（0-100）""",
    """                  )}
                </fieldset>

                <fieldset className="editor-fieldset">
                  <legend>透明padding</legend>
                  <p className="editor-note">
                    選択画像の周囲へ透明pixelを追加します。元の内容がworld上で動かないようLayer位置を補正し、Asset canvasとゲーム情報は変更しません。
                  </p>
                  {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                    <label className="editor-field" key={side}>
                      padding {side}（px）
                      <input
                        type="number"
                        aria-label={`padding ${side}`}
                        min={0}
                        max={MAX_LAYER_IMAGE_EDGE}
                        step={1}
                        value={layerPadding[side]}
                        onChange={(event) =>
                          setLayerPadding((current) => ({
                            ...current,
                            [side]: Math.min(
                              MAX_LAYER_IMAGE_EDGE,
                              Math.max(0, Math.round(Number(event.target.value) || 0)),
                            ),
                          }))
                        }
                      />
                    </label>
                  ))}
                  {paddingOutputSize && (
                    <p className="editor-note" aria-label="padding変更後preview">
                      変更後: {paddingOutputSize.width} x {paddingOutputSize.height}px
                      {paddingPreviewPosition
                        ? ` / Layer位置 x ${roundValue(paddingPreviewPosition.x)}, y ${roundValue(
                            paddingPreviewPosition.y,
                          )}`
                        : ''}
                    </p>
                  )}
                  {!paddingOutputValid && (
                    <p role="alert" className="editor-note">
                      変更後の幅と高さは1〜{MAX_LAYER_IMAGE_EDGE}pxにしてください。
                    </p>
                  )}
                  {paddingExtendsOutside && (
                    <p role="alert" className="editor-note">
                      変更後のLayer画像はAsset canvas外へはみ出します。canvasは自動拡張しません。
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={
                      !paddingHasChange ||
                      !paddingOutputValid ||
                      !!imageProcessing ||
                      persistentMutationBlocked
                    }
                    onClick={() =>
                      void applyImageEdit({ type: 'padLayerImage', padding: layerPadding })
                    }
                  >
                    透明paddingを追加
                  </button>
                </fieldset>

                <fieldset className="editor-fieldset">
                  <legend>Layer画像リサイズ</legend>
                  <p className="editor-note">
                    Layer中心を固定して選択画像だけをリサイズします。pixel artはnearest、写真・滑らかな素材はsmoothが基本です。Asset canvasとゲーム情報は変更しません。
                  </p>
                  <label className="editor-field">
                    リサイズ後の幅（px）
                    <input
                      type="number"
                      aria-label="リサイズ後の幅"
                      min={1}
                      max={MAX_LAYER_IMAGE_EDGE}
                      step={1}
                      value={layerResizeWidth}
                      onChange={(event) =>
                        setLayerResizeWidth(Math.round(Number(event.target.value) || 0))
                      }
                    />
                  </label>
                  <label className="editor-field">
                    リサイズ後の高さ（px）
                    <input
                      type="number"
                      aria-label="リサイズ後の高さ"
                      min={1}
                      max={MAX_LAYER_IMAGE_EDGE}
                      step={1}
                      value={layerResizeHeight}
                      onChange={(event) =>
                        setLayerResizeHeight(Math.round(Number(event.target.value) || 0))
                      }
                    />
                  </label>
                  <label className="editor-field">
                    補間方法
                    <select
                      aria-label="リサイズ補間方法"
                      value={layerResizeInterpolation}
                      onChange={(event) =>
                        setLayerResizeInterpolation(event.target.value as LayerResizeInterpolation)
                      }
                    >
                      <option value="nearest">nearest（pixel art向け）</option>
                      <option value="smooth">smooth（滑らか）</option>
                    </select>
                  </label>
                  {selectedTextureSize && resizeOutputValid && (
                    <p className="editor-note" aria-label="リサイズ変更後preview">
                      変更前: {selectedTextureSize.width} x {selectedTextureSize.height}px / 変更後:{' '}
                      {layerResizeWidth} x {layerResizeHeight}px
                      {resizePreviewPosition
                        ? ` / Layer位置 x ${roundValue(resizePreviewPosition.x)}, y ${roundValue(
                            resizePreviewPosition.y,
                          )}`
                        : ''}
                    </p>
                  )}
                  {!resizeOutputValid && (
                    <p role="alert" className="editor-note">
                      変更後の幅と高さは1〜{MAX_LAYER_IMAGE_EDGE}pxの整数にしてください。
                    </p>
                  )}
                  {resizeExtendsOutside && (
                    <p role="alert" className="editor-note">
                      変更後のLayer画像はAsset canvas外へはみ出します。canvasは自動拡張しません。
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={
                      !resizeHasChange ||
                      !resizeOutputValid ||
                      !!imageProcessing ||
                      persistentMutationBlocked
                    }
                    onClick={() =>
                      void applyImageEdit({
                        type: 'resizeLayerImage',
                        width: layerResizeWidth,
                        height: layerResizeHeight,
                        interpolation: layerResizeInterpolation,
                      })
                    }
                  >
                    Layer画像をリサイズ
                  </button>
                </fieldset>

                <label className="editor-field">
                  背景透過の許容量（0-100）""",
    'repair controls',
)

path.write_text(text)
