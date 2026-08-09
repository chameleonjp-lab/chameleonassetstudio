import { useEffect, useMemo, useRef, useState } from 'react';
import { decodeImageSource, type DecodedImageSource } from '../../core/images/decodeImageSource';
import { blobKeyFor } from '../../core/images/importImage';
import {
  animationEventsAtFrame,
  buildGameImpact,
  buildGamePreviewProjection,
  initialGamePreviewSelection,
  inspectPreviewTextureReferences,
  createAnimationPlayback,
  type Asset,
  type GameImpactItem,
  type GameImpactVariantState,
  type GamePreviewIssue,
  type Project,
} from '../../core/model';
import { findFixedFpsAnimationLosses } from '../../core/export/animationLoss';
import { findColliderOverrideExportLosses } from '../../core/export/colliderOverrideLoss';
import { loadBlob } from '../../core/storage';
import {
  renderScene,
  drawGameOverlays,
  tileRepeatViews,
  type RenderLayer,
} from '../../renderers/canvas2d/render';
import { fitView, type ViewTransform, type Viewport } from '../../renderers/canvas2d/view';
import { InspectionPanel } from './InspectionPanel';
import { ASSET_TYPE_LABELS } from './assetTypeLabels';
import { drawGameCheckTypeOverlay } from './gameCheckRenderer';

interface GameCheckModeProps {
  asset: Asset;
  project: Project;
  projectAssets: Asset[];
  variantStates?: Readonly<Record<string, GameImpactVariantState>>;
  onClose: () => void;
}

type ImpactKindFilter = 'all' | GameImpactItem['kind'];
type ImpactConfidenceFilter = 'all' | GameImpactItem['confidence'];

const EMPTY_VARIANT_STATES: Readonly<Record<string, GameImpactVariantState>> = Object.freeze({});

function issueLabel(issue: GamePreviewIssue): string {
  switch (issue.kind) {
    case 'unset':
      return '未設定';
    case 'invalid':
      return '不正';
    case 'dangling-reference':
      return '参照切れ';
    case 'missing-blob':
      return '画像表示不能';
    case 'decode-failure':
      return '画像表示不能';
  }
}

function confidenceClass(confidence: GameImpactItem['confidence']): string {
  return confidence === '確定'
    ? 'game-check-confidence-confirmed'
    : confidence === '可能性'
      ? 'game-check-confidence-possible'
      : 'game-check-confidence-unassessed';
}

function renderImpactReason(item: GameImpactItem): string {
  return item.reason;
}

function impactKindLabel(kind: GameImpactItem['kind']): string {
  const labels: Record<GameImpactItem['kind'], string> = {
    asset: 'Asset',
    'source-edit': 'source / edit',
    variant: 'Variant',
    animation: 'Animation',
    frame: 'Frame',
    'ui-state': 'UI state',
    preview: 'Preview',
    export: 'Export',
    unassessed: '未評価範囲',
  };
  return labels[kind];
}

export function GameCheckMode({
  asset,
  project,
  projectAssets,
  variantStates = EMPTY_VARIANT_STATES,
  onClose,
}: GameCheckModeProps) {
  const initialSelection = useMemo(() => initialGamePreviewSelection(asset), [asset]);
  const [animationId, setAnimationId] = useState(initialSelection.animationId);
  const [frameId, setFrameId] = useState(initialSelection.frameId);
  const [scrubOccurrenceIndex, setScrubOccurrenceIndex] = useState<number | null>(
    initialSelection.occurrenceIndex,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOrigin, setShowOrigin] = useState(true);
  const [showAnchors, setShowAnchors] = useState(true);
  const [showColliders, setShowColliders] = useState(true);
  const [showTypeOverlay, setShowTypeOverlay] = useState(true);
  const [impactOpen, setImpactOpen] = useState(true);
  const [impactKindFilter, setImpactKindFilter] = useState<ImpactKindFilter>('all');
  const [impactConfidenceFilter, setImpactConfidenceFilter] =
    useState<ImpactConfidenceFilter>('all');
  const [selectedImpactId, setSelectedImpactId] = useState<string | null>(null);
  const [parallaxPosition, setParallaxPosition] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [view, setView] = useState<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [bitmaps, setBitmaps] = useState<Map<string, DecodedImageSource>>(new Map());
  const [availableTextureIds, setAvailableTextureIds] = useState<Set<string>>(new Set());
  const [decodeFailedTextureIds, setDecodeFailedTextureIds] = useState<Set<string>>(new Set());
  const [textureInspectionReady, setTextureInspectionReady] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const playbackStartOccurrenceRef = useRef(initialSelection.occurrenceIndex ?? 0);
  const bitmapsRef = useRef<Map<string, DecodedImageSource>>(new Map());

  const projection = useMemo(
    () =>
      buildGamePreviewProjection(asset, {
        animationId,
        frameId,
        occurrenceIndex: scrubOccurrenceIndex,
      }),
    [animationId, asset, frameId, scrubOccurrenceIndex],
  );
  const selectedAnimation = projection.animation;
  const frameEvents =
    selectedAnimation && projection.frame
      ? animationEventsAtFrame(selectedAnimation, projection.frame.id)
      : [];
  const previewTextureIssues = useMemo(
    () =>
      textureInspectionReady
        ? inspectPreviewTextureReferences(asset, availableTextureIds, decodeFailedTextureIds)
        : [],
    [asset, availableTextureIds, decodeFailedTextureIds, textureInspectionReady],
  );
  const previewIssues = useMemo(
    () => [...projection.issues, ...previewTextureIssues],
    [previewTextureIssues, projection.issues],
  );
  const impact = useMemo(() => {
    const baseImpact = buildGameImpact(asset, project, projectAssets, {
      selection: { animationId, frameId, occurrenceIndex: scrubOccurrenceIndex },
      variantStates,
      uiState: {
        isPlaying,
        showOrigin,
        showAnchors,
        showColliders,
        showTypeOverlay,
        impactOpen,
        impactKindFilter,
        impactConfidenceFilter,
        selectedImpactId,
        parallaxPosition,
        reducedMotion,
        scrubOccurrenceIndex,
      },
    }).filter((item) => item.kind !== 'export');
    const fixedFpsLosses = findFixedFpsAnimationLosses(asset);
    const colliderLosses = findColliderOverrideExportLosses(asset);
    const exportItems: GameImpactItem[] = [];
    for (const loss of fixedFpsLosses) {
      exportItems.push({
        id: `export:fixed-fps:${loss.animationId}:${loss.kind}`,
        kind: 'export',
        path: `export/atlas[animationId=${loss.animationId}]`,
        confidence: '確定',
        state: '既存Atlas境界で拒否',
        reason:
          loss.kind === 'frame-duration'
            ? `個別表示時間（${loss.frameNames.join('、')}）をAtlas系へ保持できません。`
            : `Animation event（${loss.eventNames.join('、')}）をAtlas系へ保持できません。`,
        checked: '既存の固定fps export検査を実行（書き出しは未実行）',
        unchecked: '実ファイルの生成、engine読込、再生結果は未確認',
        recheck: 'Animationのframe順、duration、event、export preset変更時に再確認',
      });
    }
    for (const loss of colliderLosses) {
      exportItems.push({
        id: `export:collider:${loss.frameId}`,
        kind: 'export',
        path: `export/atlas[frameId=${loss.frameId}]`,
        confidence: '確定',
        state: '既存Atlas境界で拒否',
        reason: `Frame別collider（${loss.colliderNames.join('、')}）はAtlas 0.1.0で失われるため、既存境界で拒否されます。`,
        checked: '既存のcollider override export検査を実行（書き出しは未実行）',
        unchecked: '実ファイルの生成、engine読込、当たり判定結果は未確認',
        recheck: 'Frame別colliderまたはexport preset変更時に再確認',
      });
    }
    if (exportItems.length === 0) {
      exportItems.push({
        id: 'export:atlas:compatible',
        kind: 'export',
        path: 'export/atlas compatibility',
        confidence: '可能性',
        state: 'export未実行',
        reason: '現在の値からは既知のAtlas拒否理由が見つかりません。実際の出力成功は保証しません。',
        checked: '既存のloss検査だけを実行（書き出しは未実行）',
        unchecked: '実ファイル生成、manifest、engine読込は未確認',
        recheck: 'Asset、Animation、Frame、collider、export preset変更時に再確認',
      });
    }
    return [...baseImpact, ...exportItems];
  }, [
    animationId,
    asset,
    frameId,
    impactConfidenceFilter,
    impactKindFilter,
    impactOpen,
    isPlaying,
    parallaxPosition,
    project,
    projectAssets,
    reducedMotion,
    scrubOccurrenceIndex,
    selectedImpactId,
    showAnchors,
    showColliders,
    showOrigin,
    showTypeOverlay,
    variantStates,
  ]);
  const filteredImpact = useMemo(
    () =>
      impact.filter(
        (item) =>
          (impactKindFilter === 'all' || item.kind === impactKindFilter) &&
          (impactConfidenceFilter === 'all' || item.confidence === impactConfidenceFilter),
      ),
    [impact, impactConfidenceFilter, impactKindFilter],
  );
  const impactKinds = useMemo(() => [...new Set(impact.map((item) => item.kind))], [impact]);
  const displayedAsset = useMemo(() => {
    if (!showTypeOverlay || asset.assetType !== 'background' || parallaxPosition === 0) {
      return projection.displayAsset;
    }
    const validatedBackgroundByLayerId = new Map(
      projection.overlay.background.map((background) => [background.layerId, background]),
    );
    return {
      ...projection.displayAsset,
      layers: projection.displayAsset.layers.map((layer) => {
        const background = validatedBackgroundByLayerId.get(layer.id);
        if (!background) {
          return layer;
        }
        return {
          ...layer,
          transform: {
            ...layer.transform,
            position: {
              x: layer.transform.position.x - background.speedX * parallaxPosition,
              y: layer.transform.position.y - background.speedY * parallaxPosition,
            },
          },
        };
      }),
    };
  }, [
    asset.assetType,
    parallaxPosition,
    projection.displayAsset,
    projection.overlay.background,
    showTypeOverlay,
  ]);
  const frameIds = useMemo(() => new Set((asset.frames ?? []).map((frame) => frame.id)), [asset]);
  const playbackDataValid =
    !!selectedAnimation &&
    selectedAnimation.frameIds.length > 0 &&
    selectedAnimation.frameIds.every((candidate) => frameIds.has(candidate)) &&
    (asset.assetType !== 'effect' || projection.overlay.effect !== null);
  const canPlay = !reducedMotion && playbackDataValid;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

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
    if (viewport.width > 0 && viewport.height > 0) {
      const tile = showTypeOverlay ? projection.overlay.tile : null;
      if (tile) {
        const repeatedView = fitView(viewport, {
          width: tile.tileWidth * 3,
          height: tile.tileHeight * 3,
        });
        setView({
          ...repeatedView,
          // renderSceneの中央セル（world origin）を3×3領域の中央へ移す。
          offsetX: repeatedView.offsetX + tile.tileWidth * repeatedView.scale,
          offsetY: repeatedView.offsetY + tile.tileHeight * repeatedView.scale,
        });
        return;
      }
      setView(fitView(viewport, asset.canvasSize));
    }
  }, [asset.canvasSize, projection.overlay.tile, showTypeOverlay, viewport]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (!canPlay) {
      setIsPlaying(false);
    }
  }, [canPlay]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) {
        return;
      }
      event.preventDefault();
      setIsPlaying(false);
      onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setTextureInspectionReady(false);
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
          // 読み込み失敗は保存せず、通常のmissing-blob理由として表示する。
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
      setTextureInspectionReady(true);
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
    if (!isPlaying || !selectedAnimation || !canPlay) {
      return;
    }
    const playback = createAnimationPlayback({
      animation: selectedAnimation,
      frames: asset.frames ?? [],
      clock: {
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimeout: (handle) => window.clearTimeout(handle as number),
      },
      onFrameStart: (nextFrameId, occurrenceIndex) => {
        setFrameId(nextFrameId);
        setScrubOccurrenceIndex(occurrenceIndex);
      },
      onComplete: () => setIsPlaying(false),
    });
    playback.start(playbackStartOccurrenceRef.current);
    return () => playback.stop();
  }, [asset.frames, canPlay, isPlaying, selectedAnimation]);

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
    const layers: RenderLayer[] = displayedAsset.layers.map((layer) => ({
      layer,
      textureSize:
        displayedAsset.textures.find((texture) => texture.id === layer.textureId)?.size ?? null,
      bitmap: layer.textureId ? (bitmaps.get(layer.textureId)?.source ?? null) : null,
    }));
    renderScene(ctx, {
      view,
      viewport,
      canvasSize: displayedAsset.canvasSize,
      layers,
      selectedLayerId: null,
      tileRepeat:
        showTypeOverlay && projection.overlay.tile
          ? {
              tileSize: {
                width: projection.overlay.tile.tileWidth,
                height: projection.overlay.tile.tileHeight,
              },
            }
          : undefined,
    });
    const colliderResolutionUnavailable = projection.issues.some(
      (issue) =>
        issue.code.startsWith('frame-override-') ||
        issue.code === 'asset-collider-id-duplicate' ||
        issue.code === 'asset-collider-structure-invalid' ||
        issue.code === 'frame-collider-resolution-failed',
    );
    const overlayViews =
      showTypeOverlay && projection.overlay.tile
        ? tileRepeatViews(view, {
            width: projection.overlay.tile.tileWidth,
            height: projection.overlay.tile.tileHeight,
          })
        : [view];
    for (const overlayView of overlayViews) {
      drawGameOverlays(ctx, {
        view: overlayView,
        origin: projection.overlay.origin,
        anchors: projection.overlay.anchors,
        colliders: colliderResolutionUnavailable ? [] : projection.overlay.colliders,
        showColliders,
        showOrigin,
        showAnchors,
        selectedColliderId: null,
      });
    }
    if (showTypeOverlay) {
      drawGameCheckTypeOverlay(ctx, {
        view,
        asset: displayedAsset,
        overlay: projection.overlay,
        parallaxPosition,
        showOrigin,
      });
    }
  }, [
    bitmaps,
    displayedAsset,
    parallaxPosition,
    projection.overlay,
    projection.issues,
    showAnchors,
    showColliders,
    showOrigin,
    showTypeOverlay,
    view,
    viewport,
  ]);

  const frameOptions = asset.frames ?? [];
  const typeDetails = projection.overlay;
  const frameEventNames = frameEvents.map((event) => event.name).join('、');
  const scrubFrameIds = selectedAnimation?.frameIds ?? [];
  const scrubAvailable = scrubFrameIds.length > 0 && scrubOccurrenceIndex !== null;
  const scrubIndex = scrubAvailable
    ? Math.min(Math.max(0, scrubOccurrenceIndex), scrubFrameIds.length - 1)
    : 0;

  const chooseAnimation = (nextAnimationId: string) => {
    setIsPlaying(false);
    const nextAnimation = asset.animations.find((candidate) => candidate.id === nextAnimationId);
    setAnimationId(nextAnimationId || null);
    const nextFrameId = nextAnimation ? (nextAnimation.frameIds[0] ?? null) : frameId;
    setFrameId(nextFrameId ?? null);
    setScrubOccurrenceIndex(nextAnimation?.frameIds.length ? 0 : null);
  };

  const chooseFrame = (nextFrameId: string) => {
    setIsPlaying(false);
    const normalizedFrameId = nextFrameId || null;
    setFrameId(normalizedFrameId);
    const occurrenceIndex = normalizedFrameId
      ? (selectedAnimation?.frameIds.indexOf(normalizedFrameId) ?? -1)
      : -1;
    setScrubOccurrenceIndex(occurrenceIndex >= 0 ? occurrenceIndex : null);
  };

  return (
    <main
      className="game-check-mode"
      aria-label="ゲーム確認"
      aria-keyshortcuts="Escape"
      aria-busy={!textureInspectionReady}
    >
      <header className="game-check-header">
        <div>
          <p className="game-check-kicker">読み取り専用モード</p>
          <h1>ゲーム確認：{asset.displayName}</h1>
          <p className="game-check-note">
            説明用表示。物理演算・engine固有挙動・実際のexport成功は保証しません。
          </p>
        </div>
        <button ref={closeButtonRef} type="button" className="game-check-close" onClick={onClose}>
          Editorへ戻る
        </button>
      </header>

      <div className="game-check-layout">
        <section className="game-check-preview-section" aria-label="ゲーム風プレビュー">
          <div ref={wrapperRef} className="game-check-canvas-wrapper">
            <canvas ref={canvasRef} aria-label="ゲーム風プレビューキャンバス" />
          </div>
          <p className="game-check-preview-status" role="status">
            {ASSET_TYPE_LABELS[asset.assetType]} / Frame：{projection.frame?.name ?? '未設定'} /{' '}
            {isPlaying ? '再生中' : '停止中'}
          </p>
        </section>

        <aside className="game-check-controls" aria-label="ゲーム確認操作">
          <section className="game-check-card" aria-label="FrameとAnimation">
            <h2>Frame / Animation</h2>
            <label className="editor-field">
              Animation
              <select
                aria-label="Preview Animation"
                value={animationId ?? ''}
                onChange={(event) => chooseAnimation(event.target.value)}
              >
                <option value="">なし（静止画）</option>
                {asset.animations.map((animation) => (
                  <option key={animation.id} value={animation.id}>
                    {animation.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="editor-field">
              Frame
              <select
                aria-label="Preview Frame"
                value={frameId ?? ''}
                onChange={(event) => chooseFrame(event.target.value)}
              >
                <option value="">未設定</option>
                {frameOptions.map((frame) => (
                  <option key={frame.id} value={frame.id}>
                    {frame.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="editor-field">
              再生位置（
              {!scrubAvailable ? '未設定' : `${scrubIndex + 1} / ${scrubFrameIds.length}`}
              ）
              <input
                type="range"
                aria-label="再生位置"
                min={0}
                max={Math.max(0, scrubFrameIds.length - 1)}
                step={1}
                value={Math.min(scrubIndex, Math.max(0, scrubFrameIds.length - 1))}
                disabled={!scrubAvailable}
                aria-valuetext={
                  scrubAvailable ? `${scrubIndex + 1} / ${scrubFrameIds.length}` : '未設定'
                }
                onChange={(event) => {
                  const occurrenceIndex = Number(event.target.value);
                  const nextFrameId = scrubFrameIds[occurrenceIndex];
                  if (nextFrameId) {
                    setIsPlaying(false);
                    setScrubOccurrenceIndex(occurrenceIndex);
                    setFrameId(nextFrameId);
                  }
                }}
              />
            </label>
            <div className="game-check-actions">
              <button
                type="button"
                disabled={!canPlay}
                onClick={() =>
                  setIsPlaying((current) => {
                    if (!current) {
                      playbackStartOccurrenceRef.current = scrubOccurrenceIndex ?? 0;
                    }
                    return !current;
                  })
                }
              >
                {isPlaying ? '停止' : '再生'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  const nextFrameId = selectedAnimation
                    ? (selectedAnimation.frameIds[0] ?? null)
                    : (frameOptions[0]?.id ?? null);
                  setFrameId(nextFrameId);
                  setScrubOccurrenceIndex(selectedAnimation?.frameIds.length ? 0 : null);
                }}
              >
                先頭Frame
              </button>
            </div>
            {reducedMotion && (
              <p className="editor-note">reduced-motion設定のため自動再生を停止しています。</p>
            )}
            {!reducedMotion && !playbackDataValid && (
              <p className="editor-note">
                Frame参照または種別固有の再生設定が未設定・不正なため、静止表示にします。
              </p>
            )}
            {frameEventNames && <p className="editor-note">Frame開始イベント：{frameEventNames}</p>}
          </section>

          <section className="game-check-card" aria-label="Overlay表示切替">
            <h2>表示切替</h2>
            <label className="game-check-checkbox">
              <input
                type="checkbox"
                checked={showOrigin}
                onChange={(event) => setShowOrigin(event.target.checked)}
              />
              origin・接地線
            </label>
            <label className="game-check-checkbox">
              <input
                type="checkbox"
                checked={showAnchors}
                onChange={(event) => setShowAnchors(event.target.checked)}
              />
              anchor
            </label>
            <label className="game-check-checkbox">
              <input
                type="checkbox"
                checked={showColliders}
                onChange={(event) => setShowColliders(event.target.checked)}
              />
              実効collider
            </label>
            <label className="game-check-checkbox">
              <input
                type="checkbox"
                checked={showTypeOverlay}
                onChange={(event) => setShowTypeOverlay(event.target.checked)}
              />
              種別固有の説明表示
            </label>
            <p className="editor-note" role="status">
              種別固有の説明表示：{showTypeOverlay ? '表示中' : '非表示（UI-only）'}
            </p>
          </section>

          <section className="game-check-card" aria-label="ゲーム確認の凡例">
            <h2>凡例</h2>
            <ul className="game-check-legend">
              <li>origin：配置基準。characterではY位置を接地線として表示。</li>
              <li>anchor：名前付きの配置基準点。</li>
              <li>実効collider：Asset共通値にFrame overrideを適用した表示値。</li>
              <li>種別固有表示：物理演算ではなく、意味を説明するUI投影。</li>
            </ul>
          </section>

          {previewIssues.length > 0 && (
            <section className="game-check-card" aria-label="不足・不正理由">
              <h2>不足・不正・表示不能の理由</h2>
              <ul className="game-check-issues" aria-label="不足・不正・表示不能の理由">
                {previewIssues.map((item) => (
                  <li key={`${item.code}:${item.path}`}>
                    <strong>{issueLabel(item)}：</strong>
                    {item.message} <code>{item.path}</code>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {asset.assetType === 'background' && typeDetails.background.length > 0 && (
            <section className="game-check-card" aria-label="背景parallax">
              <h2>背景 / parallax</h2>
              <p className="editor-note">説明用の位置変更です。Assetやカメラ設定は変更しません。</p>
              <label className="editor-field">
                parallax位置
                <input
                  type="range"
                  aria-label="parallax位置"
                  min={0}
                  max={1000}
                  value={parallaxPosition}
                  onChange={(event) => setParallaxPosition(Number(event.target.value) || 0)}
                />
              </label>
              <ul className="game-check-detail-list">
                {typeDetails.background.map((layer) => (
                  <li key={layer.layerId}>
                    {layer.layerName} / {layer.role}：速度 {layer.speedX},{layer.speedY} /{' '}
                    {layer.loopX ? 'loopX' : 'no loopX'}・{layer.loopY ? 'loopY' : 'no loopY'}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="game-check-card" aria-label="種別固有の説明">
            <h2>種別固有の説明</h2>
            {asset.assetType === 'character' && (
              <p>
                {typeDetails.groundLineY !== null
                  ? 'originのYを接地線として表示しています。'
                  : 'originが未設定または不正なため、接地線を推測せず表示しません。'}
              </p>
            )}
            {asset.assetType === 'item' && (
              <p>
                {typeDetails.origin && typeDetails.anchors.length > 0
                  ? '自動の接地物理は加えず、originとanchorを配置基準として表示しています。'
                  : 'originまたはanchorが未設定・不正なため、配置基準を推測せず表示しません。'}
              </p>
            )}
            {asset.assetType === 'background' && (
              <p>
                {typeDetails.background.length > 0
                  ? 'parallax設定を読み取り、説明用の位置変更を表示しています。'
                  : 'parallax設定が未設定・不正なため、説明用の位置変更を表示しません。'}
              </p>
            )}
            {asset.assetType === 'tile' && (
              <p>
                {typeDetails.tile
                  ? `tileSize ${typeDetails.tile.tileWidth}×${typeDetails.tile.tileHeight}を中央と周囲8セルへ3×3反復 / collision ${typeDetails.tile.collisionType}を表示しています。`
                  : projection.issues.some((issue) => issue.code === 'tile-size-canvas-mismatch')
                    ? 'tileSizeとcanvasSizeが不一致のため、3×3反復を行わず単体表示にします。'
                    : 'tileSizeが未設定・不正なため、3×3反復は未評価です。'}
              </p>
            )}
            {asset.assetType === 'gimmick' && (
              <p>
                {typeDetails.gimmickPreset
                  ? `movementPreset「${typeDetails.gimmickPreset}」の方向を表示しています。`
                  : '未知のmovementPresetは軌跡を作らず未評価です。'}
              </p>
            )}
            {asset.assetType === 'effect' && (
              <>
                <p>
                  {typeDetails.effect
                    ? `duration ${typeDetails.effect.durationMs}ms / ${typeDetails.effect.loop ? 'loop' : 'once'} / blend ${typeDetails.effect.blendMode}`
                    : 'effect timingが未設定・不正なため静止表示にします。'}
                </p>
                <p className="editor-note">
                  Preview再生はFrame / Animationの実効時間を使用します。effectのduration /
                  loopは設定値として比較表示し、不一致は既存素材検査で確認します。
                </p>
              </>
            )}
          </section>

          <section className="game-check-card" aria-label="Impact">
            <button
              type="button"
              className="game-check-section-toggle"
              aria-expanded={impactOpen}
              onClick={() => setImpactOpen((current) => !current)}
            >
              <span>変更影響（Impact）</span>
              <span>{impactOpen ? '閉じる' : '開く'}</span>
            </button>
            {impactOpen && (
              <>
                <div className="game-check-impact-filters" aria-label="Impactフィルター">
                  <label className="editor-field">
                    種類
                    <select
                      aria-label="Impact種類"
                      value={impactKindFilter}
                      onChange={(event) =>
                        setImpactKindFilter(event.target.value as ImpactKindFilter)
                      }
                    >
                      <option value="all">すべて</option>
                      {impactKinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {impactKindLabel(kind)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="editor-field">
                    確度
                    <select
                      aria-label="Impact確度"
                      value={impactConfidenceFilter}
                      onChange={(event) =>
                        setImpactConfidenceFilter(event.target.value as ImpactConfidenceFilter)
                      }
                    >
                      <option value="all">すべて</option>
                      <option value="確定">確定</option>
                      <option value="可能性">可能性</option>
                      <option value="未評価">未評価</option>
                    </select>
                  </label>
                </div>
                <p className="editor-note" role="status" aria-live="polite">
                  Impact表示：{filteredImpact.length} / {impact.length}件
                </p>
                {filteredImpact.length === 0 && (
                  <p className="editor-note">条件に一致するImpactはありません。</p>
                )}
                <ul className="game-check-impact-list">
                  {filteredImpact.map((item) => (
                    <li key={item.id} className={selectedImpactId === item.id ? 'selected' : ''}>
                      <button
                        type="button"
                        className="game-check-impact-select"
                        aria-label={`Impact行を選択：${item.path}`}
                        aria-pressed={selectedImpactId === item.id}
                        onClick={() =>
                          setSelectedImpactId((current) => (current === item.id ? null : item.id))
                        }
                      >
                        {selectedImpactId === item.id ? '選択中' : 'この行を選択'}
                      </button>
                      <div className="game-check-impact-heading">
                        <span>
                          種別：<strong>{impactKindLabel(item.kind)}</strong>
                        </span>
                        <strong className={confidenceClass(item.confidence)}>
                          確度：{item.confidence}
                        </strong>
                        <span>
                          状態：<strong>{item.state}</strong>
                        </span>
                        <code>path：{item.path}</code>
                      </div>
                      <p>理由：{renderImpactReason(item)}</p>
                      <small>確認済み：{item.checked}</small>
                      <small>未確認：{item.unchecked}</small>
                      <small>再確認条件：{item.recheck}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <details className="game-check-card game-check-inspection">
            <summary>既存素材検査を表示</summary>
            <InspectionPanel asset={asset} tolerateInvalidRuntime />
          </details>
        </aside>
      </div>

      <footer className="game-check-footer">
        <p>
          ゲーム確認中の選択、再生、表示切替、parallax位置、Impact展開はUI-only
          stateです。保存・History・autosave・IndexedDB・Blob・exportは実行しません。EscapeでもEditorへ戻れます。
        </p>
        <button type="button" onClick={onClose}>
          Editorへ戻る
        </button>
      </footer>
    </main>
  );
}
