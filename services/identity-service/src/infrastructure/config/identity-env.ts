import { z } from 'zod';

/**
 * Coerce common truthy/falsy env string spellings into a boolean. Anything
 * other than an explicit true-ish value is false.
 */
const booleanFromEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') {
        return defaultValue;
      }
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
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
  IDENTITY_AUTH_ENABLED: booleanFromEnv(false),
  IDENTITY_DATABASE_URL: optionalTrimmed,
  IDENTITY_REDIS_URL: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === undefined || trimmed === '' ? 'redis://127.0.0.1:6379/1' : trimmed;
    }),
  IDENTITY_AUTH_BASE_URL: optionalTrimmed,
  IDENTITY_AUTH_BASE_PATH: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === undefined || trimmed === '' ? '/api/auth' : trimmed;
    }),
  IDENTITY_TRUSTED_ORIGINS: csvOrigins,
  IDENTITY_BETTER_AUTH_SECRET: optionalTrimmed,
  IDENTITY_DISCORD_CLIENT_ID: optionalTrimmed,
  IDENTITY_DISCORD_CLIENT_SECRET: optionalTrimmed,
  IDENTITY_GOOGLE_CLIENT_ID: optionalTrimmed,
  IDENTITY_GOOGLE_CLIENT_SECRET: optionalTrimmed,
  IDENTITY_PROOF_UI_ENABLED: booleanFromEnv(false),
  IDENTITY_SERVICE_PORT: z.coerce.number().int().positive().default(4200),
  IDENTITY_SERVICE_HOST: z.string().min(1).default('127.0.0.1'),
  IDENTITY_COOKIE_PREFIX: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === undefined || trimmed === '' ? 'v2.identity' : trimmed;
    }),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type IdentityEnv = z.output<typeof baseSchema>;

export class IdentityConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'IdentityConfigError';
  }
}

const MIN_SECRET_LENGTH = 32;

function assertEnabledRequirements(
  config: IdentityEnv,
  addIssue: (path: string, message: string) => void,
): void {
  if (config.IDENTITY_DATABASE_URL === undefined) {
    addIssue('IDENTITY_DATABASE_URL', 'is required when IDENTITY_AUTH_ENABLED=true');
  }
  if (config.IDENTITY_AUTH_BASE_URL === undefined) {
    addIssue('IDENTITY_AUTH_BASE_URL', 'is required when IDENTITY_AUTH_ENABLED=true');
  }
  if (
    config.IDENTITY_BETTER_AUTH_SECRET === undefined ||
    config.IDENTITY_BETTER_AUTH_SECRET.length < MIN_SECRET_LENGTH
  ) {
    addIssue(
      'IDENTITY_BETTER_AUTH_SECRET',
      `must be at least ${MIN_SECRET_LENGTH} characters when IDENTITY_AUTH_ENABLED=true`,
    );
  }
  if (
    config.IDENTITY_DISCORD_CLIENT_ID === undefined ||
    config.IDENTITY_DISCORD_CLIENT_SECRET === undefined
  ) {
    addIssue('IDENTITY_DISCORD_CLIENT_ID', 'Discord client id and secret are required');
  }
  if (
    config.IDENTITY_GOOGLE_CLIENT_ID === undefined ||
    config.IDENTITY_GOOGLE_CLIENT_SECRET === undefined
  ) {
    addIssue('IDENTITY_GOOGLE_CLIENT_ID', 'Google client id and secret are required');
  }
  if (config.IDENTITY_TRUSTED_ORIGINS.length === 0) {
    addIssue('IDENTITY_TRUSTED_ORIGINS', 'at least one trusted origin is required');
  }

  if (config.NODE_ENV === 'production' && config.IDENTITY_AUTH_BASE_URL !== undefined) {
    if (!config.IDENTITY_AUTH_BASE_URL.startsWith('https://')) {
      addIssue('IDENTITY_AUTH_BASE_URL', 'must use https in production');
    }
    if (config.IDENTITY_TRUSTED_ORIGINS.some((origin) => origin === '*')) {
      addIssue('IDENTITY_TRUSTED_ORIGINS', 'wildcard origin is not allowed in production');
    }
  }
}

/**
 * Validate the identity environment. When auth is disabled the service can boot
 * for CI/health without any secrets (DATABASE_URL is optional). When auth is
 * enabled, all connection, provider, and secret requirements are enforced with
 * a fail-fast error before any HTTP listener is opened.
 *
 * The thrown message names offending keys only — never their values.
 */
export function parseIdentityEnv(env: NodeJS.ProcessEnv): IdentityEnv {
  const parsed = baseSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new IdentityConfigError(`Invalid identity configuration: ${details}`);
  }

  const config = parsed.data;

  if (config.IDENTITY_AUTH_ENABLED) {
    const issues: string[] = [];
    assertEnabledRequirements(config, (path, message) => issues.push(`${path}: ${message}`));
    if (issues.length > 0) {
      throw new IdentityConfigError(
        `Identity auth is enabled but configuration is incomplete: ${issues.join('; ')}`,
      );
    }
  }

  return config;
}

const URL_CREDENTIALS = /(\/\/[^:/@\s]+:)([^@/\s]+)(@)/g;
const SENSITIVE_ASSIGNMENT = /((?:SECRET|PASSWORD|TOKEN|CLIENT_SECRET)[A-Z_]*\s*[=:]\s*)(\S+)/gi;

/**
 * Redact secret-bearing substrings so config can be safely logged. Replaces
 * URL credentials (`user:pass@host`), sensitive `KEY=value` assignments, and
 * any explicitly supplied secret literals with `[REDACTED]`.
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
