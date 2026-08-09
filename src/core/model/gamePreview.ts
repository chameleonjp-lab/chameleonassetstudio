import { applyFrameToAsset } from './assetOps';
import { ANCHOR_ROLES, type Anchor } from './anchor';
import type { Animation, Frame } from './animation';
import { inspectFrameColliderOverrides } from './frameColliderOverrides';
import type { Asset, AssetType } from './asset';
import { COLLIDER_PURPOSES, type Collider } from './collider';
import type { Vec2 } from './common';
import type { Project } from './project';

export type GamePreviewIssueKind =
  'unset' | 'invalid' | 'dangling-reference' | 'missing-blob' | 'decode-failure';

export interface GamePreviewIssue {
  code: string;
  kind: GamePreviewIssueKind;
  message: string;
  path: string;
}

export interface GamePreviewTileOverlay {
  tileWidth: number;
  tileHeight: number;
  collisionType: string;
  cellCount: 9;
}

export interface GamePreviewBackgroundOverlay {
  layerId: string;
  layerName: string;
  role: string;
  speedX: number;
  speedY: number;
  loopX: boolean;
  loopY: boolean;
}

export interface GamePreviewOverlay {
  /** Runtime-invalid or missing origins are represented as null, never guessed. */
  origin: Vec2 | null;
  /** Only runtime-validated anchors are exposed to the preview renderer. */
  anchors: Anchor[];
  /** Only runtime-validated effective colliders are exposed to the preview renderer. */
  colliders: Collider[];
  groundLineY: number | null;
  tile: GamePreviewTileOverlay | null;
  background: GamePreviewBackgroundOverlay[];
  gimmickPreset: string | null;
  effect: {
    durationMs: number;
    loop: boolean;
    blendMode: string;
  } | null;
}

export interface GamePreviewSelection {
  animationId: string | null;
  frameId: string | null;
  /** Animation.frameIds上の出現位置。同じFrame IDの反復を区別する。 */
  occurrenceIndex: number | null;
}

export interface GamePreviewProjection {
  displayAsset: Asset;
  animation: Animation | null;
  frame: Frame | null;
  frameIndex: number | null;
  issues: GamePreviewIssue[];
  overlay: GamePreviewOverlay;
}

export type ImpactConfidence = '確定' | '可能性' | '未評価';

export type GameImpactUiValue = string | number | boolean | null | undefined;

export interface GameImpactVariantState {
  label: string;
  /** True only when the existing linked-variant inspection produced a result. */
  assessed: boolean;
}

export interface GameImpactContext {
  selection?: GamePreviewSelection;
  uiState?: Readonly<Record<string, GameImpactUiValue>>;
  /** Editorで既に算出したlinked variantのread-only current status。 */
  variantStates?: Readonly<Record<string, GameImpactVariantState>>;
}

export interface GameImpactItem {
  id: string;
  kind:
    | 'asset'
    | 'source-edit'
    | 'variant'
    | 'animation'
    | 'frame'
    | 'ui-state'
    | 'preview'
    | 'export'
    | 'unassessed';
  path: string;
  confidence: ImpactConfidence;
  /** Existing/runtime state is a separate axis from the G14-I1 confidence classification. */
  state: string;
  reason: string;
  checked: string;
  unchecked: string;
  recheck: string;
}

const KNOWN_GIMMICK_PRESETS = new Set(['none', 'horizontal', 'vertical', 'rotate', 'pendulum']);

function issue(
  code: string,
  kind: GamePreviewIssueKind,
  message: string,
  path: string,
): GamePreviewIssue {
  return { code, kind, message, path };
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validatedAnchor(value: unknown, index: number, issues: GamePreviewIssue[]): Anchor | null {
  const candidate = recordValue(value);
  const position = recordValue(candidate?.position);
  const role = candidate?.role;
  if (
    !candidate ||
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof role !== 'string' ||
    !(ANCHOR_ROLES as readonly string[]).includes(role) ||
    !position ||
    !finiteNumber(position.x) ||
    !finiteNumber(position.y)
  ) {
    issues.push(
      issue(
        'asset-anchor-invalid',
        'invalid',
        `anchor[${index}]のID、名前、role、または座標が不正なため表示しません。`,
        `anchors[${index}]`,
      ),
    );
    return null;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    role: role as Anchor['role'],
    position: { x: position.x, y: position.y },
  };
}

function validatedCollider(
  value: unknown,
  index: number,
  issues: GamePreviewIssue[],
): Collider | null {
  const candidate = recordValue(value);
  const purpose = candidate?.purpose;
  const commonValid =
    candidate !== null &&
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof purpose === 'string' &&
    (COLLIDER_PURPOSES as readonly string[]).includes(purpose) &&
    typeof candidate.visible === 'boolean';
  if (commonValid && candidate.shape === 'rect') {
    const rect = recordValue(candidate.rect);
    if (
      rect &&
      finiteNumber(rect.x) &&
      finiteNumber(rect.y) &&
      finitePositive(rect.width) &&
      finitePositive(rect.height)
    ) {
      return {
        id: candidate.id as string,
        name: candidate.name as string,
        purpose: purpose as Collider['purpose'],
        visible: candidate.visible as boolean,
        shape: 'rect',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    }
  } else if (commonValid && candidate.shape === 'circle') {
    const circle = recordValue(candidate.circle);
    if (
      circle &&
      finiteNumber(circle.x) &&
      finiteNumber(circle.y) &&
      finitePositive(circle.radius)
    ) {
      return {
        id: candidate.id as string,
        name: candidate.name as string,
        purpose: purpose as Collider['purpose'],
        visible: candidate.visible as boolean,
        shape: 'circle',
        circle: { x: circle.x, y: circle.y, radius: circle.radius },
      };
    }
  }
  issues.push(
    issue(
      'asset-collider-invalid',
      'invalid',
      `collider[${index}]のID、名前、purpose、visible、shape、または幾何情報が不正なため表示しません。`,
      `colliders[${index}]`,
    ),
  );
  return null;
}

function firstAnimationFrame(asset: Asset, animation: Animation | null): string | null {
  const frameIds = new Set((asset.frames ?? []).map((frame) => frame.id));
  if (!animation) {
    return (asset.frames ?? [])[0]?.id ?? null;
  }
  const firstFrameId = animation.frameIds[0];
  return firstFrameId && frameIds.has(firstFrameId) ? firstFrameId : null;
}

export function initialGamePreviewSelection(asset: Asset): GamePreviewSelection {
  const animation = asset.animations[0] ?? null;
  const frameId = firstAnimationFrame(asset, animation);
  return {
    animationId: animation?.id ?? null,
    frameId,
    occurrenceIndex: animation && frameId ? 0 : null,
  };
}

function frameWithLayerState(asset: Asset, frame: Frame): Asset {
  const stateByLayerId = new Map((frame.layerStates ?? []).map((state) => [state.layerId, state]));
  return {
    ...asset,
    layers: asset.layers.map((layer) => {
      const state = stateByLayerId.get(layer.id);
      if (!state) {
        return layer;
      }
      return {
        ...layer,
        visible: state.visible ?? layer.visible,
        opacity: state.opacity ?? layer.opacity,
        transform: state.transform ?? layer.transform,
      };
    }),
  };
}

function overlayForAsset(asset: Asset, issues: GamePreviewIssue[]): GamePreviewOverlay {
  const overlay: GamePreviewOverlay = {
    origin: null,
    anchors: [],
    colliders: [],
    groundLineY: null,
    tile: null,
    background: [],
    gimmickPreset: null,
    effect: null,
  };

  const rawAnchors = (asset as Partial<Asset>).anchors;
  if (Array.isArray(rawAnchors)) {
    overlay.anchors = rawAnchors.flatMap((anchor, index) => {
      const valid = validatedAnchor(anchor, index, issues);
      return valid ? [valid] : [];
    });
    if (rawAnchors.length === 0) {
      issues.push(
        issue(
          'asset-anchors-unset',
          'unset',
          'anchorが未設定のため、配置基準点を推測せず表示しません。',
          'anchors',
        ),
      );
    }
  } else {
    issues.push(
      issue('asset-anchors-invalid', 'invalid', 'anchorsが配列ではありません。', 'anchors'),
    );
  }
  const rawColliders = (asset as Partial<Asset>).colliders;
  if (Array.isArray(rawColliders)) {
    overlay.colliders = rawColliders.flatMap((collider, index) => {
      const valid = validatedCollider(collider, index, issues);
      return valid ? [valid] : [];
    });
    if (rawColliders.length === 0) {
      issues.push(
        issue(
          'asset-colliders-unset',
          'unset',
          'colliderが未設定のため、実効colliderを推測せず表示しません。',
          'colliders',
        ),
      );
    }
  } else {
    issues.push(
      issue('asset-colliders-invalid', 'invalid', 'collidersが配列ではありません。', 'colliders'),
    );
  }

  const origin = (asset as Partial<Asset>).origin;
  if (origin && finiteNumber(origin.x) && finiteNumber(origin.y)) {
    overlay.origin = { x: origin.x, y: origin.y };
  } else {
    issues.push(
      issue(
        'asset-origin-invalid',
        origin == null ? 'unset' : 'invalid',
        origin == null
          ? 'originが未設定のため、配置基準を推測せず表示しません。'
          : 'originが有限値ではないため、配置基準を表示できません。',
        'origin',
      ),
    );
  }

  if (asset.assetType === 'character') {
    if (overlay.origin) {
      overlay.groundLineY = overlay.origin.y;
    }
  }

  if (asset.assetType === 'tile') {
    const tile = asset.tile;
    const tileSize = tile?.tileSize;
    const canvasSize = recordValue((asset as Partial<Asset>).canvasSize);
    const tileSizeIsValid =
      tileSize && finitePositive(tileSize.width) && finitePositive(tileSize.height);
    const canvasSizeIsValid =
      canvasSize && finitePositive(canvasSize.width) && finitePositive(canvasSize.height);
    if (
      tileSizeIsValid &&
      canvasSizeIsValid &&
      tileSize.width === canvasSize.width &&
      tileSize.height === canvasSize.height
    ) {
      overlay.tile = {
        tileWidth: tileSize.width,
        tileHeight: tileSize.height,
        collisionType: tile?.collisionType ?? '未設定',
        cellCount: 9,
      };
    } else if (!tileSizeIsValid) {
      issues.push(
        issue(
          'tile-settings-unset',
          'unset',
          'tileSizeが未設定または不正なため、3×3反復を評価できません。',
          'tile.tileSize',
        ),
      );
    } else {
      issues.push(
        issue(
          'tile-size-canvas-mismatch',
          'invalid',
          'tileSizeとcanvasSizeが一致しないため、3×3反復を行わず単体表示にします。',
          'tile.tileSize / canvasSize',
        ),
      );
    }
  }

  if (asset.assetType === 'background') {
    let hasUnsetBackground = false;
    let hasInvalidBackground = false;
    overlay.background = asset.layers.flatMap((layer) => {
      const background = layer.background;
      if (!background) {
        hasUnsetBackground = true;
        return [];
      }
      const speed = background.parallaxSpeed;
      if (
        !speed ||
        !finiteNumber(speed.x) ||
        !finiteNumber(speed.y) ||
        typeof background.loopX !== 'boolean' ||
        typeof background.loopY !== 'boolean'
      ) {
        hasInvalidBackground = true;
        return [];
      }
      return [
        {
          layerId: layer.id,
          layerName: layer.name,
          role: background.role,
          speedX: speed.x,
          speedY: speed.y,
          loopX: background.loopX,
          loopY: background.loopY,
        },
      ];
    });
    if (hasInvalidBackground) {
      issues.push(
        issue(
          'background-parallax-invalid',
          'invalid',
          'parallax速度またはloop設定が不正なため、該当レイヤーを評価できません。',
          'layers[].background',
        ),
      );
    } else if (overlay.background.length === 0 || hasUnsetBackground) {
      issues.push(
        issue(
          'background-parallax-unset',
          'unset',
          'parallax設定がないため、位置変更を評価できません。',
          'layers[].background',
        ),
      );
    }
  }

  if (asset.assetType === 'gimmick') {
    const preset = asset.gimmick?.movementPreset;
    if (typeof preset === 'string' && KNOWN_GIMMICK_PRESETS.has(preset)) {
      overlay.gimmickPreset = preset;
    } else {
      issues.push(
        issue(
          'gimmick-preset-unknown',
          preset ? 'invalid' : 'unset',
          '既知のmovementPresetがないため、軌跡を作らず未評価として表示します。',
          'gimmick.movementPreset',
        ),
      );
    }
  }

  if (asset.assetType === 'effect') {
    const effect = asset.effect;
    if (
      effect &&
      finitePositive(effect.durationMs) &&
      typeof effect.loop === 'boolean' &&
      typeof effect.blendMode === 'string'
    ) {
      overlay.effect = {
        durationMs: effect.durationMs,
        loop: effect.loop,
        blendMode: effect.blendMode,
      };
    } else {
      issues.push(
        issue(
          'effect-settings-invalid',
          effect ? 'invalid' : 'unset',
          'durationまたは再生設定が不正なため、effect timingを評価できません。',
          'effect',
        ),
      );
    }
  }

  return overlay;
}

export function inspectPreviewTextureReferences(
  asset: Asset,
  availableTextureIds: ReadonlySet<string>,
  decodeFailedTextureIds: ReadonlySet<string>,
): GamePreviewIssue[] {
  const textureById = new Map(asset.textures.map((texture) => [texture.id, texture]));
  const issues: GamePreviewIssue[] = [];
  for (const layer of asset.layers) {
    if (!layer.textureId || layer.layerType !== 'image') {
      continue;
    }
    const path = `layers[id=${layer.id}].textureId`;
    const texture = textureById.get(layer.textureId);
    if (!texture) {
      issues.push(
        issue(
          'layer-texture-dangling',
          'dangling-reference',
          `レイヤー「${layer.name}」の画像参照が見つかりません。`,
          path,
        ),
      );
      continue;
    }
    if (decodeFailedTextureIds.has(texture.id)) {
      issues.push(
        issue(
          'texture-decode-failure',
          'decode-failure',
          `画像「${texture.name}」をデコードできないため、ゲーム風表示は未評価です。`,
          `textures[id=${texture.id}]`,
        ),
      );
    } else if (!availableTextureIds.has(texture.id)) {
      issues.push(
        issue(
          'texture-blob-missing',
          'missing-blob',
          `画像「${texture.name}」のBlobが見つからないため、ゲーム風表示は未評価です。`,
          `textures[id=${texture.id}].path`,
        ),
      );
    }
  }
  return issues;
}

export function buildGamePreviewProjection(
  asset: Asset,
  selection: GamePreviewSelection,
): GamePreviewProjection {
  const animation =
    selection.animationId === null
      ? null
      : (asset.animations.find((candidate) => candidate.id === selection.animationId) ?? null);
  const frameId = selection.frameId;
  const frame = (asset.frames ?? []).find((candidate) => candidate.id === frameId) ?? null;
  const frameIndex =
    animation &&
    selection.occurrenceIndex !== null &&
    Number.isInteger(selection.occurrenceIndex) &&
    selection.occurrenceIndex >= 0 &&
    animation.frameIds[selection.occurrenceIndex] === frameId
      ? selection.occurrenceIndex
      : null;
  const issues: GamePreviewIssue[] = [];
  const frameById = new Map((asset.frames ?? []).map((candidate) => [candidate.id, candidate]));
  if (selection.animationId && !animation) {
    issues.push(
      issue(
        'animation-dangling-reference',
        'dangling-reference',
        `選択したAnimation「${selection.animationId}」が見つかりません。`,
        `animations[id=${selection.animationId}]`,
      ),
    );
  }
  if (animation) {
    for (const animationFrameId of animation.frameIds) {
      if (!frameById.has(animationFrameId)) {
        issues.push(
          issue(
            'animation-frame-dangling-reference',
            'dangling-reference',
            `Animation「${animation.name}」が存在しないFrame「${animationFrameId}」を参照しています。`,
            `animations[id=${animation.id}].frameIds`,
          ),
        );
      }
    }
  }
  let colliderInspection: ReturnType<typeof inspectFrameColliderOverrides>;
  try {
    colliderInspection = inspectFrameColliderOverrides(asset);
  } catch {
    colliderInspection = { valid: false, issues: [] };
    issues.push(
      issue(
        'asset-collider-structure-invalid',
        'invalid',
        'colliderまたはFrame overrideの構造が不正なため、実効colliderを解決できません。',
        'colliders / frames[].colliderOverrides',
      ),
    );
  }
  if (!colliderInspection.valid) {
    for (const colliderIssue of colliderInspection.issues) {
      issues.push(
        issue(
          colliderIssue.code,
          colliderIssue.code.includes('dangling') ? 'dangling-reference' : 'invalid',
          colliderIssue.message,
          colliderIssue.path,
        ),
      );
    }
  }
  if (selection.frameId && !frame) {
    issues.push(
      issue(
        'frame-dangling-reference',
        'dangling-reference',
        `選択したFrame「${selection.frameId}」が見つかりません。`,
        `frames[id=${selection.frameId}]`,
      ),
    );
  }
  if (animation && animation.frameIds.length === 0) {
    issues.push(
      issue(
        'animation-empty',
        'unset',
        `Animation「${animation.name}」にFrameがないため、静止表示にします。`,
        `animations[id=${animation.id}].frameIds`,
      ),
    );
  }

  let displayAsset = asset;
  let effectiveCollidersAvailable = colliderInspection.valid;
  if (frame) {
    displayAsset = frameWithLayerState(asset, frame);
    if (colliderInspection.valid) {
      try {
        displayAsset = applyFrameToAsset(asset, frame.id);
      } catch {
        effectiveCollidersAvailable = false;
        issues.push(
          issue(
            'frame-collider-resolution-failed',
            'invalid',
            'Frame別colliderを実効値へ解決できないため、値を推測せず表示しません。',
            `frames[id=${frame.id}].colliderOverrides`,
          ),
        );
      }
    }
  }

  if (!effectiveCollidersAvailable) {
    issues.push(
      issue(
        'effective-collider-unavailable',
        'invalid',
        'colliderの意味検証またはFrame override解決に失敗したため、実効colliderを表示しません。',
        'colliders / frames[].colliderOverrides',
      ),
    );
  }

  const overlay = overlayForAsset(displayAsset, issues);
  if (!effectiveCollidersAvailable) {
    overlay.colliders = [];
  }

  return {
    displayAsset,
    animation,
    frame,
    frameIndex,
    issues,
    overlay,
  };
}

function pushImpact(result: GameImpactItem[], item: Omit<GameImpactItem, 'id'>): void {
  result.push({ ...item, id: `${item.kind}:${item.path}:${result.length}` });
}

export function buildGameImpact(
  asset: Asset,
  project: Project,
  assets: readonly Asset[],
  context?: GameImpactContext,
): GameImpactItem[] {
  const result: GameImpactItem[] = [];
  const sourceTextures = asset.textures.filter((texture) => texture.kind === 'source');
  const editTextures = asset.textures.filter((texture) => texture.kind === 'edit');
  const layerIdsByTextureId = new Map<string, string[]>();
  for (const layer of asset.layers) {
    if (!layer.textureId) {
      continue;
    }
    const layerIds = layerIdsByTextureId.get(layer.textureId) ?? [];
    layerIds.push(layer.id);
    layerIdsByTextureId.set(layer.textureId, layerIds);
  }

  for (const sourceTexture of sourceTextures) {
    pushImpact(result, {
      kind: 'source-edit',
      path: `textures[id=${sourceTexture.id},kind=source]`,
      confidence: '確定',
      state: '現在登録済み',
      reason: 'source画像は現在のAssetに原本参照として直接登録されています。',
      checked: `kind、ID、pathを確認（${sourceTexture.path}）`,
      unchecked: 'Blob bytes、画像内容、editの生成過程は未確認',
      recheck: 'sourceの差し替え、path変更、provenance変更時に再確認',
    });
  }
  for (const editTexture of editTextures) {
    const referencingLayerIds = layerIdsByTextureId.get(editTexture.id) ?? [];
    pushImpact(result, {
      kind: 'source-edit',
      path: `textures[id=${editTexture.id},kind=edit]`,
      confidence: '確定',
      state: referencingLayerIds.length > 0 ? 'Layer参照あり' : 'Layer参照なし',
      reason:
        referencingLayerIds.length > 0
          ? `edit画像は現在のLayer（${referencingLayerIds.join(', ')}）から直接参照されています。`
          : 'edit画像は現在のAssetに直接登録されています。',
      checked: `kind、ID、path、Layer参照を確認（${editTexture.path}）`,
      unchecked:
        referencingLayerIds.length > 0
          ? 'Blob bytes、画像内容、sourceからの生成過程は未確認'
          : 'Blob bytes、画像内容、未参照editを使う将来のLayerは未確認',
      recheck: 'edit更新、LayerのtextureId変更、path変更時に再確認',
    });
  }
  if (sourceTextures.length > 0 && editTextures.length > 0) {
    pushImpact(result, {
      kind: 'source-edit',
      path: 'textures[kind=source] -> textures[kind=edit]',
      confidence: '可能性',
      state: '現在関係: 未評価',
      reason:
        '同じAsset内にsourceとeditがありますが、個別の生成元を示す直接参照は保存されていないため関係は候補です。',
      checked: 'source/editの現在の登録とAsset内での共存を確認',
      unchecked: 'どのsourceからどのeditを生成したかは未確認',
      recheck: 'source、edit、provenance、Layer参照の変更時に再確認',
    });
  } else {
    pushImpact(result, {
      kind: 'unassessed',
      path: 'textures[kind=source|edit]',
      confidence: '未評価',
      state: '現在状態: 未評価',
      reason: 'sourceとeditの両方が揃っていないため、現在の関係を算出できません。',
      checked: 'source/edit textureの登録有無を確認',
      unchecked: '不足textureの履歴や過去の関係は未確認',
      recheck: 'sourceまたはeditが追加されたときに再確認',
    });
  }

  const family = project.families?.find(
    (candidate) =>
      candidate.baseAssetId === asset.id ||
      candidate.variants.some((variant) => variant.assetId === asset.id),
  );

  if (family) {
    if (family.baseAssetId === asset.id) {
      for (const variant of family.variants) {
        const currentVariantState = context?.variantStates?.[variant.assetId];
        const currentVariantAssessed = currentVariantState?.assessed === true;
        pushImpact(result, {
          kind: 'variant',
          path: `families[id=${family.id}].variants[assetId=${variant.assetId}]`,
          confidence: variant.kind === 'manual' ? '未評価' : '確定',
          state:
            variant.kind === 'manual'
              ? 'manual / 未評価'
              : `既存状態: ${currentVariantState?.label ?? '未評価'} / 保存fingerprint: base=${variant.fingerprint.base}, variant=${variant.fingerprint.variant}, syncedAt=${variant.fingerprint.syncedAt}`,
          reason:
            variant.kind === 'manual'
              ? 'manual variantはGroup 14で自動追跡せず、未評価として扱います。'
              : 'Projectに直接登録されたlinked variantです。',
          checked:
            variant.kind !== 'manual' && currentVariantAssessed
              ? 'Family registryの直接参照とEditorの既存linked検査結果を確認'
              : 'Family registryの直接参照を確認',
          unchecked:
            variant.kind === 'manual'
              ? 'manual variantの内容差分と派生経路は未確認'
              : currentVariantAssessed
                ? '対象engineでの動作とtransitiveな派生影響は未確認'
                : '現在のup-to-date/stale、Blob bytes、対象engineでの動作は未確認',
          recheck: 'Family registryまたはvariant内容の変更時に再確認',
        });
      }
    } else {
      const selectedVariant = family.variants.find((variant) => variant.assetId === asset.id);
      const currentVariantState = selectedVariant
        ? context?.variantStates?.[selectedVariant.assetId]
        : undefined;
      const currentVariantAssessed = currentVariantState?.assessed === true;
      pushImpact(result, {
        kind: 'variant',
        path: `families[id=${family.id}].baseAssetId`,
        confidence: selectedVariant?.kind === 'manual' ? '未評価' : '確定',
        state:
          selectedVariant?.kind === 'manual'
            ? 'manual / 未評価'
            : selectedVariant
              ? `既存状態: ${currentVariantState?.label ?? '未評価'} / 保存fingerprint: base=${selectedVariant.fingerprint.base}, variant=${selectedVariant.fingerprint.variant}, syncedAt=${selectedVariant.fingerprint.syncedAt}`
              : 'Family参照状態: 未評価',
        reason:
          selectedVariant?.kind === 'manual'
            ? '選択Assetはmanual variantのため、baseとの差分や同期状態を未評価として扱います。'
            : '選択Assetが所属Familyのbaseへ直接リンクされています。',
        checked: currentVariantAssessed
          ? 'Family registryの直接参照とEditorの既存linked検査結果を確認'
          : 'Family registryの直接参照を確認',
        unchecked:
          selectedVariant?.kind === 'manual'
            ? 'manual variantの内容差分と派生経路は未確認'
            : currentVariantAssessed
              ? '対象engineでの動作とtransitiveな派生影響は未確認'
              : '現在のup-to-date/stale、Blob bytes、base変更の反映結果は未確認',
        recheck: 'Family registryまたはbase/variantの変更時に再確認',
      });
      if (family.variants.length > 1) {
        pushImpact(result, {
          kind: 'unassessed',
          path: `families[id=${family.id}].variants`,
          confidence: '未評価',
          state: 'transitiveな現在状態: 未評価',
          reason: '同じFamily内の他variantへのtransitiveな影響は計算しません。',
          checked: 'transitive連鎖は未評価',
          unchecked: '他variantへの間接的な影響と実行結果は未確認',
          recheck: 'Family構成またはvariant連鎖の変更時に再確認',
        });
      }
    }
    if (family.variants.some((variant) => variant.kind === 'manual')) {
      pushImpact(result, {
        kind: 'unassessed',
        path: `families[id=${family.id}].variants[kind=manual]`,
        confidence: '未評価',
        state: 'manual / 未評価',
        reason: 'manual variantは手動変更の範囲を推測しません。',
        checked: 'manual variantは未評価',
        unchecked: 'manual variantの差分、意図、派生範囲は未確認',
        recheck: 'manual variantの内容またはFamily registry変更時に再確認',
      });
    }
  }

  const validFrameIds = new Set((asset.frames ?? []).map((frame) => frame.id));
  for (const animation of asset.animations) {
    if (animation.frameIds.length === 0) {
      pushImpact(result, {
        kind: 'frame',
        path: `animations[id=${animation.id}].frameIds`,
        confidence: '確定',
        state: 'Frame未設定（確認済み）',
        reason: 'AnimationにFrame参照がない現在状態を直接確認しました。',
        checked: '現在のAnimation.frameIdsが空であることを確認',
        unchecked: '将来追加されるFrame、実時間再生、engineでのタイミングは未確認',
        recheck: 'AnimationのframeIds、Frame、duration変更時に再確認',
      });
      continue;
    }
    animation.frameIds.forEach((animationFrameId, occurrenceIndex) => {
      const targetExists = validFrameIds.has(animationFrameId);
      pushImpact(result, {
        kind: 'frame',
        path: `animations[id=${animation.id}].frameIds[${occurrenceIndex}] -> frames[id=${animationFrameId}]`,
        confidence: '確定',
        state: targetExists ? '直接参照・参照先あり' : '直接参照・参照先切れ',
        reason: targetExists
          ? `Animationに保存されたFrame「${animationFrameId}」への直接参照です。`
          : `AnimationにFrame「${animationFrameId}」への直接参照が保存されていますが、参照先は存在しません。`,
        checked: '現在のAnimation.frameIdsと対象Frame IDを直接照合',
        unchecked: targetExists
          ? 'Frameの画像decode、実時間再生、engineでのタイミングは未確認'
          : '欠落Frameの過去値、画像、engineでのタイミングは未確認',
        recheck: 'AnimationのframeIds、Frame、duration変更時に再確認',
      });
    });
  }

  const selectedAnimationId = context?.selection?.animationId;
  if (selectedAnimationId) {
    const selectedAnimation = asset.animations.find(
      (animation) => animation.id === selectedAnimationId,
    );
    pushImpact(result, {
      kind: 'animation',
      path: `animations[id=${selectedAnimationId}]`,
      confidence: selectedAnimation ? '確定' : '可能性',
      state: selectedAnimation ? '現在選択中' : '選択参照切れ',
      reason: selectedAnimation
        ? '現在選択中のAnimationがAssetに直接存在し、PreviewのFrame候補を決めます。'
        : '現在のUIは存在しないAnimation IDを選択しているため、影響候補としてのみ表示します。',
      checked: '選択Animation IDと現在のAsset.animationsを照合',
      unchecked: selectedAnimation
        ? '実時間再生とengine固有のタイミングは未確認'
        : '削除または変更されたAnimationの過去値は未確認',
      recheck: '選択AnimationまたはAsset.animations変更時に再確認',
    });
  }
  const selectedFrameId = context?.selection?.frameId;
  if (selectedFrameId) {
    const selectedFrame = (asset.frames ?? []).find((frame) => frame.id === selectedFrameId);
    pushImpact(result, {
      kind: 'frame',
      path: `frames[id=${selectedFrameId}]`,
      confidence: selectedFrame ? '確定' : '可能性',
      state: selectedFrame ? '現在選択中' : '選択参照切れ',
      reason: selectedFrame
        ? '現在選択中のFrameがAssetに直接存在し、PreviewのLayer状態と実効colliderを決めます。'
        : '現在のUIは存在しないFrame IDを選択しているため、影響候補としてのみ表示します。',
      checked: '選択Frame IDと現在のAsset.framesを照合',
      unchecked: selectedFrame
        ? '画像decode、実時間再生、engineでのcollider判定は未確認'
        : '削除または変更されたFrameの過去値は未確認',
      recheck: '選択FrameまたはAsset.frames変更時に再確認',
    });
  }

  const uiEntries = Object.entries(context?.uiState ?? {})
    .filter(
      (entry): entry is [string, Exclude<GameImpactUiValue, undefined>] => entry[1] !== undefined,
    )
    .sort(([left], [right]) => left.localeCompare(right));
  if (uiEntries.length > 0) {
    const uiSummary = uiEntries.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ');
    pushImpact(result, {
      kind: 'ui-state',
      path: `Game Check Mode.uiState[${uiSummary}]`,
      confidence: '可能性',
      state: 'UI-only現在値',
      reason: '現在のUI-only状態がPreviewの説明用表示に影響する候補です。',
      checked: `現在のUI-only値を読み取り（${uiSummary}）`,
      unchecked: 'Asset、Project、Historyへの書き込みとengine固有挙動は評価対象外',
      recheck: `UI-only状態（${uiEntries.map(([key]) => key).join(', ')}）の変更時に再計算`,
    });
  }

  pushImpact(result, {
    kind: 'asset',
    path: 'origin / anchors / colliders / gameAttributes',
    confidence: '確定',
    state: '保存済み現在値',
    reason: '現在のAssetに直接保存されているゲーム用情報です。',
    checked: 'Assetの現在値を読み取り',
    unchecked: '実ゲームの物理、AI、接地判定、engine固有処理は未確認',
    recheck: 'origin、anchor、collider、gameAttributes変更時に再確認',
  });
  if (asset.assetType === 'background') {
    for (const layer of asset.layers) {
      pushImpact(result, {
        kind: 'asset',
        path: `layers[id=${layer.id}].background`,
        confidence: '確定',
        state: layer.background ? '保存済み現在値' : '未設定（確認済み）',
        reason: layer.background
          ? '現在のLayerに直接保存されたbackground設定です。'
          : '現在のLayerにbackground設定がないことを直接確認しました。',
        checked: 'Layerのbackground、parallax、loop設定の現在値を読み取り',
        unchecked: '実行時カメラ、world座標、engine固有scrollは未確認',
        recheck: 'Layerまたはbackground設定変更時に再確認',
      });
    }
  } else if (asset.assetType === 'tile') {
    pushImpact(result, {
      kind: 'asset',
      path: 'tile',
      confidence: '確定',
      state: asset.tile ? '保存済み現在値' : '未設定（確認済み）',
      reason: '現在のtileSize、collisionType、visualTypeを直接確認した結果です。',
      checked: 'Asset.tileの現在値を読み取り',
      unchecked: 'autotile、terrain、engine固有の接続規則は未確認',
      recheck: 'tile設定変更時に再確認',
    });
  } else if (asset.assetType === 'gimmick') {
    pushImpact(result, {
      kind: 'asset',
      path: 'gimmick',
      confidence: '確定',
      state: asset.gimmick ? '保存済み現在値' : '未設定（確認済み）',
      reason: '現在のmovementPresetを直接確認した結果です。',
      checked: 'Asset.gimmickの現在値を読み取り',
      unchecked: '物理、AI、状態遷移、実行時軌道は未確認',
      recheck: 'gimmick設定変更時に再確認',
    });
  } else if (asset.assetType === 'effect') {
    pushImpact(result, {
      kind: 'asset',
      path: 'effect',
      confidence: '確定',
      state: asset.effect ? '保存済み現在値' : '未設定（確認済み）',
      reason: '現在のduration、loop、blend設定を直接確認した結果です。',
      checked: 'Asset.effectの現在値を読み取り',
      unchecked: 'engine固有blend、粒子物理、実行時の見え方は未確認',
      recheck: 'effect設定変更時に再確認',
    });
  }
  pushImpact(result, {
    kind: 'preview',
    path: 'Game Check Mode',
    confidence: '可能性',
    state: '説明用投影',
    reason: '現在の画像・Frame・ゲーム用情報がPreview表示へ影響する候補です。',
    checked: '現在のAssetからPreview投影を算出',
    unchecked: '対象engineでの実行結果、物理、色再現は未確認',
    recheck: 'Asset、Animation、Frame、UI-only状態変更時に再確認',
  });

  if (assets.some((candidate) => candidate.id === asset.id)) {
    pushImpact(result, {
      kind: 'export',
      path: 'current export compatibility',
      confidence: '可能性',
      state: 'export未実行',
      reason: '実際のexport実行ではなく、現在のAssetから互換性候補を表示します。',
      checked: 'exportを実行せず、現在値だけを参照',
      unchecked: 'export出力bytes、manifest、対象engineでの読み込みは未確認',
      recheck: 'Asset、Project、export preflight規則変更時に再確認',
    });
  }
  pushImpact(result, {
    kind: 'unassessed',
    path: 'past export / verification record',
    confidence: '未評価',
    state: '過去状態: 未評価',
    reason: '過去のexportやverification recordを新しい検証結果として扱いません。',
    checked: '過去記録は読み取り対象外',
    unchecked: '過去exportの内容、verification record、外部engineの結果は未確認',
    recheck: '過去記録の明示的な検証ワークフローを実行したときに再確認',
  });
  return result;
}

export function assetTypeLabel(assetType: AssetType): string {
  const labels: Record<AssetType, string> = {
    character: 'キャラクター',
    item: 'アイテム',
    background: '背景',
    tile: 'タイル',
    gimmick: 'ギミック',
    effect: 'エフェクト',
  };
  return labels[assetType];
}
