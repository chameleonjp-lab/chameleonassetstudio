import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

interface CommittedInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'defaultValue' | 'onBlur' | 'onChange' | 'onFocus' | 'onKeyDown' | 'value'
> {
  value: string;
  onCommit: (value: string) => void;
  normalize?: (value: string) => string;
}

/**
 * 入力中の値をAssetへ反映せず、Enterまたはblurで一度だけ確定する入力欄。
 * Escapeは元の値へ戻し、意味上のno-opは呼び出し側のmodel判定でも抑止する。
 */
export function CommittedInput({ value, onCommit, normalize, ...inputProps }: CommittedInputProps) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (committed.current) {
      return;
    }
    committed.current = true;
    const normalized = normalize ? normalize(draft) : draft;
    setDraft(normalized);
    if (normalized !== value) {
      onCommit(normalized);
    }
  };

  return (
    <input
      {...inputProps}
      value={draft}
      onFocus={() => {
        committed.current = false;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          committed.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      onBlur={commit}
    />
  );
}
