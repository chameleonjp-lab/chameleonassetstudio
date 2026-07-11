/**
 * ゲームデータの意味検査（2D-3-GAMEDATA-01）。
 *
 * asset.json の JSON Schema は「形」（型・必須項目）だけを検証する。ここではその上の
 * 「意味」（参照が実在するか、character として最低限の判定が揃っているか等）を検査する。
 *
 * 重要な設計方針:
 * - inspectAsset は asset を deep-read するだけで、一切変更しない（advisory のみ）。
 * - 自動修正は行わない。あくまで「気づき」を返し、ユーザーが対象へジャンプして自分で直す。
 * - export / save の経路はゲートしない（このモジュールは呼ばれない限り何も起きない）。
 */
import type { Asset } from './asset';

export type InspectionSeverity = 'error' | 'warning' | 'info';

export type InspectionCategory =
  'reference' | 'collider' | 'anchor' | 'animation' | 'frame' | 'origin';

export interface InspectionTarget {
  kind: 'collider' | 'anchor' | 'animation' | 'frame';
  id: string;
}

export interface InspectionFinding {
  /** 一意（code + 対象 id 等から生成、React key 用）。 */
  id: string;
  /** 機械可読コード（例 'animation.empty'）。 */
  code: string;
  severity: InspectionSeverity;
  category: InspectionCategory;
  /** 日本語の理由（何が問題か・どう直すか）。 */
  message: string;
  target?: InspectionTarget;
}

const SEVERITY_RANK: Record<InspectionSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/** 値の重複を name -> 出現 index[] の形で集計する。 */
function groupDuplicates<T>(items: T[], keyOf: (item: T) => string): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const key = keyOf(item);
    const indices = groups.get(key) ?? [];
    indices.push(index);
    groups.set(key, indices);
  });
  for (const [key, indices] of groups) {
    if (indices.length < 2) {
      groups.delete(key);
    }
  }
  return groups;
}

/**
 * asset の参照整合性・ゲームデータとしての最低限の充足を検査する。
 * asset を一切変更しない純関数。severity 降順（error → warning → info）で返す。
 */
export function inspectAsset(asset: Asset): InspectionFinding[] {
  const findings: InspectionFinding[] = [];
  let seq = 0;
  const nextId = (code: string, targetId?: string): string => {
    seq += 1;
    return `${code}:${targetId ?? 'none'}:${seq}`;
  };
  const push = (finding: Omit<InspectionFinding, 'id'> & { targetIdForKey?: string }): void => {
    const { targetIdForKey, ...rest } = finding;
    findings.push({ id: nextId(rest.code, targetIdForKey ?? rest.target?.id), ...rest });
  };

  const frames = asset.frames ?? [];
  const layerIds = new Set(asset.layers.map((layer) => layer.id));
  const textureIds = new Set(asset.textures.map((texture) => texture.id));
  const frameIds = new Set(frames.map((frame) => frame.id));

  // ---- reference/error: frame.layerStates[].layerId が asset.layers に無い ----
  for (const frame of frames) {
    const missing = frame.layerStates
      .map((state) => state.layerId)
      .filter((id) => !layerIds.has(id));
    const uniqueMissing = Array.from(new Set(missing));
    if (uniqueMissing.length > 0) {
      push({
        code: 'reference.frameLayerMissing',
        severity: 'error',
        category: 'reference',
        message: `フレーム「${frame.name}」が存在しないレイヤー（${uniqueMissing.join(', ')}）を参照しています。フレームのレイヤー状態を作り直すか、参照を削除してください。`,
        target: { kind: 'frame', id: frame.id },
      });
    }
  }

  // ---- reference/error: animation.frameIds[] が asset.frames に無い（frames 未定義含む） ----
  for (const animation of asset.animations) {
    const missing = animation.frameIds.filter((id) => !frameIds.has(id));
    const uniqueMissing = Array.from(new Set(missing));
    if (uniqueMissing.length > 0) {
      push({
        code: 'reference.animationFrameMissing',
        severity: 'error',
        category: 'reference',
        message: `アニメーション「${animation.name}」が存在しないフレーム（${uniqueMissing.join(', ')}）を参照しています。フレーム一覧から選び直すか、参照を削除してください。`,
        target: { kind: 'animation', id: animation.id },
      });
    }
  }

  // ---- reference/error: layer.textureId が設定されているのに asset.textures に無い ----
  for (const layer of asset.layers) {
    if (layer.textureId !== undefined && !textureIds.has(layer.textureId)) {
      push({
        code: 'reference.layerTextureMissing',
        severity: 'error',
        category: 'reference',
        message: `レイヤー「${layer.name}」が存在しないテクスチャ（${layer.textureId}）を参照しています。画像を選び直してください。`,
      });
    }
  }

  // ---- reference/error: part.layerIds[] が asset.layers に無い ----
  for (const part of asset.parts) {
    const missing = part.layerIds.filter((id) => !layerIds.has(id));
    const uniqueMissing = Array.from(new Set(missing));
    if (uniqueMissing.length > 0) {
      push({
        code: 'reference.partLayerMissing',
        severity: 'error',
        category: 'reference',
        message: `パーツ「${part.name}」が存在しないレイヤー（${uniqueMissing.join(', ')}）を参照しています。パーツの構成レイヤーを見直してください。`,
      });
    }
  }

  // ---- id 重複（error） ----
  const duplicateColliderIds = groupDuplicates(asset.colliders, (collider) => collider.id);
  for (const id of duplicateColliderIds.keys()) {
    push({
      code: 'collider.duplicateId',
      severity: 'error',
      category: 'collider',
      message: `当たり判定の id「${id}」が重複しています。id はアセット内で一意である必要があります。どちらか一方を作り直してください。`,
      target: { kind: 'collider', id },
    });
  }

  const duplicateAnchorIds = groupDuplicates(asset.anchors, (anchor) => anchor.id);
  for (const id of duplicateAnchorIds.keys()) {
    push({
      code: 'anchor.duplicateId',
      severity: 'error',
      category: 'anchor',
      message: `アンカーの id「${id}」が重複しています。id はアセット内で一意である必要があります。どちらか一方を作り直してください。`,
      target: { kind: 'anchor', id },
    });
  }

  const duplicateAnimationIds = groupDuplicates(asset.animations, (animation) => animation.id);
  for (const id of duplicateAnimationIds.keys()) {
    push({
      code: 'animation.duplicateId',
      severity: 'error',
      category: 'animation',
      message: `アニメーションの id「${id}」が重複しています。id はアセット内で一意である必要があります。どちらか一方を作り直してください。`,
      target: { kind: 'animation', id },
    });
  }

  const duplicateFrameIds = groupDuplicates(frames, (frame) => frame.id);
  for (const id of duplicateFrameIds.keys()) {
    push({
      code: 'frame.duplicateId',
      severity: 'error',
      category: 'frame',
      message: `フレームの id「${id}」が重複しています。id はアセット内で一意である必要があります。どちらか一方を作り直してください。`,
      target: { kind: 'frame', id },
    });
  }

  // ---- name 重複（warning） ----
  const duplicateColliderNames = groupDuplicates(asset.colliders, (collider) => collider.name);
  for (const [name, indices] of duplicateColliderNames) {
    const targetId = asset.colliders[indices[0]].id;
    push({
      code: 'collider.duplicateName',
      severity: 'warning',
      category: 'collider',
      message: `当たり判定の名前「${name}」が ${indices.length} 件で重複しています。一覧での見分けが付きにくくなるため、名前を分けてください。`,
      target: { kind: 'collider', id: targetId },
      targetIdForKey: `${name}`,
    });
  }

  const duplicateFrameNames = groupDuplicates(frames, (frame) => frame.name);
  for (const [name, indices] of duplicateFrameNames) {
    const targetId = frames[indices[0]].id;
    push({
      code: 'frame.duplicateName',
      severity: 'warning',
      category: 'frame',
      message: `フレームの名前「${name}」が ${indices.length} 件で重複しています。atlas 書き出しは frame.name をキーに使うため衝突します。名前を分けてください。`,
      target: { kind: 'frame', id: targetId },
      targetIdForKey: `${name}`,
    });
  }

  // ---- animation/warning: animation.frameIds が空 ----
  for (const animation of asset.animations) {
    if (animation.frameIds.length === 0) {
      push({
        code: 'animation.empty',
        severity: 'warning',
        category: 'animation',
        message: `アニメーション「${animation.name}」にフレームが 1 つも設定されていません。再生できないため、フレームを追加してください。`,
        target: { kind: 'animation', id: animation.id },
      });
    }
  }

  // ---- collider/info: character で body 判定が無い ----
  if (asset.assetType === 'character' && !asset.colliders.some((c) => c.purpose === 'body')) {
    push({
      code: 'collider.characterBodyMissing',
      severity: 'info',
      category: 'collider',
      message:
        '被弾・接地判定に使う用途「body」の当たり判定がありません。ゲーム側の判定が未設定の可能性があるため、当たり判定パネルから追加してください。',
    });
  }

  // ---- anchor/info: character で anchors が空 ----
  if (asset.assetType === 'character' && asset.anchors.length === 0) {
    push({
      code: 'anchor.characterAnchorsEmpty',
      severity: 'info',
      category: 'anchor',
      message:
        '手・足・弾発射位置などの参照点になるアンカーが 1 つもありません。ゲーム側で位置合わせが必要な場合は、アンカーパネルから追加してください。',
    });
  }

  // ---- origin/info: origin が canvasSize の範囲外 ----
  const { origin, canvasSize } = asset;
  if (origin.x < 0 || origin.x > canvasSize.width || origin.y < 0 || origin.y > canvasSize.height) {
    push({
      code: 'origin.outOfBounds',
      severity: 'info',
      category: 'origin',
      message: `原点（${origin.x}, ${origin.y}）がキャンバスの範囲（0〜${canvasSize.width}, 0〜${canvasSize.height}）の外にあります。意図的でなければ原点パネルで位置を見直してください。`,
    });
  }

  return findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
