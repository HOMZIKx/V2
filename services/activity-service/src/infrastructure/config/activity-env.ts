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
      if (TRUE_VALUES.has(normalized)) {
        return true;
      }
      if (FALSE_VALUES.has(normalized)) {
        return false;
      }
      ctx.addIssue({
        code: 'custom',
        message: `must be one of ${[...TRUE_VALUES, ...FALSE_VALUES].join('|')} (got an unrecognized value)`,
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

const baseSchema = z.object({
  ACTIVITY_DATABASE_URL: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const trimmed = value?.trim();
      if (trimmed === undefined || trimmed === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'ACTIVITY_DATABASE_URL is required',
        });
        return z.NEVER;
      }
      return trimmed;
    }),
  ACTIVITY_SERVICE_PORT: z.coerce.number().int().positive().default(4400),
  ACTIVITY_SERVICE_HOST: z.string().min(1).default('127.0.0.1'),
  ACTIVITY_ENABLED: booleanFromEnv(false),
  ACTIVITY_OUTBOX_WORKER_ENABLED: booleanFromEnv(false),
  ACTIVITY_AUTHORIZATION_BASE_URL: optionalTrimmed,
  ACTIVITY_AUTHORIZATION_ASSERTION_AUD: optionalTrimmed,
  ACTIVITY_TO_AUTHZ_CLIENT_ID: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === undefined || trimmed === '' ? 'v2.activity-service' : trimmed;
    }),
  ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM: optionalTrimmed,
  ACTIVITY_TO_AUTHZ_ACTIVE_KID: optionalTrimmed,
  ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: z.coerce.number().int().positive().max(60).default(60),
  ACTIVITY_INBOUND_CLIENTS_JSON: optionalTrimmed,
  /** Zeabur-friendly alternative when JSON commas break CLI `-k` flags. */
  ACTIVITY_INBOUND_CLIENTS_B64: optionalTrimmed,
  ACTIVITY_ASSERTION_AUD: optionalTrimmed,
  ACTIVITY_DISCORD_PROJECTION_BASE_URL: optionalTrimmed,
  /** Optional override for Discord Gateway base (channel validate). Falls back to projection URL. */
  ACTIVITY_DISCORD_GATEWAY_BASE_URL: optionalTrimmed,
  /** Shared secret for Discord Gateway internal activity routes (optional; headers mode otherwise). */
  ACTIVITY_PROJECTION_SHARED_SECRET: optionalTrimmed,
  ACTIVITY_TO_DISCORD_CLIENT_ID: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === undefined || trimmed === '' ? 'v2.activity-service' : trimmed;
    }),
  ACTIVITY_TO_DISCORD_PRIVATE_KEY_PEM: optionalTrimmed,
  ACTIVITY_TO_DISCORD_ACTIVE_KID: optionalTrimmed,
  ACTIVITY_DISCORD_ASSERTION_AUD: optionalTrimmed,
  ACTIVITY_ALLOW_TEST_SEED: booleanFromEnv(false),
  /** DEV-ONLY: trust x-actor-* headers when ACTIVITY_ENABLED=false. Never in production. */
  ACTIVITY_TRUST_ACTOR_HEADERS: booleanFromEnv(false),
  ACTIVITY_REDIS_URL: optionalTrimmed,
  ACTIVITY_ASSERTION_JTI_REDIS_PREFIX: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === undefined || trimmed === ''
        ? 'v2:activity:client-assertion:jti:'
        : trimmed;
    }),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ActivityEnv = z.output<typeof baseSchema>;

export class ActivityConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ActivityConfigError';
  }
}

function assertEnabledRequirements(
  config: ActivityEnv,
  addIssue: (path: string, message: string) => void,
): void {
  if (config.ACTIVITY_AUTHORIZATION_BASE_URL === undefined) {
    addIssue('ACTIVITY_AUTHORIZATION_BASE_URL', 'is required when ACTIVITY_ENABLED=true');
  }
  if (config.ACTIVITY_AUTHORIZATION_ASSERTION_AUD === undefined) {
    addIssue('ACTIVITY_AUTHORIZATION_ASSERTION_AUD', 'is required when ACTIVITY_ENABLED=true');
  }
  if (config.ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM === undefined) {
    addIssue('ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM', 'is required when ACTIVITY_ENABLED=true');
  }
  if (config.ACTIVITY_TO_AUTHZ_ACTIVE_KID === undefined) {
    addIssue('ACTIVITY_TO_AUTHZ_ACTIVE_KID', 'is required when ACTIVITY_ENABLED=true');
  }
  if (config.ACTIVITY_INBOUND_CLIENTS_JSON === undefined) {
    addIssue('ACTIVITY_INBOUND_CLIENTS_JSON', 'is required when ACTIVITY_ENABLED=true');
  }
  if (config.ACTIVITY_REDIS_URL === undefined) {
    addIssue('ACTIVITY_REDIS_URL', 'is required when ACTIVITY_ENABLED=true');
  }
}

function assertOutboxWorkerRequirements(
  config: ActivityEnv,
  addIssue: (path: string, message: string) => void,
): void {
  if (config.ACTIVITY_DISCORD_PROJECTION_BASE_URL === undefined) {
    addIssue(
      'ACTIVITY_DISCORD_PROJECTION_BASE_URL',
      'is required when ACTIVITY_OUTBOX_WORKER_ENABLED=true',
    );
  }
  if (config.ACTIVITY_PROJECTION_SHARED_SECRET === undefined) {
    addIssue(
      'ACTIVITY_PROJECTION_SHARED_SECRET',
      'is required when ACTIVITY_OUTBOX_WORKER_ENABLED=true (x-activity-projection-secret contract)',
    );
  }
  if (config.ACTIVITY_ENABLED) {
    if (config.ACTIVITY_TO_DISCORD_PRIVATE_KEY_PEM === undefined) {
      addIssue(
        'ACTIVITY_TO_DISCORD_PRIVATE_KEY_PEM',
        'is required when ACTIVITY_OUTBOX_WORKER_ENABLED=true and ACTIVITY_ENABLED=true',
      );
    }
    if (config.ACTIVITY_TO_DISCORD_ACTIVE_KID === undefined) {
      addIssue(
        'ACTIVITY_TO_DISCORD_ACTIVE_KID',
        'is required when ACTIVITY_OUTBOX_WORKER_ENABLED=true and ACTIVITY_ENABLED=true',
      );
    }
    if (config.ACTIVITY_DISCORD_ASSERTION_AUD === undefined) {
      addIssue(
        'ACTIVITY_DISCORD_ASSERTION_AUD',
        'is required when ACTIVITY_OUTBOX_WORKER_ENABLED=true and ACTIVITY_ENABLED=true',
      );
    }
  }
}

export function parseActivityEnv(env: NodeJS.ProcessEnv): ActivityEnv {
  const parsed = baseSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ActivityConfigError(`Invalid activity configuration: ${details}`);
  }

  const config = parsed.data;
  if (config.ACTIVITY_ENABLED) {
    const issues: string[] = [];
    assertEnabledRequirements(config, (path, message) => issues.push(`${path}: ${message}`));
    if (issues.length > 0) {
      throw new ActivityConfigError(
        `Activity is enabled but configuration is incomplete: ${issues.join('; ')}`,
      );
    }
  }
  if (config.ACTIVITY_OUTBOX_WORKER_ENABLED) {
    const issues: string[] = [];
    assertOutboxWorkerRequirements(config, (path, message) => issues.push(`${path}: ${message}`));
    if (issues.length > 0) {
      throw new ActivityConfigError(
        `Outbox worker is enabled but configuration is incomplete: ${issues.join('; ')}`,
      );
    }
  }

  if (config.NODE_ENV === 'production' && config.ACTIVITY_TRUST_ACTOR_HEADERS) {
    throw new ActivityConfigError('ACTIVITY_TRUST_ACTOR_HEADERS cannot be enabled in production');
  }

  return config;
}

const URL_CREDENTIALS = /(\/\/[^:/@\s]+:)([^@/\s]+)(@)/g;
const SENSITIVE_ASSIGNMENT =
  /((?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|CLIENT_SECRET)[A-Z_]*\s*[=:]\s*)(\S+)/gi;

export function redactSecrets(text: string, secrets: readonly (string | undefined)[] = []): string {
  let output = text.replace(URL_CREDENTIALS, '$1[REDACTED]$3');
  output = output.replace(SENSITIVE_ASSIGNMENT, '$1[REDACTED]');
  for (const secret of secrets) {
    if (secret !== undefined && secret.length >= 4) {
      output = output.split(secret).join('[REDACTED]');
    }
  }
  return output;
}
