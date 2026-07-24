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
import type { Part, PartPose, PartType } from './part';
import type { RigAnimation } from './rig';
import { assertRigPreflight } from './rigPreflight';

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

/** JSON roundtripで0へ正規化される-0を生成しない符号反転。 */
function negate(value: number): number {
  return value === 0 ? 0 : -value;
}

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
    ...structuredClone(transform),
    position: {
      ...structuredClone(transform.position),
      x: 2 * mirrorX - transform.position.x - textureWidth,
      y: transform.position.y,
    },
    scale: {
      ...structuredClone(transform.scale),
      x: negate(transform.scale.x),
      y: transform.scale.y,
    },
    rotation: negate(transform.rotation),
  };
}

function mirrorPose(pose: PartPose): PartPose {
  return {
    ...structuredClone(pose),
    ...(pose.localPosition
      ? {
          localPosition: {
            ...structuredClone(pose.localPosition),
            x: negate(pose.localPosition.x),
          },
        }
      : {}),
    ...(pose.localRotation !== undefined ? { localRotation: negate(pose.localRotation) } : {}),
    ...(pose.localScale ? { localScale: structuredClone(pose.localScale) } : {}),
  };
}

function createIdMap(
  ids: readonly string[],
  prefix: string,
  preserveInternalIds: boolean,
): Map<string, string> {
  return new Map(ids.map((id) => [id, preserveInternalIds ? id : generateId(prefix)] as const));
}

function mappedId(map: ReadonlyMap<string, string>, sourceId: string, path: string): string {
  const result = map.get(sourceId);
  if (!result) {
    // preflightを通過していれば到達しない。旧IDを残すfallbackは禁止する。
    throw new Error(`${path} のID対応が見つかりません: ${sourceId}`);
  }
  return result;
}

export interface FlipCopyAssetOptions {
  now?: Date;
  /** linked Family用。Asset namespaceが別なので内部IDと未知field内の参照を維持する。 */
  preserveInternalIds?: boolean;
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
 * `bindPose` / `rotationLimit`）も鏡映して保持し、全内部参照を完全mapで張り替える
 * （詳細は docs/adr/0022-rig-flip-and-bake-parity.md）。
 */
export function flipCopyAsset(asset: Asset, options: FlipCopyAssetOptions = {}): Asset {
  const preserveInternalIds = options.preserveInternalIds ?? false;
  // ID採番より前に全入力を検査し、拒否時に乱数・Asset・Blob・Historyへ副作用を残さない。
  // linked Familyのrefresh previewだけは、baseからLayerを削除した直後の空Partを
  // downstreamのwrite-set同期で扱う既存契約を維持する。その他の検査は共通のまま通す。
  assertRigPreflight(asset, { allowPartLayerEmpty: preserveInternalIds });

  const iso = (options.now ?? new Date()).toISOString();
  const mirrorX = asset.origin.x;
  const reflectX = (x: number): number => 2 * mirrorX - x;

  // 元レイヤー id → texture 幅（frame の layerState 鏡映にも使う）。
  const textureById = new Map(asset.textures.map((texture) => [texture.id, texture]));
  const layerWidth = new Map<string, number>();
  for (const layer of asset.layers) {
    const width = layer.textureId ? textureById.get(layer.textureId)!.size.width : 0;
    layerWidth.set(layer.id, width);
  }

  // 変換開始前に完全ID mapを作る。TextureRefだけはAsset間でid/pathを維持する。
  const nextAssetId = generateId('asset');
  const layerIdMap = createIdMap(
    asset.layers.map(({ id }) => id),
    'layer',
    preserveInternalIds,
  );
  const partIdMap = createIdMap(
    asset.parts.map(({ id }) => id),
    'part',
    preserveInternalIds,
  );
  const frameIdMap = createIdMap(
    (asset.frames ?? []).map(({ id }) => id),
    'frame',
    preserveInternalIds,
  );
  const animationIdMap = createIdMap(
    asset.animations.map(({ id }) => id),
    'anim',
    preserveInternalIds,
  );
  const rigAnimationIdMap = createIdMap(
    (asset.rigAnimations ?? []).map(({ id }) => id),
    'rig',
    preserveInternalIds,
  );
  const eventIdMap = createIdMap(
    asset.animations.flatMap((animation) => (animation.events ?? []).map(({ id }) => id)),
    'event',
    preserveInternalIds,
  );
  const anchorIdMap = createIdMap(
    asset.anchors.map(({ id }) => id),
    'anchor',
    preserveInternalIds,
  );
  const colliderIdMap = createIdMap(
    asset.colliders.map(({ id }) => id),
    'col',
    preserveInternalIds,
  );

  const layers: Layer[] = asset.layers.map((layer) => ({
    ...structuredClone(layer),
    id: mappedId(layerIdMap, layer.id, `layers[id=${layer.id}]`),
    transform: mirrorTransform(layer.transform, mirrorX, layerWidth.get(layer.id) ?? 0),
    ...(layer.background
      ? {
          background: {
            ...structuredClone(layer.background),
            parallaxSpeed: structuredClone(layer.background.parallaxSpeed),
          },
        }
      : {}),
  }));

  const anchors: Anchor[] = asset.anchors.map((anchor) => ({
    ...structuredClone(anchor),
    id: mappedId(anchorIdMap, anchor.id, `anchors[id=${anchor.id}]`),
    name: swapLeftRightLabel(anchor.name),
    role: ANCHOR_ROLE_MIRROR[anchor.role] ?? anchor.role,
    position: {
      ...structuredClone(anchor.position),
      x: reflectX(anchor.position.x),
      y: anchor.position.y,
    },
  }));

  const colliders: Collider[] = asset.colliders.map((collider) => {
    if (collider.shape === 'rect') {
      return {
        ...structuredClone(collider),
        id: mappedId(colliderIdMap, collider.id, `colliders[id=${collider.id}]`),
        name: swapLeftRightLabel(collider.name),
        // 左上 x + 幅を反射する（右端が新しい左端になる）。
        rect: {
          ...structuredClone(collider.rect),
          x: 2 * mirrorX - collider.rect.x - collider.rect.width,
        },
      };
    }
    return {
      ...structuredClone(collider),
      id: mappedId(colliderIdMap, collider.id, `colliders[id=${collider.id}]`),
      name: swapLeftRightLabel(collider.name),
      circle: { ...structuredClone(collider.circle), x: reflectX(collider.circle.x) },
    };
  });

  const parts: Part[] = asset.parts.map((part) => {
    const preservedPart = structuredClone(part);
    const next: Part = {
      ...preservedPart,
      id: mappedId(partIdMap, part.id, `parts[id=${part.id}]`),
      name: swapLeftRightLabel(part.name),
      partType: PART_TYPE_MIRROR[part.partType] ?? part.partType,
      layerIds: part.layerIds.map((id, index) =>
        mappedId(layerIdMap, id, `parts[id=${part.id}].layerIds[${index}]`),
      ),
    };
    if (part.pivot) {
      next.pivot = {
        ...structuredClone(part.pivot),
        x: reflectX(part.pivot.x),
        y: part.pivot.y,
      };
    }
    if (part.parentId) {
      next.parentId = mappedId(partIdMap, part.parentId, `parts[id=${part.id}].parentId`);
    }
    if (part.bindPose) {
      next.bindPose = mirrorPose(part.bindPose);
    }
    if (part.rotationLimit) {
      next.rotationLimit = {
        ...structuredClone(part.rotationLimit),
        min: negate(part.rotationLimit.max),
        max: negate(part.rotationLimit.min),
      };
    }
    return next;
  });

  const frames: Frame[] | undefined = asset.frames?.map((frame) => ({
    ...structuredClone(frame),
    id: mappedId(frameIdMap, frame.id, `frames[id=${frame.id}]`),
    name: swapLeftRightLabel(frame.name),
    layerStates: frame.layerStates.map((state, index) => ({
      ...structuredClone(state),
      layerId: mappedId(
        layerIdMap,
        state.layerId,
        `frames[id=${frame.id}].layerStates[${index}].layerId`,
      ),
      transform: state.transform
        ? mirrorTransform(state.transform, mirrorX, layerWidth.get(state.layerId) ?? 0)
        : state.transform,
    })),
  }));

  const animations = asset.animations.map((animation) => ({
    ...structuredClone(animation),
    id: mappedId(animationIdMap, animation.id, `animations[id=${animation.id}]`),
    name: swapLeftRightLabel(animation.name),
    frameIds: animation.frameIds.map((id, index) =>
      mappedId(frameIdMap, id, `animations[id=${animation.id}].frameIds[${index}]`),
    ),
    ...(animation.events
      ? {
          events: animation.events.map((event, index) => ({
            ...structuredClone(event),
            id: mappedId(
              eventIdMap,
              event.id,
              `animations[id=${animation.id}].events[${index}].id`,
            ),
            frameId: mappedId(
              frameIdMap,
              event.frameId,
              `animations[id=${animation.id}].events[${index}].frameId`,
            ),
          })),
        }
      : {}),
  }));

  const rigAnimations: RigAnimation[] | undefined = asset.rigAnimations?.map((rig, rigIndex) => ({
    ...structuredClone(rig),
    id: mappedId(rigAnimationIdMap, rig.id, `rigAnimations[${rigIndex}].id`),
    name: swapLeftRightLabel(rig.name),
    keyframes: rig.keyframes.map((keyframe, keyframeIndex) => ({
      ...structuredClone(keyframe),
      poses: Object.fromEntries(
        Object.entries(keyframe.poses).map(([partId, pose]) => [
          mappedId(
            partIdMap,
            partId,
            `rigAnimations[${rigIndex}].keyframes[${keyframeIndex}].poses`,
          ),
          mirrorPose(pose),
        ]),
      ),
    })),
  }));

  const swappedName = swapLeftRightLabel(asset.name);
  const swappedDisplayName = swapLeftRightLabel(asset.displayName);

  return {
    ...structuredClone(asset),
    id: nextAssetId,
    name: options.name ?? (swappedName !== asset.name ? swappedName : `${asset.name}_flipped`),
    displayName:
      options.displayName ??
      (swappedDisplayName !== asset.displayName
        ? swappedDisplayName
        : `${asset.displayName} (左右反転)`),
    canvasSize: structuredClone(asset.canvasSize),
    origin: structuredClone(asset.origin), // 反転軸なので座標は不変
    textures: asset.textures.map((texture) => structuredClone(texture)),
    layers,
    parts,
    anchors,
    colliders,
    ...(frames ? { frames } : {}),
    animations,
    tags: [...asset.tags],
    gameAttributes: structuredClone(asset.gameAttributes),
    ...(asset.provenance
      ? { provenance: asset.provenance.map((record) => structuredClone(record)) }
      : {}),
    ...(asset.tile ? { tile: structuredClone(asset.tile) } : {}),
    ...(asset.gimmick ? { gimmick: structuredClone(asset.gimmick) } : {}),
    ...(asset.effect ? { effect: structuredClone(asset.effect) } : {}),
    ...(rigAnimations ? { rigAnimations } : {}),
    createdAt: iso,
    updatedAt: iso,
  };
}
