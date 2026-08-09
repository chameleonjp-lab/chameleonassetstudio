import type { Animation, Asset, Frame, GamePreviewProjection } from '../../core/model';
import { InspectionPanel } from './InspectionPanel';
import type {
  GameCheckImpactItem,
  ResolvedGameCheckPresentation,
} from './gameCheckContract';
import { GameCheckImpactPanel } from './GameCheckImpactPanel';
import { GameCheckTypeDetails } from './GameCheckTypeDetails';

interface GameCheckControlsProps {
  asset: Asset;
  projection: GamePreviewProjection;
  presentation: ResolvedGameCheckPresentation;
  animationId: string | null;
  frameId: string | null;
  selectedAnimation: Animation | null;
  frameOptions: readonly Frame[];
  playableFrameIds: readonly string[];
  scrubIndex: number;
  isPlaying: boolean;
  reducedMotion: boolean;
  frameEventNames: string;
  showOrigin: boolean;
  showAnchors: boolean;
  showColliders: boolean;
  showTypeOverlay: boolean;
  parallaxPosition: number;
  impactOpen: boolean;
  impact: readonly GameCheckImpactItem[];
  onAnimationChange: (animationId: string) => void;
  onFrameChange: (frameId: string) => void;
  onPlayingChange: (playing: boolean) => void;
  onFrameIdChange: (frameId: string | null) => void;
  onShowOriginChange: (value: boolean) => void;
  onShowAnchorsChange: (value: boolean) => void;
  onShowCollidersChange: (value: boolean) => void;
  onShowTypeOverlayChange: (value: boolean) => void;
  onParallaxPositionChange: (value: number) => void;
  onImpactToggle: () => void;
}

export function GameCheckControls({
  asset,
  projection,
  presentation,
  animationId,
  frameId,
  selectedAnimation,
  frameOptions,
  playableFrameIds,
  scrubIndex,
  isPlaying,
  reducedMotion,
  frameEventNames,
  showOrigin,
  showAnchors,
  showColliders,
  showTypeOverlay,
  parallaxPosition,
  impactOpen,
  impact,
  onAnimationChange,
  onFrameChange,
  onPlayingChange,
  onFrameIdChange,
  onShowOriginChange,
  onShowAnchorsChange,
  onShowCollidersChange,
  onShowTypeOverlayChange,
  onParallaxPositionChange,
  onImpactToggle,
}: GameCheckControlsProps) {
  return (
    <aside className="game-check-controls" aria-label="ゲーム確認操作">
      <section className="game-check-card" aria-label="FrameとAnimation">
        <h2>Frame / Animation</h2>
        <label className="editor-field">
          Animation
          <select
            aria-label="Preview Animation"
            value={animationId ?? ''}
            onChange={(event) => onAnimationChange(event.target.value)}
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
            onChange={(event) => onFrameChange(event.target.value)}
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
          Animation scrub
          <input
            type="range"
            aria-label="Animation scrub"
            min={0}
            max={Math.max(0, playableFrameIds.length - 1)}
            value={scrubIndex}
            disabled={playableFrameIds.length < 2}
            onChange={(event) => {
              onPlayingChange(false);
              onFrameIdChange(playableFrameIds[Number(event.target.value)] ?? null);
            }}
          />
        </label>
        <div className="game-check-actions">
          <button
            type="button"
            disabled={reducedMotion || !selectedAnimation || selectedAnimation.frameIds.length === 0}
            onClick={() => onPlayingChange(!isPlaying)}
          >
            {isPlaying ? '停止' : '再生'}
          </button>
          <button
            type="button"
            onClick={() => {
              onPlayingChange(false);
              onFrameIdChange(selectedAnimation?.frameIds[0] ?? frameOptions[0]?.id ?? null);
            }}
          >
            先頭Frame
          </button>
        </div>
        {reducedMotion && (
          <p className="editor-note">reduced-motion設定のため自動再生を停止しています。</p>
        )}
        {frameEventNames && <p className="editor-note">Frame開始イベント：{frameEventNames}</p>}
        <p className="editor-note">
          実効collider：{projection.displayAsset.colliders.length}件 / Frame override：
          {projection.frame?.colliderOverrides?.length ?? 0}件
        </p>
      </section>

      <section className="game-check-card" aria-label="Overlay表示切替">
        <h2>表示切替</h2>
        <label className="game-check-checkbox">
          <input
            type="checkbox"
            checked={showOrigin}
            onChange={(event) => onShowOriginChange(event.target.checked)}
          />
          origin・接地線
        </label>
        <label className="game-check-checkbox">
          <input
            type="checkbox"
            checked={showAnchors}
            onChange={(event) => onShowAnchorsChange(event.target.checked)}
          />
          anchor
        </label>
        <label className="game-check-checkbox">
          <input
            type="checkbox"
            checked={showColliders}
            onChange={(event) => onShowCollidersChange(event.target.checked)}
          />
          実効collider
        </label>
        <label className="game-check-checkbox">
          <input
            type="checkbox"
            checked={showTypeOverlay}
            onChange={(event) => onShowTypeOverlayChange(event.target.checked)}
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

      <GameCheckTypeDetails
        asset={asset}
        presentation={presentation}
        parallaxPosition={parallaxPosition}
        onParallaxPositionChange={onParallaxPositionChange}
      />
      <GameCheckImpactPanel open={impactOpen} items={impact} onToggle={onImpactToggle} />

      <details className="game-check-card game-check-inspection">
        <summary>既存素材検査を表示</summary>
        <InspectionPanel asset={asset} />
      </details>
    </aside>
  );
}
