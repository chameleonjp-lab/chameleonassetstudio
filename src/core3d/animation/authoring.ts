import { cloneProject, validateProject, type Project3D, type Clip3D } from '../model/project';
import { assertLocksPreserved } from '../model/editability';

export type AnimationProperty = Clip3D['tracks'][number]['property'];
export type AnimationInterpolation = Clip3D['tracks'][number]['interpolation'];
const clip = (project: Project3D, id: string) => {
  const value = project.clips.find((item) => item.id === id);
  if (!value) throw new Error('Clip does not exist');
  return value;
};
function atomic(project: Project3D, operation: (candidate: Project3D) => void) {
  validateProject(project);
  const candidate = cloneProject(project);
  operation(candidate);
  validateProject(candidate);
  assertLocksPreserved(project, candidate);
  project.clips = candidate.clips;
}
function name(value: string) {
  if (!value.trim() || value.length > 4096) throw new Error('Clip name must be nonempty');
  return value;
}
export function createClip(
  project: Project3D,
  id: string,
  title: string,
  duration = 1,
  loop = false,
) {
  atomic(project, (p) => p.clips.push({ id, name: name(title), duration, loop, tracks: [] }));
}
export function duplicateClip(project: Project3D, sourceId: string, id: string, title: string) {
  atomic(project, (p) =>
    p.clips.push({ ...structuredClone(clip(p, sourceId)), id, name: name(title) }),
  );
}
export function updateClip(
  project: Project3D,
  id: string,
  value: { name: string; duration: number; loop: boolean },
) {
  atomic(project, (p) => Object.assign(clip(p, id), { ...value, name: name(value.name) }));
}
export function deleteClip(project: Project3D, id: string) {
  atomic(project, (p) => {
    clip(p, id);
    p.clips = p.clips.filter((item) => item.id !== id);
  });
}
export function addKey(
  project: Project3D,
  id: string,
  nodeId: string,
  property: AnimationProperty,
  interpolation: AnimationInterpolation,
  time: number,
  value: number[],
) {
  atomic(project, (p) => {
    const current = clip(p, id);
    let track = current.tracks.find((item) => item.nodeId === nodeId && item.property === property);
    if (!track) {
      track = { nodeId, property, interpolation, keys: [] };
      current.tracks.push(track);
    } else if (track.interpolation !== interpolation) {
      throw new Error('Change track interpolation explicitly before adding a key');
    }
    track.keys.push({ time, value: [...value] });
    track.keys.sort((a, b) => a.time - b.time);
  });
}
export function editKey(
  project: Project3D,
  id: string,
  nodeId: string,
  property: AnimationProperty,
  previousTime: number,
  time: number,
  value: number[],
) {
  atomic(project, (p) => {
    const track = clip(p, id).tracks.find(
      (item) => item.nodeId === nodeId && item.property === property,
    );
    const key = track?.keys.find((item) => item.time === previousTime);
    if (!track || !key) throw new Error('Key does not exist');
    key.time = time;
    key.value = [...value];
    track.keys.sort((a, b) => a.time - b.time);
  });
}
export function duplicateKey(
  project: Project3D,
  id: string,
  nodeId: string,
  property: AnimationProperty,
  previousTime: number,
  time: number,
) {
  const track = clip(project, id).tracks.find(
    (item) => item.nodeId === nodeId && item.property === property,
  );
  const key = track?.keys.find((item) => item.time === previousTime);
  if (!track || !key) throw new Error('Key does not exist');
  addKey(project, id, nodeId, property, track.interpolation, time, key.value);
}
export function deleteKey(
  project: Project3D,
  id: string,
  nodeId: string,
  property: AnimationProperty,
  time: number,
) {
  atomic(project, (p) => {
    const track = clip(p, id).tracks.find(
      (item) => item.nodeId === nodeId && item.property === property,
    );
    if (!track?.keys.some((item) => item.time === time)) throw new Error('Key does not exist');
    track.keys = track.keys.filter((item) => item.time !== time);
  });
}
export function setTrackInterpolation(
  project: Project3D,
  id: string,
  nodeId: string,
  property: AnimationProperty,
  interpolation: AnimationInterpolation,
) {
  atomic(project, (p) => {
    const track = clip(p, id).tracks.find(
      (item) => item.nodeId === nodeId && item.property === property,
    );
    if (!track) throw new Error('Track does not exist');
    track.interpolation = interpolation;
  });
}
