import { expect, it, vi } from 'vitest';
import { watchNativeMotionPreference, type MotionWindow } from './motionPreference';
it('reports unavailable without inventing an OS preference', () => {
  for (const target of [
    undefined,
    {
      matchMedia: () => {
        throw new Error('Unsupported');
      },
    } as MotionWindow,
  ]) {
    const update = vi.fn(),
      release = watchNativeMotionPreference(target, update);
    expect(update).toHaveBeenCalledExactlyOnceWith('unavailable');
    release();
  }
});
it('observes initial/repeated reduced motion changes and drops delayed callbacks after disposal', () => {
  let listener: (() => void) | undefined;
  const query = {
    matches: false,
    addEventListener: vi.fn((_name, callback) => {
      listener = callback;
    }),
    removeEventListener: vi.fn(),
  };
  const target = { matchMedia: vi.fn(() => query) } as unknown as MotionWindow;
  const update = vi.fn(),
    release = watchNativeMotionPreference(target, update);
  expect(target.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  expect(update).toHaveBeenLastCalledWith('no-preference');
  query.matches = true;
  listener!();
  expect(update).toHaveBeenLastCalledWith('reduce');
  query.matches = false;
  listener!();
  expect(update).toHaveBeenLastCalledWith('no-preference');
  release();
  const count = update.mock.calls.length;
  listener!();
  expect(update).toHaveBeenCalledTimes(count);
  expect(query.removeEventListener).toHaveBeenCalledWith('change', listener);
});
it('supports the older listener contract and safely releases it', () => {
  const query = { matches: true, addListener: vi.fn(), removeListener: vi.fn() };
  const update = vi.fn(),
    release = watchNativeMotionPreference(
      { matchMedia: () => query } as unknown as MotionWindow,
      update,
    );
  expect(update).toHaveBeenLastCalledWith('reduce');
  release();
  expect(query.removeListener).toHaveBeenCalledWith(query.addListener.mock.calls[0][0]);
});
it('does not promise live preference adoption when change events are unavailable', () => {
  const update = vi.fn();
  watchNativeMotionPreference(
    { matchMedia: () => ({ matches: true }) } as unknown as MotionWindow,
    update,
  )();
  expect(update).toHaveBeenCalledExactlyOnceWith('unavailable');
});

it('handles observer registration failure without leaving an active callback', () => {
  let delayed: (() => void) | undefined;
  const query = {
    matches: true,
    addEventListener: vi.fn((_name, listener) => {
      delayed = listener;
      throw new Error('Not available');
    }),
    removeEventListener: vi.fn(),
  };
  const update = vi.fn();
  watchNativeMotionPreference({ matchMedia: () => query } as unknown as MotionWindow, update)();
  expect(update).toHaveBeenCalledExactlyOnceWith('unavailable');
  delayed!();
  expect(update).toHaveBeenCalledTimes(1);
});
