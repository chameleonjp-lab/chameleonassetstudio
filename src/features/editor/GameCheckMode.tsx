import { useEffect, useMemo, useRef, useState } from 'react';
import {
  animationEventsAtFrame,
  buildGamePreviewProjection,
  createAnimationPlayback,
  initialGamePreviewSelection,
  inspectPreviewTextureReferences,
  type Asset,
  type GamePreviewIssue,
  type Project,
} from '../../core/model';
import { ASSET_TYPE_LABELS } from './assetTypeLabels';
import { GameCheckControls } from './GameCheckControls';
import {
  buildDetailedGameImpact,
  resolveGameCheckPresentation,
} from './gameCheckContract';
import { useGameCheckCanvas } from './useGameCheckCanvas';
import { useGameCheckVariantInspections } from './useGameCheckVariantInspections';
import './gameCheckMode.css';

interface GameCheckModeProps {
  asset: Asset;
  project: Project;
  projectAssets: Asset[];
  onClose: () => void;
}

function issueLabel(issue: GamePreviewIssue): string {
  switch (issue.kind) {
    case 'unset':
      return '未設定';
    case 'invalid':
      return '不正';
    case 'dangling-reference':
      return '参照切れ';
    case 'missing-blob':
    case 'decode-failure':
      return '画像表示不能';
  }
}

export function GameCheckMode({ asset, project, projectAssets, onClose }: GameCheckModeProps) {
  const initialSelection = useMemo(() => initialGamePreviewSelection(asset), [asset]);
  const [animationId, setAnimationId] = useState(initialSelection.animationId);
  const [frameId, setFrameId] = useState(initialSelection.frameId);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOrigin, setShowOrigin] = useState(true);
  const [showAnchors, setShowAnchors] = useState(true);
  const [showColliders, setShowColliders] = useState(true);
  const [showTypeOverlay, setShowTypeOverlay] = useState(true);
  const [impactOpen, setImpactOpen] = useState(true);
  const [parallaxPosition, setParallaxPosition] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const mainRef = useRef<HTMLMainElement | null>(null);

  const projection = useMemo(
    () => buildGamePreviewProjection(asset, { animationId, frameId }),
    [animationId, asset, frameId],
  );
  const presentation = useMemo(
    () => resolveGameCheckPresentation(asset, projection.overlay),
    [asset, projection.overlay],
  );
  const displayedAsset = useMemo(() => {
    if (asset.assetType !== 'background' || parallaxPosition === 0) {
      return projection.displayAsset;
    }
    return {
      ...projection.displayAsset,
      layers: projection.displayAsset.layers.map((layer) => {
        if (!layer.background) {
          return layer;
        }
        return {
          ...layer,
          transform: {
            ...layer.transform,
            position: {
              x: layer.transform.position.x - layer.background.parallaxSpeed.x * parallaxPosition,
              y: layer.transform.position.y - layer.background.parallaxSpeed.y * parallaxPosition,
            },
          },
        };
      }),
    };
  }, [asset.assetType, parallaxPosition, projection.displayAsset]);
  const canvas = useGameCheckCanvas({
    asset: displayedAsset,
    overlay: presentation.overlay,
    parallaxPosition,
    showOrigin,
    showAnchors,
    showColliders,
    showTypeOverlay,
  });
  const previewTextureIssues = useMemo(
    () =>
      inspectPreviewTextureReferences(
        asset,
        canvas.availableTextureIds,
        canvas.decodeFailedTextureIds,
      ),
    [asset, canvas.availableTextureIds, canvas.decodeFailedTextureIds],
  );
  const previewIssues = useMemo(
    () => [...projection.issues, ...presentation.issues, ...previewTextureIssues],
    [presentation.issues, previewTextureIssues, projection.issues],
  );
  const selectedAnimation = projection.animation;
  const frameOptions = useMemo(() => asset.frames ?? [], [asset.frames]);
  const playableFrameIds = useMemo(
    () =>
      selectedAnimation?.frameIds.filter((candidate) =>
        frameOptions.some((frame) => frame.id === candidate),
      ) ?? [],
    [frameOptions, selectedAnimation],
  );
  const scrubIndex = Math.max(0, frameId ? playableFrameIds.indexOf(frameId) : 0);
  const frameEventNames =
    selectedAnimation && projection.frame
      ? animationEventsAtFrame(selectedAnimation, projection.frame.id)
          .map((event) => event.name)
          .join('、')
      : '';
  const visibleOverlays = useMemo(
    () =>
      [
        showOrigin ? 'origin' : null,
        showAnchors ? 'anchor' : null,
        showColliders ? 'collider' : null,
        showTypeOverlay ? '種別固有表示' : null,
      ].filter((value): value is string => value !== null),
    [showAnchors, showColliders, showOrigin, showTypeOverlay],
  );
  const variantInspections = useGameCheckVariantInspections(asset, project, projectAssets);
  const impact = useMemo(
    () =>
      buildDetailedGameImpact(
        asset,
        project,
        projectAssets,
        {
          animationId,
          frameId,
          isPlaying,
          visibleOverlays,
          parallaxPosition,
          impactOpen,
        },
        variantInspections,
      ),
    [
      animationId,
      asset,
      frameId,
      impactOpen,
      isPlaying,
      parallaxPosition,
      project,
      projectAssets,
      variantInspections,
      visibleOverlays,
    ],
  );

  useEffect(() => {
    mainRef.current?.focus();
  }, []);

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [onClose]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setIsPlaying(false);
    }
  }, [reducedMotion]);

  useEffect(() => {
    if (!isPlaying || !selectedAnimation || reducedMotion) {
      return;
    }
    const playback = createAnimationPlayback({
      animation: selectedAnimation,
      frames: asset.frames ?? [],
      clock: {
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimeout: (handle) => window.clearTimeout(handle as number),
      },
      onFrameStart: (nextFrameId) => setFrameId(nextFrameId),
      onComplete: () => setIsPlaying(false),
    });
    playback.start();
    return () => playback.stop();
  }, [asset.frames, isPlaying, reducedMotion, selectedAnimation]);

  const chooseAnimation = (nextAnimationId: string) => {
    setIsPlaying(false);
    const nextAnimation = asset.animations.find((candidate) => candidate.id === nextAnimationId);
    setAnimationId(nextAnimationId || null);
    setFrameId(
      nextAnimation
        ? (nextAnimation.frameIds.find((candidate) =>
            frameOptions.some((frame) => frame.id === candidate),
          ) ?? (nextAnimation.frameIds.length === 0 ? (frameOptions[0]?.id ?? null) : null))
        : (frameOptions[0]?.id ?? null),
    );
  };

  const chooseFrame = (nextFrameId: string) => {
    setIsPlaying(false);
    setFrameId(nextFrameId || null);
  };

  return (
    <main ref={mainRef} className="game-check-mode" aria-label="ゲーム確認" tabIndex={-1}>
      <header className="game-check-header">
        <div>
          <p className="game-check-kicker">読み取り専用モード</p>
          <h1>ゲーム確認：{asset.displayName}</h1>
          <p className="game-check-note" id="game-check-description">
            説明用表示。物理演算・engine固有挙動・実際のexport成功は保証しません。
          </p>
        </div>
        <button type="button" className="game-check-close" onClick={onClose}>
          Editorへ戻る
        </button>
      </header>

      <div className="game-check-layout">
        <section className="game-check-preview-section" aria-label="ゲーム風プレビュー">
          <div ref={canvas.wrapperRef} className="game-check-canvas-wrapper">
            <canvas
              ref={canvas.canvasRef}
              aria-label="ゲーム風プレビューキャンバス"
              data-preview-tile-cells={presentation.overlay.tile?.cellCount ?? 1}
            />
          </div>
          <p className="game-check-preview-status" role="status" aria-live="polite">
            {ASSET_TYPE_LABELS[asset.assetType]} / Frame：{projection.frame?.name ?? '未設定'} /{' '}
            {isPlaying ? '再生中' : '停止中'}
          </p>
          {previewIssues.length > 0 && (
            <ul className="game-check-issues" aria-label="不足・不正・表示不能の理由">
              {previewIssues.map((item) => (
                <li key={`${item.code}:${item.path}`}>
                  <strong>{issueLabel(item)}：</strong>
                  {item.message} <code>{item.path}</code>
                </li>
              ))}
            </ul>
          )}
        </section>

        <GameCheckControls
          asset={asset}
          projection={projection}
          presentation={presentation}
          animationId={animationId}
          frameId={frameId}
          selectedAnimation={selectedAnimation}
          frameOptions={frameOptions}
          playableFrameIds={playableFrameIds}
          scrubIndex={scrubIndex}
          isPlaying={isPlaying}
          reducedMotion={reducedMotion}
          frameEventNames={frameEventNames}
          showOrigin={showOrigin}
          showAnchors={showAnchors}
          showColliders={showColliders}
          showTypeOverlay={showTypeOverlay}
          parallaxPosition={parallaxPosition}
          impactOpen={impactOpen}
          impact={impact}
          onAnimationChange={chooseAnimation}
          onFrameChange={chooseFrame}
          onPlayingChange={setIsPlaying}
          onFrameIdChange={setFrameId}
          onShowOriginChange={setShowOrigin}
          onShowAnchorsChange={setShowAnchors}
          onShowCollidersChange={setShowColliders}
          onShowTypeOverlayChange={setShowTypeOverlay}
          onParallaxPositionChange={setParallaxPosition}
          onImpactToggle={() => setImpactOpen((current) => !current)}
        />
      </div>

      <footer className="game-check-footer">
        <p>
          ゲーム確認中の選択、再生、scrub、表示切替、parallax位置、Impact展開はUI-only
          stateです。保存・History・autosave・IndexedDB・Blob・exportは実行しません。
        </p>
        <button type="button" onClick={onClose}>
          Editorへ戻る
        </button>
      </footer>
    </main>
  );
}
