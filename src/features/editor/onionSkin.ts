import type { Animation } from '../../core/model';

export const ONION_SKIN_PREVIOUS_COLOR = '#d1434f';
export const ONION_SKIN_NEXT_COLOR = '#2563eb';
export const ONION_SKIN_OPACITY = 0.25;

export interface OnionSkinOccurrence {
  frameId: string;
  occurrenceIndex: number;
}

export interface OnionSkinOccurrences {
  previous: OnionSkinOccurrence | null;
  next: OnionSkinOccurrence | null;
}

function emptyOccurrences(): OnionSkinOccurrences {
  return { previous: null, next: null };
}

/**
 * 選択中Animationの出現順から、現在位置の前後1件を返す。
 * Frame IDが同じでもoccurrenceIndexを保持し、参照切れはghostへ使わない。
 */
export function resolveOnionSkinOccurrences(
  animation: Animation,
  currentOccurrenceIndex: number | null,
  availableFrameIds: ReadonlySet<string>,
): OnionSkinOccurrences {
  const count = animation.frameIds.length;
  if (
    currentOccurrenceIndex === null ||
    !Number.isInteger(currentOccurrenceIndex) ||
    currentOccurrenceIndex < 0 ||
    currentOccurrenceIndex >= count ||
    count < 2
  ) {
    return emptyOccurrences();
  }

  const currentFrameId = animation.frameIds[currentOccurrenceIndex];
  if (!availableFrameIds.has(currentFrameId)) {
    return emptyOccurrences();
  }

  const occurrenceAt = (index: number | null): OnionSkinOccurrence | null => {
    if (index === null) {
      return null;
    }
    const frameId = animation.frameIds[index];
    return availableFrameIds.has(frameId) ? { frameId, occurrenceIndex: index } : null;
  };

  const previousIndex =
    currentOccurrenceIndex > 0 ? currentOccurrenceIndex - 1 : animation.loop ? count - 1 : null;
  const nextIndex =
    currentOccurrenceIndex + 1 < count ? currentOccurrenceIndex + 1 : animation.loop ? 0 : null;

  return {
    previous: occurrenceAt(previousIndex),
    next: occurrenceAt(nextIndex),
  };
}
