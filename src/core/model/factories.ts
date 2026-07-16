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
  /** 新規キャンバスのピクセルサイズ。作成UI側で上限検査した整数値を渡す。 */
  canvasSize: Size;
  /** UIで明示選択したtemplate。ID自体はAssetへ保存しない。 */
  templateId?: AssetCreationTemplateId;
  /** character-basic選択時だけ、main layerを参照する単純なbody Partを追加する。 */
  createCharacterBodyPart?: boolean;
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
 * 作成フォームで明示選択するtemplate fixture。
 * IDはUI定数であり、Asset JSON / .casprojへ保存しない。
 */
export type AssetCreationTemplateId =
  | 'blank'
  | 'character-basic'
  | 'item-pickup'
  | 'background-loop'
  | 'tile-floor'
  | 'gimmick-platform'
  | 'effect-spark';

export interface AssetCreationTemplateDefinition {
  id: AssetCreationTemplateId;
  assetType: AssetType | null;
  label: string;
  description: string;
}

export const ASSET_CREATION_TEMPLATES: readonly AssetCreationTemplateDefinition[] = [
  {
    id: 'blank',
    assetType: null,
    label: '空白',
    description: '型固有の情報を追加せず、透明なmain layerだけで開始します。',
  },
  {
    id: 'character-basic',
    assetType: 'character',
    label: 'キャラクター基本',
    description: 'body当たり判定を追加します。body Partは別のチェックで任意追加できます。',
  },
  {
    id: 'item-pickup',
    assetType: 'item',
    label: '取得アイテム',
    description: 'pickup当たり判定とitemタグを追加します。',
  },
  {
    id: 'background-loop',
    assetType: 'background',
    label: '横ループ背景',
    description: 'main layerへmid背景設定、横ループ、視差速度を追加します。',
  },
  {
    id: 'tile-floor',
    assetType: 'tile',
    label: '床タイル',
    description: '32 x 32、solid、floorのtile設定を追加します。',
  },
  {
    id: 'gimmick-platform',
    assetType: 'gimmick',
    label: '足場ギミック',
    description: 'gimmick設定、body当たり判定、platformタグを追加します。',
  },
  {
    id: 'effect-spark',
    assetType: 'effect',
    label: 'sparkエフェクト',
    description: '500ms、非ループ、normal blendのeffect設定を追加します。',
  },
];

export function assetCreationTemplatesForType(
  assetType: AssetType,
): AssetCreationTemplateDefinition[] {
  return ASSET_CREATION_TEMPLATES.filter(
    (template) => template.assetType === null || template.assetType === assetType,
  );
}

export function defaultAssetCreationTemplateId(assetType: AssetType): AssetCreationTemplateId {
  return assetType === 'character' ? 'character-basic' : 'blank';
}

export function applyAssetCreationTemplate(
  asset: Asset,
  templateId: AssetCreationTemplateId,
  options: { createCharacterBodyPart?: boolean } = {},
): Asset {
  const definition = ASSET_CREATION_TEMPLATES.find((template) => template.id === templateId);
  if (!definition) {
    throw new Error(`不明な作成templateです: ${templateId}`);
  }
  if (definition.assetType !== null && definition.assetType !== asset.assetType) {
    throw new Error(`${templateId} は ${asset.assetType} アセットには適用できません。`);
  }
  if (options.createCharacterBodyPart && templateId !== 'character-basic') {
    throw new Error('body Partはcharacter-basic templateでだけ作成できます。');
  }

  switch (templateId) {
    case 'blank':
      return asset;
    case 'character-basic': {
      const mainLayer = asset.layers[0];
      return {
        ...asset,
        colliders: [
          ...asset.colliders,
          { id: generateId('col'), ...createDefaultRectCollider(asset.canvasSize, 'body') },
        ],
        parts:
          options.createCharacterBodyPart && mainLayer
            ? [
                ...asset.parts,
                {
                  id: generateId('part'),
                  name: 'body',
                  partType: 'body',
                  layerIds: [mainLayer.id],
                  pivot: {
                    x: Math.round(asset.canvasSize.width / 2),
                    y: Math.round(asset.canvasSize.height / 2),
                  },
                },
              ]
            : asset.parts,
      };
    }
    case 'item-pickup':
      return {
        ...asset,
        colliders: [
          ...asset.colliders,
          { id: generateId('col'), ...createDefaultRectCollider(asset.canvasSize, 'pickup') },
        ],
        tags: asset.tags.includes('item') ? asset.tags : [...asset.tags, 'item'],
      };
    case 'background-loop':
      return {
        ...asset,
        layers: asset.layers.map((layer, index) =>
          index === 0
            ? {
                ...layer,
                background: {
                  role: 'mid',
                  parallaxSpeed: { x: 0.5, y: 0 },
                  loopX: true,
                  loopY: false,
                },
              }
            : layer,
        ),
      };
    case 'tile-floor':
      return {
        ...asset,
        tile: {
          tileSize: { width: 32, height: 32 },
          collisionType: 'solid',
          visualType: 'floor',
        },
      };
    case 'gimmick-platform':
      return {
        ...asset,
        gimmick: { movementPreset: 'none' },
        colliders: [
          ...asset.colliders,
          { id: generateId('col'), ...createDefaultRectCollider(asset.canvasSize, 'body') },
        ],
        tags: asset.tags.includes('platform') ? asset.tags : [...asset.tags, 'platform'],
      };
    case 'effect-spark':
      return {
        ...asset,
        effect: {
          effectType: 'spark',
          durationMs: 500,
          loop: false,
          blendMode: 'normal',
        },
      };
  }
}

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

  const templateId = options.templateId ?? defaultAssetCreationTemplateId(options.assetType);
  return applyAssetCreationTemplate(asset, templateId, {
    createCharacterBodyPart: options.createCharacterBodyPart,
  });
}
