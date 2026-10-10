import { describe, expect, it, vi } from 'vitest';
import { guardNativeCompositionKey, isNativeCompositionKey } from './keyboardSafety';

type CompositionEvent = Parameters<typeof isNativeCompositionKey>[0];

const compositionSignals = [
  { name: 'tracked composition', tracked: true, nativeEvent: {} },
  { name: 'native composition', tracked: false, nativeEvent: { isComposing: true } },
  {
    name: 'IME keyCode after compositionend',
    tracked: false,
    nativeEvent: { isComposing: false, keyCode: 229 },
  },
];

function keyEvent(
  key: string,
  nativeEvent: CompositionEvent = {},
  target: EventTarget | null = null,
) {
  return { key, nativeEvent, target, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

// Model the closest() contract without a DOM runtime or a global Element constructor.
function elementTarget(
  tagName: string,
  parent: { closest(selector: string): EventTarget | null } | null = null,
) {
  const target = Object.assign(new EventTarget(), {
    tagName,
    closest: vi.fn((selector: string): EventTarget | null => {
      if (selector !== 'button') return null;
      return tagName === 'BUTTON' ? target : (parent?.closest(selector) ?? null);
    }),
  });
  return target;
}

describe('isNativeCompositionKey', () => {
  it.each(compositionSignals)('recognizes $name independently', ({ tracked, nativeEvent }) => {
    expect(isNativeCompositionKey(nativeEvent, tracked)).toBe(true);
  });

  it.each([{}, { isComposing: false }, { keyCode: 13 }, { keyCode: 27 }, { keyCode: 0 }])(
    'does not invent composition for %j',
    (nativeEvent) => {
      expect(isNativeCompositionKey(nativeEvent, false)).toBe(false);
    },
  );
});

describe('guardNativeCompositionKey', () => {
  it.each(compositionSignals)(
    'isolates Enter and Escape for $name without cancelling text defaults',
    ({ tracked, nativeEvent }) => {
      for (const key of ['Enter', 'Escape']) {
        const event = keyEvent(key, nativeEvent, elementTarget('INPUT'));
        expect(guardNativeCompositionKey(event, tracked)).toBe(true);
        expect(event.stopPropagation).toHaveBeenCalledExactlyOnceWith();
        expect(event.preventDefault).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['BUTTON', 'SPAN', 'svg', 'path'])(
    'prevents Enter button activation from a %s target',
    (tagName) => {
      const button = elementTarget('BUTTON');
      const target = tagName === 'BUTTON' ? button : elementTarget(tagName, button);
      const event = keyEvent('Enter', { isComposing: true }, target);
      expect(guardNativeCompositionKey(event, false)).toBe(true);
      expect(target.closest).toHaveBeenCalledExactlyOnceWith('button');
      expect(event.stopPropagation).toHaveBeenCalledExactlyOnceWith();
      expect(event.preventDefault).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it('recognizes a nested SVG path inside a button', () => {
    const button = elementTarget('BUTTON');
    const svg = elementTarget('svg', button);
    const event = keyEvent('Enter', { keyCode: 229 }, elementTarget('path', svg));
    expect(guardNativeCompositionKey(event, false)).toBe(true);
    expect(event.stopPropagation).toHaveBeenCalledExactlyOnceWith();
    expect(event.preventDefault).toHaveBeenCalledExactlyOnceWith();
  });

  it.each(['INPUT', 'TEXTAREA', 'DIV', 'SUMMARY', 'A'])(
    'preserves composing Enter default behavior on %s outside the form guard',
    (tagName) => {
      const event = keyEvent('Enter', {}, elementTarget(tagName));
      expect(guardNativeCompositionKey(event, true)).toBe(true);
      expect(event.stopPropagation).toHaveBeenCalledExactlyOnceWith();
      expect(event.preventDefault).not.toHaveBeenCalled();
    },
  );

  it.each(compositionSignals)(
    'prevents implicit form submission for $name',
    ({ tracked, nativeEvent }) => {
      const event = keyEvent('Enter', nativeEvent, elementTarget('INPUT'));
      expect(guardNativeCompositionKey(event, tracked, true)).toBe(true);
      expect(event.stopPropagation).toHaveBeenCalledExactlyOnceWith();
      expect(event.preventDefault).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it.each([false, true])('keeps Escape candidate cancellation with implicitSubmit=%s', (submit) => {
    const button = elementTarget('BUTTON');
    const event = keyEvent('Escape', { isComposing: true, keyCode: 229 }, button);
    expect(guardNativeCompositionKey(event, true, submit)).toBe(true);
    expect(event.stopPropagation).toHaveBeenCalledExactlyOnceWith();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(button.closest).not.toHaveBeenCalled();
  });

  it.each(['Enter', 'Escape'])(
    'leaves ordinary %s untouched, including form and button defaults',
    (key) => {
      for (const implicitSubmit of [false, true]) {
        const button = elementTarget('BUTTON');
        const event = keyEvent(
          key,
          { isComposing: false, keyCode: key === 'Enter' ? 13 : 27 },
          button,
        );
        expect(guardNativeCompositionKey(event, false, implicitSubmit)).toBe(false);
        expect(event.stopPropagation).not.toHaveBeenCalled();
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(button.closest).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['a', 'Tab', 'ArrowDown', ' ', 'Process', 'Unidentified'])(
    'leaves %j untouched during composition',
    (key) => {
      const button = elementTarget('BUTTON');
      const event = keyEvent(key, { isComposing: true, keyCode: 229 }, button);
      expect(guardNativeCompositionKey(event, true, true)).toBe(false);
      expect(event.stopPropagation).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(button.closest).not.toHaveBeenCalled();
    },
  );

  it('uses the current tracked ref without retaining state after composition ends or focus resets', () => {
    const composing = { current: true };
    const composingEvent = keyEvent('Enter');
    expect(guardNativeCompositionKey(composingEvent, composing.current)).toBe(true);
    composing.current = false;
    const lastImeEvent = keyEvent('Enter', { isComposing: false, keyCode: 229 });
    expect(guardNativeCompositionKey(lastImeEvent, composing.current)).toBe(true);
    const ordinaryEvent = keyEvent('Enter', { isComposing: false, keyCode: 13 });
    expect(guardNativeCompositionKey(ordinaryEvent, composing.current)).toBe(false);
    expect(composing.current).toBe(false);
    for (const event of [composingEvent, lastImeEvent]) {
      expect(event.stopPropagation).toHaveBeenCalledExactlyOnceWith();
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(ordinaryEvent.stopPropagation).not.toHaveBeenCalled();
    expect(ordinaryEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('handles absent and non-element targets safely without a global Element', () => {
    expect(typeof Element).toBe('undefined');
    for (const target of [
      null,
      new EventTarget(),
      Object.assign(new EventTarget(), { closest: null }),
    ]) {
      const event = keyEvent('Enter', { isComposing: true }, target);
      expect(guardNativeCompositionKey(event, false)).toBe(true);
      expect(event.stopPropagation).toHaveBeenCalledExactlyOnceWith();
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  });

  it('calls each event method only once when all composition signals and submit guards match', () => {
    const event = keyEvent('Enter', { isComposing: true, keyCode: 229 }, elementTarget('BUTTON'));
    expect(guardNativeCompositionKey(event, true, true)).toBe(true);
    expect(event.stopPropagation).toHaveBeenCalledExactlyOnceWith();
    expect(event.preventDefault).toHaveBeenCalledExactlyOnceWith();
  });
});
