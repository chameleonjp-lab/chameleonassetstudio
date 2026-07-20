import { useState, type ChangeEvent } from 'react';
import type {
  AtlasFallbackAssetType,
  ChameleonAtlasBundleInput,
} from '../../core/images/importAtlasBundle';
import {
  MAX_FRAME_SET_ITEMS,
  type ManualGridInput,
  type TileSetImportInput,
} from '../../core/images/importFrameSet';
import { TILE_COLLISION_TYPES, type TileCollisionType } from '../../core/model';
import { ASSET_TYPE_LABELS } from './assetTypeLabels';

interface ImportFrameSetPanelProps {
  accept: string;
  busy: boolean;
  onPrepareSequence: (files: File[]) => Promise<void>;
  onPrepareSheet: (file: File, grid: ManualGridInput) => Promise<void>;
  onPrepareTileset: (file: File, input: TileSetImportInput) => Promise<void>;
  onPrepareAtlas: (
    jsonFile: File,
    textureFile: File,
    input: ChameleonAtlasBundleInput,
  ) => Promise<void>;
}

type ImportMode = 'sequence' | 'sheet' | 'tileset' | 'atlas';

const ATLAS_FALLBACK_TYPES: AtlasFallbackAssetType[] = [
  'character',
  'item',
  'background',
  'gimmick',
];

export function ImportFrameSetPanel({
  accept,
  busy,
  onPrepareSequence,
  onPrepareSheet,
  onPrepareTileset,
  onPrepareAtlas,
}: ImportFrameSetPanelProps) {
  const [mode, setMode] = useState<ImportMode>('sequence');
  const [sequenceFiles, setSequenceFiles] = useState<File[]>([]);
  const [gridFile, setGridFile] = useState<File | null>(null);
  const [cellWidth, setCellWidth] = useState('32');
  const [cellHeight, setCellHeight] = useState('32');
  const [margin, setMargin] = useState('0');
  const [spacing, setSpacing] = useState('0');
  const [tileWidth, setTileWidth] = useState('32');
  const [tileHeight, setTileHeight] = useState('32');
  const [collisionType, setCollisionType] = useState<TileCollisionType>('solid');
  const [visualType, setVisualType] = useState('floor');
  const [atlasJsonFile, setAtlasJsonFile] = useState<File | null>(null);
  const [atlasTextureFile, setAtlasTextureFile] = useState<File | null>(null);
  const [atlasAssetName, setAtlasAssetName] = useState('atlas_import');
  const [atlasFallbackType, setAtlasFallbackType] = useState<AtlasFallbackAssetType>('character');

  const handleSequenceFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setSequenceFiles(event.target.files ? Array.from(event.target.files) : []);
  };

  const handleGridFile = (event: ChangeEvent<HTMLInputElement>) => {
    setGridFile(event.target.files?.[0] ?? null);
  };

  const gridInput = (): ManualGridInput => ({
    cellWidth: Number(cellWidth),
    cellHeight: Number(cellHeight),
    margin: Number(margin),
    spacing: Number(spacing),
  });

  const gridMode = mode === 'sheet' || mode === 'tileset';
  const gridModeLabel = mode === 'tileset' ? 'Tileset' : 'Sprite Sheet';

  return (
    <fieldset className="editor-fieldset import-frame-set-panel" disabled={busy}>
      <legend>連番・Sheet・Tileset・Atlasを取り込む</legend>
      <p className="editor-note">
        通常画像の「1 file = 1 Asset」は維持します。ここでは明示的に1 Assetのframe列を作ります。
      </p>

      <label className="editor-field">
        取り込みモード
        <select
          aria-label="frame列取り込みモード"
          value={mode}
          onChange={(event) => setMode(event.target.value as ImportMode)}
        >
          <option value="sequence">連番画像</option>
          <option value="sheet">Sprite Sheet（手動格子）</option>
          <option value="tileset">Tileset（手動格子）</option>
          <option value="atlas">Chameleon Atlas 0.1.0</option>
        </select>
      </label>

      {mode === 'sequence' && (
        <div className="import-frame-set-config">
          <label className="import-button">
            連番ファイルを選ぶ
            <input
              type="file"
              accept={accept}
              multiple
              onChange={handleSequenceFiles}
              className="visually-hidden-input"
            />
          </label>
          <p className="editor-note">
            1〜{MAX_FRAME_SET_ITEMS}
            枚・同一寸法。ファイル名の数字を数値順に並べ、確定順をpreviewします。
          </p>
          {sequenceFiles.length > 0 && (
            <ol className="import-frame-set-files" aria-label="選択中の連番画像">
              {sequenceFiles.map((file, index) => (
                <li key={`${index}:${file.name}`}>{file.name}</li>
              ))}
            </ol>
          )}
          <button
            type="button"
            disabled={sequenceFiles.length === 0}
            onClick={() => void onPrepareSequence(sequenceFiles)}
          >
            連番previewを準備
          </button>
        </div>
      )}

      {gridMode && (
        <div className="import-frame-set-config">
          <label className="import-button">
            {gridModeLabel}ファイルを選ぶ
            <input
              type="file"
              accept={accept}
              onChange={handleGridFile}
              className="visually-hidden-input"
            />
          </label>
          {gridFile && <p className="import-frame-set-file-name">{gridFile.name}</p>}
          <p className="editor-note">
            uniform外周marginとcell間spacingを使い、左上から行優先で最大
            {MAX_FRAME_SET_ITEMS}cellを切り出します。
          </p>
          <div className="import-frame-set-grid-fields">
            <label className="editor-field">
              cell幅
              <input
                aria-label={`${gridModeLabel} cell幅`}
                type="number"
                min={1}
                max={4096}
                step={1}
                inputMode="numeric"
                value={cellWidth}
                onChange={(event) => {
                  const next = event.target.value;
                  if (tileWidth === cellWidth) setTileWidth(next);
                  setCellWidth(next);
                }}
              />
            </label>
            <label className="editor-field">
              cell高さ
              <input
                aria-label={`${gridModeLabel} cell高さ`}
                type="number"
                min={1}
                max={4096}
                step={1}
                inputMode="numeric"
                value={cellHeight}
                onChange={(event) => {
                  const next = event.target.value;
                  if (tileHeight === cellHeight) setTileHeight(next);
                  setCellHeight(next);
                }}
              />
            </label>
            <label className="editor-field">
              外周margin
              <input
                aria-label={`${gridModeLabel} 外周margin`}
                type="number"
                min={0}
                max={4096}
                step={1}
                inputMode="numeric"
                value={margin}
                onChange={(event) => setMargin(event.target.value)}
              />
            </label>
            <label className="editor-field">
              cell間spacing
              <input
                aria-label={`${gridModeLabel} cell間spacing`}
                type="number"
                min={0}
                max={4096}
                step={1}
                inputMode="numeric"
                value={spacing}
                onChange={(event) => setSpacing(event.target.value)}
              />
            </label>
          </div>

          {mode === 'tileset' && (
            <div className="import-frame-set-config" aria-label="Tileset設定">
              <div className="import-frame-set-grid-fields">
                <label className="editor-field">
                  tile幅
                  <input
                    aria-label="Tileset tile幅"
                    type="number"
                    min={1}
                    max={4096}
                    step={1}
                    inputMode="numeric"
                    value={tileWidth}
                    onChange={(event) => setTileWidth(event.target.value)}
                  />
                </label>
                <label className="editor-field">
                  tile高さ
                  <input
                    aria-label="Tileset tile高さ"
                    type="number"
                    min={1}
                    max={4096}
                    step={1}
                    inputMode="numeric"
                    value={tileHeight}
                    onChange={(event) => setTileHeight(event.target.value)}
                  />
                </label>
              </div>
              <label className="editor-field">
                Asset全体のcollision
                <select
                  aria-label="Tileset collision"
                  value={collisionType}
                  onChange={(event) => setCollisionType(event.target.value as TileCollisionType)}
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
                  aria-label="Tileset visualType"
                  type="text"
                  value={visualType}
                  onChange={(event) => setVisualType(event.target.value)}
                />
              </label>
              <p className="editor-note">
                tileSizeはcellSizeと同じ値を既定にします。設定はAsset全体に適用し、colliderは自動生成しません。
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={!gridFile}
            onClick={() => {
              if (!gridFile) return;
              if (mode === 'tileset') {
                void onPrepareTileset(gridFile, {
                  grid: gridInput(),
                  tileSize: { width: Number(tileWidth), height: Number(tileHeight) },
                  collisionType,
                  visualType,
                });
              } else {
                void onPrepareSheet(gridFile, gridInput());
              }
            }}
          >
            {gridModeLabel} previewを準備
          </button>
        </div>
      )}

      {mode === 'atlas' && (
        <div className="import-frame-set-config">
          <p className="editor-note">
            Chameleonが出力したatlas.jsonとspritesheet.pngの2ファイルだけを受理します。外部形式・URL参照・ZIP直接取込には対応しません。
          </p>
          <label className="import-button">
            atlas.jsonを選ぶ
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => setAtlasJsonFile(event.target.files?.[0] ?? null)}
              className="visually-hidden-input"
            />
          </label>
          {atlasJsonFile && <p className="import-frame-set-file-name">{atlasJsonFile.name}</p>}
          <label className="import-button">
            spritesheet.pngを選ぶ
            <input
              type="file"
              accept="image/png"
              onChange={(event) => setAtlasTextureFile(event.target.files?.[0] ?? null)}
              className="visually-hidden-input"
            />
          </label>
          {atlasTextureFile && (
            <p className="import-frame-set-file-name">{atlasTextureFile.name}</p>
          )}
          <label className="editor-field">
            作成するAsset名
            <input
              aria-label="Atlas Asset名"
              type="text"
              value={atlasAssetName}
              onChange={(event) => setAtlasAssetName(event.target.value)}
            />
          </label>
          <label className="editor-field">
            metadataがない場合のAsset type
            <select
              aria-label="Atlas fallback Asset type"
              value={atlasFallbackType}
              onChange={(event) =>
                setAtlasFallbackType(event.target.value as AtlasFallbackAssetType)
              }
            >
              {ATLAS_FALLBACK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ASSET_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <p className="editor-note">
            atlasにtile/effect設定がある場合は、そのtypeを優先して復元します。raw
            JSONは保存せず、hashをprovenanceへ記録します。
          </p>
          <button
            type="button"
            disabled={!atlasJsonFile || !atlasTextureFile || atlasAssetName.trim() === ''}
            onClick={() => {
              if (!atlasJsonFile || !atlasTextureFile) return;
              void onPrepareAtlas(atlasJsonFile, atlasTextureFile, {
                assetName: atlasAssetName,
                fallbackAssetType: atlasFallbackType,
              });
            }}
          >
            Chameleon Atlas previewを準備
          </button>
        </div>
      )}
    </fieldset>
  );
}
