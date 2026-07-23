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
import {
  blobKeyFor,
  importImageAsLayer,
  isQuarantinableImageImportError,
} from '../../core/images/importImage';
import {
  NEW_ASSET_IMPORT_ACCEPT,
  RASTER_IMPORT_ACCEPT,
  prepareNewAssetImageImport,
} from '../../core/images/importOptionalImage';
import {
  prepareChameleonAtlasBundleImport,
  type ChameleonAtlasBundleInput,
} from '../../core/images/importAtlasBundle';
import {
  FrameSetImportError,
  prepareSequenceImport,
  prepareSpriteSheetImport,
  prepareTileSetImport,
  type ManualGridInput,
  type PreparedFrameSetImport,
  type TileSetImportInput,
} from '../../core/images/importFrameSet';
import { assertImageBatchCount } from '../../core/input/inputSafety';
import {
  MAX_LAYER_IMAGE_EDGE,
  type AlphaInspection,
  type LayerImagePadding,
  type LayerResizeInterpolation,
} from '../../core/images/layerRepair';
import { MAX_PALETTE_COLORS, type PaletteExtraction } from '../../core/images/paletteExtraction';
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
import { runAlphaInspection, runPaletteExtraction } from '../../core/images/runAnalysis';
import {
  blobToPixelBuffer,
  pixelBufferToBlob,
  runImageOperation,
} from '../../core/images/runOperation';
import {
  addAnchor,
  addGuideLayer,
  applyFrameToAsset,
  createAnimationPlayback,
  assetCreationTemplatesForType,
  defaultAssetCreationTemplateId,
  duplicateAsset,
  flipCopyAsset,
  flipLayerHorizontal,
  createLinkedMirrorVariantDraft,
  createLinkedPaletteVariantDraft,
  createLinkedVariantFingerprint,
  generateId,
  inspectLinkedVariant,
  prepareLinkedVariantRefresh,
  renameLayer,
  ASSET_TYPES,
  type AnchorRole,
  type AnimationEvent,
  type Asset,
  type AssetFamily,
  type LinkedAssetFamilyVariant,
  type LinkedVariantRefreshArtifact,
  type PaletteReplacement,
  type AssetCreationTemplateId,
  type AssetType,
  type Layer,
  type Project,
  type Size,
  type Vec2,
} from '../../core/model';
import {
  AutosaveQueue,
  cancelSnapshotRestore,
  commitSnapshotRestore,
  deleteAssetBundle,
  deleteAssetsBundle,
  listProjectAssets,
  listSnapshots,
  loadBlob,
  loadProject,
  getStorageUsage,
  prepareSnapshotRestore,
  saveAsset,
  saveAssetBatchRevision,
  saveAssetRevision,
  saveProject,
  saveProjectBundle,
  saveQuarantineEntry,
  saveSnapshot,
  type AssetSnapshotSummary,
  type SaveState,
  type SourceBlobTransitions,
} from '../../core/storage';
import { layerWorldPoint } from '../../renderers/canvas2d/view';
import { AlignPanel } from './AlignPanel';
import { AssetBatchPanel } from './AssetBatchPanel';
import { AssetTypePanel, BackgroundLayerFields } from './AssetTypePanel';
import {
  AssetBatchCancelledError,
  buildAssetBatchRevisionPlan,
  prepareAssetBatchPreview,
  type AssetBatchConfig,
  type AssetBatchPreview,
  type AssetBatchProgress,
} from './assetBatch';
import { ASSET_TYPE_LABELS } from './assetTypeLabels';
import {
  BLANK_CANVAS_PRESETS,
  blankCanvasSizeForPreset,
  createBlankAssetBundle,
  DEFAULT_BLANK_CANVAS_PRESET_ID,
  DEFAULT_BLANK_CANVAS_SIZE,
  type BlankCanvasPresetId,
} from './blankAsset';
import { CanvasResizePanel } from './CanvasResizePanel';
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
import { ImportFrameSetPanel } from './ImportFrameSetPanel';
import { ImportPreviewDialog, type ImportPreviewContent } from './ImportPreviewDialog';
import { LayerPanel } from './LayerPanel';
import { PartPanel } from './PartPanel';
import { RigPanel } from './RigPanel';
import { TimelinePanel } from './TimelinePanel';
import { CANVAS_TOOL_GUIDE_BY_ID, CANVAS_TOOL_GUIDES } from './toolHelp';
import { VariantPanel, type VariantInspectionView } from './VariantPanel';
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
      point.x < 0 || point.y < 0 || point.x > canvasSize.width || point.y > canvasSize.height,
  );
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

interface ImageProcessingState {
  label: string;
  progress: number;
}

interface AlphaInspectionState {
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

interface VariantRefreshPreviewState {
  familyId: string;
  assetId: string;
  artifact: LinkedVariantRefreshArtifact;
  beforeProject: Project;
  afterProject: Project;
  baseAsset: Asset;
  beforeAsset: Asset;
  baseBlobs: Map<string, Blob>;
  variantBlobs: Map<string, Blob>;
}

interface PendingNewAssetsImageImport {
  kind: 'new-assets';
  preview: ImportPreviewContent;
  beforeProject: Project;
  beforeAssets: Asset[];
  beforeSelectedAssetId: string | null;
  stagedAssets: Asset[];
  blobs: Array<{ key: string; blob: Blob }>;
}

interface PendingLayerImageImport {
  kind: 'layers';
  preview: ImportPreviewContent;
  beforeProject: Project;
  beforeAssets: Asset[];
  beforeAsset: Asset;
  afterAsset: Asset;
  blobs: Array<{ key: string; blob: Blob }>;
  sourceCreateKeys: string[];
  selectedLayerId: string | null;
}

type PendingImageImport = PendingNewAssetsImageImport | PendingLayerImageImport;

interface EditorPersistentMutationOptions {
  allowPendingImageImport?: boolean;
}

const FRAME_SET_PREVIEW_MODE_LABELS: Record<PreparedFrameSetImport['preview']['mode'], string> = {
  sequence: '連番画像',
  sheet: 'Sprite Sheet（手動格子）',
  tileset: 'Tileset（手動格子）',
  atlas: 'Chameleon Atlas 0.1.0',
};

function frameSetPreviewContent(result: PreparedFrameSetImport): ImportPreviewContent {
  return {
    id: generateId('import_preview'),
    modeLabel: FRAME_SET_PREVIEW_MODE_LABELS[result.preview.mode],
    title: result.preview.title,
    fileNames: result.preview.fileNames,
    assetCount: result.preview.assetCount,
    layerCount: result.preview.layerCount,
    frameCount: result.preview.frameCount,
    animationCount: result.preview.animationCount,
    details: result.preview.details,
    losses: result.preview.losses,
    warnings: result.preview.warnings,
  };
}

function projectFamilyMembership(project: Project, assetId: string) {
  for (const family of project.families ?? []) {
    if (family.baseAssetId === assetId) {
      return { family, role: 'base' as const, variant: null };
    }
    const variant = family.variants.find((candidate) => candidate.assetId === assetId);
    if (variant) {
      return { family, role: 'variant' as const, variant };
    }
  }
  return null;
}

function projectFamilyStatusLabel(project: Project | null, assetId: string): string {
  if (!project) {
    return 'standalone';
  }
  const membership = projectFamilyMembership(project, assetId);
  if (!membership) {
    return 'standalone';
  }
  if (membership.role === 'base') {
    return `${membership.family.name} · base`;
  }
  switch (membership.variant.kind) {
    case 'manual':
      return `${membership.family.name} · manual`;
    case 'linked-mirror':
      return `${membership.family.name} · linked mirror`;
    case 'linked-palette':
      return `${membership.family.name} · linked palette`;
  }
}

function projectEntryForVariantAsset(asset: Asset) {
  return {
    id: asset.id,
    name: asset.name,
    displayName: asset.displayName,
    assetType: asset.assetType,
  };
}

async function loadAssetBlobMap(asset: Asset): Promise<Map<string, Blob>> {
  const result = new Map<string, Blob>();
  for (const texture of asset.textures) {
    const blob = await loadBlob(blobKeyFor(asset.id, texture.path));
    if (!blob) {
      throw new Error(`画像Blobが見つかりません: ${asset.displayName} / ${texture.path}`);
    }
    result.set(texture.path, blob);
  }
  return result;
}

async function transformPaletteVariantBlob(
  source: Blob,
  replacements: readonly PaletteReplacement[],
  tolerance: number,
): Promise<Blob> {
  return (await transformPaletteBatchBlob(source, replacements, tolerance)).blob;
}

async function transformPaletteBatchBlob(
  source: Blob,
  replacements: readonly PaletteReplacement[],
  tolerance: number,
  onProgress?: (progress: number) => void,
): Promise<{ blob: Blob; changed: boolean }> {
  let buffer = await blobToPixelBuffer(source);
  const beforePixels = new Uint8ClampedArray(buffer.data);
  for (let index = 0; index < replacements.length; index += 1) {
    const replacement = replacements[index];
    buffer = await runImageOperation(
      buffer,
      {
        type: 'replaceColor',
        from: hexToRgb(replacement.from),
        to: hexToRgb(replacement.to),
        tolerance,
      },
      (progress) => onProgress?.((index + progress) / replacements.length),
    );
  }
  const changed = buffer.data.some((value, index) => value !== beforePixels[index]);
  onProgress?.(0.95);
  const blob = await pixelBufferToBlob(buffer);
  onProgress?.(1);
  return { blob, changed };
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
  const [importStatusLabel, setImportStatusLabel] = useState('画像を取り込み中…');
  const [pendingImageImport, setPendingImageImport] = useState<PendingImageImport | null>(null);
  const [imageProcessing, setImageProcessing] = useState<ImageProcessingState | null>(null);
  const mutationBusyRef = useRef(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('canvas');
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
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
  const [variantInspections, setVariantInspections] = useState<
    Record<string, VariantInspectionView>
  >({});
  const [variantPreview, setVariantPreview] = useState<VariantRefreshPreviewState | null>(null);

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
  const [firedAnimationEvents, setFiredAnimationEvents] = useState<AnimationEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

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
  const [alphaThreshold, setAlphaThreshold] = useState(0);
  const [alphaInspection, setAlphaInspection] = useState<AlphaInspectionState | null>(null);
  const [alphaInspecting, setAlphaInspecting] = useState(false);
  const [paletteMaxColors, setPaletteMaxColors] = useState(8);
  const [paletteAlphaThreshold, setPaletteAlphaThreshold] = useState(0);
  const [paletteExtraction, setPaletteExtraction] = useState<PaletteExtractionState | null>(null);
  const [paletteInspecting, setPaletteInspecting] = useState(false);
  const [layerPadding, setLayerPadding] = useState<LayerImagePadding>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  const [layerResizeWidth, setLayerResizeWidth] = useState(1);
  const [layerResizeHeight, setLayerResizeHeight] = useState(1);
  const [layerResizeInterpolation, setLayerResizeInterpolation] =
    useState<LayerResizeInterpolation>('nearest');

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

  const persistentMutationBlocked =
    historyState.isBusy ||
    mutationBusy ||
    alphaInspecting ||
    paletteInspecting ||
    pendingImageImport !== null;

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null;
  const selectedFamilyMembership =
    project && selectedAsset ? projectFamilyMembership(project, selectedAsset.id) : null;
  const selectedFamilyId = selectedFamilyMembership?.family.id ?? null;
  const selectedLayer = selectedAsset?.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedTextureSize =
    selectedAsset?.textures.find((texture) => texture.id === selectedLayer?.textureId)?.size ??
    null;
  const activeAlphaInspection =
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

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobileViewport(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setVariantPreview(null);
    const panelVisible = isMobileViewport ? mobileView === 'properties' : rightOpen;
    const selectedFamily = (project?.families ?? []).find(
      (family) => family.id === selectedFamilyId,
    );
    if (!project || !panelVisible || !selectedFamily) {
      setVariantInspections({});
      return () => {
        cancelled = true;
      };
    }
    const linked = selectedFamily.variants
      .filter((variant): variant is LinkedAssetFamilyVariant => variant.kind !== 'manual')
      .map((variant) => ({ family: selectedFamily, variant }));
    setVariantInspections(
      Object.fromEntries(linked.map(({ variant }) => [variant.assetId, { state: 'checking' }])),
    );
    void Promise.all(
      linked.map(async ({ family, variant }) => {
        const base = assets.find((asset) => asset.id === family.baseAssetId);
        const variantAsset = assets.find((asset) => asset.id === variant.assetId);
        if (!base || !variantAsset) {
          return [
            variant.assetId,
            { state: 'error', error: 'Familyが参照するAssetを読み込めません。' },
          ] as const;
        }
        try {
          const [baseBlobs, variantBlobs] = await Promise.all([
            loadAssetBlobMap(base),
            loadAssetBlobMap(variantAsset),
          ]);
          const inspection = await inspectLinkedVariant({
            base,
            variantAsset,
            variant,
            baseBlobs,
            variantBlobs,
          });
          return [variant.assetId, { state: 'ready', inspection }] as const;
        } catch (error) {
          return [
            variant.assetId,
            { state: 'error', error: error instanceof Error ? error.message : String(error) },
          ] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) {
        setVariantInspections(Object.fromEntries(entries));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [assets, isMobileViewport, mobileView, project, rightOpen, selectedFamilyId]);
  useEffect(() => {
    if (!selectedTextureSize) {
      return;
    }
    setLayerResizeWidth(selectedTextureSize.width);
    setLayerResizeHeight(selectedTextureSize.height);
  }, [selectedTextureSize]);

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

  const canStartEditorPersistentMutation = useCallback(
    ({ allowPendingImageImport = false }: EditorPersistentMutationOptions = {}) => {
      return canStartPersistentMutation({
        history,
        mutationBusy: mutationBusyRef.current,
        previewPending: pendingImageImport !== null && !allowPendingImageImport,
        onReject: setEditorError,
      });
    },
    [history, pendingImageImport],
  );

  const beginEditorPersistentMutation = useCallback(
    (options: EditorPersistentMutationOptions = {}) => {
      if (!canStartEditorPersistentMutation(options)) {
        return false;
      }
      mutationBusyRef.current = true;
      setMutationBusy(true);
      return true;
    },
    [canStartEditorPersistentMutation],
  );

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
    if (!canStartEditorPersistentMutation()) {
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
  }, [canStartEditorPersistentMutation, history]);

  const handleHistoryRedo = useCallback(async () => {
    if (!canStartEditorPersistentMutation()) {
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
  }, [canStartEditorPersistentMutation, history]);

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
    setFiredAnimationEvents([]);
    setIsPlaying(false);
    setSelectedColliderId(null);
  }, [selectedAssetId]);

  // アセット / レイヤーを切り替えたらselection・copy buffer・paste preview・text draftを解除する
  // （selectionはsingle-layerのため、レイヤーが変わったら維持しない。契約 §6 / §10.4）
  useEffect(() => {
    setSelection(null);
    setSelectionClipboard(null);
    setPastePreview(null);
    setPastePreviewPosition(null);
    setTextDraft(null);
    setAlphaInspection(null);
    setPaletteExtraction(null);
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

  // Frame単位の実効時間に従う取消可能な逐次再生。
  useEffect(() => {
    if (!isPlaying || !selectedAnimation || selectedAnimation.frameIds.length === 0) {
      return;
    }
    const playback = createAnimationPlayback({
      animation: selectedAnimation,
      frames: selectedAsset?.frames ?? [],
      clock: {
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimeout: (handle) => window.clearTimeout(handle as number),
      },
      onFrameStart: (frameId) => {
        setPreviewFrameId(frameId);
        setFiredAnimationEvents([]);
      },
      onEvent: (event) => {
        setFiredAnimationEvents((current) => [...current, event]);
      },
      onComplete: () => setIsPlaying(false),
    });
    playback.start();
    return () => playback.stop();
  }, [isPlaying, selectedAnimation, selectedAsset?.frames]);

  const handleSelectAnimation = (id: string | null) => {
    setSelectedAnimationId(id);
    setIsPlaying(false);
    setFiredAnimationEvents([]);
  };

  const handleSelectFrame = (frameId: string) => {
    setIsPlaying(false);
    setPreviewFrameId(frameId);
    setFiredAnimationEvents([]);
  };

  const handlePlayAnimation = () => {
    if (!selectedAnimation || selectedAnimation.frameIds.length === 0) {
      return;
    }
    setFiredAnimationEvents([]);
    setIsPlaying(true);
  };

  const handleStopAnimation = () => {
    setIsPlaying(false);
    setPreviewFrameId(null);
    setFiredAnimationEvents([]);
  };

  const handleRewindAnimation = () => {
    if (!selectedAnimation || selectedAnimation.frameIds.length === 0) {
      return;
    }
    setPreviewFrameId(selectedAnimation.frameIds[0]);
    setFiredAnimationEvents([]);
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
      setAlphaInspection(null);
      setPaletteExtraction(null);
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

  const handleAlphaInspect = async () => {
    if (!selectedAsset || !selectedLayer?.textureId) {
      setEditorError('検査するレイヤーを選択してください。');
      return;
    }
    const texture = selectedAsset.textures.find((entry) => entry.id === selectedLayer.textureId);
    if (!texture) {
      setEditorError('レイヤーが参照するテクスチャが見つかりません。');
      return;
    }
    if (texture.kind !== 'edit') {
      setEditorError('元画像（source）は検査対象にできません。編集用画像を選択してください。');
      return;
    }
    if (persistentMutationBlocked || imageProcessing) {
      return;
    }

    setEditorError(null);
    setAlphaInspection(null);
    setAlphaInspecting(true);
    setImageProcessing({ label: '透明縁を検査', progress: 0 });
    try {
      const blob = await loadBlob(blobKeyFor(selectedAsset.id, texture.path));
      if (!blob) {
        throw new Error('編集用画像が見つかりません。');
      }
      const buffer = await blobToPixelBuffer(blob);
      const result = await runAlphaInspection(buffer, alphaThreshold, (progress) =>
        setImageProcessing({ label: '透明縁を検査', progress }),
      );
      setAlphaInspection({
        assetId: selectedAsset.id,
        layerId: selectedLayer.id,
        textureId: texture.id,
        result,
      });
    } catch (error) {
      setEditorError(
        `透明縁を検査できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setImageProcessing(null);
      setAlphaInspecting(false);
    }
  };

  const handleAlphaTrim = async () => {
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
        `パレットを抽出できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setImageProcessing(null);
      setPaletteInspecting(false);
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

  const handleCreateFamily = async (name: string, baseAssetId: string) => {
    if (!project || !assets.some((asset) => asset.id === baseAssetId)) {
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    try {
      await autosave.flush();
      if (projectFamilyMembership(project, baseAssetId)) {
        throw new Error('選択したbase AssetはすでにFamilyへ所属しています。');
      }
      const now = new Date().toISOString();
      const family: AssetFamily = {
        id: generateId('family'),
        name,
        baseAssetId,
        variants: [],
      };
      const nextProject: Project = {
        ...project,
        families: [...(project.families ?? []), family],
        updatedAt: now,
      };
      await saveProject(nextProject);
      setProject(nextProject);
      setSelectedAssetId(baseAssetId);
      history.clear();
    } catch (error) {
      setEditorError(
        `Familyを作成できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      endEditorPersistentMutation();
    }
  };

  const handleAddManualVariant = async (familyId: string, assetId: string) => {
    if (!project) {
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    try {
      await autosave.flush();
      if (projectFamilyMembership(project, assetId)) {
        throw new Error('選択したAssetはすでにFamilyへ所属しています。');
      }
      const now = new Date().toISOString();
      const nextProject: Project = {
        ...project,
        families: (project.families ?? []).map((family) =>
          family.id === familyId
            ? {
                ...family,
                variants: [...family.variants, { assetId, kind: 'manual' as const }],
              }
            : family,
        ),
        updatedAt: now,
      };
      await saveProject(nextProject);
      setProject(nextProject);
      setSelectedAssetId(assetId);
      history.clear();
    } catch (error) {
      setEditorError(
        `manual variantを登録できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      endEditorPersistentMutation();
    }
  };

  const handleCreateMirrorVariant = async (familyId: string) => {
    if (!project) {
      return;
    }
    const family = (project.families ?? []).find((candidate) => candidate.id === familyId);
    const base = assets.find((asset) => asset.id === family?.baseAssetId);
    if (!family || !base) {
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setImportStatusLabel('linked左右反転variantを作成中…');
    setImporting(true);
    try {
      await autosave.flush();
      const now = new Date();
      const draft = createLinkedMirrorVariantDraft(base, { now });
      const baseBlobs = await loadAssetBlobMap(base);
      const variantBlobs = new Map(baseBlobs);
      const fingerprint = await createLinkedVariantFingerprint({
        base,
        variant: draft.asset,
        recipe: draft.recipe,
        baseBlobs,
        variantBlobs,
        now,
      });
      const linked: LinkedAssetFamilyVariant = {
        assetId: draft.asset.id,
        kind: 'linked-mirror',
        recipe: draft.recipe,
        fingerprint,
      };
      const nextProject: Project = {
        ...project,
        assets: [...project.assets, projectEntryForVariantAsset(draft.asset)],
        families: (project.families ?? []).map((candidate) =>
          candidate.id === familyId
            ? { ...candidate, variants: [...candidate.variants, linked] }
            : candidate,
        ),
        updatedAt: now.toISOString(),
      };
      await saveProjectBundle(
        nextProject,
        [draft.asset],
        draft.asset.textures.map((texture) => ({
          key: blobKeyFor(draft.asset.id, texture.path),
          blob: variantBlobs.get(texture.path)!,
        })),
      );
      setProject(nextProject);
      setAssets((current) => [...current, draft.asset]);
      setSelectedAssetId(draft.asset.id);
      setSelectedLayerId(null);
      history.clear();
    } catch (error) {
      setEditorError(
        `linked左右反転を作成できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setImporting(false);
      endEditorPersistentMutation();
    }
  };

  const handleCreatePaletteVariant = async (options: {
    familyId: string;
    baseLayerId: string;
    from: string;
    to: string;
    tolerance: number;
  }) => {
    if (!project) {
      return;
    }
    const family = (project.families ?? []).find((candidate) => candidate.id === options.familyId);
    const base = assets.find((asset) => asset.id === family?.baseAssetId);
    if (!family || !base) {
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setImportStatusLabel('linked palette variantを作成中…');
    setImporting(true);
    try {
      await autosave.flush();
      const now = new Date();
      const draft = createLinkedPaletteVariantDraft(base, {
        baseLayerId: options.baseLayerId,
        replacements: [{ from: options.from, to: options.to }],
        tolerance: options.tolerance,
        now,
      });
      const baseBlobs = await loadAssetBlobMap(base);
      const variantBlobs = new Map(baseBlobs);
      const targetPath = draft.recipe.writeSet.blobPaths[0];
      const baseLayer = base.layers.find((layer) => layer.id === options.baseLayerId)!;
      const baseTexture = base.textures.find((texture) => texture.id === baseLayer.textureId)!;
      const transformed = await transformPaletteVariantBlob(
        baseBlobs.get(baseTexture.path)!,
        draft.recipe.replacements,
        draft.recipe.tolerance,
      );
      const targetTexture = draft.asset.textures.find((texture) => texture.path === targetPath)!;
      if (transformed.type !== targetTexture.mimeType) {
        throw new Error(`palette変換後BlobのMIME typeが一致しません: ${targetPath}`);
      }
      variantBlobs.set(targetPath, transformed);
      const fingerprint = await createLinkedVariantFingerprint({
        base,
        variant: draft.asset,
        recipe: draft.recipe,
        baseBlobs,
        variantBlobs,
        now,
      });
      const linked: LinkedAssetFamilyVariant = {
        assetId: draft.asset.id,
        kind: 'linked-palette',
        recipe: draft.recipe,
        fingerprint,
      };
      const nextProject: Project = {
        ...project,
        assets: [...project.assets, projectEntryForVariantAsset(draft.asset)],
        families: (project.families ?? []).map((candidate) =>
          candidate.id === options.familyId
            ? { ...candidate, variants: [...candidate.variants, linked] }
            : candidate,
        ),
        updatedAt: now.toISOString(),
      };
      await saveProjectBundle(
        nextProject,
        [draft.asset],
        draft.asset.textures.map((texture) => ({
          key: blobKeyFor(draft.asset.id, texture.path),
          blob: variantBlobs.get(texture.path)!,
        })),
      );
      setProject(nextProject);
      setAssets((current) => [...current, draft.asset]);
      setSelectedAssetId(draft.asset.id);
      setSelectedLayerId(null);
      history.clear();
    } catch (error) {
      setEditorError(
        `linked paletteを作成できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setImporting(false);
      endEditorPersistentMutation();
    }
  };

  const handleDetachVariant = async (familyId: string, assetId: string) => {
    if (!project) {
      return;
    }
    const family = (project.families ?? []).find((candidate) => candidate.id === familyId);
    const asset = assets.find((candidate) => candidate.id === assetId);
    const variant = family?.variants.find((candidate) => candidate.assetId === assetId);
    const lostMetadata =
      variant?.kind === 'manual'
        ? 'manual variantとしての登録は失われます'
        : 'linked recipeと同期情報は失われます';
    if (
      !family ||
      !asset ||
      !variant ||
      !window.confirm(
        `variant「${asset.displayName}」をFamily「${family.name}」から外します。${lostMetadata}が、Assetは残ります。`,
      )
    ) {
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    try {
      await autosave.flush();
      const nextProject: Project = {
        ...project,
        families: (project.families ?? []).map((family) =>
          family.id === familyId
            ? {
                ...family,
                variants: family.variants.filter((variant) => variant.assetId !== assetId),
              }
            : family,
        ),
        updatedAt: new Date().toISOString(),
      };
      await saveProject(nextProject);
      setProject(nextProject);
      setVariantPreview(null);
      history.clear();
    } catch (error) {
      setEditorError(
        `Familyから外せませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      endEditorPersistentMutation();
    }
  };

  const handleRemoveFamily = async (familyId: string) => {
    if (!project) {
      return;
    }
    const family = (project.families ?? []).find((candidate) => candidate.id === familyId);
    if (!family || !window.confirm(`Family「${family.name}」を解除します。Assetは削除しません。`)) {
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    try {
      await autosave.flush();
      const nextProject: Project = {
        ...project,
        families: (project.families ?? []).filter((candidate) => candidate.id !== familyId),
        updatedAt: new Date().toISOString(),
      };
      await saveProject(nextProject);
      setProject(nextProject);
      setVariantPreview(null);
      history.clear();
    } catch (error) {
      setEditorError(
        `Familyを解除できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      endEditorPersistentMutation();
    }
  };

  const handlePreviewVariantRefresh = async (familyId: string, assetId: string) => {
    if (!project) {
      return;
    }
    const family = (project.families ?? []).find((candidate) => candidate.id === familyId);
    const variant = family?.variants.find(
      (candidate): candidate is LinkedAssetFamilyVariant =>
        candidate.assetId === assetId && candidate.kind !== 'manual',
    );
    const base = assets.find((asset) => asset.id === family?.baseAssetId);
    const variantAsset = assets.find((asset) => asset.id === assetId);
    if (!family || !variant || !base || !variantAsset) {
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    try {
      await autosave.flush();
      const [baseBlobs, variantBlobs] = await Promise.all([
        loadAssetBlobMap(base),
        loadAssetBlobMap(variantAsset),
      ]);
      const artifact = await prepareLinkedVariantRefresh({
        base,
        variantAsset,
        variant,
        baseBlobs,
        variantBlobs,
        transformPaletteBlob: transformPaletteVariantBlob,
      });
      const afterProject: Project = {
        ...project,
        families: (project.families ?? []).map((candidate) =>
          candidate.id === familyId
            ? {
                ...candidate,
                variants: candidate.variants.map((entry) =>
                  entry.assetId === assetId ? artifact.nextVariant : entry,
                ),
              }
            : candidate,
        ),
        updatedAt: artifact.nextVariant.fingerprint.syncedAt,
      };
      setVariantPreview({
        familyId,
        assetId,
        artifact,
        beforeProject: structuredClone(project),
        afterProject,
        baseAsset: structuredClone(base),
        beforeAsset: structuredClone(variantAsset),
        baseBlobs,
        variantBlobs,
      });
    } catch (error) {
      setVariantPreview(null);
      setEditorError(
        `refresh previewを作成できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      endEditorPersistentMutation();
    }
  };

  const handleRefreshVariant = async (
    familyId: string,
    assetId: string,
    artifact: LinkedVariantRefreshArtifact,
  ) => {
    const preview = variantPreview;
    if (
      !preview ||
      preview.familyId !== familyId ||
      preview.assetId !== assetId ||
      preview.artifact !== artifact
    ) {
      setEditorError('previewが古いため、refresh前後をもう一度previewしてください。');
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    try {
      await autosave.flush();
      const changedVariantPaths = new Set(artifact.blobChanges.map((change) => change.targetPath));
      const forwardInput = {
        beforeProject: preview.beforeProject,
        afterProject: preview.afterProject,
        targets: [
          {
            beforeAsset: preview.beforeAsset,
            afterAsset: artifact.afterAsset,
            blobs: artifact.blobChanges.map((change) => ({
              key: blobKeyFor(assetId, change.targetPath),
              before: change.before,
              after: change.after,
            })),
          },
        ],
        readExpectations: [
          {
            asset: preview.baseAsset,
            blobs: artifact.baseReadBlobPaths.map((path) => ({
              key: blobKeyFor(preview.baseAsset.id, path),
              expected: preview.baseBlobs.get(path)!,
            })),
          },
          {
            // target Asset自身もsource / write対象外Blobをrecipe入力として読んでいる。
            // 書き換えるedit Blobはtarget側CAS、それ以外はread expectationで再照合する。
            asset: preview.beforeAsset,
            blobs: artifact.variantReadBlobPaths
              .filter((path) => !changedVariantPaths.has(path))
              .map((path) => ({
                key: blobKeyFor(preview.beforeAsset.id, path),
                expected: preview.variantBlobs.get(path)!,
              })),
          },
        ],
        snapshotLabel: 'linked variant refresh前',
      };
      const reverseInput = {
        beforeProject: preview.afterProject,
        afterProject: preview.beforeProject,
        targets: [
          {
            beforeAsset: artifact.afterAsset,
            afterAsset: preview.beforeAsset,
            blobs: artifact.blobChanges.map((change) => ({
              key: blobKeyFor(assetId, change.targetPath),
              before: change.after,
              after: change.before,
            })),
          },
        ],
        allowProjectUpdatedAtDrift: true,
        historyReplay: true,
        snapshotLabel: '',
      };
      const redoInput = {
        ...forwardInput,
        allowProjectUpdatedAtDrift: true,
        historyReplay: true,
        snapshotLabel: '',
      };
      const applyState = (nextProject: Project, nextAsset: Asset) => {
        setProject(nextProject);
        setAssets((current) =>
          current.map((asset) => (asset.id === nextAsset.id ? nextAsset : asset)),
        );
      };
      await commitPersistentMutationWithHistory({
        apply: async () => {
          const committedProject = await saveAssetBatchRevision(forwardInput);
          applyState(committedProject, artifact.afterAsset);
        },
        history,
        entry: {
          label: 'linked variant refresh',
          undo: async () => {
            const committedProject = await saveAssetBatchRevision(reverseInput);
            applyState(committedProject, preview.beforeAsset);
            await reloadSnapshots(assetId);
          },
          redo: async () => {
            const committedProject = await saveAssetBatchRevision(redoInput);
            applyState(committedProject, artifact.afterAsset);
            await reloadSnapshots(assetId);
          },
        },
      });
      setVariantPreview(null);
      await reloadSnapshots(assetId);
    } catch (error) {
      setEditorError(
        `linked variantをrefreshできませんでした: ${error instanceof Error ? error.message : String(error)} previewを作り直してください。`,
      );
    } finally {
      endEditorPersistentMutation();
    }
  };

  const handlePrepareAssetBatch = async (
    config: AssetBatchConfig,
    signal: AbortSignal,
    onProgress: (progress: AssetBatchProgress) => void,
  ): Promise<AssetBatchPreview> => {
    await history.waitForPending();
    if (signal.aborted) {
      throw new AssetBatchCancelledError();
    }
    if (!project) {
      throw new Error('Projectを読み込めません。');
    }
    if (!beginEditorPersistentMutation()) {
      throw new Error('別の保存処理が完了してからpreviewを作成してください。');
    }
    try {
      await autosave.flush();
      if (signal.aborted) {
        throw new AssetBatchCancelledError();
      }
      return await prepareAssetBatchPreview({
        project: structuredClone(project),
        assets: assets.map((asset) => structuredClone(asset)),
        config,
        signal,
        onProgress,
        dependencies: {
          loadAssetBlobs: loadAssetBlobMap,
          loadBlob,
          transformPaletteBlob: transformPaletteBatchBlob,
          getStorageUsage,
        },
      });
    } finally {
      endEditorPersistentMutation();
    }
  };

  const handleExecuteAssetBatch = async (
    preview: AssetBatchPreview,
    includedTargetIds: ReadonlySet<string>,
  ): Promise<void> => {
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      throw new Error('別の保存処理が完了してから一括変更を実行してください。');
    }
    try {
      await autosave.flush();
      const plan = buildAssetBatchRevisionPlan(preview, includedTargetIds);
      const applyState = (nextProject: Project, nextAssets: Asset[]) => {
        const byId = new Map(
          nextAssets.map((asset) => [asset.id, { ...asset, textures: [...asset.textures] }]),
        );
        setProject(nextProject);
        setAssets((current) => current.map((asset) => byId.get(asset.id) ?? asset));
      };
      const refreshVisibleSnapshots = async () => {
        if (selectedAssetId && plan.targetIds.includes(selectedAssetId)) {
          await reloadSnapshots(selectedAssetId);
        }
      };
      await commitPersistentMutationWithHistory({
        apply: async () => {
          const committedProject = await saveAssetBatchRevision(plan.forward);
          applyState(committedProject, plan.afterAssets);
        },
        history,
        entry: {
          label: plan.label,
          undo: async () => {
            const committedProject = await saveAssetBatchRevision(plan.undo);
            applyState(committedProject, plan.beforeAssets);
            await refreshVisibleSnapshots();
          },
          redo: async () => {
            const committedProject = await saveAssetBatchRevision(plan.redo);
            applyState(committedProject, plan.afterAssets);
            await refreshVisibleSnapshots();
          },
        },
      });
      setVariantPreview(null);
      await refreshVisibleSnapshots();
    } finally {
      endEditorPersistentMutation();
    }
  };

  const deleteAssetWithFamilyReferences = async (asset: Asset) => {
    if (!project) {
      return;
    }
    const membership = projectFamilyMembership(project, asset.id);
    if (membership?.role === 'base') {
      setEditorError('Family baseは削除できません。先にFamilyを解除してください。');
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setDeletingAsset(true);
    try {
      await autosave.flush();
      const nextProject: Project = {
        ...project,
        assets: project.assets.filter((entry) => entry.id !== asset.id),
        ...(project.families
          ? {
              families: project.families.map((family) => ({
                ...family,
                variants: family.variants.filter((variant) => variant.assetId !== asset.id),
              })),
            }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      await deleteAssetBundle({ project: nextProject, assetId: asset.id });
      const remaining = assets.filter((candidate) => candidate.id !== asset.id);
      setProject(nextProject);
      setAssets(remaining);
      setSelectedAssetId(remaining[0]?.id ?? null);
      setSelectedLayerId(null);
      setCheckedLayerIds([]);
      setVariantPreview(null);
      history.clear();
    } catch (error) {
      setEditorError(
        `アセットを削除できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setDeletingAsset(false);
      endEditorPersistentMutation();
    }
  };

  const handleDeleteVariantAsset = async (_familyId: string, assetId: string) => {
    const asset = assets.find((candidate) => candidate.id === assetId);
    if (!asset) {
      return;
    }
    if (
      !window.confirm(
        `variantアセット「${asset.displayName}」をFamily参照・画像Blobごと削除します。この操作は元に戻せません。`,
      )
    ) {
      return;
    }
    await deleteAssetWithFamilyReferences(asset);
  };

  const quarantineFailedImage = async (file: File | undefined, error: unknown) => {
    if (!file) {
      return false;
    }
    const cause = error instanceof FrameSetImportError ? error.cause : error;
    if (!isQuarantinableImageImportError(cause)) {
      return false;
    }
    try {
      await saveQuarantineEntry({
        fileName: file.name,
        errorMessage: cause.message,
        bytes: await file.arrayBuffer(),
      });
      return true;
    } catch {
      // quarantine保存の失敗で、利用者が直すべき元の画像import errorを隠さない。
      return false;
    }
  };

  const stageFrameSetResult = (result: PreparedFrameSetImport) => {
    if (!project) return;
    setPendingImageImport({
      kind: 'new-assets',
      preview: frameSetPreviewContent(result),
      beforeProject: project,
      beforeAssets: assets,
      beforeSelectedAssetId: selectedAssetId,
      stagedAssets: [result.asset],
      blobs: result.blobs,
    });
  };

  const handleFiles = async (files: Iterable<File>) => {
    const batch = Array.from(files);
    if (batch.length === 0 || !project || !beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setImportStatusLabel('画像のpreviewを準備中…');
    setImporting(true);
    let currentFile: File | undefined;
    try {
      assertImageBatchCount(batch.length);
      const staged = [];
      for (const file of batch) {
        currentFile = file;
        staged.push(await prepareNewAssetImageImport(file));
      }
      const stagedAssets = staged.map(({ asset }) => asset);
      const containsOptionalFormat = staged.some(({ preview }) => preview.format !== 'standard');
      setPendingImageImport({
        kind: 'new-assets',
        preview: {
          id: generateId('import_preview'),
          modeLabel: containsOptionalFormat
            ? '新規Asset画像（通常 + optional形式）'
            : '通常画像（1 file = 1 Asset）',
          title: `${stagedAssets.length}件の独立Asset`,
          fileNames: batch.map((file) => file.name),
          assetCount: stagedAssets.length,
          layerCount: stagedAssets.reduce((sum, asset) => sum + asset.layers.length, 0),
          frameCount: stagedAssets.reduce((sum, asset) => sum + (asset.frames?.length ?? 0), 0),
          animationCount: stagedAssets.reduce((sum, asset) => sum + asset.animations.length, 0),
          details: [
            '各fileを独立したAssetとして作成します。連番としてまとめる場合は専用モードを使ってください。',
            ...staged.flatMap(({ preview }) => preview.details),
          ],
          losses: staged.flatMap(({ preview }) => preview.losses),
          warnings: staged.flatMap(({ preview }) => preview.warnings),
        },
        beforeProject: project,
        beforeAssets: assets,
        beforeSelectedAssetId: selectedAssetId,
        stagedAssets,
        blobs: staged.flatMap(({ blobs }) => blobs),
      });
    } catch (error) {
      const quarantined = await quarantineFailedImage(currentFile, error);
      setEditorError(
        `${error instanceof Error ? error.message : String(error)} 選択した画像は1件も追加されていません。${
          quarantined ? ' 失敗したfileを隔離しました。' : ''
        }`,
      );
    } finally {
      setImporting(false);
      endEditorPersistentMutation();
    }
  };

  const handlePrepareSequenceImport = async (files: File[]) => {
    if (!project || files.length === 0 || !beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setImportStatusLabel('連番previewを準備中…');
    setImporting(true);
    try {
      stageFrameSetResult(await prepareSequenceImport(files));
    } catch (error) {
      const failedFile = error instanceof FrameSetImportError ? error.file : undefined;
      const quarantined = await quarantineFailedImage(failedFile, error);
      setEditorError(
        `${error instanceof Error ? error.message : String(error)} 正本は変更されていません。${
          quarantined ? ' 失敗したfileを隔離しました。' : ''
        }`,
      );
    } finally {
      setImporting(false);
      endEditorPersistentMutation();
    }
  };

  const handlePrepareSpriteSheetImport = async (file: File, grid: ManualGridInput) => {
    if (!project || !beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setImportStatusLabel('Sprite Sheet previewを準備中…');
    setImporting(true);
    try {
      stageFrameSetResult(await prepareSpriteSheetImport(file, grid));
    } catch (error) {
      const quarantined = await quarantineFailedImage(file, error);
      setEditorError(
        `${error instanceof Error ? error.message : String(error)} 正本は変更されていません。${
          quarantined ? ' 失敗したfileを隔離しました。' : ''
        }`,
      );
    } finally {
      setImporting(false);
      endEditorPersistentMutation();
    }
  };

  const handlePrepareTileSetImport = async (file: File, input: TileSetImportInput) => {
    if (!project || !beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setImportStatusLabel('Tileset previewを準備中…');
    setImporting(true);
    try {
      stageFrameSetResult(await prepareTileSetImport(file, input));
    } catch (error) {
      const quarantined = await quarantineFailedImage(file, error);
      setEditorError(
        `${error instanceof Error ? error.message : String(error)} 正本は変更されていません。${
          quarantined ? ' 失敗したfileを隔離しました。' : ''
        }`,
      );
    } finally {
      setImporting(false);
      endEditorPersistentMutation();
    }
  };

  const handlePrepareAtlasImport = async (
    jsonFile: File,
    textureFile: File,
    input: ChameleonAtlasBundleInput,
  ) => {
    if (!project || !beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setImportStatusLabel('Chameleon Atlas previewを準備中…');
    setImporting(true);
    try {
      stageFrameSetResult(await prepareChameleonAtlasBundleImport(jsonFile, textureFile, input));
    } catch (error) {
      const failedFile = error instanceof FrameSetImportError ? error.file : textureFile;
      const quarantined = await quarantineFailedImage(failedFile, error);
      setEditorError(
        `${error instanceof Error ? error.message : String(error)} 正本は変更されていません。${
          quarantined ? ' 失敗した画像fileを隔離しました。' : ''
        }`,
      );
    } finally {
      setImporting(false);
      endEditorPersistentMutation();
    }
  };

  const handleCancelImageImport = () => {
    if (importing) return;
    setPendingImageImport(null);
    setEditorError(null);
  };

  const handleConfirmImageImport = async () => {
    const pending = pendingImageImport;
    if (!pending || !project) {
      return;
    }
    const beforeAssetStillCurrent =
      pending.kind === 'new-assets' ||
      pending.beforeAssets.find((asset) => asset.id === pending.beforeAsset.id) ===
        pending.beforeAsset;
    if (
      project !== pending.beforeProject ||
      assets !== pending.beforeAssets ||
      !beforeAssetStillCurrent
    ) {
      setPendingImageImport(null);
      setEditorError(
        'preview準備後にProjectまたはAssetが変わりました。取り込みpreviewを作り直してください。',
      );
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation({ allowPendingImageImport: true })) {
      return;
    }
    setEditorError(null);
    setImportStatusLabel('取り込み内容を原子保存中…');
    setImporting(true);
    try {
      if (pending.kind === 'new-assets') {
        const beforeProject = pending.beforeProject;
        const beforeAssets = pending.beforeAssets;
        const afterProject: Project = {
          ...beforeProject,
          assets: [
            ...beforeProject.assets,
            ...pending.stagedAssets.map((asset) => ({
              id: asset.id,
              name: asset.name,
              displayName: asset.displayName,
              assetType: asset.assetType,
            })),
          ],
          updatedAt: new Date().toISOString(),
        };
        const afterAssets = [...beforeAssets, ...pending.stagedAssets];
        const applyAfterState = () => {
          setProject(afterProject);
          setAssets(afterAssets);
          setSelectedAssetId(pending.stagedAssets.at(-1)?.id ?? null);
          setSelectedLayerId(null);
          setCheckedLayerIds([]);
          setVariantPreview(null);
        };
        const applyBeforeState = () => {
          setProject(beforeProject);
          setAssets(beforeAssets);
          setSelectedAssetId(pending.beforeSelectedAssetId ?? beforeAssets[0]?.id ?? null);
          setSelectedLayerId(null);
          setCheckedLayerIds([]);
          setVariantPreview(null);
        };
        await autosave.flush();
        await commitPersistentMutationWithHistory({
          apply: async () => {
            await saveProjectBundle(afterProject, pending.stagedAssets, pending.blobs);
            applyAfterState();
          },
          history,
          entry: {
            label: '画像取り込み',
            undo: async () => {
              await autosave.flush();
              await deleteAssetsBundle({
                project: beforeProject,
                assetIds: pending.stagedAssets.map((asset) => asset.id),
              });
              applyBeforeState();
            },
            redo: async () => {
              await autosave.flush();
              await saveProjectBundle(afterProject, pending.stagedAssets, pending.blobs);
              applyAfterState();
            },
          },
        });
      } else {
        const blobKeys = pending.blobs.map(({ key }) => key);
        const redoBlobs = pending.blobs.map(({ key, blob }) => ({ key, blob }));
        await commitPersistentMutationWithHistory({
          apply: () =>
            saveAssetRevisionAndApply(pending.afterAsset, {
              putBlobs: pending.blobs,
              sourceBlobTransitions: { createKeys: pending.sourceCreateKeys },
            }),
          history,
          entry: {
            label: '画像レイヤー一括追加',
            undo: () =>
              saveAssetRevisionAndApply(pending.beforeAsset, {
                deleteBlobKeys: blobKeys,
                sourceBlobTransitions: { deleteKeys: pending.sourceCreateKeys },
              }),
            redo: () =>
              saveAssetRevisionAndApply(pending.afterAsset, {
                putBlobs: redoBlobs,
                sourceBlobTransitions: { createKeys: pending.sourceCreateKeys },
              }),
          },
        });
        setSelectedLayerId(pending.selectedLayerId);
      }
      setPendingImageImport(null);
    } catch (error) {
      setEditorError(
        `${error instanceof Error ? error.message : String(error)} 正本は部分更新されていません。previewを確認して再試行してください。`,
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
    setImportStatusLabel('独立左右反転コピーを作成中…');
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
      history.clear();
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
      history.clear();
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
      history.clear();
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
    if (selectedFamilyMembership?.role === 'base') {
      setEditorError('Family baseは削除できません。先にFamilyを解除してください。');
      return;
    }
    const ok = window.confirm(
      `アセット「${selectedAsset.displayName}」を削除します。この操作は元に戻せません。よろしいですか？`,
    );
    if (!ok) {
      return;
    }
    await deleteAssetWithFamilyReferences(selectedAsset);
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
    history.clear();
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
    if (files.length === 0 || !selectedAsset || !project) {
      return;
    }
    if (!beginEditorPersistentMutation()) {
      return;
    }
    setEditorError(null);
    setImportStatusLabel('画像レイヤーのpreviewを準備中…');
    setImporting(true);
    let currentFile: File | undefined;
    try {
      assertImageBatchCount(files.length);
      const staged = [];
      for (const file of files) {
        currentFile = file;
        staged.push(await importImageAsLayer(file, selectedAsset));
      }
      const before = selectedAsset;
      const after: Asset = {
        ...before,
        updatedAt: new Date().toISOString(),
        textures: [...before.textures, ...staged.flatMap(({ textures }) => textures)],
        layers: [...before.layers, ...staged.map(({ layer }) => layer)],
        provenance: [...(before.provenance ?? []), ...staged.map(({ provenance }) => provenance)],
      };
      const blobs = staged.flatMap(({ blobs: resultBlobs }) => resultBlobs);
      const sourceCreateKeys = staged
        .flatMap(({ textures }) => textures)
        .filter((texture) => texture.kind === 'source')
        .map((texture) => blobKeyFor(before.id, texture.path));
      setPendingImageImport({
        kind: 'layers',
        preview: {
          id: generateId('import_preview'),
          modeLabel: '選択Assetへの画像layer追加',
          title: `「${before.displayName}」へ${files.length} layer追加`,
          fileNames: files.map((file) => file.name),
          assetCount: 0,
          layerCount: staged.length,
          frameCount: 0,
          animationCount: 0,
          details: [
            '選択中Assetの最前面へ画像layerを追加します。canvasSizeは変更しません。',
            '各fileをsource Blobとしてそのまま保持し、edit PNGとprovenanceを1件ずつ作成します。',
            '対応していない内容や失われる画像pixelはありません。',
          ],
          losses: [],
          warnings: [],
        },
        beforeProject: project,
        beforeAssets: assets,
        beforeAsset: before,
        afterAsset: after,
        blobs,
        sourceCreateKeys,
        selectedLayerId: staged.at(-1)?.layer.id ?? null,
      });
    } catch (error) {
      const quarantined = await quarantineFailedImage(currentFile, error);
      setEditorError(
        `${error instanceof Error ? error.message : String(error)} 選択した画像レイヤーは1件も追加されていません。${
          quarantined ? ' 失敗したfileを隔離しました。' : ''
        }`,
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

  const toolButtons = CANVAS_TOOL_GUIDES;
  const activeToolGuide = CANVAS_TOOL_GUIDE_BY_ID[tool];

  const statusMessages = (
    <>
      {importing && <p className="import-status">{importStatusLabel}</p>}
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
        <a
          className="editor-help-link"
          href={`${import.meta.env.BASE_URL}guide/features/`}
          target="_blank"
          rel="noreferrer"
        >
          ？ 操作ガイド
        </a>
        <div className="editor-panel-toggles">
          <button type="button" aria-pressed={leftOpen} onClick={() => setLeftOpen((v) => !v)}>
            ツール
          </button>
          <button type="button" aria-pressed={rightOpen} onClick={() => setRightOpen((v) => !v)}>
            プロパティ
          </button>
        </div>
      </header>

      {(importing || imageProcessing || editorError) && (
        <div className="editor-global-status" aria-live="polite">
          {statusMessages}
        </div>
      )}

      <div className="editor-body">
        <nav
          className={`editor-toolbar editor-side${leftOpen ? '' : ' collapsed'}`}
          aria-label="ツール"
          aria-describedby="active-tool-help"
        >
          {toolButtons.map((item) => (
            <button
              key={item.tool}
              type="button"
              aria-pressed={tool === item.tool}
              title={item.purpose}
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
              <nav
                className="editor-mobile-toolbar"
                aria-label="編集ツール"
                aria-describedby="active-tool-help"
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
              <div
                id="active-tool-help"
                className="editor-tool-help"
                data-change-kind={activeToolGuide.kind}
              >
                <div className="editor-tool-help-heading">
                  <strong>現在：{activeToolGuide.label}</strong>
                  <span>{activeToolGuide.kind}</span>
                </div>
                <p>
                  <b>できること：</b>
                  {activeToolGuide.purpose}
                </p>
                <p>
                  <b>操作：</b>
                  {activeToolGuide.gesture}
                </p>
                <p>
                  <b>変化と戻し方：</b>
                  {activeToolGuide.effect}
                </p>
                <a
                  href={`${import.meta.env.BASE_URL}guide/features/#tool-${activeToolGuide.tool}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  図で詳しく見る
                </a>
              </div>
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
            </div>
          ) : (
            <div className={`canvas-placeholder${dragOver ? ' drag-over' : ''}`}>
              <div className="import-zone">
                <p>画像をここへドラッグ&ドロップ</p>
                <label className="import-button">
                  画像を選ぶ
                  <input
                    type="file"
                    accept={NEW_ASSET_IMPORT_ACCEPT}
                    multiple
                    onChange={handleFileInput}
                    className="visually-hidden-input"
                  />
                </label>
                <p className="editor-note">
                  PNG / JPG / WebPは通常画像、SVGはPNG pixel、GIF /
                  APNGは最大16frameのAssetとして取り込みます。一度に16file、1fileあたり25MiB、4096 x
                  4096までです。
                </p>
              </div>
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
          <div className="editor-properties-guide">
            <p>目的の場所へ移動できます。詳しい説明は別タブで開きます。</p>
            <nav aria-label="プロパティ内メニュー">
              <a href="#property-asset">アセット</a>
              <a href="#property-layers">レイヤー</a>
              <a href="#property-image">画像編集</a>
              <a href="#property-game-data">ゲーム情報</a>
              <a href="#property-parts">パーツ・リグ</a>
            </nav>
            <a
              href={`${import.meta.env.BASE_URL}guide/features/#properties`}
              target="_blank"
              rel="noreferrer"
            >
              ？ プロパティの機能を図で見る
            </a>
          </div>
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

          <h3 id="property-asset" className="editor-subheading">
            アセット
          </h3>
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
                  独立左右反転コピーを作成
                </button>
                <button
                  type="button"
                  className="asset-delete-button"
                  disabled={
                    deletingAsset || mutationBusy || selectedFamilyMembership?.role === 'base'
                  }
                  onClick={() => void handleDeleteAsset()}
                >
                  アセットを削除
                </button>
              </div>
              <p className="editor-note">
                独立コピーはstandaloneです。Familyには登録されず、自動refreshも行いません。
              </p>
              {selectedFamilyMembership?.role === 'base' && (
                <p className="variant-warning">
                  baseを削除するには、先にFamilyを解除してください。
                </p>
              )}
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

          {project && (
            <ImportFrameSetPanel
              accept={RASTER_IMPORT_ACCEPT}
              busy={persistentMutationBlocked || importing || creatingAsset || deletingAsset}
              onPrepareSequence={handlePrepareSequenceImport}
              onPrepareSheet={handlePrepareSpriteSheetImport}
              onPrepareTileset={handlePrepareTileSetImport}
              onPrepareAtlas={handlePrepareAtlasImport}
            />
          )}

          {project && (
            <VariantPanel
              project={project}
              assets={assets}
              selectedAsset={selectedAsset}
              busy={persistentMutationBlocked || importing || creatingAsset || deletingAsset}
              inspections={variantInspections}
              preview={
                variantPreview
                  ? { assetId: variantPreview.assetId, artifact: variantPreview.artifact }
                  : null
              }
              onSelectAsset={(assetId) => {
                setSelectedAssetId(assetId);
                setSelectedLayerId(null);
                setCheckedLayerIds([]);
              }}
              onCreateFamily={(name, baseAssetId) => void handleCreateFamily(name, baseAssetId)}
              onAddManualVariant={(familyId, assetId) =>
                void handleAddManualVariant(familyId, assetId)
              }
              onCreateMirrorVariant={(familyId) => void handleCreateMirrorVariant(familyId)}
              onCreatePaletteVariant={(options) => void handleCreatePaletteVariant(options)}
              onDetachVariant={(familyId, assetId) => void handleDetachVariant(familyId, assetId)}
              onRemoveFamily={(familyId) => void handleRemoveFamily(familyId)}
              onPreviewRefresh={(familyId, assetId) =>
                void handlePreviewVariantRefresh(familyId, assetId)
              }
              onRefreshVariant={(familyId, assetId, artifact) =>
                void handleRefreshVariant(familyId, assetId, artifact)
              }
              onDeleteVariantAsset={(familyId, assetId) =>
                void handleDeleteVariantAsset(familyId, assetId)
              }
            />
          )}

          {project && (
            <AssetBatchPanel
              project={project}
              assets={assets}
              selectedAsset={selectedAsset}
              busy={persistentMutationBlocked || importing || creatingAsset || deletingAsset}
              onPrepare={handlePrepareAssetBatch}
              onExecute={handleExecuteAssetBatch}
              onOpenBackup={() => setMobileView('export')}
            />
          )}

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

          <h3 id="property-canvas" className="editor-subheading">
            Asset canvasサイズ
          </h3>
          {selectedAsset ? (
            <CanvasResizePanel asset={selectedAsset} onCommit={commitPanelChange} />
          ) : (
            <p className="editor-note">アセットを選ぶとcanvasサイズを変更できます。</p>
          )}

          <h3 id="property-layers" className="editor-subheading">
            レイヤー
          </h3>
          {selectedAsset ? (
            <LayerPanel
              asset={selectedAsset}
              selectedLayerId={selectedLayerId}
              checkedLayerIds={checkedLayerIds}
              importAccept={RASTER_IMPORT_ACCEPT}
              onSelectLayer={setSelectedLayerId}
              onToggleChecked={handleToggleChecked}
              onCommit={commitPanelChange}
              onAddImageLayer={(event) => void handleAddImageLayer(event)}
              onAddGuideLayer={handleAddGuideLayer}
            />
          ) : (
            <p className="editor-note">アセットを選ぶとレイヤーを操作できます。</p>
          )}

          <h3 className="editor-subheading">整列・等間隔配置</h3>
          {selectedAsset ? (
            <AlignPanel
              asset={selectedAsset}
              checkedLayerIds={checkedLayerIds}
              selectedLayerId={selectedLayerId}
              onCommit={commitPanelChange}
            />
          ) : (
            <p className="editor-note">アセットを選ぶと複数レイヤーの整列ができます。</p>
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
              <h3 id="property-image" className="editor-subheading">
                画像編集
              </h3>
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

                <fieldset className="editor-fieldset">
                  <legend>透明縁・トリミング</legend>
                  <p className="editor-note">
                    alpha
                    boundsを読み取り専用で検査します。結果は保存せず、トリミング時も選択layerの画像だけを変更します。Asset
                    canvas、原点、アンカー、当たり判定は変更しません。
                  </p>
                  <label className="editor-field">
                    alphaしきい値（0-255）
                    <input
                      type="number"
                      aria-label="alphaしきい値"
                      min={0}
                      max={255}
                      step={1}
                      value={alphaThreshold}
                      onChange={(event) => {
                        const next = Math.min(
                          255,
                          Math.max(0, Math.round(Number(event.target.value) || 0)),
                        );
                        setAlphaThreshold(next);
                        setAlphaInspection(null);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!!imageProcessing || persistentMutationBlocked}
                    onClick={() => void handleAlphaInspect()}
                  >
                    透明縁を検査
                  </button>
                  {activeAlphaInspection && (
                    <div aria-label="透明縁検査結果" className="editor-repair-result">
                      {activeAlphaInspection.isEmpty ||
                      !activeAlphaInspection.bounds ||
                      !activeAlphaInspection.margins ? (
                        <p role="alert" className="editor-note">
                          しきい値を超える表示pixelがありません。トリミングできません。
                        </p>
                      ) : (
                        <>
                          <p className="editor-note">
                            表示範囲: x {activeAlphaInspection.bounds.x}, y{' '}
                            {activeAlphaInspection.bounds.y}, {activeAlphaInspection.bounds.width} x{' '}
                            {activeAlphaInspection.bounds.height}px
                          </p>
                          <p className="editor-note">
                            透明余白: 上 {activeAlphaInspection.margins.top}px / 右{' '}
                            {activeAlphaInspection.margins.right}px / 下{' '}
                            {activeAlphaInspection.margins.bottom}px / 左{' '}
                            {activeAlphaInspection.margins.left}px
                          </p>
                          <p role="status" className="editor-note">
                            {activeAlphaInspection.hasTransparentMargin
                              ? '透明縁があります。選択画像だけをトリミングできます。'
                              : '透明縁はありません。現在の画像サイズが表示範囲と一致しています。'}
                          </p>
                          {Object.values(activeAlphaInspection.touchesEdge).some(Boolean) && (
                            <p role="alert" className="editor-note">
                              表示pixelが画像端に接しています。接している辺にはトリミング後も余白がありません。
                            </p>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        disabled={
                          !activeAlphaInspection.bounds ||
                          !activeAlphaInspection.hasTransparentMargin ||
                          !!imageProcessing ||
                          persistentMutationBlocked
                        }
                        onClick={() => void handleAlphaTrim()}
                      >
                        透明縁をトリミング
                      </button>
                    </div>
                  )}
                </fieldset>

                <fieldset className="editor-fieldset">
                  <legend>透明padding</legend>
                  <p className="editor-note">
                    選択画像の周囲へ透明pixelを追加します。元の内容がworld上で動かないようLayer位置を補正し、Asset
                    canvasとゲーム情報は変更しません。
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
                    Layer中心を固定して選択画像だけをリサイズします。pixel
                    artはnearest、写真・滑らかな素材はsmoothが基本です。Asset
                    canvasとゲーム情報は変更しません。
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
                                  {hex} · {entry.count}px · {Math.round(entry.coverage * 1000) / 10}
                                  %
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
              </div>
            </>
          )}

          <h3 id="property-game-data" className="editor-subheading">
            ゲーム情報
          </h3>
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

          <h3 id="property-parts" className="editor-subheading">
            パーツ
          </h3>
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
                    {asset.canvasSize.height} · {projectFamilyStatusLabel(project, asset.id)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <label className="import-button">
            画像を追加
            <input
              type="file"
              accept={NEW_ASSET_IMPORT_ACCEPT}
              multiple
              onChange={handleFileInput}
              className="visually-hidden-input"
            />
          </label>
          <div className="editor-note" aria-label="画像取り込み対応状況">
            <p>
              PNG / JPG / WebPは通常画像、SVGはrasterized画像、GIF /
              APNGはframe列として新規Assetへ取り込みます。
            </p>
            <p>
              AsepriteはPNG Sprite Sheet、PSD / Krita /
              OpenRasterはPNGまたはWebPへ書き出してから取り込んでください。専用原本だけのreference保存は行いません。
            </p>
          </div>
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
            firedAnimationEvents={firedAnimationEvents}
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

      {pendingImageImport && (
        <ImportPreviewDialog
          preview={pendingImageImport.preview}
          busy={importing || mutationBusy}
          onConfirm={handleConfirmImageImport}
          onCancel={handleCancelImageImport}
        />
      )}
    </div>
  );
}
