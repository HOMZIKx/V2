import { z } from 'zod';

/** Matches Technika live-config keys (timersNotify.* / kingdomWar.*). */
export const TimersNotifyConfigSchema = z.object({
  enabled: z.boolean(),
  messageTemplate: z.string().trim().min(1).max(1800),
  reminderMinutesBefore: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
});

export const KingdomWarConfigSchema = z.object({
  enabled: z.boolean(),
  warAt: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  maxClaimsPerUser: z.number().int().min(1).max(20).default(3),
  notifyMinutesBefore: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  messageTemplate: z.string().trim().min(1).max(1800),
  /** Stub roster until Kuzyn profile is wired — do not invent a fake roster API. */
  characterRosterStub: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(80),
      }),
    )
    .max(25)
    .default([]),
});

export const LiveBotConfigSchema = z.object({
  revision: z.number().int().nonnegative(),
  updatedAtIso: z.string().min(1),
  timersNotify: TimersNotifyConfigSchema,
  kingdomWar: KingdomWarConfigSchema,
});

export type TimersNotifyConfig = z.infer<typeof TimersNotifyConfigSchema>;
export type KingdomWarConfig = z.infer<typeof KingdomWarConfigSchema>;
export type LiveBotConfig = z.infer<typeof LiveBotConfigSchema>;

export const DEFAULT_LIVE_BOT_CONFIG: LiveBotConfig = {
  revision: 0,
  updatedAtIso: new Date(0).toISOString(),
  timersNotify: {
    enabled: true,
    messageTemplate:
      'Przypomnienie DESTILED: timer „{{title}}” za {{minutes}} min. Otwórz: {{deepLink}}',
    reminderMinutesBefore: 60,
  },
  kingdomWar: {
    enabled: false,
    warAt: '18:00',
    notifyMinutesBefore: 30,
    maxClaimsPerUser: 3,
    messageTemplate:
      'Wojna królestw o {{warAt}} (Warszawa). Zostało {{minutes}} min — wybierz postać na wojnę.',
    characterRosterStub: [
      { id: 'stub-1', name: 'Postać A (stub)' },
      { id: 'stub-2', name: 'Postać B (stub)' },
      { id: 'stub-3', name: 'Postać C (stub)' },
    ],
  },
};

let current: LiveBotConfig = structuredClone(DEFAULT_LIVE_BOT_CONFIG);

export function getLiveBotConfig(): LiveBotConfig {
  return current;
}

export function patchLiveBotConfig(input: {
  readonly timersNotify?: Partial<TimersNotifyConfig>;
  readonly kingdomWar?: Partial<KingdomWarConfig>;
}): LiveBotConfig {
  const nextTimers = TimersNotifyConfigSchema.parse({
    ...current.timersNotify,
    ...(input.timersNotify ?? {}),
  });
  const nextWar = KingdomWarConfigSchema.parse({
    ...current.kingdomWar,
    ...(input.kingdomWar ?? {}),
  });
  current = {
    revision: current.revision + 1,
    updatedAtIso: new Date().toISOString(),
    timersNotify: nextTimers,
    kingdomWar: nextWar,
  };
  return current;
}

export function resetLiveBotConfigForTests(value: LiveBotConfig = DEFAULT_LIVE_BOT_CONFIG): void {
  current = structuredClone(value);
}

export function computeNotifyAt(warAt: string, notifyMinutesBefore: number): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(warAt);
  if (!match) {
    throw new Error('Invalid warAt');
  }
  const h = Number(match[1]);
  const m = Number(match[2]);
  const total = h * 60 + m - Math.floor(notifyMinutesBefore);
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
  const mm = String(normalized % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function applyMessageTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? '' : String(value);
  });
}
