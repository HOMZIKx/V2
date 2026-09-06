import { z } from 'zod';

import {
  defaultBotConfigValues,
  type BotConfigValues,
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

export const TimersNotifySchema = z.object({
  enabled: z.boolean(),
  messageTemplate: z.string().trim().min(1).max(1800),
  reminderMinutesBefore: z.number().int().min(1).max(24 * 60),
  resetNotifyEnabled: z.boolean(),
});

export const CharacterTimersSchema = TimersNotifySchema;

export const KingdomWarSchema = z.object({
  enabled: z.boolean(),
  warAt: z
    .string()
    .trim()
    .regex(HH_MM, 'warAt must be HH:mm (Europe/Warsaw wall clock)'),
  notifyMinutesBefore: z.number().int().min(1).max(24 * 60),
  messageTemplate: z.string().trim().min(1).max(1800),
});

export const BotConfigValuesSchema = z
  .object({
    'panel-test-enabled': z.boolean(),
    'notify-timer-enabled': z.boolean(),
    timersNotify: TimersNotifySchema,
    characterTimers: CharacterTimersSchema,
    kingdomWar: KingdomWarSchema,
    'notify-timer-dm-action-buttons': z.boolean(),
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

  return { ok: true, config: parsed.data, issues: [] };
}

export function mergePartialDraft(
  base: BotConfigValues,
  partial: unknown,
): ConfigValidationResult {
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

  const merged = {
    ...base,
    ...(partial as Record<string, unknown>),
    timersNotify: synced,
    characterTimers: synced,
    kingdomWar: {
      ...base.kingdomWar,
      ...(p.kingdomWar ?? {}),
    },
  };
  return validateBotConfigDraft(merged);
}

export function cloneBotConfig(values: BotConfigValues): BotConfigValues {
  return structuredClone(values);
}

export { defaultBotConfigValues };
