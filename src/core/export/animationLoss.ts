import type { Asset } from '../model';

export type FixedFpsAnimationLossKind = 'frame-duration' | 'animation-events';

export interface FixedFpsAnimationLoss {
  kind: FixedFpsAnimationLossKind;
  animationId: string;
  animationName: string;
  frameIds: string[];
  frameNames: string[];
  eventIds: string[];
  eventNames: string[];
}

/** 現行の固定fps派生物では保持できない時間・イベントを、Animationごとに列挙する。 */
export function findFixedFpsAnimationLosses(asset: Asset): FixedFpsAnimationLoss[] {
  const frameById = new Map((asset.frames ?? []).map((frame) => [frame.id, frame]));
  const losses: FixedFpsAnimationLoss[] = [];

  for (const animation of asset.animations) {
    const durationFrames = [
      ...new Set(
        animation.frameIds.filter((frameId) => frameById.get(frameId)?.durationMs !== undefined),
      ),
    ];
    if (durationFrames.length > 0) {
      losses.push({
        kind: 'frame-duration',
        animationId: animation.id,
        animationName: animation.name,
        frameIds: durationFrames,
        frameNames: durationFrames.map((id) => frameById.get(id)?.name ?? id),
        eventIds: [],
        eventNames: [],
      });
    }

    const events = animation.events ?? [];
    if (events.length > 0) {
      losses.push({
        kind: 'animation-events',
        animationId: animation.id,
        animationName: animation.name,
        frameIds: [],
        frameNames: [],
        eventIds: events.map((event) => event.id),
        eventNames: events.map((event) => event.name),
      });
    }
  }

  return losses;
}

export function formatFixedFpsAnimationLosses(losses: readonly FixedFpsAnimationLoss[]): string {
  const details = losses.map((loss) =>
    loss.kind === 'frame-duration'
      ? `アニメーション「${loss.animationName}」のフレーム「${loss.frameNames.join('、')}」に個別表示時間があります`
      : `アニメーション「${loss.animationName}」にイベント「${loss.eventNames.join('、')}」があります`,
  );
  return `固定fpsの書き出しを中止しました。${details.join('。')}。時間またはイベントが失われるためです。PNG / WebP / asset.json / .casproj は引き続き書き出せます。`;
}

export class FixedFpsAnimationLossError extends Error {
  readonly losses: readonly FixedFpsAnimationLoss[];

  constructor(losses: readonly FixedFpsAnimationLoss[]) {
    super(formatFixedFpsAnimationLosses(losses));
    this.name = 'FixedFpsAnimationLossError';
    this.losses = losses;
  }
}

/** Atlas 0.1.0など固定fpsの派生物を、情報を落とさず事前拒否する。 */
export function assertFixedFpsAnimationExportSafe(asset: Asset): void {
  const losses = findFixedFpsAnimationLosses(asset);
  if (losses.length > 0) {
    throw new FixedFpsAnimationLossError(losses);
  }
}
