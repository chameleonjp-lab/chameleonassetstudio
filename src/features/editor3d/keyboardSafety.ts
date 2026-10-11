type NativeCompositionEvent = { isComposing?: boolean; keyCode?: number };

/** The final IME keydown can follow compositionend with only keyCode 229 set. */
export function isNativeCompositionKey(event: NativeCompositionEvent, tracked: boolean): boolean {
  return tracked || event.isComposing === true || event.keyCode === 229;
}

function isButtonTarget(target: EventTarget | null): boolean {
  // Feature detection also covers SVG descendants and elements from another window.
  return (
    target !== null &&
    'closest' in target &&
    typeof target.closest === 'function' &&
    Boolean(target.closest('button'))
  );
}

/** Keep composition keys away from editor commands without cancelling IME text defaults. */
export function guardNativeCompositionKey(
  event: {
    key: string;
    nativeEvent: NativeCompositionEvent;
    target: EventTarget | null;
    preventDefault(): void;
    stopPropagation(): void;
  },
  tracked: boolean,
  implicitSubmit = false,
): boolean {
  if (
    (event.key !== 'Enter' && event.key !== 'Escape') ||
    !isNativeCompositionKey(event.nativeEvent, tracked)
  ) {
    return false;
  }
  event.stopPropagation();
  // Escape must retain the browser's IME candidate cancellation behavior.
  // Form callers opt in to preventing Enter's implicit submission.
  if (event.key === 'Enter' && (implicitSubmit || isButtonTarget(event.target))) {
    event.preventDefault();
  }
  return true;
}
