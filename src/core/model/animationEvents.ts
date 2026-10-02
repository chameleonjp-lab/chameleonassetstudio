import type { AnimationEvent, AnimationEventPayload } from './animation';
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

/** Editing limit only; imported payloads remain preserved without truncation. */
export const EVENT_PAYLOAD_EDIT_MAX_BYTES = 16 * 1024;

export function parseAnimationEventPayload(
  text: string,
): { ok: true; payload: AnimationEventPayload } | { ok: false; reason: string } {
  if (
    text.length > EVENT_PAYLOAD_EDIT_MAX_BYTES ||
    new TextEncoder().encode(text).length > EVENT_PAYLOAD_EDIT_MAX_BYTES
  ) {
    return {
      ok: false,
      reason: '追加データはUTF-8で16 KiB以内にしてください。既存データは変更していません。',
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: '正しいJSONを入力してください。文字列は二重引用符で囲みます。' };
  }
  const primitive = (item: unknown) =>
    item === null ||
    typeof item === 'string' ||
    typeof item === 'boolean' ||
    (typeof item === 'number' && Number.isFinite(item));
  if (!(
    primitive(value) ||
    (typeof value === 'object' && value !== null && Object.values(value).every(primitive))
  )) {
    return {
      ok: false,
      reason:
        '文字列・有限の数値・真偽値・null、またはそれらだけを含む配列・オブジェクトを入力してください。入れ子は使えません。',
    };
  }
  return { ok: true, payload: value as AnimationEventPayload };
}

function samePayload(
  left: AnimationEventPayload | undefined,
  right: AnimationEventPayload | undefined,
): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftEntries = Object.entries(left),
    rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(
      ([key, value]) =>
        Object.hasOwn(right, key) && value === (right as Record<string, unknown>)[key],
    )
  );
}

/** null removes the optional field; JSON text "null" stores an explicit null value. */
export function changeAnimationEventPayload(
  asset: Asset,
  animationId: string,
  eventId: string,
  text: string | null,
): AnimationEventChangeResult {
  const targets = asset.animations.filter((animation) => animation.id === animationId);
  if (
    targets.length !== 1 ||
    targets[0].events?.filter((event) => event.id === eventId).length !== 1
  ) {
    return { ok: false, asset, reason: '編集対象のイベントを一意に確認できません。' };
  }
  const parsed = text === null ? null : parseAnimationEventPayload(text);
  if (parsed && !parsed.ok) return { ok: false, asset, reason: parsed.reason };
  const payload = parsed?.payload;
  return updateEvents(asset, animationId, (events) => {
    const target = events.find((event) => event.id === eventId)!;
    if (samePayload(target.payload, payload)) return events;
    return events.map((event) => {
      if (event !== target) return event;
      const next = { ...event };
      if (text === null) delete next.payload;
      else next.payload = payload;
      return next;
    });
  });
}
