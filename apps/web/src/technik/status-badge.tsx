import type { CSSProperties, JSX } from 'react';

export type StatusBadgeTone = 'ok' | 'warn' | 'error';

export function StatusBadge({
  label,
  tone,
}: {
  readonly label: string;
  readonly tone: StatusBadgeTone;
}): JSX.Element {
  const colors: Record<StatusBadgeTone, string> = {
    ok: '#15803d',
    warn: '#a16207',
    error: '#b91c1c',
  };
  return (
    <span
      className="technik-status-badge"
      data-tone={tone}
      style={{ '--technik-status-badge-color': colors[tone] } as CSSProperties}
    >
      {label}
    </span>
  );
}
