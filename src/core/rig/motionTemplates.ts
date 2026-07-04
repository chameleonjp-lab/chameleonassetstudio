/**
 * モーションテンプレート（Phase 15）。パーツ種別（partType）を手がかりに、
 * よく使う動き（idle・歩行・ジャンプなど）の RigAnimation をあらかじめ組み立てる純関数群。
 * ブラウザ API に依存しない。
 */
import {
  generateId,
  type Asset,
  type PartPose,
  type PartType,
  type RigAnimation,
  type RigKeyframe,
} from '../model';

export const MOTION_TEMPLATES = [
  'idle_sway',
  'walk_bounce',
  'jump_squash',
  'attack_swing',
  'damage_shake',
  'dead_collapse',
] as const;

export type MotionTemplateName = (typeof MOTION_TEMPLATES)[number];

interface PoseEntry {
  partId: string;
  time: number;
  pose: PartPose;
}

/** partType に一致する最初のパーツの id を返す。無ければ undefined。 */
function byType(asset: Asset, partType: PartType): string | undefined {
  return asset.parts.find((part) => part.partType === partType)?.id;
}

/** (partId, time, pose) の並びを time でグルーピングし、time 昇順の RigKeyframe[] にする。 */
function assembleKeyframes(entries: PoseEntry[]): RigKeyframe[] {
  const byTime = new Map<number, Record<string, PartPose>>();
  for (const entry of entries) {
    const poses = byTime.get(entry.time) ?? {};
    poses[entry.partId] = entry.pose;
    byTime.set(entry.time, poses);
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([time, poses]) => ({ time, poses }));
}

/** entries が空（対象パーツが 1 つも見つからなかった）なら null を返す。 */
function makeRig(
  name: MotionTemplateName,
  fps: number,
  loop: boolean,
  durationMs: number,
  entries: PoseEntry[],
): RigAnimation | null {
  if (entries.length === 0) {
    return null;
  }
  return {
    id: generateId('rig'),
    name,
    fps,
    loop,
    durationMs,
    keyframes: assembleKeyframes(entries),
  };
}

function buildIdleSway(asset: Asset): RigAnimation | null {
  const bodyId = byType(asset, 'body');
  const headId = byType(asset, 'head');
  const entries: PoseEntry[] = [];
  if (bodyId) {
    entries.push(
      { partId: bodyId, time: 0, pose: { localRotation: -3 } },
      { partId: bodyId, time: 0.5, pose: { localRotation: 3 } },
      { partId: bodyId, time: 1, pose: { localRotation: -3 } },
    );
  }
  if (headId) {
    entries.push(
      { partId: headId, time: 0, pose: { localRotation: 2 } },
      { partId: headId, time: 0.5, pose: { localRotation: -2 } },
      { partId: headId, time: 1, pose: { localRotation: 2 } },
    );
  }
  return makeRig('idle_sway', 8, true, 1600, entries);
}

function buildWalkBounce(asset: Asset): RigAnimation | null {
  const bodyId = byType(asset, 'body');
  const legLeftId = byType(asset, 'leg_left');
  const legRightId = byType(asset, 'leg_right');
  const entries: PoseEntry[] = [];

  if (bodyId) {
    const times = [0, 0.25, 0.5, 0.75, 1];
    const ys = [0, -4, 0, -4, 0];
    times.forEach((time, i) => {
      entries.push({ partId: bodyId, time, pose: { localPosition: { x: 0, y: ys[i] } } });
    });
  }
  if (legLeftId) {
    const times = [0, 0.5, 1];
    const rots = [20, -20, 20];
    times.forEach((time, i) => {
      entries.push({ partId: legLeftId, time, pose: { localRotation: rots[i] } });
    });
  }
  if (legRightId) {
    const times = [0, 0.5, 1];
    const rots = [-20, 20, -20];
    times.forEach((time, i) => {
      entries.push({ partId: legRightId, time, pose: { localRotation: rots[i] } });
    });
  }

  return makeRig('walk_bounce', 10, true, 800, entries);
}

function buildJumpSquash(asset: Asset): RigAnimation | null {
  const bodyId = byType(asset, 'body');
  if (!bodyId) {
    return null;
  }
  const times = [0, 0.3, 0.6, 1];
  const scales = [
    { x: 1, y: 1 },
    { x: 1.15, y: 0.85 },
    { x: 0.9, y: 1.1 },
    { x: 1, y: 1 },
  ];
  const entries: PoseEntry[] = times.map((time, i) => ({
    partId: bodyId,
    time,
    pose: { localScale: scales[i] },
  }));
  return makeRig('jump_squash', 12, false, 600, entries);
}

function buildAttackSwing(asset: Asset): RigAnimation | null {
  const partId = byType(asset, 'weapon') ?? byType(asset, 'arm_right');
  if (!partId) {
    return null;
  }
  const times = [0, 0.3, 0.6, 1];
  const rots = [0, -30, 90, 0];
  const entries: PoseEntry[] = times.map((time, i) => ({
    partId,
    time,
    pose: { localRotation: rots[i] },
  }));
  return makeRig('attack_swing', 12, false, 500, entries);
}

function buildDamageShake(asset: Asset): RigAnimation | null {
  const bodyId = byType(asset, 'body');
  if (!bodyId) {
    return null;
  }
  const times = [0, 0.25, 0.5, 0.75, 1];
  const xs = [0, -4, 4, -4, 0];
  const entries: PoseEntry[] = times.map((time, i) => ({
    partId: bodyId,
    time,
    pose: { localPosition: { x: xs[i], y: 0 } },
  }));
  return makeRig('damage_shake', 15, false, 400, entries);
}

function buildDeadCollapse(asset: Asset): RigAnimation | null {
  const bodyId = byType(asset, 'body');
  const headId = byType(asset, 'head');
  const entries: PoseEntry[] = [];
  if (bodyId) {
    entries.push(
      { partId: bodyId, time: 0, pose: { localRotation: 0, localPosition: { x: 0, y: 0 } } },
      { partId: bodyId, time: 1, pose: { localRotation: 90, localPosition: { x: 0, y: 8 } } },
    );
  }
  if (headId) {
    entries.push(
      { partId: headId, time: 0, pose: { localRotation: 0 } },
      { partId: headId, time: 1, pose: { localRotation: 40 } },
    );
  }
  return makeRig('dead_collapse', 8, false, 700, entries);
}

const TEMPLATE_BUILDERS: Record<MotionTemplateName, (asset: Asset) => RigAnimation | null> = {
  idle_sway: buildIdleSway,
  walk_bounce: buildWalkBounce,
  jump_squash: buildJumpSquash,
  attack_swing: buildAttackSwing,
  damage_shake: buildDamageShake,
  dead_collapse: buildDeadCollapse,
};

/**
 * asset のパーツ構成から template のキーフレームを組み立てる。
 * テンプレートが必要とするパーツ種別が asset に 1 つも見つからない場合は null を返す。
 */
export function buildMotionTemplate(
  asset: Asset,
  template: MotionTemplateName,
): RigAnimation | null {
  return TEMPLATE_BUILDERS[template](asset);
}
