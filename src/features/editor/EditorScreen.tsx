import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { History } from '../../core/history/history';
import { blobKeyFor, importImageAsLayer, importImageFile } from '../../core/images/importImage';
import { assertImageBatchCount } from '../../core/input/inputSafety';
import {
  imageOperationLabel as operationLabel,
  type ImageOperation,
} from '../../core/images/imageOperation';
import { hexToRgb, rgbToHex, type Rect } from '../../core/images/operations';
import {
  copySelectionPixels,
  type RasterSelection,
  type SelectionClipboard,
} from '../../core/images/rasterFoundation';
import {
  blobToPixelBuffer,
  pixelBufferToBlob,
  runImageOperation,
} from '../../core/images/runOperation';
import {
  addAnchor,
  addGuideLayer,
  applyFrameToAsset,
  assetCreationTemplatesForType,
  defaultAssetCreationTemplateId,
  duplicateAsset,
  flipCopyAsset,
  flipLayerHorizontal,
  renameLayer,
  ASSET_TYPES,
  type AnchorRole,
  type Asset,
  type AssetCreationTemplateId,
  type AssetType,
  type Project,
  type Vec2,
} from '../../core/model';
import {
  AutosaveQueue,
  cancelSnapshotRestore,
  commitSnapshotRestore,
  deleteAssetBundle,
  listProjectAssets,
  listSnapshots,
  loadBlob,
  loadProject,
  prepareSnapshotRestore,
  saveAsset,
  saveAssetRevision,
  saveProject,
  saveProjectBundle,
  saveSnapshot,
  type AssetSnapshotSummary,
  type SaveState,
  type SourceBlobTransitions,
} from '../../core/storage';
import { layerWorldPoint } from '../../renderers/canvas2d/view';
import { AssetTypePanel, BackgroundLayerFields } from './AssetTypePanel';
import { ASSET_TYPE_LABELS } from './assetTypeLabels';
import {
  BLANK_CANVAS_PRESETS,
  blankCanvasSizeForPreset,
  createBlankAssetBundle,
  DEFAULT_BLANK_CANVAS_PRESET_ID,
  DEFAULT_BLANK_CANVAS_SIZE,
  type BlankCanvasPresetId,
} from './blankAsset';
import {
  CanvasEditor,
  type PastePreviewState,
  type RasterTextDraft,
  type RasterTextFontFamily,
} from './CanvasEditor';
import { LAYER_TOOLS, SELECTION_AWARE_TOOLS, type CanvasTool } from './canvasTools';
import {
  canStartPersistentMutation,
  commitPersistentMutationWithHistory,
} from './editorMutationGuard';
import { ExportPanel } from './ExportPanel';
import { GameAttributesPanel } from './GameAttributesPanel';
import { GameDataPanel } from './GameDataPanel';
import { LayerPanel } from './LayerPanel';
import { PartPanel } from './PartPanel';
import { RigPanel } from './RigPanel';
import { TimelinePanel } from './TimelinePanel';
import { applyEditSnap } from './snap';
import './editor.css';

type MobileView = 'canvas' | 'properties' | 'timeline' | 'export';

interface EditorScreenProps {
  projectId: string;
  onBackToHome: () => void;
}

function useSaveState(queue: AutosaveQueue): SaveState {
  const subscribe = useCallback((onChange: () => void) => queue.subscribe(onChange), [queue]);
  return useSyncExternalStore(subscribe, () => queue.getState());
}

function saveStatusText(state: SaveState): string {
  switch (state.status) {
    case 'saving':
      return '保存中…';
    case 'saved':
      return '保存済み';
    case 'error':
      return `保存失敗: ${state.errorMessage ?? '不明なエラー'}`;
    default:
      return '';
  }
}

function roundValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function syncProjectAssetSummary(project: Project | null, asset: Asset): Project | null {
  if (!project || !project.assets.some((entry) => entry.id === asset.id)) {
    return project;
  }
  return {
    ...project,
    assets: project.assets.map((entry) =>
      entry.id === asset.id
        ? {
            id: asset.id,
            name: asset.name,
            displayName: asset.displayName,
            assetType: asset.assetType,
          }
        : entry,
    ),
    updatedAt: project.updatedAt < asset.updatedAt ? asset.updatedAt : project.updatedAt,
  };
}

const IMPORT_ACCEPT = 'image/png,image/jpeg,image/webp';

interface ImageProcessingState {
  label: string;
  progress: number;
}

export function EditorScreen({ projectId, onBackToHome }: EditorScreenProps) {
  const autosaveRef = useRef<AutosaveQueue | null>(null);
  autosaveRef.current ??= new AutosaveQueue();
  const autosave = autosaveRef.current;
  const saveState = useSaveState(autosave);

  const historyRef = useRef<History | null>(null);
  historyRef.current ??= new History();
  const history = historyRef.current;
  const subscribeHistory = useCallback(
    (onChange: () => void) => history.subscribe(onChange),
    [history],
  );
  const historyState = useSyncExternalStore(subscribeHistory, () => history.getState());

  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [checkedLayerIds, setCheckedLayerIds] = useState<string[]>([]);
  const [showColliders, setShowColliders] = useState(true);
  const [selectedColliderId, setSelectedColliderId] = useState<string | null>(null);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [gridSize, setGridSize] = useState(16);
  const [gridSizeMode, setGridSizeMode] = useState<'8' | '16' | '32' | 'custom'>('16');
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [newAnchorRole, setNewAnchorRole] = useState<AnchorRole>('foot');
  const [tool, setTool] = useState<CanvasTool>('select');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [imageProcessing, setImageProcessing] = useState<ImageProcessingState | null>(null);
  const mutationBusyRef = useRef(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('canvas');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const layerEditBeforeRef = useRef<Asset | null>(null);

  // 新規アセット作成フォーム（2D-2-CREATE-01）。画像を取り込まず、型とサイズだけで空キャンバスを作る。
  const [newAssetName, setNewAssetName] = useState('新規アセット');
  const [newAssetType, setNewAssetType] = useState<AssetType>('character');
  const [newAssetSizePreset, setNewAssetSizePreset] = useState<BlankCanvasPresetId>(
    DEFAULT_BLANK_CANVAS_PRESET_ID,
  );
  const [newAssetWidth, setNewAssetWidth] = useState(String(DEFAULT_BLANK_CANVAS_SIZE));
  const [newAssetHeight, setNewAssetHeight] = useState(String(DEFAULT_BLANK_CANVAS_SIZE));
  const [newAssetTemplateId, setNewAssetTemplateId] = useState<AssetCreationTemplateId>(
    defaultAssetCreationTemplateId('character'),
  );
  const [newAssetCreateBodyPart, setNewAssetCreateBodyPart] = useState(false);
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [duplicatingAsset, setDuplicatingAsset] = useState(false);
  const [deletingAsset, setDeletingAsset] = useState(false);

  const handleNewAssetTypeChange = (assetType: AssetType) => {
    setNewAssetType(assetType);
    setNewAssetTemplateId(defaultAssetCreationTemplateId(assetType));
    setNewAssetCreateBodyPart(false);
  };

  const handleNewAssetPresetChange = (presetId: BlankCanvasPresetId) => {
    setNewAssetSizePreset(presetId);
    const presetSize = blankCanvasSizeForPreset(presetId);
    if (presetSize) {
      setNewAssetWidth(String(presetSize.width));
      setNewAssetHeight(String(presetSize.height));
    }
  };

  const handleNewAssetDimensionChange = (dimension: 'width' | 'height', value: string) => {
    setNewAssetSizePreset('custom');
    if (dimension === 'width') {
      setNewAssetWidth(value);
    } else {
      setNewAssetHeight(value);
    }
  };

  const newAssetTemplates = assetCreationTemplatesForType(newAssetType);

  // タイムライン（Phase 9）
  const [selectedAnimationId, setSelectedAnimationId] = useState<string | null>(null);
  const [previewFrameId, setPreviewFrameId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIndexRef = useRef(0);

  // 画像編集パラメータ
  const [eraserSize, setEraserSize] = useState(16);
  const [brushSize, setBrushSize] = useState(8);
  const [rasterColor, setRasterColor] = useState('#000000');
  const [fillTolerance, setFillTolerance] = useState(0);
  const [bgTolerance, setBgTolerance] = useState(30);
  const [hsl, setHsl] = useState({ hue: 0, saturation: 0, lightness: 0 });
  const [replaceFrom, setReplaceFrom] = useState('#ffffff');
  const [replaceTo, setReplaceTo] = useState('#ff0000');
  const [replaceTolerance, setReplaceTolerance] = useState(20);
  const [outlineColor, setOutlineColor] = useState('#000000');
  const [outlineThickness, setOutlineThickness] = useState(2);

  // 単一layerのrectangular selection（契約 §6 / §10.4）。すべて一時UI状態でAsset / Project / Historyへは保存しない。
  const [selection, setSelection] = useState<RasterSelection | null>(null);
  const [selectionClipboard, setSelectionClipboard] = useState<SelectionClipboard | null>(null);
  const [pastePreview, setPastePreview] = useState<PastePreviewState | null>(null);
  const [pastePreviewPosition, setPastePreviewPosition] = useState<Vec2 | null>(null);

  // raster textの確定前preview（契約 §5 A）。text文字列・font・sizeはAsset / Projectへ保存しない。
  const [textDraft, setTextDraft] = useState<RasterTextDraft | null>(null);
  const [textFontFamily, setTextFontFamily] = useState<RasterTextFontFamily>('sans-serif');
  const [textSize, setTextSize] = useState(24);

  // 破壊的画像編集の復旧点（Phase 2D-1B-STORAGE §C）。選択中アセットの一覧を保持する。
  const [snapshots, setSnapshots] = useState<AssetSnapshotSummary[]>([]);

  const reloadSnapshots = useCallback(async (assetId: string | null) => {
    if (!assetId) {
      setSnapshots([]);
      return;
    }
    try {
      setSnapshots(await listSnapshots(assetId));
    } catch {
      setSnapshots([]);
    }
  }, []);

  useEffect(() => {
    void reloadSnapshots(selectedAssetId);
  }, [selectedAssetId, reloadSnapshots]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProject(projectId), listProjectAssets(projectId)])
      .then(([{ project: loaded }, loadedAssets]) => {
        if (cancelled) {
          return;
        }
        setProject(loaded);
        setAssets(loadedAssets);
        setSelectedAssetId(loadedAssets[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const persistentMutationBlocked = historyState.isBusy || mutationBusy;

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null;
  const selectedLayer = selectedAsset?.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedTextureSize =
    selectedAsset?.textures.find((texture) => texture.id === selectedLayer?.textureId)?.size ??
    null;
  const selectedAnimation =
    selectedAsset?.animations.find((animation) => animation.id === selectedAnimationId) ?? null;
  /** タイムラインでプレビュー中のフレームをレイヤーへ適用したアセット（キャンバス表示用）。 */
  const previewAsset =
    selectedAsset && previewFrameId
      ? applyFrameToAsset(selectedAsset, previewFrameId)
      : selectedAsset;

  useEffect(() => {
    if (
      selectedColliderId &&
      !selectedAsset?.colliders.some((collider) => collider.id === selectedColliderId)
    ) {
      setSelectedColliderId(null);
    }
  }, [selectedAsset, selectedColliderId]);

  const canStartEditorPersistentMutation = useCallback(() => {
    return canStartPersistentMutation({
      history,
      mutationBusy: mutationBusyRef.current,
      onReject: setEditorError,
    });
  }, [history]);

  const beginEditorPersistentMutation = useCallback(() => {
    if (!canStartEditorPersistentMutation()) {
      return false;
    }
    mutationBusyRef.current = true;
    setMutationBusy(true);
    return true;
  }, [canStartEditorPersistentMutation]);

  const endEditorPersistentMutation = useCallback(() => {
    mutationBusyRef.current = false;
    setMutationBusy(false);
  }, []);

  /** アセットのスナップショットを適用して自動保存する（Undo / Redo からも使う）。 */
  const applyAssetSnapshot = useCallback(
    (snapshot: Asset) => {
      setAssets((prev) => prev.map((asset) => (asset.id === snapshot.id ? snapshot : asset)));
      setProject((current) => syncProjectAssetSummary(current, snapshot));
      autosave.schedule(() => saveAsset(projectId, snapshot));
    },
    [autosave, projectId],
  );

  /** Blob 変更を含む改訂は保存成功後だけ React 状態へ反映し、Asset 単体 autosave は予約しない。 */
  const saveAssetRevisionAndApply = useCallback(
    async (
      snapshot: Asset,
      options: {
        putBlobs?: Array<{ key: string; blob: Blob }>;
        deleteBlobKeys?: string[];
        sourceBlobTransitions?: SourceBlobTransitions;
      } = {},
    ) => {
      await autosave.flush();
      await saveAssetRevision({
        projectId,
        asset: snapshot,
        putBlobs: options.putBlobs,
        deleteBlobKeys: options.deleteBlobKeys,
        sourceBlobTransitions: options.sourceBlobTransitions,
      });
      setAssets((prev) => prev.map((asset) => (asset.id === snapshot.id ? snapshot : asset)));
      setProject((current) => syncProjectAssetSummary(current, snapshot));
    },
    [autosave, projectId],
  );

  const handleHistoryUndo = useCallback(async () => {
    if (
      !canStartPersistentMutation({
        history,
        mutationBusy: mutationBusyRef.current,
        onReject: setEditorError,
      })
    ) {
      return;
    }
    try {
      setEditorError(null);
      await history.undo();
    } catch (error) {
      setEditorError(
        `元に戻せませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, [history]);

  const handleHistoryRedo = useCallback(async () => {
    if (
      !canStartPersistentMutation({
        history,
        mutationBusy: mutationBusyRef.current,
        onReject: setEditorError,
      })
    ) {
      return;
    }
    try {
      setEditorError(null);
      await history.redo();
    } catch (error) {
      setEditorError(
        `やり直せませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, [history]);

  /** 変更を適用し、履歴へ積む。 */
  const commitAssetChange = useCallback(
    (label: string, before: Asset, next: Asset) => {
      if (!canStartEditorPersistentMutation()) {
        return;
      }
      const pushed = history.push({
        label,
        undo: () => applyAssetSnapshot(before),
        redo: () => applyAssetSnapshot(next),
      });
      if (!pushed) {
        setEditorError('元に戻す／やり直す処理中です。完了後に操作してください。');
        return;
      }
      applyAssetSnapshot(next);
    },
    [applyAssetSnapshot, canStartEditorPersistentMutation, history],
  );

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y で Undo / Redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        void handleHistoryUndo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        void handleHistoryRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleHistoryRedo, handleHistoryUndo]);

  // Escで selection・copy buffer・paste preview・text draftを解除する（契約 §6 / §10.4）
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      setSelection(null);
      setSelectionClipboard(null);
      setPastePreview(null);
      setPastePreviewPosition(null);
      setTextDraft(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // アセットを切り替えたらタイムラインの選択・再生状態をリセットする
  useEffect(() => {
    setSelectedAnimationId(null);
    setPreviewFrameId(null);
    setIsPlaying(false);
    setSelectedColliderId(null);
    playbackIndexRef.current = 0;
  }, [selectedAssetId]);

  // アセット / レイヤーを切り替えたらselection・copy buffer・paste preview・text draftを解除する
  // （selectionはsingle-layerのため、レイヤーが変わったら維持しない。契約 §6 / §10.4）
  useEffect(() => {
    setSelection(null);
    setSelectionClipboard(null);
    setPastePreview(null);
    setPastePreviewPosition(null);
    setTextDraft(null);
  }, [selectedAssetId, selectedLayerId]);

  // selection-aware以外のtoolへ切り替えたらselection・copy bufferを解除する
  useEffect(() => {
    if (!SELECTION_AWARE_TOOLS.includes(tool)) {
      setSelection(null);
      setSelectionClipboard(null);
    }
    if (tool !== 'selection') {
      setPastePreview(null);
      setPastePreviewPosition(null);
    }
    if (tool !== 'text') {
      setTextDraft(null);
    }
  }, [tool]);

  // アニメーションの再生ループ（fps に従いフレームを順送りする）
  useEffect(() => {
    if (!isPlaying || !selectedAnimation || selectedAnimation.frameIds.length === 0) {
      return;
    }
    const { fps, loop, frameIds } = selectedAnimation;
    const intervalMs = 1000 / Math.max(1, fps);
    const interval = window.setInterval(() => {
      const nextIndex = playbackIndexRef.current + 1;
      if (nextIndex >= frameIds.length) {
        if (!loop) {
          setIsPlaying(false);
          return;
        }
        playbackIndexRef.current = 0;
      } else {
        playbackIndexRef.current = nextIndex;
      }
      setPreviewFrameId(frameIds[playbackIndexRef.current]);
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [isPlaying, selectedAnimation]);

  const handleSelectAnimation = (id: string | null) => {
    setSelectedAnimationId(id);
    setIsPlaying(false);
    playbackIndexRef.current = 0;
  };

  const handleSelectFrame = (frameId: string) => {
    setIsPlaying(false);
    setPreviewFrameId(frameId);
  };

  const handlePlayAnimation = () => {
    if (!selectedAnimation || selectedAnimation.frameIds.length === 0) {
      return;
    }
    playbackIndexRef.current = 0;
    setPreviewFrameId(selectedAnimation.frameIds[0]);
    setIsPlaying(true);
  };

  const handleStopAnimation = () => {
    setIsPlaying(false);
    setPreviewFrameId(null);
  };

  const handleRewindAnimation = () => {
    if (!selectedAnimation || selectedAnimation.frameIds.length === 0) {
      return;
    }
    playbackIndexRef.current = 0;
    setPreviewFrameId(selectedAnimation.frameIds[0]);
  };

  /** レイヤー上で使うツールは、レイヤー未選択なら先頭レイヤーを選ぶ。 */
  const activateTool = (nextTool: CanvasTool) => {
    setTool(nextTool);
    if (LAYER_TOOLS.includes(nextTool) && !selectedLayerId && selectedAsset?.layers[0]) {
      setSelectedLayerId(selectedAsset.layers[0].id);
    }
  };

  /**
   * 選択レイヤーの編集用テクスチャへ画像処理を適用する。
   * 元画像（source）は変更せず、失敗時は理由を表示し、Undo で戻せる。
   * 呼び出し側が結果に応じて追加のUI状態（selectionの移動先反映など）を更新できるよう、
   * 保存成功時は true、失敗・early returnは false を返す。
   */
  const applyImageEdit = async (operation: ImageOperation): Promise<boolean> => {
    if (!selectedAsset || !selectedLayer?.textureId) {
      setEditorError('編集するレイヤーを選択してください。');
      return false;
    }
    const texture = selectedAsset.textures.find((tex) => tex.id === selectedLayer.textureId);
    if (!texture) {
      setEditorError('レイヤーが参照するテクスチャが見つかりません。');
      return false;
    }
    if (texture.kind !== 'edit') {
      setEditorError('元画像（source）は破壊的編集できません。編集用画像を選択してください。');
      return false;
    }
    if (!beginEditorPersistentMutation()) {
      return false;
    }
    const label = operationLabel(operation);
    setEditorError(null);
    setImageProcessing({ label, progress: 0 });
    try {
      const key = blobKeyFor(selectedAsset.id, texture.path);
      const beforeBlob = await loadBlob(key);
      if (!beforeBlob) {
        throw new Error('編集用画像が見つかりません。');
      }
      const beforeBuffer = await blobToPixelBuffer(beforeBlob);
      const afterBuffer = await runImageOperation(beforeBuffer, operation, (progress) =>
        setImageProcessing({ label, progress }),
      );
      const afterBlob = await pixelBufferToBlob(afterBuffer);

      const before = selectedAsset;
      let nextLayers = before.layers;
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
      }
      const next: Asset = {
        ...before,
        updatedAt: new Date().toISOString(),
        layers: nextLayers,
        textures: before.textures.map((tex) =>
          tex.id === texture.id
            ? { ...tex, size: { width: afterBuffer.width, height: afterBuffer.height } }
            : tex,
        ),
      };

      // 上書き（破壊的編集）の前に復旧点を保存する（2D-1B-STORAGE §C）。
      // 復旧点の保存に失敗しても、画像編集自体は止めない（ベストエフォート）。
      try {
        await saveSnapshot({
          projectId,
          assetId: before.id,
          label,
          asset: before,
          blobKey: key,
          blob: beforeBlob,
        });
        await reloadSnapshots(before.id);
      } catch (snapshotError) {
        console.warn('復旧点の保存に失敗しました', snapshotError);
      }

      await commitPersistentMutationWithHistory({
        apply: () => saveAssetRevisionAndApply(next, { putBlobs: [{ key, blob: afterBlob }] }),
        history,
        entry: {
          label,
          undo: async () => {
            // textures を新しい配列にしてビットマップ再読込を促す
            await saveAssetRevisionAndApply(
              { ...before, textures: [...before.textures] },
              { putBlobs: [{ key, blob: beforeBlob }] },
            );
          },
          redo: async () => {
            await saveAssetRevisionAndApply(
              { ...next, textures: [...next.textures] },
              { putBlobs: [{ key, blob: afterBlob }] },
            );
          },
        },
      });
      return true;
    } catch (error) {
      setEditorError(
        `${label}に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    } finally {
      setImageProcessing(null);
      endEditorPersistentMutation();
    }
  };

  /**
   * 復旧点から画像とアセットを復元する（2D-1B-STORAGE §C）。
   * asset（JSON）と Blob（画像実体）はtoken付きの原子的な復元入口で対にして書き換え、
   * Undo / Redo も改訂保存で Blob を対にして書き戻す。assetだけを保存すると
   * Undo 後に「asset は復元前（新サイズ）だが Blob は復元後（旧サイズ）のまま」という
   * 不整合が起きるため使わない。未使用tokenはfinallyで必ず取消す。
   */
  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    let restoreToken: string | null = null;
    try {
      const restored = await prepareSnapshotRestore(snapshotId);
      restoreToken = restored.restoreToken;
      const key = restored.blobKey;
      const beforeBlob = restored.beforeBlob;
      // textures を新しい配列にしてビットマップ再読込を促す（他の画像編集 Undo/Redo と同じ手当て）
      const before: Asset = {
        ...restored.beforeAsset,
        textures: [...restored.beforeAsset.textures],
      };
      const next: Asset = { ...restored.asset, textures: [...restored.asset.textures] };

      await commitPersistentMutationWithHistory({
        apply: async () => {
          await commitSnapshotRestore(restored.restoreToken);
          setAssets((previous) => previous.map((asset) => (asset.id === next.id ? next : asset)));
        },
        history,
        entry: {
          label: '復旧点から復元',
          undo: async () => {
            await saveAssetRevisionAndApply(
              { ...before, textures: [...before.textures] },
              { putBlobs: [{ key, blob: beforeBlob }] },
            );
          },
          redo: async () => {
            await saveAssetRevisionAndApply(
              { ...next, textures: [...next.textures] },
              { putBlobs: [{ key, blob: restored.blob }] },
            );
          },
        },
      });
    } catch (error) {
      setEditorError(
        `復旧点から復元できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (restoreToken) {
        cancelSnapshotRestore(restoreToken);
      }
      endEditorPersistentMutation();
    }
  };

  /** bgpick / picker ツールでキャンバスをクリックしたときの色拾い。 */
  const handlePickColor = async (layerId: string, texturePoint: Vec2) => {
    if (!selectedAsset) {
      return;
    }
    const layer = selectedAsset.layers.find((l) => l.id === layerId);
    const texture = selectedAsset.textures.find((tex) => tex.id === layer?.textureId);
    if (!layer || !texture) {
      return;
    }
    try {
      const blob = await loadBlob(blobKeyFor(selectedAsset.id, texture.path));
      if (!blob) {
        return;
      }
      const buffer = await blobToPixelBuffer(blob);
      const x = Math.floor(texturePoint.x);
      const y = Math.floor(texturePoint.y);
      if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) {
        return;
      }
      const offset = (y * buffer.width + x) * 4;
      const color = {
        r: buffer.data[offset],
        g: buffer.data[offset + 1],
        b: buffer.data[offset + 2],
      };
      const alpha = buffer.data[offset + 3];
      if (tool === 'picker') {
        if (alpha === 0) {
          setEditorError('透明な場所の色は拾えません。');
          return;
        }
        setEditorError(null);
        setReplaceFrom(rgbToHex(color));
        return;
      }
      // bgpick: 拾った色で背景透過を実行
      if (alpha === 0) {
        setEditorError('その場所はすでに透明です。');
        return;
      }
      await applyImageEdit({
        type: 'removeBackground',
        color,
        tolerance: Math.round((bgTolerance / 100) * 255),
      });
    } catch (error) {
      setEditorError(
        `色の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleCropCommit = (layerId: string, rect: Rect) => {
    if (selectedLayerId !== layerId) {
      setSelectedLayerId(layerId);
    }
    void applyImageEdit({ type: 'crop', rect });
  };

  const handleEraseCommit = (layerId: string, points: Vec2[]) => {
    if (selectedLayerId !== layerId) {
      setSelectedLayerId(layerId);
    }
    void applyImageEdit({ type: 'erase', points, radius: eraserSize });
  };

  /** ドラッグで新しいselectionを定義したときの確定（契約 §6）。 */
  const handleSelectionCommit = (nextSelection: RasterSelection) => {
    setSelection(nextSelection);
  };

  /**
   * 選択範囲のpixelsをin-memoryのcopy bufferへコピーする。Asset / Project / Historyへは保存しない。
   * source Blobは読み取るだけで変更しない。
   */
  const handleSelectionCopy = async () => {
    if (!selectedAsset || !selectedLayer?.textureId || !selection) {
      setEditorError('コピーするには選択範囲が必要です。');
      return;
    }
    const texture = selectedAsset.textures.find((tex) => tex.id === selectedLayer.textureId);
    if (!texture) {
      return;
    }
    try {
      const blob = await loadBlob(blobKeyFor(selectedAsset.id, texture.path));
      if (!blob) {
        setEditorError('編集用画像が見つかりません。');
        return;
      }
      const buffer = await blobToPixelBuffer(blob);
      setSelectionClipboard(copySelectionPixels(buffer, selection));
      setEditorError(null);
    } catch (error) {
      setEditorError(
        `選択範囲のコピーに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  /** 選択範囲を透明化して確定する（既存改訂保存経路）。 */
  const handleSelectionClear = () => {
    if (!selection) {
      return;
    }
    void applyImageEdit({ type: 'selectionClear', selection });
  };

  /** selection内側のドラッグによる移動の確定。元位置は透明化され、選択自体も移動先へ追従する。 */
  const handleSelectionMoveCommit = async (movedSelection: RasterSelection, target: Vec2) => {
    const success = await applyImageEdit({
      type: 'selectionMove',
      selection: movedSelection,
      target,
    });
    if (success) {
      setSelection({
        rect: {
          x: target.x,
          y: target.y,
          width: movedSelection.rect.width,
          height: movedSelection.rect.height,
        },
      });
    }
  };

  /** paste previewをarmする。ドラッグまたはボタンでの確定を待つ状態にする。 */
  const handleArmPaste = () => {
    if (!selectionClipboard) {
      return;
    }
    const origin = selection ? { x: selection.rect.x, y: selection.rect.y } : { x: 0, y: 0 };
    setPastePreview({ clipboard: selectionClipboard, origin });
    setPastePreviewPosition(origin);
    setTool('selection');
  };

  const handleCancelPaste = () => {
    setPastePreview(null);
    setPastePreviewPosition(null);
  };

  /** paste previewの確定（pointer up、またはパネルの確定ボタン）。 */
  const handlePasteCommit = async (position: Vec2) => {
    if (!pastePreview) {
      return;
    }
    const success = await applyImageEdit({
      type: 'selectionPaste',
      clipboard: pastePreview.clipboard,
      target: position,
    });
    if (success) {
      setPastePreview(null);
      setPastePreviewPosition(null);
    }
  };

  /** textツールでキャンバスをクリックしたときのアンカー確定（既存の文字列・font・sizeは維持する）。 */
  const handleTextAnchor = (point: Vec2) => {
    setTextDraft((prev) => ({
      anchor: point,
      text: prev?.text ?? '',
      fontFamily: prev?.fontFamily ?? textFontFamily,
      size: prev?.size ?? textSize,
    }));
  };

  /**
   * raster textの確定。main threadのoffscreen canvasへtextureサイズ全体を描画し、
   * 透明部分を保ったまま合成するstampImage操作を既存改訂保存経路で適用する（契約 §5 A）。
   * text文字列・font・sizeはAsset / Projectへ一切保存しない。
   */
  const handleTextCommit = async () => {
    if (!textDraft || !textDraft.text.trim() || !selectedLayer || !selectedTextureSize) {
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = selectedTextureSize.width;
      canvas.height = selectedTextureSize.height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('この環境ではCanvas 2Dが使えません。');
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = rasterColor;
      context.font = `${textDraft.size}px ${textDraft.fontFamily}`;
      context.textBaseline = 'top';
      context.fillText(textDraft.text, textDraft.anchor.x, textDraft.anchor.y);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const clipboard: SelectionClipboard = {
        width: imageData.width,
        height: imageData.height,
        data: imageData.data,
      };
      const success = await applyImageEdit({
        type: 'stampImage',
        clipboard,
        target: { x: 0, y: 0 },
      });
      if (success) {
        setTextDraft(null);
      }
    } catch (error) {
      setEditorError(
        `テキストの確定に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleTextCancel = () => {
    setTextDraft(null);
  };

  const handleFiles = async (files: Iterable<File>) => {
    const batch = Array.from(files);
    if (batch.length === 0) {
      return;
    }
    if (!beginEditorPersistentMutation()) {
      return;
    }
    if (!project) {
      endEditorPersistentMutation();
      return;
    }
    setEditorError(null);
    setImporting(true);
    try {
      assertImageBatchCount(batch.length);
      const staged = [];
      for (const file of batch) {
        staged.push(await importImageFile(file));
      }
      const stagedAssets = staged.map(({ asset }) => asset);
      const nextProject: Project = {
        ...project,
        assets: [
          ...project.assets,
          ...stagedAssets.map((asset) => ({
            id: asset.id,
            name: asset.name,
            displayName: asset.displayName,
            assetType: asset.assetType,
          })),
        ],
        updatedAt: new Date().toISOString(),
      };
      await saveProjectBundle(
        nextProject,
        stagedAssets,
        staged.flatMap(({ blobs }) => blobs),
      );
      setProject(nextProject);
      setAssets((prev) => [...prev, ...stagedAssets]);
      setSelectedAssetId(stagedAssets.at(-1)?.id ?? null);
      setSelectedLayerId(null);
    } catch (error) {
      setEditorError(
        `${error instanceof Error ? error.message : String(error)} 選択した画像は1件も追加されていません。`,
      );
    } finally {
      setImporting(false);
      endEditorPersistentMutation();
    }
  };

  /** 選択アセットを左右反転した新しいアセットを生成する（Phase 19-B, docs/future/FLIP_DESIGN.md）。 */
  const handleFlipCopyAsset = async () => {
    if (!project || !selectedAsset) {
      return;
    }
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setImporting(true);
    try {
      const flipped = flipCopyAsset(selectedAsset);
      // 画像 Blob は asset id 単位で保存されるため、新アセットのキーへ複製する。
      const blobs: Array<{ key: string; blob: Blob }> = [];
      for (const texture of selectedAsset.textures) {
        const blob = await loadBlob(blobKeyFor(selectedAsset.id, texture.path));
        if (blob) {
          blobs.push({ key: blobKeyFor(flipped.id, texture.path), blob });
        }
      }
      const nextProject: Project = {
        ...project,
        assets: [
          ...project.assets,
          {
            id: flipped.id,
            name: flipped.name,
            displayName: flipped.displayName,
            assetType: flipped.assetType,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      // project + 新アセット + 複製した Blob を単一トランザクションで保存する（2D-1B-STORAGE §A）。
      // 途中で失敗しても、複製が中途半端な状態で残らない。
      await saveProjectBundle(nextProject, [flipped], blobs);
      setProject(nextProject);
      setAssets((prev) => [...prev, flipped]);
      setSelectedAssetId(flipped.id);
      setSelectedLayerId(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
      endEditorPersistentMutation();
    }
  };

  /** 選択Assetを参照もBlobも共有しない独立Assetとして複製する。 */
  const handleDuplicateAsset = async () => {
    if (!project || !selectedAsset) {
      return;
    }
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setDuplicatingAsset(true);
    try {
      await autosave.flush();
      const copy = duplicateAsset(selectedAsset);
      const blobs: Array<{ key: string; blob: Blob }> = [];
      for (const texture of selectedAsset.textures) {
        const blob = await loadBlob(blobKeyFor(selectedAsset.id, texture.path));
        if (!blob) {
          throw new Error(`複製元の画像Blobが見つかりません: ${texture.path}`);
        }
        blobs.push({ key: blobKeyFor(copy.id, texture.path), blob });
      }
      const nextProject: Project = {
        ...project,
        assets: [
          ...project.assets,
          {
            id: copy.id,
            name: copy.name,
            displayName: copy.displayName,
            assetType: copy.assetType,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      await saveProjectBundle(nextProject, [copy], blobs);
      setProject(nextProject);
      setAssets((prev) => [...prev, copy]);
      setSelectedAssetId(copy.id);
      setSelectedLayerId(null);
      setCheckedLayerIds([]);
    } catch (error) {
      setEditorError(
        `アセットを複製できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setDuplicatingAsset(false);
      endEditorPersistentMutation();
    }
  };

  /**
   * 画像を取り込まず、型とサイズだけで新しい空キャンバスのアセットを作る（2D-2-CREATE-01）。
   * プロジェクト級の操作のため Undo 履歴には積まない（docs/USER_GUIDE.md に明記）。
   */
  const handleCreateBlankAsset = async () => {
    if (!project) {
      return;
    }
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setCreatingAsset(true);
    try {
      const trimmedName = newAssetName.trim() || '新規アセット';
      const { asset, blobs } = await createBlankAssetBundle({
        name: trimmedName,
        displayName: trimmedName,
        assetType: newAssetType,
        size: { width: Number(newAssetWidth), height: Number(newAssetHeight) },
        templateId: newAssetTemplateId,
        createCharacterBodyPart:
          newAssetType === 'character' &&
          newAssetTemplateId === 'character-basic' &&
          newAssetCreateBodyPart,
      });
      const nextProject: Project = {
        ...project,
        assets: [
          ...project.assets,
          {
            id: asset.id,
            name: asset.name,
            displayName: asset.displayName,
            assetType: asset.assetType,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      // project + 新アセット + 透明画像 Blob を単一トランザクションで保存する（2D-1B-STORAGE §A）。
      await saveProjectBundle(nextProject, [asset], blobs);
      setProject(nextProject);
      setAssets((prev) => [...prev, asset]);
      setSelectedAssetId(asset.id);
      setSelectedLayerId(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingAsset(false);
      endEditorPersistentMutation();
    }
  };

  /**
   * 選択中のアセットを削除する（2D-2-CREATE-01）。画像 Blob・復旧点も
   * deleteAsset（2D-1B-STORAGE）でまとめて消し、project 側の参照も外す。
   * 確認ダイアログで防護するため、Undo 履歴には積まない。
   *
   * 削除の前に必ず autosave.flush() で保留中の自動保存（数値編集などの 800ms
   * デバウンス保存）を完了させる。flush しないと、削除直後にデバウンス済みの
   * 古い asset スナップショットが保存され、削除したはずのアセットが
   * IndexedDB へ書き戻ってしまう競合が起きる（Opus 4.8 レビュー指摘）。
   */
  const handleDeleteAsset = async () => {
    if (!project || !selectedAsset) {
      return;
    }
    const ok = window.confirm(
      `アセット「${selectedAsset.displayName}」を削除します。この操作は元に戻せません。よろしいですか？`,
    );
    if (!ok) {
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setDeletingAsset(true);
    try {
      // 保留中の自動保存を先に終わらせてから削除する（上記コメント参照）。
      await autosave.flush();
      const nextProject: Project = {
        ...project,
        assets: project.assets.filter((entry) => entry.id !== selectedAsset.id),
        updatedAt: new Date().toISOString(),
      };
      await deleteAssetBundle({ project: nextProject, assetId: selectedAsset.id });
      const remaining = assets.filter((asset) => asset.id !== selectedAsset.id);
      setProject(nextProject);
      setAssets(remaining);
      setSelectedAssetId(remaining[0]?.id ?? null);
      setSelectedLayerId(null);
      setCheckedLayerIds([]);
    } catch (error) {
      setEditorError(
        `アセットを削除できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setDeletingAsset(false);
      endEditorPersistentMutation();
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      void handleFiles(files);
    }
    // 同じファイルをもう一度選べるようにする
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) {
      void handleFiles(event.dataTransfer.files);
    }
  };

  const handleRename = (name: string) => {
    if (!project) {
      return;
    }
    if (!canStartEditorPersistentMutation()) {
      return;
    }
    const next: Project = { ...project, name, updatedAt: new Date().toISOString() };
    setProject(next);
    autosave.schedule(() => saveProject(next));
  };

  /** 数値入力によるレイヤー変形の更新（フォーカス中は履歴に積まず、blur で確定する）。 */
  const snapCoordinate = (value: number): number => applyEditSnap(value, snapEnabled, gridSize);

  const handleLayerTransformChange = (
    field: 'x' | 'y' | 'scale' | 'rotation',
    rawValue: string,
  ) => {
    if (!selectedAsset || !selectedLayer) {
      return;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      return;
    }
    if (!canStartEditorPersistentMutation()) {
      return;
    }
    const next: Asset = {
      ...selectedAsset,
      updatedAt: new Date().toISOString(),
      layers: selectedAsset.layers.map((layer) => {
        if (layer.id !== selectedLayer.id) {
          return layer;
        }
        const transform = { ...layer.transform };
        if (field === 'x') {
          transform.position = { ...transform.position, x: snapCoordinate(value) };
        } else if (field === 'y') {
          transform.position = { ...transform.position, y: snapCoordinate(value) };
        } else if (field === 'scale') {
          const magnitude = Math.max(0.01, value / 100);
          // 左右反転（scale.x が負）の状態を保つため、拡大率編集では符号を維持する。
          const signX = layer.transform.scale.x < 0 ? -1 : 1;
          transform.scale = { x: magnitude * signX, y: magnitude };
        } else {
          transform.rotation = value;
        }
        return { ...layer, transform };
      }),
    };
    applyAssetSnapshot(next);
  };

  const beginLayerEdit = () => {
    if (!canStartEditorPersistentMutation()) {
      layerEditBeforeRef.current = null;
      return;
    }
    layerEditBeforeRef.current = selectedAsset;
  };

  const commitLayerEdit = () => {
    const before = layerEditBeforeRef.current;
    layerEditBeforeRef.current = null;
    const current = assets.find((asset) => asset.id === before?.id);
    if (!before || !current || before === current) {
      return;
    }
    if (JSON.stringify(before) === JSON.stringify(current)) {
      return;
    }
    const pushed = history.push({
      label: '数値編集',
      undo: () => applyAssetSnapshot(before),
      redo: () => applyAssetSnapshot(current),
    });
    if (!pushed) {
      setEditorError('元に戻す／やり直す処理中です。完了後に操作してください。');
    }
  };

  /** パネルのボタン操作による変更を履歴付きで確定する。 */
  const commitPanelChange = (label: string, next: Asset) => {
    if (!selectedAsset || next === selectedAsset) {
      return;
    }
    commitAssetChange(label, selectedAsset, next);
  };

  /** 画像ファイルを選択中アセットのレイヤーとして追加する（Phase 7）。 */
  const handleAddImageLayer = async (event: ChangeEvent<HTMLInputElement>) => {
    // value のリセットで FileList が空になる前に配列へ写す
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0 || !selectedAsset) {
      return;
    }
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setImporting(true);
    try {
      assertImageBatchCount(files.length);
      const staged = [];
      for (const file of files) {
        staged.push(await importImageAsLayer(file, selectedAsset));
      }
      const before = selectedAsset;
      const after: Asset = {
        ...before,
        updatedAt: new Date().toISOString(),
        textures: [...before.textures, ...staged.flatMap(({ textures }) => textures)],
        layers: [...before.layers, ...staged.map(({ layer }) => layer)],
      };
      const blobs = staged.flatMap(({ blobs: resultBlobs }) => resultBlobs);
      const blobKeys = blobs.map(({ key }) => key);
      const sourceCreateKeys = staged
        .flatMap(({ textures }) => textures)
        .filter((texture) => texture.kind === 'source')
        .map((texture) => blobKeyFor(before.id, texture.path));
      const redoBlobs = blobs.map(({ key, blob }) => ({ key, blob }));
      await commitPersistentMutationWithHistory({
        apply: () =>
          saveAssetRevisionAndApply(after, {
            putBlobs: blobs,
            sourceBlobTransitions: { createKeys: sourceCreateKeys },
          }),
        history,
        entry: {
          label: '画像レイヤー一括追加',
          undo: () =>
            saveAssetRevisionAndApply(before, {
              deleteBlobKeys: blobKeys,
              sourceBlobTransitions: { deleteKeys: sourceCreateKeys },
            }),
          redo: () =>
            saveAssetRevisionAndApply(after, {
              putBlobs: redoBlobs,
              sourceBlobTransitions: { createKeys: sourceCreateKeys },
            }),
        },
      });
      setSelectedLayerId(staged.at(-1)?.layer.id ?? null);
    } catch (error) {
      setEditorError(
        `${error instanceof Error ? error.message : String(error)} 選択した画像レイヤーは1件も追加されていません。`,
      );
    } finally {
      setImporting(false);
      endEditorPersistentMutation();
    }
  };

  const handleAddGuideLayer = () => {
    if (!selectedAsset) {
      return;
    }
    commitPanelChange('ガイドレイヤー追加', addGuideLayer(selectedAsset));
  };

  /** アンカーツールでキャンバスをクリックしたときの追加。 */
  const handleAddAnchor = (worldPoint: Vec2) => {
    if (!selectedAsset) {
      return;
    }
    commitPanelChange(
      'アンカー追加',
      addAnchor(selectedAsset, {
        role: newAnchorRole,
        position: {
          x: snapCoordinate(Math.round(worldPoint.x)),
          y: snapCoordinate(Math.round(worldPoint.y)),
        },
      }),
    );
  };

  const handleToggleChecked = (layerId: string) => {
    setCheckedLayerIds((prev) =>
      prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId],
    );
  };

  const handleBack = async () => {
    await autosave.flush();
    onBackToHome();
  };

  if (loadError) {
    return (
      <main className="editor-load-error">
        <h1>プロジェクトを開けませんでした</h1>
        <p role="alert">{loadError}</p>
        <button type="button" onClick={onBackToHome}>
          ホームへ戻る
        </button>
      </main>
    );
  }

  const mobileNavItems: Array<{ view: MobileView; label: string }> = [
    { view: 'canvas', label: '編集' },
    { view: 'properties', label: 'プロパティ' },
    { view: 'timeline', label: 'タイムライン' },
    { view: 'export', label: '書き出し' },
  ];

  const toolButtons: Array<{ tool: CanvasTool; label: string }> = [
    { tool: 'select', label: '選択' },
    { tool: 'pan', label: 'パン' },
    { tool: 'crop', label: 'トリミング' },
    { tool: 'eraser', label: '消しゴム' },
    { tool: 'brush', label: 'ブラシ' },
    { tool: 'fill', label: '塗りつぶし' },
    { tool: 'rect', label: '矩形' },
    { tool: 'ellipse', label: '楕円' },
    { tool: 'selection', label: '範囲' },
    { tool: 'text', label: '文字' },
    { tool: 'bgpick', label: '背景透過' },
    { tool: 'picker', label: 'スポイト' },
    { tool: 'origin', label: '原点' },
    { tool: 'anchor', label: 'アンカー' },
    { tool: 'collider', label: '判定' },
  ];

  const statusMessages = (
    <>
      {importing && <p className="import-status">取り込み中…</p>}
      {imageProcessing && (
        <p className="import-status">
          {imageProcessing.label} 処理中… {Math.round(imageProcessing.progress * 100)}%
        </p>
      )}
      {editorError && (
        <p className="import-error" role="alert">
          {editorError}
        </p>
      )}
    </>
  );

  return (
    <div className="editor" aria-busy={persistentMutationBlocked}>
      <header className="editor-topbar">
        <button type="button" onClick={handleBack}>
          ← ホーム
        </button>
        <h1 className="editor-title">{project?.name ?? '読み込み中…'}</h1>
        <div className="editor-history-buttons">
          <button
            type="button"
            disabled={!historyState.canUndo || persistentMutationBlocked}
            onClick={() => void handleHistoryUndo()}
            title={historyState.undoLabel ?? undefined}
          >
            元に戻す
          </button>
          <button
            type="button"
            disabled={!historyState.canRedo || persistentMutationBlocked}
            onClick={() => void handleHistoryRedo()}
            title={historyState.redoLabel ?? undefined}
          >
            やり直す
          </button>
        </div>
        <p className="editor-save-status" role="status">
          {saveStatusText(saveState)}
        </p>
        <div className="editor-panel-toggles">
          <button type="button" aria-pressed={leftOpen} onClick={() => setLeftOpen((v) => !v)}>
            ツール
          </button>
          <button type="button" aria-pressed={rightOpen} onClick={() => setRightOpen((v) => !v)}>
            プロパティ
          </button>
        </div>
      </header>

      <div className="editor-body">
        <nav
          className={`editor-toolbar editor-side${leftOpen ? '' : ' collapsed'}`}
          aria-label="ツール"
        >
          {toolButtons.map((item) => (
            <button
              key={item.tool}
              type="button"
              aria-pressed={tool === item.tool}
              onClick={() => activateTool(item.tool)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section
          className={`editor-canvas-area${mobileView === 'canvas' ? ' mobile-active' : ''}`}
          aria-label="キャンバス"
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {selectedAsset ? (
            <div className={`canvas-editor-frame${dragOver ? ' drag-over' : ''}`}>
              <CanvasEditor
                asset={previewAsset ?? selectedAsset}
                tool={tool}
                selectedLayerId={selectedLayerId}
                eraserRadius={eraserSize}
                brushRadius={brushSize}
                rasterColor={hexToRgb(rasterColor)}
                fillTolerance={Math.round((fillTolerance / 100) * 255)}
                onSelectLayer={setSelectedLayerId}
                onCommitAsset={commitAssetChange}
                onPickColor={(layerId, point) => void handlePickColor(layerId, point)}
                onCropCommit={handleCropCommit}
                onEraseCommit={handleEraseCommit}
                onRasterCommit={(operation) => void applyImageEdit(operation)}
                selection={selection}
                onSelectionCommit={handleSelectionCommit}
                onSelectionMoveCommit={(sel, target) => void handleSelectionMoveCommit(sel, target)}
                pastePreview={pastePreview}
                onPastePreviewMove={setPastePreviewPosition}
                onPasteCommit={(position) => void handlePasteCommit(position)}
                textDraft={textDraft}
                onTextAnchor={handleTextAnchor}
                showColliders={showColliders}
                gridEnabled={gridEnabled}
                gridSize={gridSize}
                gridSizeMode={gridSizeMode}
                snapEnabled={snapEnabled}
                onGridEnabledChange={setGridEnabled}
                onGridSizeChange={setGridSize}
                onGridSizeModeChange={setGridSizeMode}
                onSnapEnabledChange={setSnapEnabled}
                onAddAnchor={handleAddAnchor}
                selectedColliderId={selectedColliderId}
                onSelectCollider={setSelectedColliderId}
              />
              {statusMessages}
            </div>
          ) : (
            <div className={`canvas-placeholder${dragOver ? ' drag-over' : ''}`}>
              <div className="import-zone">
                <p>画像をここへドラッグ&ドロップ</p>
                <label className="import-button">
                  画像を選ぶ
                  <input
                    type="file"
                    accept={IMPORT_ACCEPT}
                    multiple
                    onChange={handleFileInput}
                    className="visually-hidden-input"
                  />
                </label>
                <p className="editor-note">
                  PNG / JPG / WebP に対応。一度に16枚、1枚あたり25MiB、4096 x 4096までです。
                </p>
              </div>
              {statusMessages}
            </div>
          )}
        </section>

        <aside
          className={`editor-properties editor-side${rightOpen ? '' : ' collapsed'}${
            mobileView === 'properties' ? ' mobile-active' : ''
          }`}
          aria-label="プロパティ"
        >
          <h2>プロパティ</h2>
          <label className="editor-field">
            プロジェクト名
            <input
              type="text"
              value={project?.name ?? ''}
              aria-label="プロジェクト名"
              disabled={!project || persistentMutationBlocked}
              onChange={(event) => handleRename(event.target.value)}
            />
          </label>

          <h3 className="editor-subheading">アセット</h3>
          {selectedAsset ? (
            <>
              <AssetTypePanel asset={selectedAsset} onCommit={commitPanelChange} />
              <div className="asset-actions">
                <button
                  type="button"
                  disabled={duplicatingAsset || persistentMutationBlocked}
                  onClick={() => void handleDuplicateAsset()}
                >
                  独立コピーを作成
                </button>
                <button
                  type="button"
                  className="asset-flip-copy-button"
                  disabled={importing || persistentMutationBlocked}
                  onClick={() => void handleFlipCopyAsset()}
                >
                  左右反転コピーを作成
                </button>
                <button
                  type="button"
                  className="asset-delete-button"
                  disabled={deletingAsset || mutationBusy}
                  onClick={() => void handleDeleteAsset()}
                >
                  アセットを削除
                </button>
              </div>
            </>
          ) : (
            <p className="editor-note">アセットを選ぶと種別を設定できます。</p>
          )}

          <fieldset className="editor-fieldset asset-create-fieldset">
            <legend>新規アセットを作成</legend>
            <p className="editor-note">
              サイズとtemplateを確認してから作成します。templateは作成結果だけを保存し、template
              ID自体は保存しません。
            </p>
            <label className="editor-field">
              新規アセット名
              <input
                type="text"
                value={newAssetName}
                onChange={(event) => setNewAssetName(event.target.value)}
              />
            </label>
            <label className="editor-field">
              新規アセットの種別
              <select
                value={newAssetType}
                onChange={(event) => handleNewAssetTypeChange(event.target.value as AssetType)}
              >
                {ASSET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ASSET_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="editor-field">
              新規アセットのサイズ
              <select
                value={newAssetSizePreset}
                onChange={(event) =>
                  handleNewAssetPresetChange(event.target.value as BlankCanvasPresetId)
                }
              >
                {BLANK_CANVAS_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
                <option value="custom">自由入力</option>
              </select>
            </label>
            <div className="gamedata-inline-fields">
              <label className="editor-field">
                新規アセットの幅
                <input
                  type="number"
                  min={1}
                  max={4096}
                  inputMode="numeric"
                  value={newAssetWidth}
                  onChange={(event) => handleNewAssetDimensionChange('width', event.target.value)}
                />
              </label>
              <label className="editor-field">
                新規アセットの高さ
                <input
                  type="number"
                  min={1}
                  max={4096}
                  inputMode="numeric"
                  value={newAssetHeight}
                  onChange={(event) => handleNewAssetDimensionChange('height', event.target.value)}
                />
              </label>
            </div>
            <p className="editor-note">
              幅・高さは1〜4096の整数です。値は自動調整せず、範囲外なら画像生成前に拒否します。
            </p>
            <label className="editor-field">
              新規アセットのテンプレート
              <select
                value={newAssetTemplateId}
                onChange={(event) => {
                  setNewAssetTemplateId(event.target.value as AssetCreationTemplateId);
                  setNewAssetCreateBodyPart(false);
                }}
              >
                {newAssetTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="editor-note">
              {newAssetTemplates.find((template) => template.id === newAssetTemplateId)
                ?.description ?? ''}
            </p>
            {newAssetType === 'character' && newAssetTemplateId === 'character-basic' && (
              <label className="editor-field editor-field-checkbox">
                <input
                  type="checkbox"
                  aria-label="character body Partを作成"
                  checked={newAssetCreateBodyPart}
                  onChange={(event) => setNewAssetCreateBodyPart(event.target.checked)}
                />
                main layerを参照するbody Partも作成する
              </label>
            )}
            <button
              type="button"
              aria-label="新規アセットを作成"
              disabled={creatingAsset || !project || persistentMutationBlocked}
              onClick={() => void handleCreateBlankAsset()}
            >
              新規アセットを作成
            </button>
          </fieldset>

          {selectedAsset && snapshots.length > 0 && (
            <>
              <h3 className="editor-subheading">復旧点</h3>
              <p className="editor-note">
                破壊的な画像編集（トリミング・消しゴム・色調整など）の前の状態です。アセットあたり最大
                3 件保持します。
              </p>
              <ul className="snapshot-list">
                {snapshots.map((snapshot) => (
                  <li key={snapshot.id} className="snapshot-list-item">
                    <div className="snapshot-item-main">
                      <span className="snapshot-item-label">{snapshot.label}</span>
                      <span className="snapshot-item-meta">
                        {new Date(snapshot.createdAt).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestoreSnapshot(snapshot.id)}
                      aria-label={`復旧点「${snapshot.label}（${new Date(
                        snapshot.createdAt,
                      ).toLocaleString('ja-JP')}）」から復元`}
                    >
                      復元
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className="editor-subheading">レイヤー</h3>
          {selectedAsset ? (
            <LayerPanel
              asset={selectedAsset}
              selectedLayerId={selectedLayerId}
              checkedLayerIds={checkedLayerIds}
              importAccept={IMPORT_ACCEPT}
              onSelectLayer={setSelectedLayerId}
              onToggleChecked={handleToggleChecked}
              onCommit={commitPanelChange}
              onAddImageLayer={(event) => void handleAddImageLayer(event)}
              onAddGuideLayer={handleAddGuideLayer}
            />
          ) : (
            <p className="editor-note">アセットを選ぶとレイヤーを操作できます。</p>
          )}

          <h3 className="editor-subheading">選択中レイヤー</h3>
          {selectedLayer ? (
            <div className="layer-fields">
              <label className="editor-field">
                レイヤー名
                <input
                  type="text"
                  value={selectedLayer.name}
                  onFocus={beginLayerEdit}
                  onBlur={commitLayerEdit}
                  onChange={(event) => {
                    if (selectedAsset) {
                      applyAssetSnapshot(
                        renameLayer(selectedAsset, selectedLayer.id, event.target.value),
                      );
                    }
                  }}
                />
              </label>
              <label className="editor-field">
                X
                <input
                  type="number"
                  value={roundValue(selectedLayer.transform.position.x)}
                  onFocus={beginLayerEdit}
                  onBlur={commitLayerEdit}
                  onChange={(event) => handleLayerTransformChange('x', event.target.value)}
                />
              </label>
              <label className="editor-field">
                Y
                <input
                  type="number"
                  value={roundValue(selectedLayer.transform.position.y)}
                  onFocus={beginLayerEdit}
                  onBlur={commitLayerEdit}
                  onChange={(event) => handleLayerTransformChange('y', event.target.value)}
                />
              </label>
              <label className="editor-field">
                拡大率（%）
                <input
                  type="number"
                  min={1}
                  value={roundValue(Math.abs(selectedLayer.transform.scale.x) * 100)}
                  onFocus={beginLayerEdit}
                  onBlur={commitLayerEdit}
                  onChange={(event) => handleLayerTransformChange('scale', event.target.value)}
                />
              </label>
              <label className="editor-field">
                回転（度）
                <input
                  type="number"
                  value={roundValue(selectedLayer.transform.rotation)}
                  onFocus={beginLayerEdit}
                  onBlur={commitLayerEdit}
                  onChange={(event) => handleLayerTransformChange('rotation', event.target.value)}
                />
              </label>
              <button
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
              {selectedAsset?.assetType === 'background' && (
                <BackgroundLayerFields
                  asset={selectedAsset}
                  layer={selectedLayer}
                  onCommit={commitPanelChange}
                />
              )}
            </div>
          ) : (
            <p className="editor-note">キャンバス上のレイヤーをクリックすると選択できます。</p>
          )}

          {selectedLayer && (
            <>
              <h3 className="editor-subheading">画像編集</h3>
              <div className="image-edit-fields">
                <p className="editor-note">
                  ブラシ・矩形・楕円はキャンバス上でドラッグ、塗りつぶしと背景透過は対象をタップします。描画は選択中の編集用画像へ確定され、Undoで戻せます。
                </p>
                <fieldset className="editor-fieldset">
                  <legend>ラスター描画</legend>
                  <label className="editor-field">
                    描画色
                    <input
                      type="color"
                      aria-label="描画色"
                      value={rasterColor}
                      onChange={(event) => setRasterColor(event.target.value)}
                    />
                  </label>
                  <label className="editor-field">
                    ブラシサイズ（px）
                    <input
                      type="number"
                      aria-label="ブラシサイズ"
                      min={1}
                      max={128}
                      value={brushSize}
                      onChange={(event) =>
                        setBrushSize(Math.min(128, Math.max(1, Number(event.target.value) || 1)))
                      }
                    />
                  </label>
                  <label className="editor-field">
                    塗りつぶし許容量（0-100）
                    <input
                      type="number"
                      aria-label="塗りつぶし許容量"
                      min={0}
                      max={100}
                      value={fillTolerance}
                      onChange={(event) =>
                        setFillTolerance(
                          Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                        )
                      }
                    />
                  </label>
                </fieldset>

                <fieldset className="editor-fieldset">
                  <legend>選択範囲</legend>
                  <p className="editor-note">
                    「範囲」ツールでキャンバスをドラッグすると矩形選択を作れます。選択中は他のラスターツールが選択範囲をmaskとして使います。Escで解除できます。
                  </p>
                  {selection && (
                    <p className="editor-note">
                      選択範囲: {Math.round(selection.rect.width)} x{' '}
                      {Math.round(selection.rect.height)}px
                    </p>
                  )}
                  <div className="editor-button-row">
                    <button
                      type="button"
                      disabled={!selection || !!imageProcessing || persistentMutationBlocked}
                      onClick={() => void handleSelectionCopy()}
                    >
                      コピー
                    </button>
                    <button
                      type="button"
                      disabled={!selection || !!imageProcessing || persistentMutationBlocked}
                      onClick={handleSelectionClear}
                    >
                      消去
                    </button>
                    <button
                      type="button"
                      disabled={
                        !selectionClipboard || !!imageProcessing || persistentMutationBlocked
                      }
                      onClick={handleArmPaste}
                    >
                      貼り付け
                    </button>
                  </div>
                  {pastePreview && (
                    <div className="editor-button-row">
                      <button
                        type="button"
                        disabled={!!imageProcessing || persistentMutationBlocked}
                        onClick={() =>
                          void handlePasteCommit(pastePreviewPosition ?? pastePreview.origin)
                        }
                      >
                        貼り付けを確定
                      </button>
                      <button type="button" onClick={handleCancelPaste}>
                        貼り付けをキャンセル
                      </button>
                    </div>
                  )}
                </fieldset>

                <fieldset className="editor-fieldset">
                  <legend>文字</legend>
                  <p className="editor-note">
                    「文字」ツールでキャンバスをクリックするとアンカー位置を決められます。
                  </p>
                  <p role="note" className="editor-note editor-text-warning">
                    確定するとテキストはピクセルになり、再編集できません。
                  </p>
                  <label className="editor-field">
                    テキスト文字列
                    <input
                      type="text"
                      aria-label="テキスト文字列"
                      value={textDraft?.text ?? ''}
                      onChange={(event) => {
                        const nextText = event.target.value;
                        setTextDraft((prev) =>
                          prev
                            ? { ...prev, text: nextText }
                            : {
                                anchor: { x: 0, y: 0 },
                                text: nextText,
                                fontFamily: textFontFamily,
                                size: textSize,
                              },
                        );
                      }}
                    />
                  </label>
                  <label className="editor-field">
                    フォント
                    <select
                      aria-label="フォント"
                      value={textDraft?.fontFamily ?? textFontFamily}
                      onChange={(event) => {
                        const nextFont = event.target.value as typeof textFontFamily;
                        setTextFontFamily(nextFont);
                        setTextDraft((prev) => (prev ? { ...prev, fontFamily: nextFont } : prev));
                      }}
                    >
                      <option value="sans-serif">サンセリフ体</option>
                      <option value="serif">セリフ体</option>
                      <option value="monospace">等幅</option>
                    </select>
                  </label>
                  <label className="editor-field">
                    文字サイズ（px）
                    <input
                      type="number"
                      aria-label="文字サイズ"
                      min={1}
                      max={
                        selectedTextureSize
                          ? Math.max(selectedTextureSize.width, selectedTextureSize.height)
                          : 256
                      }
                      value={textDraft?.size ?? textSize}
                      onChange={(event) => {
                        const max = selectedTextureSize
                          ? Math.max(selectedTextureSize.width, selectedTextureSize.height)
                          : 256;
                        const nextSize = Math.min(
                          max,
                          Math.max(1, Math.round(Number(event.target.value) || 1)),
                        );
                        setTextSize(nextSize);
                        setTextDraft((prev) => (prev ? { ...prev, size: nextSize } : prev));
                      }}
                    />
                  </label>
                  <div className="editor-button-row">
                    <button
                      type="button"
                      disabled={
                        !textDraft ||
                        !textDraft.text.trim() ||
                        !!imageProcessing ||
                        persistentMutationBlocked
                      }
                      onClick={() => void handleTextCommit()}
                    >
                      テキストを確定
                    </button>
                    <button type="button" disabled={!textDraft} onClick={handleTextCancel}>
                      テキストをリセット
                    </button>
                  </div>
                </fieldset>

                <label className="editor-field">
                  背景透過の許容量（0-100）
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={bgTolerance}
                    onChange={(event) => setBgTolerance(Number(event.target.value) || 0)}
                  />
                </label>
                <label className="editor-field">
                  消しゴムサイズ（px）
                  <input
                    type="number"
                    min={2}
                    max={128}
                    value={eraserSize}
                    onChange={(event) =>
                      setEraserSize(Math.max(2, Number(event.target.value) || 2))
                    }
                  />
                </label>

                <fieldset className="editor-fieldset">
                  <legend>色調整（HSL）</legend>
                  <label className="editor-field">
                    色相（-180〜180）
                    <input
                      type="number"
                      min={-180}
                      max={180}
                      value={hsl.hue}
                      onChange={(event) =>
                        setHsl((prev) => ({ ...prev, hue: Number(event.target.value) || 0 }))
                      }
                    />
                  </label>
                  <label className="editor-field">
                    彩度（-100〜100）
                    <input
                      type="number"
                      min={-100}
                      max={100}
                      value={hsl.saturation}
                      onChange={(event) =>
                        setHsl((prev) => ({
                          ...prev,
                          saturation: Number(event.target.value) || 0,
                        }))
                      }
                    />
                  </label>
                  <label className="editor-field">
                    明度（-100〜100）
                    <input
                      type="number"
                      min={-100}
                      max={100}
                      value={hsl.lightness}
                      onChange={(event) =>
                        setHsl((prev) => ({
                          ...prev,
                          lightness: Number(event.target.value) || 0,
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!!imageProcessing || persistentMutationBlocked}
                    onClick={() => void applyImageEdit({ type: 'adjustHsl', ...hsl })}
                  >
                    色調整を適用
                  </button>
                </fieldset>

                <fieldset className="editor-fieldset">
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
              </div>
            </>
          )}

          <h3 className="editor-subheading">ゲーム情報</h3>
          {selectedAsset ? (
            <GameDataPanel
              asset={selectedAsset}
              showColliders={showColliders}
              newAnchorRole={newAnchorRole}
              onNewAnchorRoleChange={setNewAnchorRole}
              onToggleShowColliders={() => setShowColliders((v) => !v)}
              snapEnabled={snapEnabled}
              gridSize={gridSize}
              onCommit={commitPanelChange}
              onLiveChange={applyAssetSnapshot}
              onBeginFieldEdit={beginLayerEdit}
              onCommitFieldEdit={commitLayerEdit}
              selectedColliderId={selectedColliderId}
              onSelectCollider={setSelectedColliderId}
            />
          ) : (
            <p className="editor-note">
              アセットを選ぶと原点・アンカー・当たり判定を設定できます。
            </p>
          )}

          <h3 className="editor-subheading">ゲーム属性</h3>
          {selectedAsset ? (
            <GameAttributesPanel asset={selectedAsset} onCommit={commitPanelChange} />
          ) : (
            <p className="editor-note">アセットを選ぶとゲーム属性を編集できます。</p>
          )}

          <h3 className="editor-subheading">パーツ</h3>
          {selectedAsset ? (
            <PartPanel
              asset={selectedAsset}
              checkedLayerIds={checkedLayerIds}
              onClearChecked={() => setCheckedLayerIds([])}
              onCommit={commitPanelChange}
              onLiveChange={applyAssetSnapshot}
              onBeginFieldEdit={beginLayerEdit}
              onCommitFieldEdit={commitLayerEdit}
            />
          ) : (
            <p className="editor-note">アセットを選ぶとパーツを操作できます。</p>
          )}

          <h3 className="editor-subheading">リグ</h3>
          {selectedAsset ? (
            <RigPanel asset={selectedAsset} onCommit={commitPanelChange} />
          ) : (
            <p className="editor-note">アセットを選ぶとリグを編集できます。</p>
          )}

          <h3 className="editor-subheading">アセット</h3>
          {assets.length === 0 ? (
            <p className="editor-note">
              アセットがありません。画像を取り込むか、新規アセットを作成してください。
            </p>
          ) : (
            <ul className="asset-list">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    aria-pressed={asset.id === selectedAsset?.id}
                    onClick={() => {
                      setSelectedAssetId(asset.id);
                      setSelectedLayerId(null);
                      setCheckedLayerIds([]);
                    }}
                  >
                    {asset.displayName}
                  </button>
                  <span className="asset-meta">
                    {ASSET_TYPE_LABELS[asset.assetType]} · {asset.canvasSize.width} x{' '}
                    {asset.canvasSize.height}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <label className="import-button">
            画像を追加
            <input
              type="file"
              accept={IMPORT_ACCEPT}
              multiple
              onChange={handleFileInput}
              className="visually-hidden-input"
            />
          </label>
        </aside>
      </div>

      <footer
        className={`editor-timeline${mobileView === 'timeline' ? ' mobile-active' : ''}`}
        aria-label="タイムライン"
      >
        <h2>タイムライン</h2>
        {selectedAsset ? (
          <TimelinePanel
            asset={selectedAsset}
            playingFrameId={previewFrameId}
            isPlaying={isPlaying}
            selectedAnimationId={selectedAnimationId}
            onSelectAnimation={handleSelectAnimation}
            onSelectFrame={handleSelectFrame}
            onPlay={handlePlayAnimation}
            onStop={handleStopAnimation}
            onRewind={handleRewindAnimation}
            onCommit={commitPanelChange}
            onLiveChange={applyAssetSnapshot}
            onBeginFieldEdit={beginLayerEdit}
            onCommitFieldEdit={commitLayerEdit}
          />
        ) : (
          <p className="editor-note">アセットを選ぶとフレームとアニメーションを編集できます。</p>
        )}
      </footer>

      <section
        className={`editor-export${mobileView === 'export' ? ' mobile-active' : ''}`}
        aria-label="書き出し"
      >
        <h2>書き出し</h2>
        {selectedAsset && project ? (
          <ExportPanel asset={selectedAsset} project={project} projectAssets={assets} />
        ) : (
          <p className="editor-note">アセットを選ぶと書き出せます。</p>
        )}
      </section>

      <nav className="editor-mobile-nav" aria-label="画面切り替え">
        <button type="button" onClick={handleBack}>
          ホーム
        </button>
        {mobileNavItems.map((item) => (
          <button
            key={item.view}
            type="button"
            aria-pressed={mobileView === item.view}
            onClick={() => setMobileView(item.view)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
