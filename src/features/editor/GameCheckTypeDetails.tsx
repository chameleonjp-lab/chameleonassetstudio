import type { Asset } from '../../core/model';
import type { ResolvedGameCheckPresentation } from './gameCheckContract';

interface GameCheckTypeDetailsProps {
  asset: Asset;
  presentation: ResolvedGameCheckPresentation;
  parallaxPosition: number;
  onParallaxPositionChange: (value: number) => void;
}

export function GameCheckTypeDetails({
  asset,
  presentation,
  parallaxPosition,
  onParallaxPositionChange,
}: GameCheckTypeDetailsProps) {
  return (
    <>
      {asset.assetType === 'background' && presentation.overlay.background.length > 0 && (
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
              onChange={(event) => onParallaxPositionChange(Number(event.target.value) || 0)}
            />
          </label>
          <ul className="game-check-detail-list">
            {presentation.overlay.background.map((layer) => (
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
            {presentation.overlay.tile
              ? `tileSize ${presentation.overlay.tile.tileWidth}×${presentation.overlay.tile.tileHeight}の実画像3×3反復 / collision ${presentation.overlay.tile.collisionType}を表示しています。`
              : 'tileSize未設定またはcanvasと不一致のため、3×3反復は未評価です。'}
          </p>
        )}
        {asset.assetType === 'gimmick' && (
          <p>
            {presentation.overlay.gimmickPreset
              ? `movementPreset「${presentation.overlay.gimmickPreset}」の方向を表示しています。`
              : '未知のmovementPresetは軌跡を作らず未評価です。'}
          </p>
        )}
        {asset.assetType === 'effect' && (
          <p>
            {presentation.overlay.effect
              ? `duration ${presentation.overlay.effect.durationMs}ms / ${presentation.overlay.effect.loop ? 'loop' : 'once'} / blend ${presentation.overlay.effect.blendMode}`
              : 'effect timingは未評価です。'}
          </p>
        )}
      </section>
    </>
  );
}
