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
  type GamePreviewIssue,
  type Project,
} from '../../core/model';
import { findFixedFpsAnimationLosses } from '../../core/export/animationLoss';
import { findColliderOverrideExportLosses } from '../../core/export/colliderOverrideLoss';
import { loadBlob } from '../../core/storage';
import { renderScene, drawGameOverlays, type RenderLayer } from '../../renderers/canvas2d/render';
import { fitView, type ViewTransform, type Viewport } from '../../renderers/canvas2d/view';
import { InspectionPanel } from './InspectionPanel';
import { ASSET_TYPE_LABELS } from './assetTypeLabels';
import { drawGameCheckTypeOverlay } from './gameCheckRenderer';

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
  return `${item.confidence}：${item.reason}`;
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
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [view, setView] = useState<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [bitmaps, setBitmaps] = useState<Map<string, DecodedImageSource>>(new Map());
  const [availableTextureIds, setAvailableTextureIds] = useState<Set<string>>(new Set());
  const [decodeFailedTextureIds, setDecodeFailedTextureIds] = useState<Set<string>>(new Set());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapsRef = useRef<Map<string, DecodedImageSource>>(new Map());

  const projection = useMemo(
    () => buildGamePreviewProjection(asset, { animationId, frameId }),
    [animationId, asset, frameId],
  );
  const selectedAnimation = projection.animation;
  const frameEvents =
    selectedAnimation && projection.frame
      ? animationEventsAtFrame(selectedAnimation, projection.frame.id)
      : [];
  const previewTextureIssues = useMemo(
    () => inspectPreviewTextureReferences(asset, availableTextureIds, decodeFailedTextureIds),
    [asset, availableTextureIds, decodeFailedTextureIds],
  );
  const previewIssues = useMemo(
    () => [...projection.issues, ...previewTextureIssues],
    [previewTextureIssues, projection.issues],
  );
  const impact = useMemo(() => {
    const baseImpact = buildGameImpact(asset, project, projectAssets).filter(
      (item) => item.kind !== 'export',
    );
    const fixedFpsLosses = findFixedFpsAnimationLosses(asset);
    const colliderLosses = findColliderOverrideExportLosses(asset);
    const exportItems: GameImpactItem[] = [];
    for (const loss of fixedFpsLosses) {
      exportItems.push({
        id: `export:fixed-fps:${loss.animationId}:${loss.kind}`,
        kind: 'export',
        path: `export/atlas[animationId=${loss.animationId}]`,
        confidence: '確定',
        reason:
          loss.kind === 'frame-duration'
            ? `個別表示時間（${loss.frameNames.join('、')}）をAtlas系へ保持できません。`
            : `Animation event（${loss.eventNames.join('、')}）をAtlas系へ保持できません。`,
        checked: '既存の固定fps export検査を実行（書き出しは未実行）',
      });
    }
    for (const loss of colliderLosses) {
      exportItems.push({
        id: `export:collider:${loss.frameId}`,
        kind: 'export',
        path: `export/atlas[frameId=${loss.frameId}]`,
        confidence: '確定',
        reason: `Frame別collider（${loss.colliderNames.join('、')}）はAtlas 0.1.0で失われるため、既存境界で拒否されます。`,
        checked: '既存のcollider override export検査を実行（書き出しは未実行）',
      });
    }
    if (exportItems.length === 0) {
      exportItems.push({
        id: 'export:atlas:compatible',
        kind: 'export',
        path: 'export/atlas compatibility',
        confidence: '可能性',
        reason: '現在の値からは既知のAtlas拒否理由が見つかりません。実際の出力成功は保証しません。',
        checked: '既存のloss検査だけを実行（書き出しは未実行）',
      });
    }
    return [...baseImpact, ...exportItems];
  }, [asset, project, projectAssets]);
  const displayedAsset = useMemo(() => {
    if (asset.assetType !== 'background' || parallaxPosition === 0) {
      return projection.displayAsset;
    }
    return {
      ...projection.displayAsset,
      layers: projection.displayAsset.layers.map((layer) => {
        const background = layer.background;
        if (!background) {
          return layer;
        }
        return {
          ...layer,
          transform: {
            ...layer.transform,
            position: {
              x: layer.transform.position.x - background.parallaxSpeed.x * parallaxPosition,
              y: layer.transform.position.y - background.parallaxSpeed.y * parallaxPosition,
            },
          },
        };
      }),
    };
  }, [asset.assetType, parallaxPosition, projection.displayAsset]);

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
      setView(fitView(viewport, asset.canvasSize));
    }
  }, [asset.canvasSize, viewport]);

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
    });
    drawGameOverlays(ctx, {
      view,
      origin: displayedAsset.origin,
      anchors: displayedAsset.anchors,
      colliders: displayedAsset.colliders,
      showColliders,
      showOrigin,
      showAnchors,
      selectedColliderId: null,
    });
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
    <main className="game-check-mode" aria-label="ゲーム確認">
      <header className="game-check-header">
        <div>
          <p className="game-check-kicker">読み取り専用モード</p>
          <h1>ゲーム確認：{asset.displayName}</h1>
          <p className="game-check-note">
            説明用表示。物理演算・engine固有挙動・実際のexport成功は保証しません。
          </p>
        </div>
        <button type="button" className="game-check-close" onClick={onClose}>
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
            <div className="game-check-actions">
              <button
                type="button"
                disabled={
                  reducedMotion || !selectedAnimation || selectedAnimation.frameIds.length === 0
                }
                onClick={() => setIsPlaying((current) => !current)}
              >
                {isPlaying ? '停止' : '再生'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setFrameId(selectedAnimation?.frameIds[0] ?? frameOptions[0]?.id ?? null);
                }}
              >
                先頭Frame
              </button>
            </div>
            {reducedMotion && (
              <p className="editor-note">reduced-motion設定のため自動再生を停止しています。</p>
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
            {asset.assetType === 'character' && <p>originのYを接地線として表示しています。</p>}
            {asset.assetType === 'item' && (
              <p>自動の接地物理は加えず、originとanchorを配置基準として表示しています。</p>
            )}
            {asset.assetType === 'background' && (
              <p>parallax設定を読み取り、説明用の位置変更を表示しています。</p>
            )}
            {asset.assetType === 'tile' && (
              <p>
                {typeDetails.tile
                  ? `tileSize ${typeDetails.tile.tileWidth}×${typeDetails.tile.tileHeight}の3×3反復 / collision ${typeDetails.tile.collisionType}を表示しています。`
                  : 'tileSize未設定のため3×3反復は未評価です。'}
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
              <p>
                {typeDetails.effect
                  ? `duration ${typeDetails.effect.durationMs}ms / ${typeDetails.effect.loop ? 'loop' : 'once'} / blend ${typeDetails.effect.blendMode}`
                  : 'effect timingは未評価です。'}
              </p>
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
              <ul className="game-check-impact-list">
                {impact.map((item) => (
                  <li key={item.id}>
                    <div className="game-check-impact-heading">
                      <strong className={confidenceClass(item.confidence)}>
                        {item.confidence}
                      </strong>
                      <code>{item.path}</code>
                    </div>
                    <p>{renderImpactReason(item)}</p>
                    <small>確認：{item.checked}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="game-check-card game-check-inspection">
            <summary>既存素材検査を表示</summary>
            <InspectionPanel asset={asset} />
          </details>
        </aside>
      </div>

      <footer className="game-check-footer">
        <p>
          ゲーム確認中の選択、再生、表示切替、parallax位置、Impact展開はUI-only
          stateです。保存・History・autosave・IndexedDB・Blob・exportは実行しません。
        </p>
        <button type="button" onClick={onClose}>
          Editorへ戻る
        </button>
      </footer>
    </main>
  );
}
