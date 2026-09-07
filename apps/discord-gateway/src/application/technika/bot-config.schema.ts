import { z } from 'zod';

import {
  defaultBotConfigValues,
  defaultGuildConfig,
  defaultGuildModules,
  defaultRecurringPosts,
  type BotConfigValues,
  type GuildConfig,
} from './capabilities.js';

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const FORBIDDEN_CONFIG_KEYS = [
  'token',
  'secret',
  'password',
  'pem',
  'allowlist',
  'operator',
  'oauth',
  'database',
  'privateKey',
  'private_key',
] as const;

const GUILD_RIGHTS = [
  'technika.config',
  'technika.apply',
  'technika.rollback',
  'discord.notify',
  'discord.panels',
  'discord.commands',
] as const;

export const GuildModulesSchema = z.object({
  characterTimers: z.boolean(),
  kingdomWar: z.boolean(),
  /** Optional in Technika flat DTO — defaults applied. */
  panels: z.boolean().default(true),
  channels: z.boolean().default(false),
});

export const PublishChannelsSchema = z
  .object({
    centrumHub: z
      .string()
      .regex(/^\d{17,20}$/)
      .optional(),
    notifications: z
      .string()
      .regex(/^\d{17,20}$/)
      .optional(),
    dungeons: z
      .string()
      .regex(/^\d{17,20}$/)
      .optional(),
    trade: z
      .string()
      .regex(/^\d{17,20}$/)
      .optional(),
    recurring: z
      .string()
      .regex(/^\d{17,20}$/)
      .optional(),
    events: z
      .string()
      .regex(/^\d{17,20}$/)
      .optional(),
    website: z
      .string()
      .regex(/^\d{17,20}$/)
      .optional(),
  })
  .strict();

export const GuildConfigSchema = z.object({
  enabled: z.boolean(),
  displayName: z.string().trim().min(1).max(100).optional(),
  modules: GuildModulesSchema,
  rights: z.array(z.enum(GUILD_RIGHTS)).max(32),
  notes: z.string().trim().max(500).optional(),
  publishChannels: PublishChannelsSchema.optional(),
  appWebsiteUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https?:\/\//i.test(v), {
      message: 'appWebsiteUrl must be http(s) URL',
    })
    .optional(),
});

export const GuildsMapSchema = z.record(
  z.string().regex(/^\d{17,20}$/, 'guildId must be a Discord snowflake'),
  GuildConfigSchema,
);

export const TimersNotifySchema = z.object({
  enabled: z.boolean(),
  messageTemplate: z.string().trim().min(1).max(1800),
  reminderMinutesBefore: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  resetNotifyEnabled: z.boolean(),
});

export const CharacterTimersSchema = TimersNotifySchema;

export const MemberActivitySchema = z.object({
  enabled: z.boolean(),
  guildId: z.string().regex(/^\d{17,20}$/, 'guildId must be a Discord snowflake'),
  memberRoleIds: z
    .array(z.string().regex(/^\d{17,20}$/))
    .max(50)
    .default([]),
  windowDays: z
    .number()
    .int()
    .refine((n) => n === 7 || n === 14 || n === 30, 'windowDays must be 7|14|30'),
  topN: z.number().int().min(1).max(100).default(10),
});

export const KingdomWarSchema = z.object({
  enabled: z.boolean(),
  warAt: z.string().trim().regex(HH_MM, 'warAt must be HH:mm (Europe/Warsaw wall clock)'),
  notifyMinutesBefore: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  maxClaimsPerUser: z.number().int().min(1).max(20).default(3),
  messageTemplate: z.string().trim().min(1).max(1800),
});

export const SeedReactionSchema = z.object({
  emoji: z.string().trim().min(1).max(64),
  role: z.enum(['decorative', 'rsvp_yes', 'rsvp_no', 'rsvp_maybe', 'count']),
  label: z.string().trim().min(1).max(80).optional(),
});

export const RecurringScheduleSchema = z.object({
  mode: z.enum(['daily', 'weekly', 'days']),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  timeWarsaw: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'timeWarsaw must be HH:mm'),
  horizonDays: z.number().int().min(1).max(90).default(90),
});

export const RecurringPostRulesSchema = z.object({
  maxSlots: z.number().int().min(1).max(9999).nullable().optional(),
  closeAt: z.enum(['none', 'at_start', 'manual']).optional(),
  whoCanReact: z.enum(['everyone', 'roles']).default('everyone'),
  roleIds: z
    .array(z.string().regex(/^\d{17,20}$/))
    .max(50)
    .optional(),
});

/** Exact Technika / New Bot recurringPosts object (config-only; no scheduler).
 * content may include placeholders `{{count:EMOJI}}` / `{{rsvp_list}}` resolved later
 * at publish/scheduler time from seedReactions + rsvpEnabled/showCountsInPost (not at draft save).
 */
export const RecurringPostsSchema = z.object({
  enabled: z.boolean().default(false),
  title: z.string().trim().max(100).default(''),
  /** Placeholders {{count:✅}} / {{rsvp_list}} — resolved at publish/scheduler (honest gap: no runtime yet). */
  content: z.string().trim().max(2000).default(''),
  schedule: RecurringScheduleSchema.default({
    mode: 'weekly',
    daysOfWeek: [1, 3, 5],
    timeWarsaw: '18:00',
    horizonDays: 90,
  }),
  channelId: z
    .string()
    .default('')
    .refine((v) => v === '' || /^\d{17,20}$/.test(v), {
      message: 'channelId must be empty or a Discord snowflake',
    }),
  seedReactions: z.array(SeedReactionSchema).max(20).default([]),
  showCountsInPost: z.boolean().default(false),
  rsvpEnabled: z.boolean().default(false),
  rules: RecurringPostRulesSchema.default({ whoCanReact: 'everyone', closeAt: 'none' }),
});

export const BotConfigValuesSchema = z
  .object({
    'panel-test-enabled': z.boolean(),
    'notify-timer-enabled': z.boolean(),
    timersNotify: TimersNotifySchema,
    characterTimers: CharacterTimersSchema,
    kingdomWar: KingdomWarSchema,
    'notify-timer-dm-action-buttons': z.boolean(),
    guilds: GuildsMapSchema.default({}),
    memberActivity: MemberActivitySchema.default({
      enabled: true,
      guildId: '1543972927719080016',
      memberRoleIds: [],
      windowDays: 7,
      topN: 10,
    }),
    publishChannels: PublishChannelsSchema.default({}),
    recurringPosts: RecurringPostsSchema.default(() => {
      const d = defaultRecurringPosts();
      return {
        enabled: d.enabled,
        title: d.title,
        content: d.content,
        schedule: {
          mode: d.schedule.mode,
          daysOfWeek: [...d.schedule.daysOfWeek],
          timeWarsaw: d.schedule.timeWarsaw,
          horizonDays: d.schedule.horizonDays,
        },
        channelId: d.channelId,
        seedReactions: d.seedReactions.map((r) => ({ ...r })),
        showCountsInPost: d.showCountsInPost,
        rsvpEnabled: d.rsvpEnabled,
        rules: {
          whoCanReact: d.rules.whoCanReact,
          ...(d.rules.closeAt ? { closeAt: d.rules.closeAt } : {}),
          ...(d.rules.maxSlots != null ? { maxSlots: d.rules.maxSlots } : {}),
          ...(d.rules.roleIds ? { roleIds: [...d.rules.roleIds] } : {}),
        },
      };
    }),
  })
  .strict();

export type ValidationIssue = {
  readonly path: string;
  readonly message: string;
};

export type ConfigValidationResult =
  | { readonly ok: true; readonly config: BotConfigValues; readonly issues: [] }
  | { readonly ok: false; readonly config: null; readonly issues: ValidationIssue[] };

function collectForbiddenKeys(value: unknown, path = ''): ValidationIssue[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    const lower = key.toLowerCase();
    if (FORBIDDEN_CONFIG_KEYS.some((frag) => lower.includes(frag))) {
      issues.push({
        path: nextPath,
        message: `Niedozwolone pole konfiguracyjne (WEB_ACCESS): ${key}`,
      });
      continue;
    }
    issues.push(...collectForbiddenKeys(child, nextPath));
  }
  return issues;
}

/** Hydrate alias: missing characterTimers ← timersNotify (and vice versa). */
export function hydrateCharacterTimersAlias(input: unknown): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }
  const record = { ...(input as Record<string, unknown>) };
  const timers = record.timersNotify;
  const character = record.characterTimers;
  if (
    character === undefined &&
    timers !== null &&
    typeof timers === 'object' &&
    !Array.isArray(timers)
  ) {
    record.characterTimers = timers;
  } else if (
    timers === undefined &&
    character !== null &&
    typeof character === 'object' &&
    !Array.isArray(character)
  ) {
    record.timersNotify = character;
  }
  return record;
}

export function validateBotConfigDraft(input: unknown): ConfigValidationResult {
  const hydrated = hydrateCharacterTimersAlias(input);
  const forbidden = collectForbiddenKeys(hydrated);
  if (forbidden.length > 0) {
    return { ok: false, config: null, issues: forbidden };
  }

  if (hydrated !== null && typeof hydrated === 'object' && !Array.isArray(hydrated)) {
    const record = hydrated as Record<string, unknown>;
    if ('strict-guild-isolation' in record) {
      return {
        ok: false,
        config: null,
        issues: [
          {
            path: 'strict-guild-isolation',
            message:
              'Pole tylko do odczytu (env DISCORD_STRICT_GUILD_ISOLATION) — nie można draftować.',
          },
        ],
      };
    }
  }

  const parsed = BotConfigValuesSchema.safeParse(hydrated);
  if (!parsed.success) {
    return {
      ok: false,
      config: null,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    };
  }

  return { ok: true, config: parsed.data as BotConfigValues, issues: [] };
}

export function mergePartialDraft(base: BotConfigValues, partial: unknown): ConfigValidationResult {
  if (partial === null || typeof partial !== 'object' || Array.isArray(partial)) {
    return {
      ok: false,
      config: null,
      issues: [{ path: '(root)', message: 'Oczekiwano obiektu konfiguracji.' }],
    };
  }
  const p = partial as {
    timersNotify?: object;
    characterTimers?: object;
    kingdomWar?: object;
    memberActivity?: object;
    publishChannels?: object;
    recurringPosts?: object;
  };
  const nextTimers = {
    ...base.timersNotify,
    ...(p.timersNotify ?? {}),
    ...(p.characterTimers ?? {}),
  };
  const nextCharacter = {
    ...base.characterTimers,
    ...(p.characterTimers ?? {}),
    ...(p.timersNotify && !p.characterTimers ? p.timersNotify : {}),
  };
  // Prefer explicit characterTimers when both present in partial.
  const synced =
    p.characterTimers !== undefined
      ? { ...nextCharacter }
      : p.timersNotify !== undefined
        ? { ...nextTimers }
        : nextCharacter;

  const partialGuilds =
    (partial as { guilds?: Record<string, unknown> }).guilds &&
    typeof (partial as { guilds?: unknown }).guilds === 'object'
      ? (partial as { guilds: Record<string, unknown> }).guilds
      : undefined;
  const mergedGuilds = {
    ...base.guilds,
    ...(partialGuilds ?? {}),
  };
  const merged = {
    ...base,
    ...(partial as Record<string, unknown>),
    timersNotify: synced,
    characterTimers: synced,
    kingdomWar: {
      ...base.kingdomWar,
      ...(p.kingdomWar ?? {}),
    },
    memberActivity: {
      ...base.memberActivity,
      ...(p.memberActivity ?? {}),
    },
    publishChannels: {
      ...base.publishChannels,
      ...(p.publishChannels ?? {}),
    },
    recurringPosts: (() => {
      const incoming = (p.recurringPosts ?? {}) as Partial<BotConfigValues['recurringPosts']> &
        Record<string, unknown>;
      return {
        ...base.recurringPosts,
        ...incoming,
        schedule: {
          ...base.recurringPosts.schedule,
          ...((incoming.schedule as object | undefined) ?? {}),
        },
        rules: {
          ...base.recurringPosts.rules,
          ...((incoming.rules as object | undefined) ?? {}),
        },
        seedReactions: Array.isArray(incoming.seedReactions)
          ? incoming.seedReactions
          : base.recurringPosts.seedReactions,
      };
    })(),
    guilds: mergedGuilds,
  };
  return validateBotConfigDraft(merged);
}

/** Accept flat Technika DTO `{ id?, name?, enabled, modules, rights }` or nested GuildConfig. */
export function normalizeGuildPayload(input: unknown, existing?: GuildConfig): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }
  const b = input as Record<string, unknown>;
  const modulesIn =
    b.modules !== null && typeof b.modules === 'object' && !Array.isArray(b.modules)
      ? (b.modules as Record<string, unknown>)
      : {};
  const baseModules = existing?.modules ?? defaultGuildModules();
  const displayName =
    typeof b.name === 'string' && b.name.trim().length > 0
      ? b.name.trim()
      : typeof b.displayName === 'string' && b.displayName.trim().length > 0
        ? b.displayName.trim()
        : existing?.displayName;
  const rights = Array.isArray(b.rights)
    ? b.rights
    : existing
      ? [...existing.rights]
      : defaultGuildConfig().rights;
  return {
    enabled: typeof b.enabled === 'boolean' ? b.enabled : (existing?.enabled ?? false),
    ...(displayName ? { displayName } : {}),
    modules: {
      characterTimers:
        typeof modulesIn.characterTimers === 'boolean'
          ? modulesIn.characterTimers
          : baseModules.characterTimers,
      kingdomWar:
        typeof modulesIn.kingdomWar === 'boolean' ? modulesIn.kingdomWar : baseModules.kingdomWar,
      panels: typeof modulesIn.panels === 'boolean' ? modulesIn.panels : baseModules.panels,
      channels: typeof modulesIn.channels === 'boolean' ? modulesIn.channels : baseModules.channels,
    },
    rights,
    ...(typeof b.notes === 'string'
      ? { notes: b.notes }
      : existing?.notes
        ? { notes: existing.notes }
        : {}),
    ...(b.publishChannels &&
    typeof b.publishChannels === 'object' &&
    !Array.isArray(b.publishChannels)
      ? { publishChannels: b.publishChannels }
      : existing?.publishChannels
        ? { publishChannels: existing.publishChannels }
        : {}),
    ...(typeof b.appWebsiteUrl === 'string'
      ? { appWebsiteUrl: b.appWebsiteUrl.trim() }
      : existing?.appWebsiteUrl
        ? { appWebsiteUrl: existing.appWebsiteUrl }
        : {}),
  };
}

export function upsertGuildInConfig(
  base: BotConfigValues,
  guildId: string,
  guild: unknown,
): ConfigValidationResult {
  if (!/^\d{17,20}$/.test(guildId)) {
    return {
      ok: false,
      config: null,
      issues: [{ path: 'guildId', message: 'guildId must be a Discord snowflake (17–20 digits).' }],
    };
  }
  const existing = base.guilds[guildId];
  const normalized = normalizeGuildPayload(guild, existing);
  const parsedGuild = GuildConfigSchema.safeParse(normalized);
  if (!parsedGuild.success) {
    return {
      ok: false,
      config: null,
      issues: parsedGuild.error.issues.map((issue) => ({
        path: `guilds.${guildId}.${issue.path.join('.') || '(root)'}`,
        message: issue.message,
      })),
    };
  }
  return validateBotConfigDraft({
    ...base,
    guilds: {
      ...base.guilds,
      [guildId]: parsedGuild.data,
    },
  });
}

export function cloneBotConfig(values: BotConfigValues): BotConfigValues {
  return structuredClone(values);
}

export { defaultBotConfigValues };
