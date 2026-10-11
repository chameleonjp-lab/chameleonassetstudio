/** OS preference only; never persisted into a project or used to change its animation data. */
export type NativeMotionPreference = 'reduce' | 'no-preference' | 'unavailable';
export type MotionWindow = Pick<Window, 'matchMedia'>;
export function watchNativeMotionPreference(
  target: MotionWindow | undefined,
  onChange: (preference: NativeMotionPreference) => void,
): () => void {
  if (!target || typeof target.matchMedia !== 'function') {
    onChange('unavailable');
    return () => {};
  }
  let query: MediaQueryList;
  try {
    query = target.matchMedia('(prefers-reduced-motion: reduce)');
  } catch {
    onChange('unavailable');
    return () => {};
  }
  let active = true;
  const notify = () => {
    if (active) onChange(query.matches ? 'reduce' : 'no-preference');
  };
  const listener = () => notify();
  let detach: (() => void) | undefined;
  try {
    if (
      typeof query.addEventListener === 'function' &&
      typeof query.removeEventListener === 'function'
    ) {
      detach = () => query.removeEventListener('change', listener);
      query.addEventListener('change', listener);
    } else if (
      typeof query.addListener === 'function' &&
      typeof query.removeListener === 'function'
    ) {
      detach = () => query.removeListener(listener);
      query.addListener(listener);
    }
  } catch {
    active = false;
    try {
      detach?.();
    } catch {
      /* The inactive callback cannot affect a later owner. */
    }
    onChange('unavailable');
    return () => {};
  }
  if (!detach) {
    active = false;
    onChange('unavailable');
    return () => {};
  }
  notify();
  return () => {
    active = false;
    try {
      detach();
    } catch {
      /* The inactive callback cannot affect a later owner. */
    }
  };
}
