'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export function parseCompactAmount(raw: string): number | null {
  const normalized = raw
    .trim()
    .toLocaleLowerCase('pl-PL')
    .replace(/[\s_]/g, '')
    .replace(',', '.');
  if (!normalized) return 0;
  const match = /^(\d+(?:\.\d+)?)(k{0,3})$/.exec(normalized);
  if (!match?.[1]) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base) || base < 0) return null;
  const suffix = match[2] ?? '';
  const multiplier = suffix === 'k' ? 1_000 : suffix === 'kk' ? 1_000_000 : suffix === 'kkk' ? 1_000_000_000 : 1;
  const value = base * multiplier;
  return Number.isFinite(value) ? value : null;
}

function initialText(value: number): string {
  return value > 0 ? String(value) : '';
}

export function CompactAmountInput({
  value,
  onValueChange,
  placeholder = 'np. 500k / 1kk / 1kkk',
  disabled = false,
}: {
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}) {
  const [text, setText] = useState(() => initialText(value));
  const [invalid, setInvalid] = useState(false);
  const editingRef = useRef(false);
  const selfCommittedValueRef = useRef<number | null>(null);

  useEffect(() => {
    if (selfCommittedValueRef.current === value) {
      selfCommittedValueRef.current = null;
      return;
    }
    if (!editingRef.current) setText(initialText(value));
  }, [value]);

  const commit = () => {
    const parsed = parseCompactAmount(text);
    editingRef.current = false;
    if (parsed === null) {
      setInvalid(true);
      setText(initialText(value));
      return;
    }
    setInvalid(false);
    selfCommittedValueRef.current = parsed;
    onValueChange(parsed);
    setText(text.trim().toLocaleLowerCase('pl-PL').replace(',', '.'));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.currentTarget.blur();
  };

  return (
    <input
      aria-invalid={invalid || undefined}
      disabled={disabled}
      inputMode="decimal"
      onBlur={commit}
      onChange={(event) => {
        setInvalid(false);
        setText(event.target.value);
      }}
      onFocus={() => {
        editingRef.current = true;
      }}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      type="text"
      value={text}
    />
  );
}
