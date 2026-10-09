import { validateProject, type Project3D, type Clip3D } from '../model/project';
import type { RigPoseUpdate } from '../ports/rigPosePort';
import { prepareTransformPose } from '../rig/pose';

type Track = Clip3D['tracks'][number];
/** Seconds, closed endpoints for scrub; looping is explicitly chosen by playback. */
export function clipTime(time: number, duration: number, loop: boolean): number {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration < 0)
    throw new Error('Invalid animation time');
  if (duration === 0) return 0;
  if (!loop) return Math.max(0, Math.min(time, duration));
  const remainder = time % duration;
  return remainder < 0 ? remainder + duration : remainder;
}
function quaternion(a: number[], b: number[], amount: number): number[] {
  const norm = (v: number[]) => {
    const length = Math.hypot(...v);
    if (!length) throw new Error('Invalid quaternion');
    return v.map((x) => x / length);
  };
  const left = norm(a),
    right = norm(b);
  let dot = left.reduce((sum, value, axis) => sum + value * right[axis], 0);
  if (dot < 0) {
    dot = -dot;
    right.forEach((value, axis) => {
      right[axis] = -value;
    });
  }
  dot = Math.max(-1, Math.min(1, dot));
  if (dot > 0.9995) return norm(left.map((value, axis) => value + amount * (right[axis] - value)));
  const angle = Math.acos(dot),
    sine = Math.sin(angle);
  const x = Math.sin((1 - amount) * angle) / sine,
    y = Math.sin(amount * angle) / sine;
  return norm(left.map((value, axis) => x * value + y * right[axis]));
}
function sample(track: Track, time: number): number[] | null {
  if (!track.keys.length) return null;
  const first = track.keys[0],
    last = track.keys.at(-1)!;
  if (time <= first.time) return [...first.value];
  if (time >= last.time) return [...last.value];
  const index = track.keys.findIndex((key) => key.time > time);
  const a = track.keys[index - 1],
    b = track.keys[index];
  if (track.interpolation === 'STEP') return [...a.value];
  const amount = (time - a.time) / (b.time - a.time);
  return track.property === 'rotation'
    ? quaternion(a.value, b.value, amount)
    : a.value.map((value, axis) => value * (1 - amount) + b.value[axis] * amount);
}
/** Always derive each clip from canonical rest, never the previous clip's evaluated values. */
export function evaluateClip(project: Project3D, clipId: string, time: number): RigPoseUpdate[] {
  return prepareClipEvaluation(project)(clipId, time);
}
export function prepareClipEvaluation(
  source: Project3D,
): (clipId: string, time: number) => RigPoseUpdate[] {
  validateProject(source);
  const project = structuredClone(source);
  const check = prepareTransformPose(project);
  return (clipId, time) => {
    const clip = project.clips.find((value) => value.id === clipId);
    if (!clip) throw new Error('Clip does not exist');
    if (!Number.isFinite(time) || time < 0 || time > clip.duration)
      throw new Error('Time lies outside the clip');
    const transforms = new Map<string, RigPoseUpdate>();
    for (const track of clip.tracks) {
      const value = sample(track, time);
      if (value === null) continue;
      let update = transforms.get(track.nodeId);
      if (!update) {
        update = {
          nodeId: track.nodeId,
          transform: structuredClone(
            project.nodes.find((node) => node.id === track.nodeId)!.transform,
          ),
        };
        transforms.set(track.nodeId, update);
      }
      if (track.property === 'rotation')
        update.transform.rotation = value as [number, number, number, number];
      else update.transform[track.property] = value as [number, number, number];
    }
    const updates = [...transforms.values()];
    check(updates);
    return updates;
  };
}
