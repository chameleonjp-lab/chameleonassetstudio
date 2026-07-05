import {
  ASSET_TYPES,
  BACKGROUND_LAYER_ROLES,
  EFFECT_BLEND_MODES,
  EFFECT_TYPES,
  GIMMICK_MOVEMENT_PRESETS,
  GIMMICK_TAG_SUGGESTIONS,
  TILE_COLLISION_TYPES,
  setAssetType,
  setEffectSettings,
  setGimmickSettings,
  setLayerBackground,
  setTileSettings,
  type Asset,
  type AssetType,
  type BackgroundLayerSettings,
  type EffectBlendMode,
  type EffectSettings,
  type EffectType,
  type GimmickSettings,
  type Layer,
  type TileCollisionType,
  type TileSettings,
} from '../../core/model';
import { BackgroundPreview } from './BackgroundPreview';

interface AssetTypePanelProps {
  asset: Asset;
  onCommit: (label: string, next: Asset) => void;
}

const DEFAULT_TILE: TileSettings = {
  tileSize: { width: 32, height: 32 },
  collisionType: 'solid',
  visualType: 'floor',
};

const DEFAULT_GIMMICK: GimmickSettings = { movementPreset: 'none' };

const DEFAULT_EFFECT: EffectSettings = {
  effectType: 'spark',
  durationMs: 500,
  loop: false,
  blendMode: 'normal',
};

const DEFAULT_BACKGROUND: BackgroundLayerSettings = {
  role: 'mid',
  parallaxSpeed: { x: 0.5, y: 0 },
  loopX: true,
  loopY: false,
};

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  character: 'キャラクター',
  item: 'アイテム',
  background: '背景',
  tile: 'タイル',
  gimmick: 'ギミック',
  effect: 'エフェクト',
};

function toggleTag(asset: Asset, tag: string): Asset {
  const tags = asset.tags.includes(tag)
    ? asset.tags.filter((t) => t !== tag)
    : [...asset.tags, tag];
  return { ...asset, tags, updatedAt: new Date().toISOString() };
}

/** アイテムテンプレートを適用する（score / rarity のゲーム属性と item タグを追加）。 */
function applyItemTemplate(asset: Asset): Asset {
  const hasScore = Object.prototype.hasOwnProperty.call(asset.gameAttributes, 'score');
  const hasRarity = Object.prototype.hasOwnProperty.call(asset.gameAttributes, 'rarity');
  const hasTag = asset.tags.includes('item');
  if (hasScore && hasRarity && hasTag) {
    return asset;
  }
  const gameAttributes = { ...asset.gameAttributes };
  if (!hasScore) {
    gameAttributes.score = 0;
  }
  if (!hasRarity) {
    gameAttributes.rarity = 'common';
  }
  const tags = hasTag ? asset.tags : [...asset.tags, 'item'];
  return { ...asset, gameAttributes, tags, updatedAt: new Date().toISOString() };
}

/** タイル設定 UI（Phase 14）。 */
function TileFields({ asset, onCommit }: AssetTypePanelProps) {
  const tile = asset.tile;
  if (!tile) {
    return (
      <button
        type="button"
        onClick={() => onCommit('タイル設定を追加', setTileSettings(asset, DEFAULT_TILE))}
      >
        タイル設定を追加
      </button>
    );
  }
  return (
    <fieldset className="editor-fieldset">
      <legend>タイル設定</legend>
      <div className="gamedata-inline-fields">
        <label className="editor-field">
          タイル幅
          <input
            type="number"
            min={1}
            value={tile.tileSize.width}
            onChange={(event) =>
              onCommit(
                'タイル幅変更',
                setTileSettings(asset, {
                  ...tile,
                  tileSize: {
                    ...tile.tileSize,
                    width: Math.max(1, Number(event.target.value) || 1),
                  },
                }),
              )
            }
          />
        </label>
        <label className="editor-field">
          タイル高さ
          <input
            type="number"
            min={1}
            value={tile.tileSize.height}
            onChange={(event) =>
              onCommit(
                'タイル高さ変更',
                setTileSettings(asset, {
                  ...tile,
                  tileSize: {
                    ...tile.tileSize,
                    height: Math.max(1, Number(event.target.value) || 1),
                  },
                }),
              )
            }
          />
        </label>
      </div>
      <label className="editor-field">
        当たり判定タイプ
        <select
          value={tile.collisionType}
          onChange={(event) =>
            onCommit(
              '当たり判定タイプ変更',
              setTileSettings(asset, {
                ...tile,
                collisionType: event.target.value as TileCollisionType,
              }),
            )
          }
        >
          {TILE_COLLISION_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="editor-field">
        見た目タイプ
        <input
          type="text"
          value={tile.visualType}
          onChange={(event) =>
            onCommit(
              '見た目タイプ変更',
              setTileSettings(asset, { ...tile, visualType: event.target.value }),
            )
          }
        />
      </label>
      <button
        type="button"
        onClick={() => onCommit('タイル設定を削除', setTileSettings(asset, undefined))}
      >
        タイル設定を削除
      </button>
    </fieldset>
  );
}

/** ギミック設定 UI（Phase 14）。 */
function GimmickFields({ asset, onCommit }: AssetTypePanelProps) {
  const gimmick = asset.gimmick;
  if (!gimmick) {
    return (
      <button
        type="button"
        onClick={() => onCommit('ギミック設定を追加', setGimmickSettings(asset, DEFAULT_GIMMICK))}
      >
        ギミック設定を追加
      </button>
    );
  }
  return (
    <fieldset className="editor-fieldset">
      <legend>ギミック設定</legend>
      <label className="editor-field">
        移動プリセット
        <select
          value={gimmick.movementPreset}
          onChange={(event) =>
            onCommit(
              '移動プリセット変更',
              setGimmickSettings(asset, { ...gimmick, movementPreset: event.target.value }),
            )
          }
        >
          {GIMMICK_MOVEMENT_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
        </select>
      </label>
      <div className="gamedata-buttons">
        {GIMMICK_TAG_SUGGESTIONS.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={asset.tags.includes(tag)}
            onClick={() => onCommit('タグ切替', toggleTag(asset, tag))}
          >
            {tag}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onCommit('ギミック設定を削除', setGimmickSettings(asset, undefined))}
      >
        ギミック設定を削除
      </button>
    </fieldset>
  );
}

/** エフェクト設定 UI（Phase 17）。本格的なエフェクトエディタ / パーティクルは対象外で、ゲーム側で解釈するメタデータのみ扱う。 */
function EffectFields({ asset, onCommit }: AssetTypePanelProps) {
  const effect = asset.effect;
  if (!effect) {
    return (
      <button
        type="button"
        onClick={() => onCommit('エフェクト設定を追加', setEffectSettings(asset, DEFAULT_EFFECT))}
      >
        エフェクト設定を追加
      </button>
    );
  }
  const hasAnimation = asset.animations.length > 0;
  return (
    <fieldset className="editor-fieldset">
      <legend>エフェクト設定</legend>
      <label className="editor-field">
        エフェクト種類
        <select
          aria-label="エフェクト種類"
          value={effect.effectType}
          onChange={(event) =>
            onCommit(
              'エフェクト種類変更',
              setEffectSettings(asset, {
                ...effect,
                effectType: event.target.value as EffectType,
              }),
            )
          }
        >
          {EFFECT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label className="editor-field">
        エフェクト長さ(ms)
        <input
          type="number"
          aria-label="エフェクト長さ(ms)"
          min={1}
          value={effect.durationMs}
          onChange={(event) =>
            onCommit(
              'エフェクト長さ変更',
              setEffectSettings(asset, {
                ...effect,
                durationMs: Math.max(1, Number(event.target.value) || 1),
              }),
            )
          }
        />
      </label>
      <label className="editor-field editor-field-checkbox">
        <input
          type="checkbox"
          aria-label="エフェクトループ"
          checked={effect.loop}
          onChange={(event) =>
            onCommit(
              'エフェクトループ切替',
              setEffectSettings(asset, { ...effect, loop: event.target.checked }),
            )
          }
        />
        ループ再生
      </label>
      <label className="editor-field">
        ブレンドモード
        <select
          aria-label="ブレンドモード"
          value={effect.blendMode}
          onChange={(event) =>
            onCommit(
              'ブレンドモード変更',
              setEffectSettings(asset, {
                ...effect,
                blendMode: event.target.value as EffectBlendMode,
              }),
            )
          }
        >
          {EFFECT_BLEND_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>
      {hasAnimation && (
        <p className="editor-note">
          アニメーションの長さと durationMs が矛盾しないよう注意してください。
        </p>
      )}
      <button
        type="button"
        onClick={() => onCommit('エフェクト設定を削除', setEffectSettings(asset, undefined))}
      >
        エフェクト設定を削除
      </button>
    </fieldset>
  );
}

/** 背景設定 UI（Phase 14）。パララックスプレビューを表示する。 */
function BackgroundFields({ asset }: AssetTypePanelProps) {
  return (
    <fieldset className="editor-fieldset">
      <legend>背景設定</legend>
      <p className="editor-note">
        各レイヤーの背景設定（役割・視差速度・ループ）はレイヤーを選択して編集します。
      </p>
      <BackgroundPreview asset={asset} />
    </fieldset>
  );
}

/** アイテム設定 UI（Phase 14）。 */
function ItemFields({ asset, onCommit }: AssetTypePanelProps) {
  return (
    <fieldset className="editor-fieldset">
      <legend>アイテム設定</legend>
      <p className="editor-note">
        取得判定は当たり判定の用途「pickup」を使います。当たり判定パネルから追加してください。
      </p>
      <button
        type="button"
        onClick={() => onCommit('アイテムテンプレートを適用', applyItemTemplate(asset))}
      >
        アイテムテンプレートを適用
      </button>
    </fieldset>
  );
}

/** アセット種別ごとの設定パネル（Phase 14）。 */
export function AssetTypePanel({ asset, onCommit }: AssetTypePanelProps) {
  return (
    <div className="gamedata-panel">
      <label className="editor-field">
        アセット種別
        <select
          value={asset.assetType}
          onChange={(event) =>
            onCommit('アセット種別変更', setAssetType(asset, event.target.value as AssetType))
          }
        >
          {ASSET_TYPES.map((type) => (
            <option key={type} value={type}>
              {ASSET_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      {asset.assetType === 'tile' && <TileFields asset={asset} onCommit={onCommit} />}
      {asset.assetType === 'gimmick' && <GimmickFields asset={asset} onCommit={onCommit} />}
      {asset.assetType === 'item' && <ItemFields asset={asset} onCommit={onCommit} />}
      {asset.assetType === 'background' && <BackgroundFields asset={asset} onCommit={onCommit} />}
      {asset.assetType === 'effect' && <EffectFields asset={asset} onCommit={onCommit} />}
    </div>
  );
}

interface BackgroundLayerFieldsProps {
  asset: Asset;
  layer: Layer;
  onCommit: (label: string, next: Asset) => void;
}

/** background アセットの選択中レイヤー用設定 UI（Phase 14）。 */
export function BackgroundLayerFields({ asset, layer, onCommit }: BackgroundLayerFieldsProps) {
  const background = layer.background;
  if (!background) {
    return (
      <button
        type="button"
        onClick={() =>
          onCommit('背景設定を追加', setLayerBackground(asset, layer.id, DEFAULT_BACKGROUND))
        }
      >
        背景設定を追加
      </button>
    );
  }
  return (
    <fieldset className="editor-fieldset">
      <legend>背景レイヤー設定</legend>
      <label className="editor-field">
        役割
        <select
          value={background.role}
          onChange={(event) =>
            onCommit(
              '背景役割変更',
              setLayerBackground(asset, layer.id, {
                ...background,
                role: event.target.value as BackgroundLayerSettings['role'],
              }),
            )
          }
        >
          {BACKGROUND_LAYER_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </label>
      <div className="gamedata-inline-fields">
        <label className="editor-field">
          視差速度 X
          <input
            type="number"
            step={0.1}
            value={background.parallaxSpeed.x}
            onChange={(event) =>
              onCommit(
                '視差速度変更',
                setLayerBackground(asset, layer.id, {
                  ...background,
                  parallaxSpeed: {
                    ...background.parallaxSpeed,
                    x: Number(event.target.value) || 0,
                  },
                }),
              )
            }
          />
        </label>
        <label className="editor-field">
          視差速度 Y
          <input
            type="number"
            step={0.1}
            value={background.parallaxSpeed.y}
            onChange={(event) =>
              onCommit(
                '視差速度変更',
                setLayerBackground(asset, layer.id, {
                  ...background,
                  parallaxSpeed: {
                    ...background.parallaxSpeed,
                    y: Number(event.target.value) || 0,
                  },
                }),
              )
            }
          />
        </label>
      </div>
      <label className="editor-field editor-field-checkbox">
        <input
          type="checkbox"
          checked={background.loopX}
          onChange={(event) =>
            onCommit(
              '横ループ切替',
              setLayerBackground(asset, layer.id, { ...background, loopX: event.target.checked }),
            )
          }
        />
        横方向にループ
      </label>
      <label className="editor-field editor-field-checkbox">
        <input
          type="checkbox"
          checked={background.loopY}
          onChange={(event) =>
            onCommit(
              '縦ループ切替',
              setLayerBackground(asset, layer.id, { ...background, loopY: event.target.checked }),
            )
          }
        />
        縦方向にループ
      </label>
      <button
        type="button"
        onClick={() => onCommit('背景設定を削除', setLayerBackground(asset, layer.id, undefined))}
      >
        背景設定を削除
      </button>
    </fieldset>
  );
}
