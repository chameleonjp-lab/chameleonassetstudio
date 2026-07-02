import { ASSET_FORMAT, CURRENT_ASSET_VERSION, type Asset } from './asset';
import type { Size } from './common';
import { CURRENT_PROJECT_VERSION, PROJECT_FORMAT, type Project } from './project';
import type { TextureMimeType, TextureRef } from './texture';

/** 一意な ID を作る（例: project_5f3e...）。 */
export function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

/** 空の新規プロジェクトを作る。 */
export function createEmptyProject(name: string, now: Date = new Date()): Project {
  const iso = now.toISOString();
  return {
    format: PROJECT_FORMAT,
    version: CURRENT_PROJECT_VERSION,
    id: generateId('project'),
    name,
    assets: [],
    createdAt: iso,
    updatedAt: iso,
  };
}

export interface CreateImageAssetOptions {
  name: string;
  displayName?: string;
  /** 取り込んだ画像のピクセルサイズ。キャンバスサイズにもなる。 */
  size: Size;
  sourceMimeType: TextureMimeType;
  sourceExtension: 'png' | 'jpg' | 'webp';
  thumbnailMimeType?: TextureMimeType;
  now?: Date;
}

/**
 * 取り込んだ画像 1 枚から新しいキャラクターアセットを作る。
 * 原点は下中央（要件 11.6）。テクスチャの path は `.casproj` 内の
 * アセットディレクトリ相対パスにする。
 */
export function createImageAsset(options: CreateImageAssetOptions): Asset {
  const now = options.now ?? new Date();
  const iso = now.toISOString();
  const assetId = generateId('asset');
  const thumbnailMimeType = options.thumbnailMimeType ?? 'image/webp';

  const textures: TextureRef[] = [
    {
      id: generateId('tex'),
      kind: 'source',
      name: 'original',
      mimeType: options.sourceMimeType,
      size: options.size,
      path: `source/original.${options.sourceExtension}`,
    },
    {
      id: generateId('tex'),
      kind: 'edit',
      name: 'main',
      mimeType: 'image/png',
      size: options.size,
      path: 'textures/main.png',
    },
    {
      id: generateId('tex'),
      kind: 'thumbnail',
      name: 'thumb',
      mimeType: thumbnailMimeType,
      size: options.size,
      path: `thumbnails/thumb.${thumbnailMimeType === 'image/webp' ? 'webp' : 'png'}`,
    },
  ];
  const editTexture = textures[1];

  return {
    format: ASSET_FORMAT,
    version: CURRENT_ASSET_VERSION,
    id: assetId,
    assetType: 'character',
    name: options.name,
    displayName: options.displayName ?? options.name,
    canvasSize: options.size,
    origin: { x: Math.round(options.size.width / 2), y: options.size.height },
    textures,
    layers: [
      {
        id: generateId('layer'),
        name: 'main',
        layerType: 'image',
        visible: true,
        locked: false,
        opacity: 1,
        transform: {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
        },
        textureId: editTexture.id,
      },
    ],
    parts: [],
    anchors: [],
    colliders: [],
    frames: [],
    animations: [],
    tags: [],
    gameAttributes: {},
    createdAt: iso,
    updatedAt: iso,
  };
}
