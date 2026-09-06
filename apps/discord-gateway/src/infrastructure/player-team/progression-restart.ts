/**
 * Mirror of web `restartAfterDone` / `inferProgressionKind` for Discord Gotowe
 * without importing the Next.js app. Keeps EQ card (Ksiega / Kamien / ...) in sync.
 */

export type ProgressionKind =
  | 'skill_book'
  | 'soul_stone'
  | 'leadership'
  | 'polymorph'
  | 'mining'
  | 'horse'
  | 'biologist';

const HORSE_HOURS = 23;
const SOUL_STONE_HOURS = 12;

const MIDNIGHT_KINDS: ReadonlySet<ProgressionKind> = new Set([
  'skill_book',
  'leadership',
  'polymorph',
  'mining',
  'biologist',
]);

export function inferProgressionKind(label: string): ProgressionKind | null {
  const normalized = label.toLocaleLowerCase('pl');
  const ascii = normalized.normalize('NFD').replace(/\p{M}/gu, '');
  if (normalized.includes('biolog')) return 'biologist';
  if (ascii.includes('jazd') || ascii.includes('konn') || ascii.includes('kon ')) {
    return 'horse';
  }
  if (
    ascii.includes('kamien duszy') ||
    ascii.includes('kamien duch') ||
    ascii.includes('soul stone') ||
    ascii.includes('duchow')
  ) {
    return 'soul_stone';
  }
  if (
    ascii.includes('dowodz') ||
    ascii.includes('sun zi') ||
    ascii.includes('leadership')
  ) {
    return 'leadership';
  }
  if (ascii.includes('polimorf') || ascii.includes('polymorph')) return 'polymorph';
  if (ascii.includes('gornict') || ascii.includes('kopan') || ascii.includes('mining')) {
    return 'mining';
  }
  if (ascii.includes('combo') || ascii.includes('kombinac')) return null;
  if (ascii.includes('ksieg') || ascii.includes('skill')) {
    return 'skill_book';
  }
  return null;
}

export function nextMidnightIso(now = new Date()): string {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.toISOString();
}

export function nextMidnightLabel(now = new Date()): string {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const hh = String(next.getHours()).padStart(2, '0');
  const mm = String(next.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function restartAfterDone(
  kind: ProgressionKind | null,
  now = new Date(),
  durationMinutes?: number,
): {
  readonly readyAtIso: string;
  readonly remainingLabel: string;
  readonly detailHint: string;
} {
  if (kind === 'horse') {
    return {
      readyAtIso: new Date(now.getTime() + HORSE_HOURS * 3_600_000).toISOString(),
      remainingLabel: `${HORSE_HOURS} h u Stajennego`,
      detailHint: `Cooldown jazdy ${HORSE_HOURS} h (Projekt Hard).`,
    };
  }
  if (kind === 'soul_stone') {
    return {
      readyAtIso: new Date(now.getTime() + SOUL_STONE_HOURS * 3_600_000).toISOString(),
      remainingLabel: `${SOUL_STONE_HOURS} h od przeczytania`,
      detailHint: `Kamien Duchowy: kolejne czytanie po ${SOUL_STONE_HOURS} h.`,
    };
  }
  if (kind && MIDNIGHT_KINDS.has(kind)) {
    return {
      readyAtIso: nextMidnightIso(now),
      remainingLabel: `do ${nextMidnightLabel(now)}`,
      detailHint: 'Limit czytan / dostaw resetuje sie o polnocy.',
    };
  }
  const minutes =
    typeof durationMinutes === 'number' && Number.isFinite(durationMinutes)
      ? Math.max(1, Math.min(24 * 60, Math.round(durationMinutes)))
      : 60;
  return {
    readyAtIso: new Date(now.getTime() + minutes * 60_000).toISOString(),
    remainingLabel: `${minutes} min`,
    detailHint: `Kolejny cykl za ${minutes} minut.`,
  };
}
