import { findFixedFpsAnimationLosses } from '../../core/export/animationLoss';
import { findColliderOverrideExportLosses } from '../../core/export/colliderOverrideLoss';
import {
  buildGameImpact,
  type Asset,
  type Collider,
  type GameImpactItem,
  type GamePreviewIssue,
  type GamePreviewOverlay,
  type LinkedVariantInspection,
  type Project,
} from '../../core/model';
import type { RenderLayer } from '../../renderers/canvas2d/render';

export interface GameCheckPreviewState {
  animationId: string | null;
  frameId: string | null;
  isPlaying: boolean;
  visibleOverlays: string[];
  parallaxPosition: number;
  impactOpen: boolean;
}

export interface GameCheckVariantInspectionView {
  state: 'checking' | 'ready' | 'error';
  inspection?: LinkedVariantInspection;
  error?: string;
}

export interface GameCheckImpactItem extends GameImpactItem {
  targetLabel: string;
  unchecked: string;
  recheck: string;
  relationStatus?: string;
}

export interface ResolvedGameCheckPresentation {
  overlay: GamePreviewOverlay;
  issues: GamePreviewIssue[];
}

const IMPACT_TARGET_LABELS: Record<GameImpactItem['kind'], string> = {
  asset: '素材データ',
  variant: 'Variant',
  frame: 'Animation / Frame',
  preview: 'ゲーム確認',
  export: '書き出し互換性',
  unassessed: '未評価範囲',
};

function tileSizeMatchesCanvas(asset: Asset, overlay: GamePreviewOverlay): boolean {
  const tile = overlay.tile;
  return Boolean(
    tile &&
      tile.tileWidth === asset.canvasSize.width &&
      tile.tileHeight === asset.canvasSize.height,
  );
}

/**
 * Game Check Modeで使う表示契約を解決する。
 * tileSizeとcanvasが一致しない場合は推測で切り出さず、単体表示へ戻す。
 */
export function resolveGameCheckPresentation(
  asset: Asset,
  overlay: GamePreviewOverlay,
): ResolvedGameCheckPresentation {
  const issues: GamePreviewIssue[] = [];
  let resolvedOverlay = overlay;

  if (asset.assetType === 'tile' && overlay.tile && !tileSizeMatchesCanvas(asset, overlay)) {
    resolvedOverlay = { ...overlay, tile: null };
    issues.push({
      code: 'tile-size-mismatch',
      kind: 'invalid',
      message: `tileSize ${overlay.tile.tileWidth}×${overlay.tile.tileHeight} とcanvas ${asset.canvasSize.width}×${asset.canvasSize.height}が一致しないため、画像を推測で切り出さず単体表示にします。`,
      path: 'tile.tileSize / canvasSize',
    });
  }

  for (const layer of asset.layers) {
    if (layer.layerType === 'image' && !layer.textureId) {
      issues.push({
        code: 'layer-texture-unset',
        kind: 'unset',
        message: `画像レイヤー「${layer.name}」のtextureIdが未設定です。`,
        path: `layers[id=${layer.id}].textureId`,
      });
    }
  }

  const runtimeOrigin = asset.origin as Asset['origin'] | undefined;
  if (!runtimeOrigin) {
    issues.push({
      code: 'origin-unset',
      kind: 'unset',
      message: 'originが未設定のため、配置基準を表示できません。',
      path: 'origin',
    });
  }

  if (
    ['character', 'item', 'tile', 'gimmick'].includes(asset.assetType) &&
    asset.colliders.length === 0
  ) {
    issues.push({
      code: 'collider-unset',
      kind: 'unset',
      message: '実効colliderが未設定です。',
      path: 'colliders',
    });
  }

  if (asset.assetType === 'item' && asset.anchors.length === 0) {
    issues.push({
      code: 'item-anchor-unset',
      kind: 'unset',
      message: 'itemの配置基準に使うanchorが未設定です。',
      path: 'anchors',
    });
  }

  return { overlay: resolvedOverlay, issues };
}

/**
 * tile正常fixtureでは、中央セルと周囲8セルへ実画像レイヤーを複製する。
 * 返す値は描画専用コピーであり、AssetやLayerを変更しない。
 */
export function buildGameCheckRenderLayers(
  layers: readonly RenderLayer[],
  asset: Asset,
  overlay: GamePreviewOverlay,
): RenderLayer[] {
  if (asset.assetType !== 'tile' || !overlay.tile || !tileSizeMatchesCanvas(asset, overlay)) {
    return [...layers];
  }

  const result: RenderLayer[] = [];
  for (let row = -1; row <= 1; row += 1) {
    for (let column = -1; column <= 1; column += 1) {
      for (const entry of layers) {
        result.push({
          ...entry,
          layer: {
            ...entry.layer,
            id: `${entry.layer.id}__game_check_${column}_${row}`,
            transform: {
              ...entry.layer.transform,
              position: {
                x: entry.layer.transform.position.x + column * overlay.tile.tileWidth,
                y: entry.layer.transform.position.y + row * overlay.tile.tileHeight,
              },
            },
          },
        });
      }
    }
  }
  return result;
}

/** tileの実効colliderも中央セルと周囲8セルへ複製し、反復時の判定範囲を表示する。 */
export function buildGameCheckColliders(
  asset: Asset,
  overlay: GamePreviewOverlay,
): Collider[] {
  if (asset.assetType !== 'tile' || !overlay.tile || !tileSizeMatchesCanvas(asset, overlay)) {
    return [...asset.colliders];
  }

  const result: Collider[] = [];
  for (let row = -1; row <= 1; row += 1) {
    for (let column = -1; column <= 1; column += 1) {
      const offsetX = column * overlay.tile.tileWidth;
      const offsetY = row * overlay.tile.tileHeight;
      for (const collider of asset.colliders) {
        result.push(
          collider.shape === 'rect'
            ? {
                ...collider,
                id: `${collider.id}__game_check_${column}_${row}`,
                rect: {
                  ...collider.rect,
                  x: collider.rect.x + offsetX,
                  y: collider.rect.y + offsetY,
                },
              }
            : {
                ...collider,
                id: `${collider.id}__game_check_${column}_${row}`,
                circle: {
                  ...collider.circle,
                  x: collider.circle.x + offsetX,
                  y: collider.circle.y + offsetY,
                },
              },
        );
      }
    }
  }
  return result;
}

function variantInspectionLabel(view: GameCheckVariantInspectionView | undefined): string {
  if (!view || view.state === 'checking') {
    return '状態を確認中';
  }
  if (view.state === 'error' || !view.inspection) {
    return '状態を確認できません';
  }
  switch (view.inspection.status) {
    case 'up-to-date':
      return '同期済み';
    case 'ready':
      return '更新候補（stale）';
    case 'manual-adjusted':
      return view.inspection.stale ? '手動調整あり（baseにも更新候補）' : '手動調整あり';
    case 'ineligible':
      return '更新不可';
  }
}

function variantAssetIdForImpact(item: GameImpactItem, selectedAssetId: string): string | null {
  const match = /variants\[assetId=([^\]]+)\]/u.exec(item.path);
  if (match) {
    return match[1];
  }
  return item.path.endsWith('.baseAssetId') ? selectedAssetId : null;
}

function detailedBaseImpact(
  item: GameImpactItem,
  state: GameCheckPreviewState,
  selectedAssetId: string,
  variantInspections: Readonly<Record<string, GameCheckVariantInspectionView>>,
): GameCheckImpactItem {
  const common = {
    ...item,
    targetLabel: IMPACT_TARGET_LABELS[item.kind],
  };

  switch (item.kind) {
    case 'variant': {
      const variantAssetId = variantAssetIdForImpact(item, selectedAssetId);
      const view = variantAssetId ? variantInspections[variantAssetId] : undefined;
      const manual = item.confidence === '未評価';
      const relationStatus = manual ? 'manual / 自動追跡なし' : variantInspectionLabel(view);
      const inspectionReason =
        !manual && view?.state === 'ready' && view.inspection?.reasons.length
          ? ` ${view.inspection.reasons.join(' ')}`
          : !manual && view?.state === 'error' && view.error
            ? ` 状態確認理由: ${view.error}`
            : '';
      return {
        ...common,
        relationStatus,
        reason: `${item.reason}${inspectionReason}`,
        checked: `${item.checked} / 関係状態=${relationStatus}`,
        unchecked: 'transitiveな派生連鎖、実際のrefresh適用結果、対象Assetのゲーム内挙動',
        recheck: 'base、recipe、fingerprint、variant、対象Blobのいずれかを変更した後',
      };
    }
    case 'frame':
      return {
        ...common,
        unchecked: '実際のゲームエンジンでの再生結果と対象別export後の再現性',
        recheck: 'AnimationのframeIds、Frame、表示時間、eventを変更した後',
      };
    case 'asset':
      return {
        ...common,
        unchecked: '物理演算、ゲームエンジン固有挙動、対象別の実行結果',
        recheck: 'source、edit、origin、anchor、collider、Game Dataを変更した後',
      };
    case 'preview':
      return {
        ...common,
        reason: `現在の選択と表示切替がPreviewへ影響する候補です。Animation=${state.animationId ?? 'なし'}、Frame=${state.frameId ?? '未設定'}。`,
        checked: `UI-only投影を再計算。再生=${state.isPlaying ? '中' : '停止'}、表示=${state.visibleOverlays.join('、') || 'なし'}、parallax=${state.parallaxPosition}、Impact=${state.impactOpen ? '展開' : '折りたたみ'}`,
        unchecked: '物理演算、対象エンジンでの見え方、実際の書き出し結果',
        recheck: 'Animation、Frame、overlay、parallax、Assetデータを変更した後',
      };
    case 'unassessed':
      return {
        ...common,
        unchecked: '過去export、verification record、manual変更、transitiveな派生影響',
        recheck: '人間が対象記録または派生経路を明示的に検証するとき',
      };
    case 'export':
      return {
        ...common,
        unchecked: '実際のbytes生成、対象ツールへのimport、対象エンジンでの実行',
        recheck: 'export preset、Animation、Frame collider、Atlas契約を変更した後',
      };
  }
}

function sourceEditImpact(asset: Asset): GameCheckImpactItem {
  const sourceIds = asset.textures
    .filter((texture) => texture.kind === 'source')
    .map((texture) => texture.id);
  const editIds = asset.textures
    .filter((texture) => texture.kind === 'edit')
    .map((texture) => texture.id);
  const layerTextureIds = asset.layers
    .filter((layer) => layer.layerType === 'image' && layer.textureId)
    .map((layer) => layer.textureId as string);
  const hasBothRoles = sourceIds.length > 0 && editIds.length > 0;

  return {
    id: 'asset:source-edit-current',
    kind: 'asset',
    targetLabel: 'source / edit関係',
    path: 'textures[kind=source|edit] / layers[].textureId',
    confidence: '未評価',
    reason: hasBothRoles
      ? 'sourceとeditの役割登録は確認しましたが、どのsourceからどのeditを生成したかの直接記録はないため、関係を推測しません。'
      : 'sourceまたはeditが不足しているため、現在の役割関係を確定できません。',
    checked: `source=${sourceIds.join('、') || 'なし'} / edit=${editIds.join('、') || 'なし'} / layer参照=${layerTextureIds.join('、') || 'なし'}`,
    unchecked: 'どのsourceからどのeditを生成したかという派生経路は、明示記録がない限り推測しません。',
    recheck: 'TextureRef、provenance、画像レイヤー参照を変更した後',
  };
}

/** G14-I1の各表示行に、未確認範囲と再確認条件を必ず付ける。 */
export function buildDetailedGameImpact(
  asset: Asset,
  project: Project,
  projectAssets: readonly Asset[],
  state: GameCheckPreviewState,
  variantInspections: Readonly<Record<string, GameCheckVariantInspectionView>> = {},
): GameCheckImpactItem[] {
  const baseItems = buildGameImpact(asset, project, projectAssets).filter(
    (item) => item.kind !== 'export',
  );
  const result: GameCheckImpactItem[] = [sourceEditImpact(asset)];
  result.push(
    ...baseItems.map((item) =>
      detailedBaseImpact(item, state, asset.id, variantInspections),
    ),
  );

  for (const loss of findFixedFpsAnimationLosses(asset)) {
    result.push({
      id: `export:fixed-fps:${loss.animationId}:${loss.kind}`,
      kind: 'export',
      targetLabel: 'Atlas固定fps',
      path: `export/atlas[animationId=${loss.animationId}]`,
      confidence: '確定',
      reason:
        loss.kind === 'frame-duration'
          ? `個別表示時間（${loss.frameNames.join('、')}）をAtlas系へ保持できません。`
          : `Animation event（${loss.eventNames.join('、')}）をAtlas系へ保持できません。`,
      checked: '既存の固定fps loss検査を実行（書き出しは未実行）',
      unchecked: '実際のbytes生成、対象ツールへのimport、対象エンジンでの再生',
      recheck: 'Animationの表示時間、event、export presetを変更した後',
    });
  }

  for (const loss of findColliderOverrideExportLosses(asset)) {
    result.push({
      id: `export:collider:${loss.frameId}`,
      kind: 'export',
      targetLabel: 'Atlas collider境界',
      path: `export/atlas[frameId=${loss.frameId}]`,
      confidence: '確定',
      reason: `Frame別collider（${loss.colliderNames.join('、')}）はAtlas 0.1.0で失われるため、既存境界で拒否されます。`,
      checked: '既存のcollider override loss検査を実行（書き出しは未実行）',
      unchecked: '実際のbytes生成、対象ツールへのimport、対象エンジンでの判定',
      recheck: 'Frame collider overrideまたはAtlas契約を変更した後',
    });
  }

  if (!result.some((item) => item.kind === 'export')) {
    result.push({
      id: 'export:atlas:compatible',
      kind: 'export',
      targetLabel: '現行Atlas互換性候補',
      path: 'export/atlas compatibility',
      confidence: '可能性',
      reason: '現在の値からは既知のAtlas拒否理由が見つかりません。実際の出力成功は保証しません。',
      checked: '既存のloss検査だけを実行（書き出しは未実行）',
      unchecked: 'bytes生成、manifest検証、対象ツールへのimport、対象エンジンでの実行',
      recheck: 'Animation、Frame collider、export preset、Atlas契約を変更した後',
    });
  }

  return result;
}
