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
import {
  hexToRgb,
  operationLabel,
  rgbToHex,
  type ImageOperation,
  type Rect,
} from '../../core/images/operations';
import {
  blobToPixelBuffer,
  pixelBufferToBlob,
  runImageOperation,
} from '../../core/images/runOperation';
import {
  addAnchor,
  addGuideLayer,
  applyFrameToAsset,
  flipCopyAsset,
  flipLayerHorizontal,
  renameLayer,
  ASSET_TYPES,
  type AnchorRole,
  type Asset,
  type AssetType,
  type Project,
  type Vec2,
} from '../../core/model';
import {
  AutosaveQueue,
  deleteAsset,
  listProjectAssets,
  listSnapshots,
  loadBlob,
  loadProject,
  restoreSnapshot,
  saveAsset,
  saveBlob,
  saveProject,
  saveProjectBundle,
  saveSnapshot,
  type AssetSnapshotSummary,
  type SaveState,
} from '../../core/storage';
import { layerWorldPoint } from '../../renderers/canvas2d/view';
import { AssetTypePanel, BackgroundLayerFields } from './AssetTypePanel';
import { ASSET_TYPE_LABELS } from './assetTypeLabels';
import {
  BLANK_CANVAS_SIZE_PRESETS,
  createBlankAssetBundle,
  DEFAULT_BLANK_CANVAS_SIZE,
  type BlankCanvasSizePreset,
} from './blankAsset';
import { CanvasEditor } from './CanvasEditor';
import { LAYER_TOOLS, type CanvasTool } from './canvasTools';
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
  const [dragOver, setDragOver] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('canvas');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const layerEditBeforeRef = useRef<Asset | null>(null);

  // 新規アセット作成フォーム（2D-2-CREATE-01）。画像を取り込まず、型とサイズだけで空キャンバスを作る。
  const [newAssetName, setNewAssetName] = useState('新規アセット');
  const [newAssetType, setNewAssetType] = useState<AssetType>('character');
  const [newAssetSize, setNewAssetSize] =
    useState<BlankCanvasSizePreset>(DEFAULT_BLANK_CANVAS_SIZE);
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [deletingAsset, setDeletingAsset] = useState(false);

  // タイムライン（Phase 9）
  const [selectedAnimationId, setSelectedAnimationId] = useState<string | null>(null);
  const [previewFrameId, setPreviewFrameId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackIndexRef = useRef(0);

  // 画像編集パラメータ
  const [eraserSize, setEraserSize] = useState(16);
  const [bgTolerance, setBgTolerance] = useState(30);
  const [hsl, setHsl] = useState({ hue: 0, saturation: 0, lightness: 0 });
  const [replaceFrom, setReplaceFrom] = useState('#ffffff');
  const [replaceTo, setReplaceTo] = useState('#ff0000');
  const [replaceTolerance, setReplaceTolerance] = useState(20);
  const [outlineColor, setOutlineColor] = useState('#000000');
  const [outlineThickness, setOutlineThickness] = useState(2);

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

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null;
  const selectedLayer = selectedAsset?.layers.find((layer) => layer.id === selectedLayerId) ?? null;
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

  /** アセットのスナップショットを適用して自動保存する（Undo / Redo からも使う）。 */
  const applyAssetSnapshot = useCallback(
    (snapshot: Asset) => {
      setAssets((prev) => prev.map((asset) => (asset.id === snapshot.id ? snapshot : asset)));
      autosave.schedule(() => saveAsset(projectId, snapshot));
    },
    [autosave, projectId],
  );

  /** 変更を適用し、履歴へ積む。 */
  const commitAssetChange = useCallback(
    (label: string, before: Asset, next: Asset) => {
      applyAssetSnapshot(next);
      history.push({
        label,
        undo: () => applyAssetSnapshot(before),
        redo: () => applyAssetSnapshot(next),
      });
    },
    [applyAssetSnapshot, history],
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
        history.undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history]);

  // アセットを切り替えたらタイムラインの選択・再生状態をリセットする
  useEffect(() => {
    setSelectedAnimationId(null);
    setPreviewFrameId(null);
    setIsPlaying(false);
    setSelectedColliderId(null);
    playbackIndexRef.current = 0;
  }, [selectedAssetId]);

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
   */
  const applyImageEdit = async (operation: ImageOperation) => {
    if (!selectedAsset || !selectedLayer?.textureId) {
      setEditorError('編集するレイヤーを選択してください。');
      return;
    }
    const texture = selectedAsset.textures.find((tex) => tex.id === selectedLayer.textureId);
    if (!texture) {
      setEditorError('レイヤーが参照するテクスチャが見つかりません。');
      return;
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

      await saveBlob(projectId, key, afterBlob);
      applyAssetSnapshot(next);
      history.push({
        label,
        undo: () => {
          void (async () => {
            await saveBlob(projectId, key, beforeBlob);
            // textures を新しい配列にしてビットマップ再読込を促す
            applyAssetSnapshot({ ...before, textures: [...before.textures] });
          })();
        },
        redo: () => {
          void (async () => {
            await saveBlob(projectId, key, afterBlob);
            applyAssetSnapshot({ ...next, textures: [...next.textures] });
          })();
        },
      });
    } catch (error) {
      setEditorError(
        `${label}に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setImageProcessing(null);
    }
  };

  /**
   * 復旧点から画像とアセットを復元する（2D-1B-STORAGE §C）。
   * asset（JSON）と Blob（画像実体）は必ず対で書き換える必要があるため、
   * applyImageEdit と同じ形（saveBlob + applyAssetSnapshot + history.push）で
   * Undo / Redo の両方で Blob を書き戻す。commitAssetChange（asset のみ）だと
   * Undo 後に「asset は復元前（新サイズ）だが Blob は復元後（旧サイズ）のまま」という
   * 不整合が起きるため使わない。
   */
  const handleRestoreSnapshot = async (snapshotId: string) => {
    setEditorError(null);
    try {
      const restored = await restoreSnapshot(snapshotId);
      const key = restored.blobKey;
      const current = assets.find((asset) => asset.id === restored.asset.id) ?? restored.asset;
      // 上書きする前に、復元前（現在）の Blob を退避する（Undo で書き戻すため）。
      const beforeBlob = await loadBlob(key);
      // textures を新しい配列にしてビットマップ再読込を促す（他の画像編集 Undo/Redo と同じ手当て）
      const before: Asset = { ...current, textures: [...current.textures] };
      const next: Asset = { ...restored.asset, textures: [...restored.asset.textures] };

      await saveBlob(projectId, key, restored.blob);
      applyAssetSnapshot(next);
      history.push({
        label: '復旧点から復元',
        undo: () => {
          void (async () => {
            if (beforeBlob) {
              await saveBlob(projectId, key, beforeBlob);
            }
            applyAssetSnapshot({ ...before, textures: [...before.textures] });
          })();
        },
        redo: () => {
          void (async () => {
            await saveBlob(projectId, key, restored.blob);
            applyAssetSnapshot({ ...next, textures: [...next.textures] });
          })();
        },
      });
    } catch (error) {
      setEditorError(
        `復旧点から復元できませんでした: ${error instanceof Error ? error.message : String(error)}`,
      );
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

  const handleFiles = async (files: Iterable<File>) => {
    if (!project) {
      return;
    }
    setEditorError(null);
    setImporting(true);
    try {
      let currentProject = project;
      for (const file of Array.from(files)) {
        const result = await importImageFile(file);
        for (const { key, blob } of result.blobs) {
          await saveBlob(currentProject.id, key, blob);
        }
        await saveAsset(currentProject.id, result.asset);
        currentProject = {
          ...currentProject,
          assets: [
            ...currentProject.assets,
            {
              id: result.asset.id,
              name: result.asset.name,
              displayName: result.asset.displayName,
              assetType: result.asset.assetType,
            },
          ],
          updatedAt: new Date().toISOString(),
        };
        await saveProject(currentProject);
        setAssets((prev) => [...prev, result.asset]);
        setSelectedAssetId(result.asset.id);
        setSelectedLayerId(null);
      }
      setProject(currentProject);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
    }
  };

  /** 選択アセットを左右反転した新しいアセットを生成する（Phase 19-B, docs/future/FLIP_DESIGN.md）。 */
  const handleFlipCopyAsset = async () => {
    if (!project || !selectedAsset) {
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
    setEditorError(null);
    setCreatingAsset(true);
    try {
      const trimmedName = newAssetName.trim() || '新規アセット';
      const { asset, blobs } = await createBlankAssetBundle({
        name: trimmedName,
        displayName: trimmedName,
        assetType: newAssetType,
        size: newAssetSize,
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
    setEditorError(null);
    setDeletingAsset(true);
    try {
      // 保留中の自動保存を先に終わらせてから削除する（上記コメント参照）。
      await autosave.flush();
      await deleteAsset(selectedAsset.id);
      const nextProject: Project = {
        ...project,
        assets: project.assets.filter((entry) => entry.id !== selectedAsset.id),
        updatedAt: new Date().toISOString(),
      };
      await saveProject(nextProject);
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
    history.push({
      label: '数値編集',
      undo: () => applyAssetSnapshot(before),
      redo: () => applyAssetSnapshot(current),
    });
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
    setEditorError(null);
    setImporting(true);
    try {
      let current = selectedAsset;
      for (const file of files) {
        const result = await importImageAsLayer(file, current);
        for (const { key, blob } of result.blobs) {
          await saveBlob(projectId, key, blob);
        }
        const next: Asset = {
          ...current,
          updatedAt: new Date().toISOString(),
          textures: [...current.textures, ...result.textures],
          layers: [...current.layers, result.layer],
        };
        commitAssetChange('画像レイヤー追加', current, next);
        setSelectedLayerId(result.layer.id);
        current = next;
      }
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
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
    <div className="editor">
      <header className="editor-topbar">
        <button type="button" onClick={handleBack}>
          ← ホーム
        </button>
        <h1 className="editor-title">{project?.name ?? '読み込み中…'}</h1>
        <div className="editor-history-buttons">
          <button
            type="button"
            disabled={!historyState.canUndo}
            onClick={() => history.undo()}
            title={historyState.undoLabel ?? undefined}
          >
            元に戻す
          </button>
          <button
            type="button"
            disabled={!historyState.canRedo}
            onClick={() => history.redo()}
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
                onSelectLayer={setSelectedLayerId}
                onCommitAsset={commitAssetChange}
                onPickColor={(layerId, point) => void handlePickColor(layerId, point)}
                onCropCommit={handleCropCommit}
                onEraseCommit={handleEraseCommit}
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
                  PNG / JPG / WebP に対応。1 枚あたり 25MB、4096 x 4096 までです。
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
              disabled={!project}
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
                  className="asset-flip-copy-button"
                  disabled={importing}
                  onClick={() => void handleFlipCopyAsset()}
                >
                  左右反転コピーを作成
                </button>
                <button
                  type="button"
                  className="asset-delete-button"
                  disabled={deletingAsset}
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
              画像を取り込まず、型とサイズだけで空キャンバスのアセットを作れます。 character
              を選ぶと、当たり判定「body」が最初から付きます。
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
                onChange={(event) => setNewAssetType(event.target.value as AssetType)}
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
                value={newAssetSize}
                onChange={(event) =>
                  setNewAssetSize(Number(event.target.value) as BlankCanvasSizePreset)
                }
              >
                {BLANK_CANVAS_SIZE_PRESETS.map((size) => (
                  <option key={size} value={size}>
                    {size} x {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              aria-label="新規アセットを作成"
              disabled={creatingAsset || !project}
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
                  トリミングはキャンバス上でドラッグ、背景透過は消したい色をクリックします。
                </p>
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
                    disabled={!!imageProcessing}
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
                    disabled={!!imageProcessing}
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
                    disabled={!!imageProcessing}
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
                    {asset.canvasSize.width} x {asset.canvasSize.height}
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
