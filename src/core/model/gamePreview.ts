import { applyFrameToAsset } from './assetOps';
import type { Animation, Frame } from './animation';
import { inspectFrameColliderOverrides } from './frameColliderOverrides';
import type { Asset, AssetType } from './asset';
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

export interface GameImpactItem {
  id: string;
  kind: 'asset' | 'variant' | 'frame' | 'preview' | 'export' | 'unassessed';
  path: string;
  confidence: ImpactConfidence;
  reason: string;
  checked: string;
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

function firstAnimationFrame(asset: Asset, animation: Animation | null): string | null {
  const frameIds = new Set((asset.frames ?? []).map((frame) => frame.id));
  if (!animation) {
    return (asset.frames ?? [])[0]?.id ?? null;
  }
  if (animation.frameIds.length === 0) {
    return (asset.frames ?? [])[0]?.id ?? null;
  }
  return animation?.frameIds.find((frameId) => frameIds.has(frameId)) ?? null;
}

export function initialGamePreviewSelection(asset: Asset): GamePreviewSelection {
  const animation = asset.animations[0] ?? null;
  return {
    animationId: animation?.id ?? null,
    frameId: firstAnimationFrame(asset, animation),
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
    groundLineY: null,
    tile: null,
    background: [],
    gimmickPreset: null,
    effect: null,
  };

  if (asset.assetType === 'character') {
    const origin = asset.origin;
    if (origin && finiteNumber(origin.x) && finiteNumber(origin.y)) {
      overlay.groundLineY = asset.origin.y;
    } else {
      issues.push(
        issue(
          'character-origin-invalid',
          'invalid',
          'originが有限値ではないため接地線を表示できません。',
          'origin',
        ),
      );
    }
  }

  if (asset.assetType === 'tile') {
    const tile = asset.tile;
    const tileSize = tile?.tileSize;
    if (tileSize && finitePositive(tileSize.width) && finitePositive(tileSize.height)) {
      overlay.tile = {
        tileWidth: tileSize.width,
        tileHeight: tileSize.height,
        collisionType: tile?.collisionType ?? '未設定',
        cellCount: 9,
      };
    } else {
      issues.push(
        issue(
          'tile-settings-unset',
          'unset',
          'tileSizeが未設定または不正なため、3×3反復を評価できません。',
          'tile.tileSize',
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
          `画像「${texture.name}」をデコードできませんでした。`,
          `textures[id=${texture.id}]`,
        ),
      );
    } else if (!availableTextureIds.has(texture.id)) {
      issues.push(
        issue(
          'texture-blob-missing',
          'missing-blob',
          `画像「${texture.name}」のBlobが見つかりません。`,
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
      : (asset.animations.find((candidate) => candidate.id === selection.animationId) ??
        asset.animations[0] ??
        null);
  const frameId = selection.frameId ?? firstAnimationFrame(asset, animation);
  const frame = (asset.frames ?? []).find((candidate) => candidate.id === frameId) ?? null;
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
  const colliderInspection = inspectFrameColliderOverrides(asset);
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
  if (frame) {
    displayAsset = frameWithLayerState(asset, frame);
    if (colliderInspection.valid) {
      try {
        displayAsset = applyFrameToAsset(asset, frame.id);
      } catch {
        issues.push(
          issue(
            'frame-collider-resolution-failed',
            'invalid',
            'Frame別colliderを実効値へ解決できないため、Asset共通値を表示します。',
            `frames[id=${frame.id}].colliderOverrides`,
          ),
        );
      }
    }
  }

  return {
    displayAsset,
    animation,
    frame,
    frameIndex: animation && frame ? animation.frameIds.indexOf(frame.id) : null,
    issues,
    overlay: overlayForAsset(displayAsset, issues),
  };
}

function pushImpact(result: GameImpactItem[], item: Omit<GameImpactItem, 'id'>): void {
  result.push({ ...item, id: `${item.kind}:${item.path}:${result.length}` });
}

export function buildGameImpact(
  asset: Asset,
  project: Project,
  assets: readonly Asset[],
): GameImpactItem[] {
  const result: GameImpactItem[] = [];
  const family = project.families?.find(
    (candidate) =>
      candidate.baseAssetId === asset.id ||
      candidate.variants.some((variant) => variant.assetId === asset.id),
  );

  if (family) {
    if (family.baseAssetId === asset.id) {
      for (const variant of family.variants) {
        pushImpact(result, {
          kind: 'variant',
          path: `families[id=${family.id}].variants[assetId=${variant.assetId}]`,
          confidence: variant.kind === 'manual' ? '未評価' : '確定',
          reason:
            variant.kind === 'manual'
              ? 'manual variantはGroup 14で自動追跡せず、未評価として扱います。'
              : 'Projectに直接登録されたlinked variantです。',
          checked: 'Family registryの直接参照を確認',
        });
      }
    } else {
      pushImpact(result, {
        kind: 'variant',
        path: `families[id=${family.id}].baseAssetId`,
        confidence: '確定',
        reason: '選択Assetが所属Familyのbaseへ直接リンクされています。',
        checked: 'Family registryの直接参照を確認',
      });
      if (family.variants.length > 1) {
        pushImpact(result, {
          kind: 'unassessed',
          path: `families[id=${family.id}].variants`,
          confidence: '未評価',
          reason: '同じFamily内の他variantへのtransitiveな影響は計算しません。',
          checked: 'transitive連鎖は未評価',
        });
      }
    }
    if (family.variants.some((variant) => variant.kind === 'manual')) {
      pushImpact(result, {
        kind: 'unassessed',
        path: `families[id=${family.id}].variants[kind=manual]`,
        confidence: '未評価',
        reason: 'manual variantは手動変更の範囲を推測しません。',
        checked: 'manual variantは未評価',
      });
    }
  }

  for (const animation of asset.animations) {
    const validFrameIds = new Set((asset.frames ?? []).map((frame) => frame.id));
    pushImpact(result, {
      kind: 'frame',
      path: `animations[id=${animation.id}].frameIds`,
      confidence: animation.frameIds.every((frameId) => validFrameIds.has(frameId))
        ? '確定'
        : '可能性',
      reason: 'Animationから参照されるFrameの直接関係です。',
      checked: '現在のAnimationとFrame IDを照合',
    });
  }

  pushImpact(result, {
    kind: 'asset',
    path: 'origin / anchors / colliders / gameAttributes',
    confidence: '確定',
    reason: '現在のAssetに直接保存されているゲーム用情報です。',
    checked: 'Assetの現在値を読み取り',
  });
  pushImpact(result, {
    kind: 'preview',
    path: 'Game Check Mode',
    confidence: '可能性',
    reason: '現在の画像・Frame・ゲーム用情報がPreview表示へ影響する候補です。',
    checked: '現在のAssetからPreview投影を算出',
  });

  if (assets.some((candidate) => candidate.id === asset.id)) {
    pushImpact(result, {
      kind: 'export',
      path: 'current export compatibility',
      confidence: '可能性',
      reason: '実際のexport実行ではなく、現在のAssetから互換性候補を表示します。',
      checked: 'exportを実行せず、現在値だけを参照',
    });
  }
  pushImpact(result, {
    kind: 'unassessed',
    path: 'past export / verification record',
    confidence: '未評価',
    reason: '過去のexportやverification recordを新しい検証結果として扱いません。',
    checked: '過去記録は読み取り対象外',
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
