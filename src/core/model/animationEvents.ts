import type { AnimationEvent } from './animation';
import type { Asset } from './asset';
import { generateId } from './factories';

export type AnimationEventChangeResult =
  { ok: true; asset: Asset; changed: boolean } | { ok: false; asset: Asset; reason: string };

function validFrameIds(asset: Asset, animationId: string): string[] {
  const animation = asset.animations.find((candidate) => candidate.id === animationId);
  if (!animation) return [];
  const existing = new Set((asset.frames ?? []).map((frame) => frame.id));
  return animation.frameIds.filter(
    (frameId, index, frameIds) => existing.has(frameId) && frameIds.indexOf(frameId) === index,
  );
}

export function animationEventFrameCandidates(asset: Asset, animationId: string): string[] {
  return validFrameIds(asset, animationId);
}

function updateEvents(
  asset: Asset,
  animationId: string,
  update: (events: AnimationEvent[]) => AnimationEvent[] | null,
): AnimationEventChangeResult {
  const animation = asset.animations.find((candidate) => candidate.id === animationId);
  if (!animation) return { ok: false, asset, reason: 'アニメーションが見つかりません。' };
  const events = update(animation.events ?? []);
  if (!events) return { ok: false, asset, reason: 'イベントが見つかりません。' };
  if (events === animation.events || (animation.events === undefined && events.length === 0)) {
    return { ok: true, asset, changed: false };
  }
  return {
    ok: true,
    changed: true,
    asset: {
      ...asset,
      animations: asset.animations.map((candidate) =>
        candidate.id === animationId ? { ...candidate, events } : candidate,
      ),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function addAnimationEvent(
  asset: Asset,
  animationId: string,
  name: string,
  frameId: string,
): AnimationEventChangeResult {
  if (!name.trim()) return { ok: false, asset, reason: 'イベント名を入力してください。' };
  if (!validFrameIds(asset, animationId).includes(frameId)) {
    return { ok: false, asset, reason: '選択中アニメーションの有効なフレームを選んでください。' };
  }
  const usedIds = new Set(
    asset.animations.flatMap((animation) => (animation.events ?? []).map((event) => event.id)),
  );
  let id = generateId('event');
  while (usedIds.has(id)) id = generateId('event');
  return updateEvents(asset, animationId, (events) => [...events, { id, name, frameId }]);
}

export function renameAnimationEvent(
  asset: Asset,
  animationId: string,
  eventId: string,
  name: string,
): AnimationEventChangeResult {
  if (!name.trim()) return { ok: false, asset, reason: 'イベント名を入力してください。' };
  return updateEvents(asset, animationId, (events) => {
    const target = events.find((event) => event.id === eventId);
    if (!target) return null;
    if (target.name === name) return events;
    return events.map((event) => (event.id === eventId ? { ...event, name } : event));
  });
}

export function changeAnimationEventFrame(
  asset: Asset,
  animationId: string,
  eventId: string,
  frameId: string,
): AnimationEventChangeResult {
  if (!validFrameIds(asset, animationId).includes(frameId)) {
    return { ok: false, asset, reason: '選択中アニメーションの有効なフレームを選んでください。' };
  }
  return updateEvents(asset, animationId, (events) => {
    const target = events.find((event) => event.id === eventId);
    if (!target) return null;
    if (target.frameId === frameId) return events;
    return events.map((event) => (event.id === eventId ? { ...event, frameId } : event));
  });
}

export function removeAnimationEvent(
  asset: Asset,
  animationId: string,
  eventId: string,
): AnimationEventChangeResult {
  return updateEvents(asset, animationId, (events) => {
    if (!events.some((event) => event.id === eventId)) return null;
    return events.filter((event) => event.id !== eventId);
  });
}
