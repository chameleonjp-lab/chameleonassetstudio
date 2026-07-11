import { ASSET_FORMAT, CURRENT_ASSET_VERSION, type Asset, type AssetType } from './asset';
import type { ColliderPurpose, RectCollider } from './collider';
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

export interface CreateBlankAssetOptions {
  name: string;
  displayName?: string;
  assetType: AssetType;
  /** 新規キャンバスのピクセルサイズ（正方形プリセット想定。要件上は任意の Size を許容）。 */
  canvasSize: Size;
  now?: Date;
}

/**
 * キャンバス中央に、幅・高さ半分の矩形当たり判定の「値部分」（id なし）を作る。
 * assetOps.ts の addRectCollider と、このファイルの character 新規作成テンプレートの
 * 両方から呼ばれる唯一の実装（2D-2-CREATE-01 レビュー対応、値の重複定義を解消）。
 * id を含まないのは、呼び出し元（addRectCollider 側／テンプレート側）にそれぞれ
 * generateId の呼び出しタイミングを委ねるため。依存方向は assetOps.ts → factories.ts の
 * ままで、循環 import は発生しない。
 */
export function createDefaultRectCollider(
  canvasSize: Size,
  purpose: ColliderPurpose = 'body',
): Omit<RectCollider, 'id'> {
  const { width, height } = canvasSize;
  return {
    name: purpose,
    purpose,
    shape: 'rect',
    visible: true,
    rect: {
      x: Math.round(width / 4),
      y: Math.round(height / 4),
      width: Math.round(width / 2),
      height: Math.round(height / 2),
    },
  };
}

/**
 * アセット種別ごとの新規作成テンプレート（2D-2-CREATE-01）。
 * コード定数として管理し、`.casproj` / asset.json には一切出さない
 * （テンプレートを適用した「結果」だけが通常のフィールドとして保存される）。
 * 将来テンプレートを増やす場合は、この map にキーを追加するだけでよい形にしてある。
 */
const BLANK_ASSET_TEMPLATES: Partial<Record<AssetType, (asset: Asset) => Asset>> = {
  // character だけ starter の body 当たり判定を付ける（他の型は空キャンバスのみ）。
  character: (asset) => ({
    ...asset,
    colliders: [
      ...asset.colliders,
      { id: generateId('col'), ...createDefaultRectCollider(asset.canvasSize, 'body') },
    ],
  }),
};

/**
 * 画像を取り込まず、型とキャンバスサイズだけで新しいアセットを作る（2D-2-CREATE-01）。
 * テクスチャは createImageAsset と同じ source / edit / thumbnail の 3 本構成にし、
 * 中身はすべて透明画像にする（実体の Blob 生成は呼び出し側の UI ユーティリティが行う。
 * この関数は Asset JSON 部分のみを純粋に組み立てるため、DOM / Canvas に依存せず
 * unit test できる）。原点は既存既定の下中央（要件 11.6）。
 */
export function createBlankAsset(options: CreateBlankAssetOptions): Asset {
  const now = options.now ?? new Date();
  const iso = now.toISOString();
  const assetId = generateId('asset');
  const size = options.canvasSize;

  const textures: TextureRef[] = [
    {
      id: generateId('tex'),
      kind: 'source',
      name: 'original',
      mimeType: 'image/png',
      size,
      path: 'source/original.png',
    },
    {
      id: generateId('tex'),
      kind: 'edit',
      name: 'main',
      mimeType: 'image/png',
      size,
      path: 'textures/main.png',
    },
    {
      id: generateId('tex'),
      kind: 'thumbnail',
      name: 'thumb',
      mimeType: 'image/png',
      size,
      path: 'thumbnails/thumb.png',
    },
  ];
  const editTexture = textures[1];

  const asset: Asset = {
    format: ASSET_FORMAT,
    version: CURRENT_ASSET_VERSION,
    id: assetId,
    assetType: options.assetType,
    name: options.name,
    displayName: options.displayName ?? options.name,
    canvasSize: size,
    origin: { x: Math.round(size.width / 2), y: size.height },
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

  const applyTemplate = BLANK_ASSET_TEMPLATES[options.assetType];
  return applyTemplate ? applyTemplate(asset) : asset;
}
