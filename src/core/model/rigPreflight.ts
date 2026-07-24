import type { AnimationEvent, FrameLayerState } from './animation';
import type { Asset } from './asset';
import type { PartPose } from './part';
import { inspectPartLayerConstraints } from './partLayerContract';
import type { RigAnimation } from './rig';

export type RigPreflightViolationCode =
  | 'duplicate-id'
  | 'non-finite-number'
  | 'non-positive-number'
  | 'opacity-out-of-range'
  | 'reference-missing'
  | 'part-layer-empty'
  | 'part-layer-duplicate'
  | 'part-layer-missing'
  | 'part-layer-shared'
  | 'part-parent-cycle'
  | 'frame-layer-state-duplicate'
  | 'rig-keyframe-time-out-of-range'
  | 'rig-keyframe-time-duplicate'
  | 'rotation-limit-order'
  | 'frame-count-unsafe';

export interface RigPreflightViolation {
  code: RigPreflightViolationCode;
  path: string;
  message: string;
  value?: number;
  referencedId?: string;
  ids?: string[];
}

export interface InspectRigPreflightOptions {
  /**
   * bake対象のRigAnimation。指定時はAsset内の全rigではなく、このrigだけを検査する。
   * 独立copyと素材検査では省略し、Assetが保持する全rigを検査する。
   */
  rig?: RigAnimation;
}

interface InspectRigPreflightInternalOptions extends InspectRigPreflightOptions {
  allowPartLayerEmpty?: boolean;
}

export class RigPreflightError extends Error {
  readonly code = 'rig-preflight';
  readonly violations: RigPreflightViolation[];

  constructor(violations: RigPreflightViolation[]) {
    super(
      `リグ処理の入力が正しくありません。${violations
        .map((violation) => violation.message)
        .join(' / ')}`,
    );
    this.name = 'RigPreflightError';
    this.violations = violations;
  }
}

export function calculateRigFrameCount(rig: RigAnimation): number {
  return Math.max(1, Math.round((rig.durationMs / 1000) * rig.fps));
}

function duplicateValues(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function inspectFiniteNumber(
  violations: RigPreflightViolation[],
  value: number,
  path: string,
  label: string,
): boolean {
  if (Number.isFinite(value)) {
    return true;
  }
  violations.push({
    code: 'non-finite-number',
    path,
    message: `${label}は有限の数である必要があります。`,
    value,
  });
  return false;
}

function inspectPositiveNumber(
  violations: RigPreflightViolation[],
  value: number,
  path: string,
  label: string,
): void {
  if (!inspectFiniteNumber(violations, value, path, label)) {
    return;
  }
  if (value <= 0) {
    violations.push({
      code: 'non-positive-number',
      path,
      message: `${label}は0より大きい数である必要があります。`,
      value,
    });
  }
}

function inspectOpacity(
  violations: RigPreflightViolation[],
  value: number,
  path: string,
  label: string,
): void {
  if (!inspectFiniteNumber(violations, value, path, label)) {
    return;
  }
  if (value < 0 || value > 1) {
    violations.push({
      code: 'opacity-out-of-range',
      path,
      message: `${label}は0から1の範囲である必要があります。`,
      value,
    });
  }
}

function inspectVec2(
  violations: RigPreflightViolation[],
  value: { x: number; y: number },
  path: string,
  label: string,
): void {
  inspectFiniteNumber(violations, value.x, `${path}.x`, `${label}のx`);
  inspectFiniteNumber(violations, value.y, `${path}.y`, `${label}のy`);
}

function inspectTransform(
  violations: RigPreflightViolation[],
  value: NonNullable<FrameLayerState['transform']>,
  path: string,
  label: string,
): void {
  inspectVec2(violations, value.position, `${path}.position`, `${label}の位置`);
  inspectVec2(violations, value.scale, `${path}.scale`, `${label}の拡大率`);
  inspectFiniteNumber(violations, value.rotation, `${path}.rotation`, `${label}の回転`);
}

function inspectPose(
  violations: RigPreflightViolation[],
  pose: PartPose,
  path: string,
  label: string,
): void {
  if (pose.localPosition) {
    inspectVec2(violations, pose.localPosition, `${path}.localPosition`, `${label}のローカル位置`);
  }
  if (pose.localRotation !== undefined) {
    inspectFiniteNumber(
      violations,
      pose.localRotation,
      `${path}.localRotation`,
      `${label}のローカル回転`,
    );
  }
  if (pose.localScale) {
    inspectVec2(violations, pose.localScale, `${path}.localScale`, `${label}のローカル拡大率`);
  }
}

function inspectDuplicateIds(
  violations: RigPreflightViolation[],
  path: string,
  label: string,
  values: ReadonlyArray<{ id: string }>,
): void {
  for (const id of duplicateValues(values.map((value) => value.id))) {
    violations.push({
      code: 'duplicate-id',
      path: `${path}[id=${id}]`,
      message: `${label}のID「${id}」が重複しています。`,
      ids: [id],
    });
  }
}

function inspectReference(
  violations: RigPreflightViolation[],
  ids: ReadonlySet<string>,
  referencedId: string,
  path: string,
  label: string,
): void {
  if (ids.has(referencedId)) {
    return;
  }
  violations.push({
    code: 'reference-missing',
    path,
    message: `${label}「${referencedId}」が見つかりません。`,
    referencedId,
  });
}

function inspectPartCycles(asset: Asset, violations: RigPreflightViolation[]): void {
  const partById = new Map(asset.parts.map((part) => [part.id, part]));
  const reported = new Set<string>();

  for (const start of asset.parts) {
    const path: string[] = [];
    const indexById = new Map<string, number>();
    let current = start;

    while (current.parentId) {
      indexById.set(current.id, path.length);
      path.push(current.id);
      const parent = partById.get(current.parentId);
      if (!parent) {
        break;
      }
      const cycleStart = indexById.get(parent.id);
      if (cycleStart !== undefined) {
        const cycleIds = [...path.slice(cycleStart), parent.id];
        const cycleKey = [...new Set(cycleIds)].sort().join('|');
        if (!reported.has(cycleKey)) {
          reported.add(cycleKey);
          violations.push({
            code: 'part-parent-cycle',
            path: `parts[id=${start.id}].parentId`,
            message: `パーツの親子関係が循環しています: ${cycleIds.join(' → ')}`,
            ids: cycleIds,
          });
        }
        break;
      }
      current = parent;
    }
  }
}

function inspectRigAnimation(
  rig: RigAnimation,
  rigPath: string,
  partIds: ReadonlySet<string>,
  violations: RigPreflightViolation[],
): void {
  inspectPositiveNumber(violations, rig.fps, `${rigPath}.fps`, `リグ「${rig.name}」のFPS`);
  inspectPositiveNumber(
    violations,
    rig.durationMs,
    `${rigPath}.durationMs`,
    `リグ「${rig.name}」の再生時間`,
  );

  const frameCount = calculateRigFrameCount(rig);
  if (!Number.isFinite(frameCount) || !Number.isSafeInteger(frameCount) || frameCount < 1) {
    violations.push({
      code: 'frame-count-unsafe',
      path: `${rigPath}.frameCount`,
      message: `リグ「${rig.name}」の生成Frame数は1以上の安全な整数である必要があります。`,
      value: frameCount,
    });
  }

  const timeIndexes = new Map<number, number[]>();
  for (const [keyframeIndex, keyframe] of rig.keyframes.entries()) {
    const keyframePath = `${rigPath}.keyframes[${keyframeIndex}]`;
    if (
      inspectFiniteNumber(
        violations,
        keyframe.time,
        `${keyframePath}.time`,
        `リグ「${rig.name}」のキーフレーム時刻`,
      )
    ) {
      if (keyframe.time < 0 || keyframe.time > 1) {
        violations.push({
          code: 'rig-keyframe-time-out-of-range',
          path: `${keyframePath}.time`,
          message: `リグ「${rig.name}」のキーフレーム時刻は0から1の範囲である必要があります。`,
          value: keyframe.time,
        });
      }
      const indexes = timeIndexes.get(keyframe.time) ?? [];
      indexes.push(keyframeIndex);
      timeIndexes.set(keyframe.time, indexes);
    }

    for (const [partId, pose] of Object.entries(keyframe.poses)) {
      inspectReference(
        violations,
        partIds,
        partId,
        `${keyframePath}.poses.${partId}`,
        `リグ「${rig.name}」のポーズ参照`,
      );
      inspectPose(
        violations,
        pose,
        `${keyframePath}.poses.${partId}`,
        `リグ「${rig.name}」のポーズ`,
      );
    }
  }

  for (const [time, indexes] of [...timeIndexes.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    if (indexes.length <= 1) {
      continue;
    }
    violations.push({
      code: 'rig-keyframe-time-duplicate',
      path: `${rigPath}.keyframes[time=${time}]`,
      message: `リグ「${rig.name}」で同じキーフレーム時刻「${time}」が重複しています。`,
      ids: indexes.map(String),
    });
  }
}

/**
 * UI検査、独立rig反転copy、bakeが共有する読み取り専用の構造preflight。
 * B2で決める生成量の上限・warning・hard capは扱わない。
 */
function inspectRigPreflightInternal(
  asset: Asset,
  options: InspectRigPreflightInternalOptions,
): RigPreflightViolation[] {
  const violations: RigPreflightViolation[] = [];
  const frames = asset.frames ?? [];
  const rigAnimations = options.rig ? [options.rig] : (asset.rigAnimations ?? []);
  const events: AnimationEvent[] = asset.animations.flatMap((animation) => animation.events ?? []);

  inspectDuplicateIds(violations, 'textures', 'テクスチャ', asset.textures);
  inspectDuplicateIds(violations, 'layers', 'レイヤー', asset.layers);
  inspectDuplicateIds(violations, 'parts', 'パーツ', asset.parts);
  inspectDuplicateIds(violations, 'anchors', 'アンカー', asset.anchors);
  inspectDuplicateIds(violations, 'colliders', '当たり判定', asset.colliders);
  inspectDuplicateIds(violations, 'frames', 'フレーム', frames);
  inspectDuplicateIds(violations, 'animations', 'アニメーション', asset.animations);
  inspectDuplicateIds(violations, 'rigAnimations', 'リグアニメーション', rigAnimations);
  inspectDuplicateIds(violations, 'animationEvents', 'アニメーションイベント', events);

  inspectPositiveNumber(violations, asset.canvasSize.width, 'canvasSize.width', 'キャンバス幅');
  inspectPositiveNumber(violations, asset.canvasSize.height, 'canvasSize.height', 'キャンバス高さ');
  inspectVec2(violations, asset.origin, 'origin', '原点');

  const textureIds = new Set(asset.textures.map((texture) => texture.id));
  const layerIds = new Set(asset.layers.map((layer) => layer.id));
  const partIds = new Set(asset.parts.map((part) => part.id));
  const frameIds = new Set(frames.map((frame) => frame.id));

  for (const texture of asset.textures) {
    inspectPositiveNumber(
      violations,
      texture.size.width,
      `textures[id=${texture.id}].size.width`,
      `テクスチャ「${texture.name}」の幅`,
    );
    inspectPositiveNumber(
      violations,
      texture.size.height,
      `textures[id=${texture.id}].size.height`,
      `テクスチャ「${texture.name}」の高さ`,
    );
  }

  for (const layer of asset.layers) {
    const layerPath = `layers[id=${layer.id}]`;
    inspectTransform(
      violations,
      layer.transform,
      `${layerPath}.transform`,
      `レイヤー「${layer.name}」`,
    );
    inspectOpacity(
      violations,
      layer.opacity,
      `${layerPath}.opacity`,
      `レイヤー「${layer.name}」の不透明度`,
    );
    if (layer.textureId) {
      inspectReference(
        violations,
        textureIds,
        layer.textureId,
        `${layerPath}.textureId`,
        `レイヤー「${layer.name}」の画像参照`,
      );
    }
    if (layer.background) {
      inspectVec2(
        violations,
        layer.background.parallaxSpeed,
        `${layerPath}.background.parallaxSpeed`,
        `レイヤー「${layer.name}」の視差速度`,
      );
    }
  }

  for (const [index, record] of (asset.provenance ?? []).entries()) {
    if (typeof record.textureId === 'string') {
      inspectReference(
        violations,
        textureIds,
        record.textureId,
        `provenance[${index}].textureId`,
        '取り込み元の画像参照',
      );
    }
  }

  for (const part of asset.parts) {
    const partPath = `parts[id=${part.id}]`;
    if (part.pivot) {
      inspectVec2(violations, part.pivot, `${partPath}.pivot`, `パーツ「${part.name}」のpivot`);
    }
    if (part.parentId) {
      inspectReference(
        violations,
        partIds,
        part.parentId,
        `${partPath}.parentId`,
        `パーツ「${part.name}」の親参照`,
      );
    }
    if (part.bindPose) {
      inspectPose(
        violations,
        part.bindPose,
        `${partPath}.bindPose`,
        `パーツ「${part.name}」のbind pose`,
      );
    }
    if (part.rotationLimit) {
      const limitPath = `${partPath}.rotationLimit`;
      const minFinite = inspectFiniteNumber(
        violations,
        part.rotationLimit.min,
        `${limitPath}.min`,
        `パーツ「${part.name}」の回転下限`,
      );
      const maxFinite = inspectFiniteNumber(
        violations,
        part.rotationLimit.max,
        `${limitPath}.max`,
        `パーツ「${part.name}」の回転上限`,
      );
      if (minFinite && maxFinite && part.rotationLimit.min > part.rotationLimit.max) {
        violations.push({
          code: 'rotation-limit-order',
          path: limitPath,
          message: `パーツ「${part.name}」の回転下限は上限以下である必要があります。`,
        });
      }
    }
  }

  for (const violation of inspectPartLayerConstraints(asset)) {
    if (violation.code === 'empty' && options.allowPartLayerEmpty) {
      continue;
    }
    violations.push({
      code: `part-layer-${violation.code}`,
      path:
        violation.code === 'shared'
          ? `layers[id=${violation.layerIds[0]}].partOwnership`
          : `parts[id=${violation.partIds[0]}].layerIds`,
      message: `PartとLayerの対応が正しくありません（${violation.code}）。`,
      ids: [...violation.partIds, ...violation.layerIds],
    });
  }
  inspectPartCycles(asset, violations);

  for (const frame of frames) {
    const framePath = `frames[id=${frame.id}]`;
    if (frame.durationMs !== undefined) {
      inspectPositiveNumber(
        violations,
        frame.durationMs,
        `${framePath}.durationMs`,
        `フレーム「${frame.name}」の表示時間`,
      );
    }
    for (const layerId of duplicateValues(frame.layerStates.map((state) => state.layerId))) {
      violations.push({
        code: 'frame-layer-state-duplicate',
        path: `${framePath}.layerStates[layerId=${layerId}]`,
        message: `フレーム「${frame.name}」で同じレイヤー状態「${layerId}」が重複しています。`,
        ids: [layerId],
      });
    }
    for (const [stateIndex, state] of frame.layerStates.entries()) {
      const statePath = `${framePath}.layerStates[${stateIndex}]`;
      inspectReference(
        violations,
        layerIds,
        state.layerId,
        `${statePath}.layerId`,
        `フレーム「${frame.name}」のレイヤー参照`,
      );
      if (state.transform) {
        inspectTransform(
          violations,
          state.transform,
          `${statePath}.transform`,
          `フレーム「${frame.name}」のレイヤー状態`,
        );
      }
      if (state.opacity !== undefined) {
        inspectOpacity(
          violations,
          state.opacity,
          `${statePath}.opacity`,
          `フレーム「${frame.name}」の不透明度`,
        );
      }
    }
  }

  for (const animation of asset.animations) {
    const animationPath = `animations[id=${animation.id}]`;
    inspectPositiveNumber(
      violations,
      animation.fps,
      `${animationPath}.fps`,
      `アニメーション「${animation.name}」のFPS`,
    );
    if (animation.durationMs !== undefined) {
      inspectPositiveNumber(
        violations,
        animation.durationMs,
        `${animationPath}.durationMs`,
        `アニメーション「${animation.name}」の再生時間`,
      );
    }
    for (const [frameIndex, frameId] of animation.frameIds.entries()) {
      inspectReference(
        violations,
        frameIds,
        frameId,
        `${animationPath}.frameIds[${frameIndex}]`,
        `アニメーション「${animation.name}」のフレーム参照`,
      );
    }
    for (const [eventIndex, event] of (animation.events ?? []).entries()) {
      inspectReference(
        violations,
        frameIds,
        event.frameId,
        `${animationPath}.events[${eventIndex}].frameId`,
        `イベント「${event.name}」のフレーム参照`,
      );
    }
  }

  for (const [rigIndex, rig] of rigAnimations.entries()) {
    const rigPath = options.rig ? `rigAnimation[id=${rig.id}]` : `rigAnimations[${rigIndex}]`;
    inspectRigAnimation(rig, rigPath, partIds, violations);
  }

  for (const [index, anchor] of asset.anchors.entries()) {
    inspectVec2(
      violations,
      anchor.position,
      `anchors[${index}].position`,
      `アンカー「${anchor.name}」`,
    );
  }
  for (const [index, collider] of asset.colliders.entries()) {
    if (collider.shape === 'rect') {
      inspectFiniteNumber(
        violations,
        collider.rect.x,
        `colliders[${index}].rect.x`,
        `当たり判定「${collider.name}」のx`,
      );
      inspectFiniteNumber(
        violations,
        collider.rect.y,
        `colliders[${index}].rect.y`,
        `当たり判定「${collider.name}」のy`,
      );
      inspectFiniteNumber(
        violations,
        collider.rect.width,
        `colliders[${index}].rect.width`,
        `当たり判定「${collider.name}」の幅`,
      );
      inspectFiniteNumber(
        violations,
        collider.rect.height,
        `colliders[${index}].rect.height`,
        `当たり判定「${collider.name}」の高さ`,
      );
    } else {
      inspectFiniteNumber(
        violations,
        collider.circle.x,
        `colliders[${index}].circle.x`,
        `当たり判定「${collider.name}」のx`,
      );
      inspectFiniteNumber(
        violations,
        collider.circle.y,
        `colliders[${index}].circle.y`,
        `当たり判定「${collider.name}」のy`,
      );
      inspectFiniteNumber(
        violations,
        collider.circle.radius,
        `colliders[${index}].circle.radius`,
        `当たり判定「${collider.name}」の半径`,
      );
    }
  }

  return violations;
}

export function inspectRigPreflight(
  asset: Asset,
  options: InspectRigPreflightOptions = {},
): RigPreflightViolation[] {
  return inspectRigPreflightInternal(asset, options);
}

function throwRigPreflightViolations(violations: RigPreflightViolation[]): void {
  if (violations.length > 0) {
    throw new RigPreflightError(violations);
  }
}

export function assertRigPreflight(asset: Asset, options: InspectRigPreflightOptions = {}): void {
  throwRigPreflightViolations(inspectRigPreflightInternal(asset, options));
}

/**
 * linked Familyのrefresh preview専用。
 * baseからLayerを削除した直後に生じる空Partだけを一時的に許可し、write-set同期を可能にする。
 * 初回linked作成、独立copy、素材検査、bakeからは呼ばない。
 *
 * @internal
 */
export function assertRigPreflightForLinkedRefresh(asset: Asset): void {
  throwRigPreflightViolations(
    inspectRigPreflightInternal(asset, {
      allowPartLayerEmpty: true,
    }),
  );
}
