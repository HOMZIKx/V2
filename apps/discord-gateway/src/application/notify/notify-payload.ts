import { z } from 'zod';

const snowflakeSchema = z.string().regex(/^\d{17,20}$/, 'Must be a Discord snowflake');

export const TimerNotifyPayloadSchema = z.object({
  discordUserId: snowflakeSchema,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(1800),
  deepLinkUrl: z.string().url().max(500),
  /** @deprecated map-hunt — optional legacy; character progress timers prefer characterId/timerId. */
  mapKey: z.string().trim().min(1).max(64).optional(),
  channel: z.coerce.number().int().positive().max(99).optional(),
  timerKey: z.string().trim().min(1).max(128).optional(),
  /** Character progress timer (EQ/Timer tab) — product path. */
  workspaceId: z.string().trim().min(1).max(64).optional(),
  characterId: z.string().trim().min(1).max(64).optional(),
  characterName: z.string().trim().min(1).max(80).optional(),
  timerId: z.string().trim().min(1).max(128).optional(),
  timerLabel: z.string().trim().min(1).max(120).optional(),
  endsAt: z.string().datetime().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  /** Optional guild text channel - when set, message goes there instead of DM. */
  discordChannelId: snowflakeSchema.optional(),
  /** Short lines summarizing other character timers (or legacy room). */
  roomSummary: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  /** When true, attach action buttons (Gotowe / Przypomnij później for character timers). */
  includeButtons: z.boolean().optional(),
  /** reset = start/confirm; reminder = ~Nh before end; manual = Technika test / ad-hoc. */
  kind: z.enum(['manual', 'reset', 'reminder']).optional(),
  actorName: z.string().trim().min(1).max(80).optional(),
  /** LIVE EQ card timers (numbered Discord buttons 1..N). */
  liveTimers: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(128),
        label: z.string().trim().min(1).max(120),
        status: z.string().trim().min(1).max(32),
        remainingLabel: z.string().trim().max(80).optional(),
        detail: z.string().trim().max(200).optional(),
      }),
    )
    .max(12)
    .optional(),
});

export type TimerNotifyPayload = z.infer<typeof TimerNotifyPayloadSchema>;

export const TimerWatchPayloadSchema = z.object({
  discordUserId: snowflakeSchema,
  mapKey: z.string().trim().min(1).max(64),
  channel: z.coerce.number().int().positive().max(99),
});

export type TimerWatchPayload = z.infer<typeof TimerWatchPayloadSchema>;

export const TimerResetNotifyPayloadSchema = z.object({
  actorDiscordUserId: snowflakeSchema,
  actorName: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(1800),
  deepLinkUrl: z.string().url().max(500),
  mapKey: z.string().trim().min(1).max(64).optional(),
  channel: z.coerce.number().int().positive().max(99).optional(),
  timerKey: z.string().trim().min(1).max(128).optional(),
  workspaceId: z.string().trim().min(1).max(64).optional(),
  characterId: z.string().trim().min(1).max(64).optional(),
  characterName: z.string().trim().min(1).max(80).optional(),
  timerId: z.string().trim().min(1).max(128).optional(),
  timerLabel: z.string().trim().min(1).max(120).optional(),
  endsAt: z.string().datetime().optional(),
  roomSummary: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  recipientDiscordUserIds: z.array(snowflakeSchema).max(40).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  /** LIVE EQ card timers (numbered Discord buttons 1..N). */
  liveTimers: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(128),
        label: z.string().trim().min(1).max(120),
        status: z.string().trim().min(1).max(32),
        remainingLabel: z.string().trim().max(80).optional(),
        detail: z.string().trim().max(200).optional(),
      }),
    )
    .max(12)
    .optional(),
});

export type TimerResetNotifyPayload = z.infer<typeof TimerResetNotifyPayloadSchema>;

export const TestDmPayloadSchema = z.object({
  module: z.enum(['characterTimers', 'kingdomWar']),
  discordAccountId: snowflakeSchema,
  messageTemplate: z.string().trim().min(1).max(1800).optional(),
  sampleVars: z.record(z.union([z.string(), z.number()])).optional(),
});

export type TestDmPayload = z.infer<typeof TestDmPayloadSchema>;

export function isCharacterProgressTimerPayload(
  payload: Pick<TimerNotifyPayload, 'characterId' | 'timerId' | 'workspaceId'>,
): boolean {
  return Boolean(payload.timerId && (payload.characterId || payload.workspaceId));
}

export function formatLiveTimerStatus(timer: {
  readonly status: string;
  readonly remainingLabel?: string;
}): string {
  if (timer.status === 'ready') return 'gotowe';
  if (timer.status === 'running') return timer.remainingLabel?.trim() || 'w toku';
  if (timer.status === 'done') return 'oznaczone';
  return timer.remainingLabel?.trim() || timer.status;
}

export function formatTimerNotifyContent(payload: TimerNotifyPayload): string {
  const isCharacter = isCharacterProgressTimerPayload(payload);
  const header = isCharacter
    ? `**DESTILED · Karta postaci${payload.characterName ? ` · ${payload.characterName}` : ''}**`
    : '**DESTILED · Timer**';
  const lines = [header, payload.title, '', payload.body];
  if (payload.actorName) {
    lines.push('', `Kto: ${payload.actorName}`);
  }
  if (isCharacter) {
    if (payload.characterName) {
      lines.push('', `Postać: ${payload.characterName}`);
    }
    const live = payload.liveTimers ?? [];
    if (live.length > 0) {
      const done = live.filter((t) => t.status === 'ready' || t.status === 'done').length;
      lines.push('', `**LIVE karta EQ** (${done}/${live.length} gotowe/oznaczone):`);
      live.forEach((timer, index) => {
        const n = index + 1;
        const status = formatLiveTimerStatus(timer);
        const detail = timer.detail?.trim() ? ` — ${timer.detail.trim().slice(0, 80)}` : '';
        lines.push(`**${n}.** ${timer.label} — ${status}${detail}`);
      });
      lines.push('', '_Kliknij numer poniżej = Gotowe na karcie postaci._');
    } else {
      if (payload.timerLabel || payload.timerId) {
        lines.push(`Timer: ${payload.timerLabel ?? payload.timerId}`);
      }
      if (payload.endsAt) {
        lines.push(`Koniec: ${payload.endsAt}`);
      }
    }
  } else if (payload.mapKey) {
    const ch = payload.channel !== undefined ? ` · CH${payload.channel}` : '';
    lines.push('', `Mapa: ${payload.mapKey}${ch}`);
    if (payload.timerKey) {
      lines.push(`Timer: ${payload.timerKey}`);
    }
  }
  if ((!payload.liveTimers || payload.liveTimers.length === 0) && payload.roomSummary && payload.roomSummary.length > 0) {
    lines.push('', isCharacter ? 'Pozostałe na tej karcie:' : 'Inne timery w pokoju:');
    for (const line of payload.roomSummary.slice(0, 8)) {
      lines.push(`• ${line}`);
    }
  }
  lines.push('', `Otwórz w DESTILED: ${payload.deepLinkUrl}`);
  return lines.join('\n').slice(0, 1900);
}

export function shouldIncludeTimerButtons(payload: TimerNotifyPayload): boolean {
  if (payload.includeButtons === false) return false;
  if (payload.includeButtons === true) return true;
  if (isCharacterProgressTimerPayload(payload)) return true;
  return Boolean(payload.mapKey && payload.channel !== undefined && payload.timerKey);
}

export function applyNotifyTemplate(
  template: string,
  vars: Record<string, string | number | undefined>,
): string {
  return template.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? '' : String(value);
  });
}
