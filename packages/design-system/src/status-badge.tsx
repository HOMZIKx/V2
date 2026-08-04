import type { CSSProperties, JSX } from 'react';

export type StatusBadgeTone = 'ok' | 'warn' | 'error';

export interface StatusBadgeProps {
  label: string;
  tone: StatusBadgeTone;
}

export function getToneColor(tone: StatusBadgeTone): string {
  const colors: Record<StatusBadgeTone, string> = {
    ok: '#15803d',
    warn: '#a16207',
    error: '#b91c1c',
  };

  return colors[tone];
}

export function StatusBadge({ label, tone }: StatusBadgeProps): JSX.Element {
  return (
    <span
      className="v2-status-badge"
      data-tone={tone}
      style={{ '--v2-status-badge-color': getToneColor(tone) } as CSSProperties}
    >
      {label}
    </span>
  );
}
