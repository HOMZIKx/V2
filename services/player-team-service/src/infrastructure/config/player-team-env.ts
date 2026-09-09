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
   * Legacy compatibility path. Keep enabled only while the web proxy is not yet
   * configured to mint Identity internal JWTs. The header is never trusted when
   * PLAYER_TEAM_INTERNAL_JWT_ENABLED=true.
   */
  PLAYER_TEAM_ALLOW_DEMO_WRITE: booleanFromEnv(true),

  PLAYER_TEAM_DEMO_VIEWER_HEADER: optionalTrimmed
    .transform((v) => (v === undefined ? 'x-demo-viewer-id' : v))
    .pipe(z.string().min(1)),

  /**
   * Preferred production auth: Identity-issued internal JWT from the trusted
   * server-side gateway/web proxy. Discord id remains the persistence key for
   * backward compatibility and is accepted only alongside a verified JWT.
   */
  PLAYER_TEAM_INTERNAL_JWT_ENABLED: booleanFromEnv(false),
  PLAYER_TEAM_INTERNAL_JWT_ISSUER: optionalTrimmed,
  PLAYER_TEAM_INTERNAL_JWT_AUDIENCE: optionalTrimmed
    .transform((v) => (v === undefined ? 'v2.api-gateway' : v))
    .pipe(z.string().min(1)),
  PLAYER_TEAM_INTERNAL_JWT_JWKS_URL: optionalTrimmed,
  PLAYER_TEAM_AUTHENTICATED_DISCORD_HEADER: optionalTrimmed
    .transform((v) => (v === undefined ? 'x-authenticated-discord-id' : v))
    .pipe(z.string().min(1)),

  /**
   * Read-only service credential for Discord gateway background jobs. It never
   * enables browser/demo writes and is only accepted by the internal Discord
   * workspace snapshot endpoint.
   */
  PLAYER_TEAM_DISCORD_GATEWAY_SHARED_SECRET: optionalTrimmed,

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

  const config = parsed.data;
  if (config.PLAYER_TEAM_INTERNAL_JWT_ENABLED) {
    const missing: string[] = [];
    if (config.PLAYER_TEAM_INTERNAL_JWT_ISSUER === undefined) {
      missing.push('PLAYER_TEAM_INTERNAL_JWT_ISSUER');
    }
    if (config.PLAYER_TEAM_INTERNAL_JWT_JWKS_URL === undefined) {
      missing.push('PLAYER_TEAM_INTERNAL_JWT_JWKS_URL');
    }
    if (missing.length > 0) {
      throw new PlayerTeamConfigError(
        `Player-team internal JWT is enabled but missing: ${missing.join(', ')}`,
      );
    }
  }

  return config;
}
