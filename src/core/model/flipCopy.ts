/**
 * 左右反転コピー（Phase 19-B, docs/future/FLIP_DESIGN.md 3〜5 章）。
 * 選択アセットを水平反転した「新しいアセット」を生成する純関数。
 * 元アセットは変更しない（非破壊）。schema / version は変えない。
 */
import type { Anchor, AnchorRole } from './anchor';
import type { Frame } from './animation';
import type { Asset } from './asset';
import type { Collider } from './collider';
import { generateId } from './factories';
import type { Layer, LayerTransform } from './layer';
import type { Part, PartType } from './part';

/** 左右で対になる anchor role の対応。 */
const ANCHOR_ROLE_MIRROR: Partial<Record<AnchorRole, AnchorRole>> = {
  hand_left: 'hand_right',
  hand_right: 'hand_left',
};

/** 左右で対になる part 種別の対応。 */
const PART_TYPE_MIRROR: Partial<Record<PartType, PartType>> = {
  arm_left: 'arm_right',
  arm_right: 'arm_left',
  leg_left: 'leg_right',
  leg_right: 'leg_left',
};

/**
 * 名前に含まれる left / right トークンを 1 回ずつ入れ替える。
 * 1 パスの置換で処理するため left→right→left の二重置換は起きない。
 */
export function swapLeftRightLabel(text: string): string {
  return text.replace(/left|right|Left|Right|LEFT|RIGHT/g, (match) => {
    switch (match) {
      case 'left':
        return 'right';
      case 'right':
        return 'left';
      case 'Left':
        return 'Right';
      case 'Right':
        return 'Left';
      case 'LEFT':
        return 'RIGHT';
      case 'RIGHT':
        return 'LEFT';
      default:
        return match;
    }
  });
}

/**
 * レイヤー変形を反転軸 mirrorX で水平鏡映する。
 * 中心 = position + textureWidth/2 を mirrorX で反射し、scale.x と rotation の符号を反転する
 * （真の水平鏡映 M·R(θ)·S(sx,sy) = R(-θ)·S(-sx,sy) を position で平行移動して表す）。
 */
function mirrorTransform(
  transform: LayerTransform,
  mirrorX: number,
  textureWidth: number,
): LayerTransform {
  return {
    position: { x: 2 * mirrorX - transform.position.x - textureWidth, y: transform.position.y },
    scale: { x: -transform.scale.x, y: transform.scale.y },
    rotation: -transform.rotation,
  };
}

export interface FlipCopyAssetOptions {
  now?: Date;
  /** 生成アセットの識別名。省略時は元 name の left/right 入替、無ければ `_flipped` 付与。 */
  name?: string;
  /** 生成アセットの表示名。省略時は元 displayName の left/right 入替、無ければ「 (左右反転)」付与。 */
  displayName?: string;
}

/**
 * アセットを水平反転した新しいアセット（新規 id）を返す。反転軸は `asset.origin.x`。
 *
 * 反転対象: origin（軸なので不変）/ layers（transform 鏡映）/ anchors（座標鏡映 + role・名前入替）/
 * colliders（rect・circle の x 鏡映 + 名前入替）/ parts（pivot 鏡映 + 種別・名前入替 + 参照 id 付け替え）/
 * frames（layerState transform 鏡映 + layerId 付け替え）/ animations（frameId 付け替え + 名前入替）。
 *
 * テクスチャ（画像 Blob）は呼び出し側が `blobKeyFor(newId, path)` へコピーする前提で、
 * texture の id / path は元のまま保持する。リグ編集データ（`rigAnimations`・part の
 * `bindPose` / `rotationLimit`）は本コピーでは反映せず省く。焼き込み済み `frames` は
 * 反転して保持するため表示・書き出しは正しく反転される（詳細は docs/future/FLIP_DESIGN.md）。
 */
export function flipCopyAsset(asset: Asset, options: FlipCopyAssetOptions = {}): Asset {
  const iso = (options.now ?? new Date()).toISOString();
  const mirrorX = asset.origin.x;
  const reflectX = (x: number): number => 2 * mirrorX - x;

  // 元レイヤー id → texture 幅（frame の layerState 鏡映にも使う）。
  const layerWidth = new Map<string, number>();
  for (const layer of asset.layers) {
    const width = layer.textureId
      ? (asset.textures.find((texture) => texture.id === layer.textureId)?.size.width ?? 0)
      : 0;
    layerWidth.set(layer.id, width);
  }

  // id 再採番マップ（相互参照を張り替えるため先に作る）。
  const layerIdMap = new Map(asset.layers.map((layer) => [layer.id, generateId('layer')]));
  const partIdMap = new Map(asset.parts.map((part) => [part.id, generateId('part')]));
  const frameIdMap = new Map((asset.frames ?? []).map((frame) => [frame.id, generateId('frame')]));

  const layers: Layer[] = asset.layers.map((layer) => ({
    ...layer,
    id: layerIdMap.get(layer.id)!,
    transform: mirrorTransform(layer.transform, mirrorX, layerWidth.get(layer.id) ?? 0),
    background: layer.background
      ? { ...layer.background, parallaxSpeed: { ...layer.background.parallaxSpeed } }
      : layer.background,
  }));

  const anchors: Anchor[] = asset.anchors.map((anchor) => ({
    ...anchor,
    id: generateId('anchor'),
    name: swapLeftRightLabel(anchor.name),
    role: ANCHOR_ROLE_MIRROR[anchor.role] ?? anchor.role,
    position: { x: reflectX(anchor.position.x), y: anchor.position.y },
  }));

  const colliders: Collider[] = asset.colliders.map((collider) => {
    if (collider.shape === 'rect') {
      return {
        ...collider,
        id: generateId('col'),
        name: swapLeftRightLabel(collider.name),
        // 左上 x + 幅を反射する（右端が新しい左端になる）。
        rect: { ...collider.rect, x: 2 * mirrorX - collider.rect.x - collider.rect.width },
      };
    }
    return {
      ...collider,
      id: generateId('col'),
      name: swapLeftRightLabel(collider.name),
      circle: { ...collider.circle, x: reflectX(collider.circle.x) },
    };
  });

  const parts: Part[] = asset.parts.map((part) => {
    const next: Part = {
      id: partIdMap.get(part.id)!,
      name: swapLeftRightLabel(part.name),
      partType: PART_TYPE_MIRROR[part.partType] ?? part.partType,
      layerIds: part.layerIds.map((id) => layerIdMap.get(id) ?? id),
    };
    if (part.pivot) {
      next.pivot = { x: reflectX(part.pivot.x), y: part.pivot.y };
    }
    if (part.parentId) {
      next.parentId = partIdMap.get(part.parentId) ?? part.parentId;
    }
    // bindPose / rotationLimit（リグ編集データ）は本コピーでは省く。
    return next;
  });

  const frames: Frame[] | undefined = asset.frames?.map((frame) => ({
    ...frame,
    id: frameIdMap.get(frame.id)!,
    name: swapLeftRightLabel(frame.name),
    layerStates: frame.layerStates.map((state) => ({
      ...state,
      layerId: layerIdMap.get(state.layerId) ?? state.layerId,
      transform: state.transform
        ? mirrorTransform(state.transform, mirrorX, layerWidth.get(state.layerId) ?? 0)
        : state.transform,
    })),
  }));

  const animations = asset.animations.map((animation) => ({
    ...animation,
    id: generateId('anim'),
    name: swapLeftRightLabel(animation.name),
    frameIds: animation.frameIds.map((id) => frameIdMap.get(id) ?? id),
  }));

  const swappedName = swapLeftRightLabel(asset.name);
  const swappedDisplayName = swapLeftRightLabel(asset.displayName);

  return {
    ...asset,
    id: generateId('asset'),
    name: options.name ?? (swappedName !== asset.name ? swappedName : `${asset.name}_flipped`),
    displayName:
      options.displayName ??
      (swappedDisplayName !== asset.displayName
        ? swappedDisplayName
        : `${asset.displayName} (左右反転)`),
    canvasSize: { ...asset.canvasSize },
    origin: { ...asset.origin }, // 反転軸なので座標は不変
    textures: asset.textures.map((texture) => ({ ...texture, size: { ...texture.size } })),
    layers,
    parts,
    anchors,
    colliders,
    frames,
    animations,
    tags: [...asset.tags],
    gameAttributes: { ...asset.gameAttributes },
    tile: asset.tile ? { ...asset.tile, tileSize: { ...asset.tile.tileSize } } : asset.tile,
    gimmick: asset.gimmick ? { ...asset.gimmick } : asset.gimmick,
    effect: asset.effect ? { ...asset.effect } : asset.effect,
    rigAnimations: undefined, // リグ編集データの反転は将来対応（焼き込み frames は反転済み）
    createdAt: iso,
    updatedAt: iso,
  };
}
