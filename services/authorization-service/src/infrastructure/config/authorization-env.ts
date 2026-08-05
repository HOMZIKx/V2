import { z } from 'zod';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

/**
 * Parse an env boolean strictly. Empty/missing → default. Recognized true/false
 * spellings map accordingly. Any other present value fails validation so a typo
 * cannot silently disable authorization (e.g. `AUTHORIZATION_ENABLED=ture`).
 */
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

const optionalUuid = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const trimmed = value?.trim();
    if (trimmed === undefined || trimmed === '') {
      return undefined;
    }
    const parsed = z.string().uuid().safeParse(trimmed);
    if (!parsed.success) {
      ctx.addIssue({
        code: 'custom',
        message: 'must be a valid UUID when set',
      });
      return z.NEVER;
    }
    return parsed.data;
  });

const baseSchema = z.object({
  AUTHORIZATION_DATABASE_URL: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const trimmed = value?.trim();
      if (trimmed === undefined || trimmed === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'AUTHORIZATION_DATABASE_URL is required',
        });
        return z.NEVER;
      }
      return trimmed;
    }),
  AUTHORIZATION_SERVICE_PORT: z.coerce.number().int().positive().default(4300),
  AUTHORIZATION_SERVICE_HOST: z.string().min(1).default('127.0.0.1'),
  AUTHORIZATION_BOOTSTRAP_DISCORD_USER_ID: optionalTrimmed,
  AUTHORIZATION_TRUST_WINDOW_SECONDS: z.coerce.number().int().positive().default(120),
  AUTHORIZATION_ENABLED: booleanFromEnv(false),
  AUTHORIZATION_INBOUND_CLIENTS_JSON: optionalTrimmed,
  AUTHORIZATION_SYSTEM_CLIENT_ID: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === undefined || trimmed === '' ? 'v2.authorization-service' : trimmed;
    }),
  AUTHORIZATION_SYSTEM_ACTIVE_KID: optionalTrimmed,
  AUTHORIZATION_SYSTEM_PRIVATE_KEY_PEM: optionalTrimmed,
  AUTHORIZATION_IDENTITY_BASE_URL: optionalTrimmed,
  AUTHORIZATION_IDENTITY_REVOKE_URL: optionalTrimmed,
  AUTHORIZATION_IDENTITY_ASSERTION_MAX_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(60)
    .default(60),
  AUTHORIZATION_ASSERTION_REDIS_URL: optionalTrimmed,
  AUTHORIZATION_ASSERTION_REDIS_PREFIX: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === undefined || trimmed === ''
        ? 'v2:authorization:client-assertion:jti:'
        : trimmed;
    }),
  /**
   * Fixed UUID for the single-organization seed. When unset, the service
   * generates and persists an organization id on first boot.
   */
  AUTHORIZATION_ORGANIZATION_ID: optionalUuid,
  /**
   * Expected `aud` for inbound client assertions. When unset, guards use the
   * full request URL (protocol + host + path) as the audience.
   */
  AUTHORIZATION_ASSERTION_AUD: optionalTrimmed,
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type AuthorizationEnv = z.output<typeof baseSchema>;

export class AuthorizationConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AuthorizationConfigError';
  }
}

function assertEnabledRequirements(
  config: AuthorizationEnv,
  addIssue: (path: string, message: string) => void,
): void {
  if (config.AUTHORIZATION_INBOUND_CLIENTS_JSON === undefined) {
    addIssue(
      'AUTHORIZATION_INBOUND_CLIENTS_JSON',
      'is required when AUTHORIZATION_ENABLED=true',
    );
  }

  if (config.AUTHORIZATION_SYSTEM_ACTIVE_KID === undefined) {
    addIssue(
      'AUTHORIZATION_SYSTEM_ACTIVE_KID',
      'is required when AUTHORIZATION_ENABLED=true',
    );
  }

  if (config.AUTHORIZATION_SYSTEM_PRIVATE_KEY_PEM === undefined) {
    addIssue(
      'AUTHORIZATION_SYSTEM_PRIVATE_KEY_PEM',
      'is required when AUTHORIZATION_ENABLED=true (outbound revoke signing)',
    );
  }

  if (config.AUTHORIZATION_IDENTITY_BASE_URL === undefined) {
    addIssue(
      'AUTHORIZATION_IDENTITY_BASE_URL',
      'is required when AUTHORIZATION_ENABLED=true',
    );
  }

  if (config.AUTHORIZATION_IDENTITY_REVOKE_URL === undefined) {
    addIssue(
      'AUTHORIZATION_IDENTITY_REVOKE_URL',
      'is required when AUTHORIZATION_ENABLED=true (exact aud for outbound assertions)',
    );
  }
}

/**
 * Validate the authorization environment. DATABASE_URL is always required.
 * When AUTHORIZATION_ENABLED=true, inbound client trust and outbound revoke
 * signing/config must also be present. Thrown messages name keys only —
 * never secret values.
 */
export function parseAuthorizationEnv(env: NodeJS.ProcessEnv): AuthorizationEnv {
  const parsed = baseSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new AuthorizationConfigError(`Invalid authorization configuration: ${details}`);
  }

  const config = parsed.data;

  if (config.AUTHORIZATION_ENABLED) {
    const issues: string[] = [];
    assertEnabledRequirements(config, (path, message) => issues.push(`${path}: ${message}`));
    if (issues.length > 0) {
      throw new AuthorizationConfigError(
        `Authorization is enabled but configuration is incomplete: ${issues.join('; ')}`,
      );
    }
  }

  return config;
}

const URL_CREDENTIALS = /(\/\/[^:/@\s]+:)([^@/\s]+)(@)/g;
const SENSITIVE_ASSIGNMENT =
  /((?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|CLIENT_SECRET)[A-Z_]*\s*[=:]\s*)(\S+)/gi;

/**
 * Redact secret-bearing substrings so config can be safely logged.
 */
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
