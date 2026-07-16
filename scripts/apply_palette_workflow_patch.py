from pathlib import Path

editor_path = Path('src/features/editor/EditorScreen.tsx')
editor = editor_path.read_text()
css_path = Path('src/features/editor/editor.css')
css = css_path.read_text()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, got {count}')
    return text.replace(old, new, 1)


editor = replace_once(
    editor,
    """import {
  MAX_LAYER_IMAGE_EDGE,
  type AlphaInspection,
  type LayerImagePadding,
  type LayerResizeInterpolation,
} from '../../core/images/layerRepair';
""",
    """import {
  MAX_LAYER_IMAGE_EDGE,
  type AlphaInspection,
  type LayerImagePadding,
  type LayerResizeInterpolation,
} from '../../core/images/layerRepair';
import {
  MAX_PALETTE_COLORS,
  type PaletteExtraction,
} from '../../core/images/paletteExtraction';
""",
    'palette import',
)

editor = replace_once(
    editor,
    "import { runAlphaInspection } from '../../core/images/runAnalysis';",
    "import { runAlphaInspection, runPaletteExtraction } from '../../core/images/runAnalysis';",
    'analysis import',
)

editor = replace_once(
    editor,
    """interface AlphaInspectionState {
  assetId: string;
  layerId: string;
  textureId: string;
  result: AlphaInspection;
}
""",
    """interface AlphaInspectionState {
  assetId: string;
  layerId: string;
  textureId: string;
  result: AlphaInspection;
}

interface PaletteExtractionState {
  assetId: string;
  layerId: string;
  textureId: string;
  result: PaletteExtraction;
}
""",
    'palette state interface',
)

editor = replace_once(
    editor,
    """  const [alphaInspection, setAlphaInspection] = useState<AlphaInspectionState | null>(null);
  const [alphaInspecting, setAlphaInspecting] = useState(false);
  const [layerPadding, setLayerPadding] = useState<LayerImagePadding>({
""",
    """  const [alphaInspection, setAlphaInspection] = useState<AlphaInspectionState | null>(null);
  const [alphaInspecting, setAlphaInspecting] = useState(false);
  const [paletteMaxColors, setPaletteMaxColors] = useState(8);
  const [paletteAlphaThreshold, setPaletteAlphaThreshold] = useState(0);
  const [paletteExtraction, setPaletteExtraction] = useState<PaletteExtractionState | null>(null);
  const [paletteInspecting, setPaletteInspecting] = useState(false);
  const [layerPadding, setLayerPadding] = useState<LayerImagePadding>({
""",
    'palette state',
)

editor = replace_once(
    editor,
    '  const persistentMutationBlocked = historyState.isBusy || mutationBusy || alphaInspecting;',
    """  const persistentMutationBlocked =
    historyState.isBusy || mutationBusy || alphaInspecting || paletteInspecting;""",
    'mutation guard',
)

editor = replace_once(
    editor,
    """  const activeAlphaInspection =
    alphaInspection &&
    alphaInspection.assetId === selectedAsset?.id &&
    alphaInspection.layerId === selectedLayer?.id &&
    alphaInspection.textureId === selectedLayer?.textureId
      ? alphaInspection.result
      : null;
""",
    """  const activeAlphaInspection =
    alphaInspection &&
    alphaInspection.assetId === selectedAsset?.id &&
    alphaInspection.layerId === selectedLayer?.id &&
    alphaInspection.textureId === selectedLayer?.textureId
      ? alphaInspection.result
      : null;
  const activePaletteExtraction =
    paletteExtraction &&
    paletteExtraction.assetId === selectedAsset?.id &&
    paletteExtraction.layerId === selectedLayer?.id &&
    paletteExtraction.textureId === selectedLayer?.textureId
      ? paletteExtraction.result
      : null;
""",
    'active palette',
)

editor = replace_once(
    editor,
    """    setTextDraft(null);
    setAlphaInspection(null);
  }, [selectedAssetId, selectedLayerId]);
""",
    """    setTextDraft(null);
    setAlphaInspection(null);
    setPaletteExtraction(null);
  }, [selectedAssetId, selectedLayerId]);
""",
    'selection reset',
)

editor = replace_once(
    editor,
    """      setAlphaInspection(null);
      return true;
""",
    """      setAlphaInspection(null);
      setPaletteExtraction(null);
      return true;
""",
    'successful edit invalidation',
)

editor = replace_once(
    editor,
    """  const handleAlphaTrim = async () => {
    if (!activeAlphaInspection?.bounds || !activeAlphaInspection.hasTransparentMargin) {
      return;
    }
    const success = await applyImageEdit({ type: 'crop', rect: activeAlphaInspection.bounds });
    if (success) {
      setAlphaInspection(null);
    }
  };

""",
    """  const handleAlphaTrim = async () => {
    if (!activeAlphaInspection?.bounds || !activeAlphaInspection.hasTransparentMargin) {
      return;
    }
    const success = await applyImageEdit({ type: 'crop', rect: activeAlphaInspection.bounds });
    if (success) {
      setAlphaInspection(null);
    }
  };

  const handlePaletteExtract = async () => {
    if (!selectedAsset || !selectedLayer?.textureId) {
      setEditorError('パレットを抽出するレイヤーを選択してください。');
      return;
    }
    const texture = selectedAsset.textures.find((entry) => entry.id === selectedLayer.textureId);
    if (!texture) {
      setEditorError('レイヤーが参照するテクスチャが見つかりません。');
      return;
    }
    if (texture.kind !== 'edit') {
      setEditorError('元画像（source）は分析対象にできません。編集用画像を選択してください。');
      return;
    }
    if (persistentMutationBlocked || imageProcessing) {
      return;
    }

    setEditorError(null);
    setPaletteExtraction(null);
    setPaletteInspecting(true);
    setImageProcessing({ label: 'パレットを抽出', progress: 0 });
    try {
      const blob = await loadBlob(blobKeyFor(selectedAsset.id, texture.path));
      if (!blob) {
        throw new Error('編集用画像が見つかりません。');
      }
      const buffer = await blobToPixelBuffer(blob);
      const result = await runPaletteExtraction(
        buffer,
        paletteMaxColors,
        paletteAlphaThreshold,
        (progress) => setImageProcessing({ label: 'パレットを抽出', progress }),
      );
      setPaletteExtraction({
        assetId: selectedAsset.id,
        layerId: selectedLayer.id,
        textureId: texture.id,
        result,
      });
    } catch (error) {
      setEditorError(
        `パレットを抽出できませんでした: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setImageProcessing(null);
      setPaletteInspecting(false);
    }
  };

""",
    'palette handler',
)

editor = replace_once(
    editor,
    """              <button
                type="button"
                className="layer-flip-button"
                aria-pressed={selectedLayer.transform.scale.x < 0}
                onClick={() => {
                  if (selectedAsset) {
                    commitPanelChange(
                      '左右反転',
                      flipLayerHorizontal(selectedAsset, selectedLayer.id),
                    );
                  }
                }}
              >
                左右反転
              </button>
""",
    '',
    'remove standalone flip',
)

old_repair = """                <fieldset className="editor-fieldset">
                  <legend>パレット置換</legend>
                  <label className="editor-field">
                    対象色（スポイトで拾えます）
                    <input
                      type="color"
                      value={replaceFrom}
                      onChange={(event) => setReplaceFrom(event.target.value)}
                    />
                  </label>
                  <label className="editor-field">
                    置換色
                    <input
                      type="color"
                      value={replaceTo}
                      onChange={(event) => setReplaceTo(event.target.value)}
                    />
                  </label>
                  <label className="editor-field">
                    許容量（0-100）
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={replaceTolerance}
                      onChange={(event) => setReplaceTolerance(Number(event.target.value) || 0)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!!imageProcessing || persistentMutationBlocked}
                    onClick={() =>
                      void applyImageEdit({
                        type: 'replaceColor',
                        from: hexToRgb(replaceFrom),
                        to: hexToRgb(replaceTo),
                        tolerance: Math.round((replaceTolerance / 100) * 255),
                      })
                    }
                  >
                    パレット置換を適用
                  </button>
                </fieldset>

                <fieldset className="editor-fieldset">
                  <legend>輪郭線</legend>
                  <label className="editor-field">
                    輪郭線の色
                    <input
                      type="color"
                      value={outlineColor}
                      onChange={(event) => setOutlineColor(event.target.value)}
                    />
                  </label>
                  <label className="editor-field">
                    太さ（px）
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={outlineThickness}
                      onChange={(event) =>
                        setOutlineThickness(Math.max(1, Number(event.target.value) || 1))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!!imageProcessing || persistentMutationBlocked}
                    onClick={() =>
                      void applyImageEdit({
                        type: 'outline',
                        color: hexToRgb(outlineColor),
                        thickness: outlineThickness,
                      })
                    }
                  >
                    輪郭線を追加
                  </button>
                </fieldset>
"""

new_repair = """                <fieldset className="editor-fieldset">
                  <legend>パレット・色違い・輪郭・反転</legend>
                  <p className="editor-note">
                    選択中のedit画像から主要色を読み取り専用で抽出します。抽出結果は保存せず、swatchを選ぶと色置換の対象色へ設定できます。
                  </p>
                  <label className="editor-field">
                    抽出色数（1-{MAX_PALETTE_COLORS}）
                    <input
                      type="number"
                      aria-label="パレット抽出色数"
                      min={1}
                      max={MAX_PALETTE_COLORS}
                      step={1}
                      value={paletteMaxColors}
                      onChange={(event) => {
                        const next = Math.min(
                          MAX_PALETTE_COLORS,
                          Math.max(1, Math.round(Number(event.target.value) || 1)),
                        );
                        setPaletteMaxColors(next);
                        setPaletteExtraction(null);
                      }}
                    />
                  </label>
                  <label className="editor-field">
                    palette alphaしきい値（0-255）
                    <input
                      type="number"
                      aria-label="パレットalphaしきい値"
                      min={0}
                      max={255}
                      step={1}
                      value={paletteAlphaThreshold}
                      onChange={(event) => {
                        const next = Math.min(
                          255,
                          Math.max(0, Math.round(Number(event.target.value) || 0)),
                        );
                        setPaletteAlphaThreshold(next);
                        setPaletteExtraction(null);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!!imageProcessing || persistentMutationBlocked}
                    onClick={() => void handlePaletteExtract()}
                  >
                    パレットを抽出
                  </button>
                  {activePaletteExtraction && (
                    <div className="palette-result" aria-label="抽出パレット">
                      <p className="editor-note">
                        表示pixel {activePaletteExtraction.visiblePixelCount} / 透明扱い{' '}
                        {activePaletteExtraction.transparentPixelCount} / RGB{' '}
                        {activePaletteExtraction.quantizationBits}-bit量子化
                      </p>
                      {activePaletteExtraction.colors.length === 0 ? (
                        <p role="alert" className="editor-note">
                          しきい値を超える色がありません。
                        </p>
                      ) : (
                        <div className="palette-swatch-list">
                          {activePaletteExtraction.colors.map((entry) => {
                            const hex = rgbToHex(entry.color);
                            return (
                              <button
                                key={`${hex}-${entry.count}`}
                                type="button"
                                className="palette-swatch-button"
                                aria-label={`抽出色 ${hex} を置換元に設定`}
                                onClick={() => {
                                  setReplaceFrom(hex);
                                  setEditorError(null);
                                }}
                              >
                                <span
                                  className="palette-swatch-chip"
                                  style={{ backgroundColor: hex }}
                                  aria-hidden="true"
                                />
                                <span>
                                  {hex} · {entry.count}px ·{' '}
                                  {Math.round(entry.coverage * 1000) / 10}%
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <h4 className="repair-section-heading">色置換</h4>
                  <label className="editor-field">
                    対象色（スポイトまたは抽出paletteから選べます）
                    <input
                      type="color"
                      aria-label="色置換の対象色"
                      value={replaceFrom}
                      onChange={(event) => setReplaceFrom(event.target.value)}
                    />
                  </label>
                  <label className="editor-field">
                    置換色
                    <input
                      type="color"
                      aria-label="色置換の置換色"
                      value={replaceTo}
                      onChange={(event) => setReplaceTo(event.target.value)}
                    />
                  </label>
                  <label className="editor-field">
                    許容量（0-100）
                    <input
                      type="number"
                      aria-label="色置換の許容量"
                      min={0}
                      max={100}
                      value={replaceTolerance}
                      onChange={(event) => setReplaceTolerance(Number(event.target.value) || 0)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!!imageProcessing || persistentMutationBlocked}
                    onClick={() =>
                      void applyImageEdit({
                        type: 'replaceColor',
                        from: hexToRgb(replaceFrom),
                        to: hexToRgb(replaceTo),
                        tolerance: Math.round((replaceTolerance / 100) * 255),
                      })
                    }
                  >
                    パレット置換を適用
                  </button>

                  <h4 className="repair-section-heading">輪郭線</h4>
                  <label className="editor-field">
                    輪郭線の色
                    <input
                      type="color"
                      aria-label="輪郭線の色"
                      value={outlineColor}
                      onChange={(event) => setOutlineColor(event.target.value)}
                    />
                  </label>
                  <label className="editor-field">
                    太さ（px）
                    <input
                      type="number"
                      aria-label="輪郭線の太さ"
                      min={1}
                      max={16}
                      value={outlineThickness}
                      onChange={(event) =>
                        setOutlineThickness(Math.max(1, Number(event.target.value) || 1))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!!imageProcessing || persistentMutationBlocked}
                    onClick={() =>
                      void applyImageEdit({
                        type: 'outline',
                        color: hexToRgb(outlineColor),
                        thickness: outlineThickness,
                      })
                    }
                  >
                    輪郭線を追加
                  </button>

                  <h4 className="repair-section-heading">レイヤー反転</h4>
                  <button
                    type="button"
                    className="layer-flip-button"
                    aria-pressed={selectedLayer.transform.scale.x < 0}
                    disabled={!!imageProcessing || persistentMutationBlocked}
                    onClick={() => {
                      if (selectedAsset) {
                        commitPanelChange(
                          '左右反転',
                          flipLayerHorizontal(selectedAsset, selectedLayer.id),
                        );
                      }
                    }}
                  >
                    左右反転
                  </button>
                </fieldset>
"""

editor = replace_once(editor, old_repair, new_repair, 'repair workflow fieldsets')

css = replace_once(
    css,
    """.editor-button-row button {
  align-self: auto;
}

""",
    """.editor-button-row button {
  align-self: auto;
}

.palette-result {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.palette-swatch-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.editor-fieldset .palette-swatch-button {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  text-align: left;
  padding: 0.35rem 0.45rem;
}

.palette-swatch-chip {
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid #8888;
  border-radius: 4px;
  flex: none;
}

.repair-section-heading {
  margin: 0.25rem 0 0;
  padding-top: 0.5rem;
  border-top: 1px dashed #8885;
  font-size: 0.82rem;
}

""",
    'palette styles',
)

editor_path.write_text(editor)
css_path.write_text(css)
