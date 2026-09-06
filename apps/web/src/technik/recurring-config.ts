'use client';

/**
 * recurringPosts draft — New Bot schema (exact):
 * enabled, title, content, schedule, channelId,
 * seedReactions[{emoji, role, label?}], showCountsInPost, rsvpEnabled,
 * rules{maxSlots?, closeAt?, whoCanReact, roleIds?}
 */

export const RECURRING_STORAGE_KEY = 'technik.recurring.v2';
export const RECURRING_STORAGE_KEY_LEGACY = 'technik.recurring.v1';

export type ReactionRole =
  | 'decorative'
  | 'rsvp_yes'
  | 'rsvp_no'
  | 'rsvp_maybe'
  | 'count';

export type SeedReaction = {
  emoji: string;
  role: ReactionRole;
  label?: string;
};

export type ScheduleMode = 'daily' | 'weekly' | 'days';

export type RecurringSchedule = {
  mode: ScheduleMode;
  daysOfWeek: number[];
  timeWarsaw: string;
  horizonDays: number;
};

export type CloseAt = 'none' | 'at_start' | 'manual';

export type WhoCanReact = 'everyone' | 'roles';

export type RecurringRules = {
  maxSlots?: number | null;
  closeAt?: CloseAt;
  whoCanReact: WhoCanReact;
  roleIds?: string[];
};

/** Exact New Bot recurringPosts payload shape. */
export type RecurringPostsConfig = {
  enabled: boolean;
  title: string;
  content: string;
  schedule: RecurringSchedule;
  channelId: string;
  seedReactions: SeedReaction[];
  showCountsInPost: boolean;
  rsvpEnabled: boolean;
  rules: RecurringRules;
};

/** Local UI extras (stripped before New Bot payload). */
export type RecurringLocalDraft = RecurringPostsConfig & {
  /** Section: Reakcje pod postem — when false, payload seedReactions = []. */
  reactionsEnabled: boolean;
};

export const REACTION_ROLE_OPTIONS: readonly {
  value: ReactionRole;
  label: string;
  hint: string;
}[] = [
  { value: 'decorative', label: 'Dekoracyjna', hint: 'Tylko wygląd — bez listy zapisów' },
  { value: 'rsvp_yes', label: 'RSVP: tak', hint: 'Zapis „będę”' },
  { value: 'rsvp_no', label: 'RSVP: nie', hint: 'Zapis „nie będę”' },
  { value: 'rsvp_maybe', label: 'RSVP: może', hint: 'Zapis „może”' },
  { value: 'count', label: 'Licznik', hint: 'Liczba kliknięć w treści / podglądzie' },
];

export const DAY_LABELS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'] as const;

export const EMOJI_QUICK: readonly string[] = [
  '✅',
  '❌',
  '❓',
  '👍',
  '👎',
  '🔥',
  '⭐',
  '🎮',
  '🗡️',
  '🛡️',
];

export const RSVP_PRESET: readonly SeedReaction[] = [
  { emoji: '✅', role: 'rsvp_yes', label: 'Będę' },
  { emoji: '❌', role: 'rsvp_no', label: 'Nie będę' },
  { emoji: '❓', role: 'rsvp_maybe', label: 'Może' },
];

export const DEFAULT_SCHEDULE: RecurringSchedule = {
  mode: 'weekly',
  daysOfWeek: [1, 3, 5],
  timeWarsaw: '18:00',
  horizonDays: 90,
};

export const DEFAULT_RULES: RecurringRules = {
  maxSlots: null,
  closeAt: 'none',
  whoCanReact: 'everyone',
  roleIds: [],
};

export const DEFAULT_RECURRING: RecurringLocalDraft = {
  enabled: false,
  title: '',
  content: '',
  schedule: { ...DEFAULT_SCHEDULE, daysOfWeek: [...DEFAULT_SCHEDULE.daysOfWeek] },
  channelId: '',
  seedReactions: [],
  showCountsInPost: false,
  rsvpEnabled: false,
  rules: {
    ...DEFAULT_RULES,
    roleIds: [],
  },
  reactionsEnabled: false,
};

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asReactionRole(v: unknown): ReactionRole {
  if (
    v === 'decorative' ||
    v === 'rsvp_yes' ||
    v === 'rsvp_no' ||
    v === 'rsvp_maybe' ||
    v === 'count'
  ) {
    return v;
  }
  return 'decorative';
}

function normalizeReactions(raw: unknown): SeedReaction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .map((r) => {
      const emoji = asString(r.emoji).trim() || '⭐';
      const role = asReactionRole(r.role);
      const label = asString(r.label).trim();
      return label ? { emoji, role, label } : { emoji, role };
    })
    .slice(0, 20);
}

function normalizeSchedule(raw: unknown, legacy?: Record<string, unknown>): RecurringSchedule {
  const s =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : (legacy ?? {});
  const mode =
    s.mode === 'daily' || s.mode === 'weekly' || s.mode === 'days' ? s.mode : 'weekly';
  const days = Array.isArray(s.daysOfWeek)
    ? s.daysOfWeek.map(Number).filter((n) => n >= 0 && n <= 6)
    : [...DEFAULT_SCHEDULE.daysOfWeek];
  const timeWarsaw = asString(s.timeWarsaw, DEFAULT_SCHEDULE.timeWarsaw) || '18:00';
  const horizonRaw = Number(s.horizonDays);
  const horizonDays =
    Number.isFinite(horizonRaw) && horizonRaw > 0
      ? Math.min(90, Math.max(1, Math.floor(horizonRaw)))
      : 90;
  return { mode, daysOfWeek: days.length ? days : [1], timeWarsaw, horizonDays };
}

function normalizeRules(raw: unknown): RecurringRules {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const closeAt: CloseAt =
    r.closeAt === 'at_start' || r.closeAt === 'manual' || r.closeAt === 'none'
      ? r.closeAt
      : 'none';
  const whoCanReact: WhoCanReact = r.whoCanReact === 'roles' ? 'roles' : 'everyone';
  const roleIds = Array.isArray(r.roleIds)
    ? r.roleIds.map(String).filter((id) => /^\d{17,20}$/.test(id))
    : [];
  let maxSlots: number | null = null;
  if (r.maxSlots === null || r.maxSlots === undefined || r.maxSlots === '') {
    maxSlots = null;
  } else {
    const n = Number(r.maxSlots);
    maxSlots = Number.isFinite(n) && n > 0 ? Math.min(9999, Math.floor(n)) : null;
  }
  return { maxSlots, closeAt, whoCanReact, roleIds };
}

export function normalizeRecurringDraft(raw: unknown): RecurringLocalDraft {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const schedule = normalizeSchedule(p.schedule, p);
  const seedReactions = normalizeReactions(p.seedReactions);
  const reactionsEnabled =
    typeof p.reactionsEnabled === 'boolean'
      ? p.reactionsEnabled
      : seedReactions.length > 0;
  return {
    enabled: asBool(p.enabled, false),
    title: asString(p.title).slice(0, 100),
    content: asString(p.content).slice(0, 2000),
    schedule,
    channelId: asString(p.channelId),
    seedReactions,
    showCountsInPost: asBool(p.showCountsInPost, false),
    rsvpEnabled: asBool(p.rsvpEnabled, false),
    rules: normalizeRules(p.rules),
    reactionsEnabled,
  };
}

export function loadRecurringDraft(): RecurringLocalDraft {
  try {
    const v2 = localStorage.getItem(RECURRING_STORAGE_KEY);
    if (v2) return normalizeRecurringDraft(JSON.parse(v2));
    const v1 = localStorage.getItem(RECURRING_STORAGE_KEY_LEGACY);
    if (v1) return normalizeRecurringDraft(JSON.parse(v1));
  } catch {
    /* ignore */
  }
  return {
    ...DEFAULT_RECURRING,
    schedule: {
      ...DEFAULT_SCHEDULE,
      daysOfWeek: [...DEFAULT_SCHEDULE.daysOfWeek],
    },
    rules: { ...DEFAULT_RULES, roleIds: [] },
    seedReactions: [],
  };
}

export function saveRecurringDraft(draft: RecurringLocalDraft): void {
  localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(draft));
}

/** Strip UI-only fields → exact New Bot recurringPosts object. */
export function toRecurringPostsPayload(draft: RecurringLocalDraft): RecurringPostsConfig {
  const reactions = draft.reactionsEnabled
    ? draft.seedReactions
        .filter((r) => r.emoji.trim())
        .map((r) => {
          const label = r.label?.trim();
          return label
            ? { emoji: r.emoji.trim(), role: r.role, label }
            : { emoji: r.emoji.trim(), role: r.role };
        })
    : [];
  const rules: RecurringRules = {
    whoCanReact: draft.rules.whoCanReact,
    closeAt: draft.rules.closeAt ?? 'none',
  };
  if (draft.rules.maxSlots != null && draft.rules.maxSlots > 0) {
    rules.maxSlots = draft.rules.maxSlots;
  }
  if (draft.rules.whoCanReact === 'roles' && draft.rules.roleIds?.length) {
    rules.roleIds = [...draft.rules.roleIds];
  }
  return {
    enabled: draft.enabled,
    title: draft.title.trim(),
    content: draft.content,
    schedule: {
      mode: draft.schedule.mode,
      daysOfWeek: [...draft.schedule.daysOfWeek].sort((a, b) => a - b),
      timeWarsaw: draft.schedule.timeWarsaw.trim() || '18:00',
      horizonDays: draft.schedule.horizonDays,
    },
    channelId: draft.channelId,
    seedReactions: reactions,
    showCountsInPost: draft.showCountsInPost,
    rsvpEnabled: draft.rsvpEnabled,
    rules,
  };
}

export function scheduleSummary(schedule: RecurringSchedule, enabled: boolean): string {
  if (!enabled) return 'wyłączone';
  if (schedule.mode === 'daily') {
    return 'codziennie o ' + schedule.timeWarsaw + ' (Warszawa)';
  }
  const days = schedule.daysOfWeek.map((i) => DAY_LABELS[i] ?? '?').join(', ');
  const modeLabel = schedule.mode === 'weekly' ? 'co tydzień' : 'w wybrane dni';
  return modeLabel + ' · ' + days + ' · ' + schedule.timeWarsaw + ' (Warszawa)';
}

/** Reactions that feed a count / RSVP number in the post body. */
export function countableReactions(
  draft: RecurringLocalDraft,
): readonly SeedReaction[] {
  if (!draft.reactionsEnabled) return [];
  return draft.seedReactions.filter(
    (r) =>
      r.emoji.trim() &&
      (r.role === 'count' ||
        r.role === 'rsvp_yes' ||
        r.role === 'rsvp_no' ||
        r.role === 'rsvp_maybe'),
  );
}

/**
 * Preview how numbers appear when showCountsInPost is on.
 * Replaces {{count:emoji}} placeholders; otherwise appends a short line.
 */
export function previewCountsInContent(
  content: string,
  reactions: readonly SeedReaction[],
  sampleCounts?: ReadonlyMap<string, number>,
): { body: string; usedPlaceholders: boolean; appendix: string } {
  const counts = new Map<string, number>();
  reactions.forEach((r, i) => {
    const key = r.emoji;
    const sample = sampleCounts?.get(key);
    counts.set(key, typeof sample === 'number' ? sample : (i + 1) * 2);
  });

  let usedPlaceholders = false;
  let body = content;
  for (const [emoji, n] of counts) {
    const token = '{{count:' + emoji + '}}';
    if (body.includes(token)) {
      usedPlaceholders = true;
      body = body.split(token).join(String(n));
    }
  }

  const appendix = reactions
    .map((r) => {
      const n = counts.get(r.emoji) ?? 0;
      const name = r.label?.trim() || r.emoji;
      return r.emoji + ' ' + name + ': **' + String(n) + '**';
    })
    .join(' · ');

  if (!usedPlaceholders && appendix) {
    body = (body.trimEnd() ? body.trimEnd() + '\n\n' : '') + '📊 ' + appendix;
  }

  return { body, usedPlaceholders, appendix };
}

export function newReactionRow(): SeedReaction {
  return { emoji: '⭐', role: 'decorative', label: '' };
}
