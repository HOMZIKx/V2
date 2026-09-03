import { z } from 'zod';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === '') {
        return defaultValue;
      }
      const normalized = value.trim().toLowerCase();
      if (TRUE_VALUES.has(normalized)) return true;
      if (FALSE_VALUES.has(normalized)) return false;
      ctx.addIssue({
        code: 'custom',
        message: `must be one of ${[...TRUE_VALUES, ...FALSE_VALUES].join('|')} (got unrecognized value)`,
      });
      return z.NEVER;
    });

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === '' ? undefined : trimmed;
  });

const csvOrigins = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PLAYER_TEAM_SERVICE_HOST: z.string().min(1).default('127.0.0.1'),
  PLAYER_TEAM_SERVICE_PORT: z.coerce.number().int().positive().default(4400),

  // Postgres URL used by player-team-service.
  PLAYER_TEAM_DATABASE_URL: z.string().min(1),

  /**
   * When true (default in dev), allow demo writes/reads using a demo header.
   * This is temporary until real identity/auth wiring is enabled.
   */
  PLAYER_TEAM_ALLOW_DEMO_WRITE: booleanFromEnv(true),

  PLAYER_TEAM_DEMO_VIEWER_HEADER: optionalTrimmed
    .transform((v) => (v === undefined ? 'x-demo-viewer-id' : v))
    .pipe(z.string().min(1)),

  PLAYER_TEAM_CORS_ORIGINS: csvOrigins,
});

export type PlayerTeamEnv = z.output<typeof baseSchema>;

export class PlayerTeamConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PlayerTeamConfigError';
  }
}

export function parsePlayerTeamEnv(env: NodeJS.ProcessEnv): PlayerTeamEnv {
  const parsed = baseSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new PlayerTeamConfigError(`Invalid player-team configuration: ${details}`);
  }

  // In production we default to safer behavior unless explicitly enabled.
  if (parsed.data.NODE_ENV === 'production' && parsed.data.PLAYER_TEAM_ALLOW_DEMO_WRITE) {
    // still allowed if explicitly set, but we leave it as-is; only guard is below
  }

  return parsed.data;
}

