import { z } from 'zod';

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') {
        return defaultValue;
      }
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }
      return defaultValue;
    });

const optionalTrimmed = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === '' ? undefined : trimmed;
  });

const schema = z.object({
  INTERNAL_JWT_CLIENT_ENABLED: booleanFromEnv(false),
  INTERNAL_JWT_CLIENT_ID: optionalTrimmed,
  INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM: optionalTrimmed,
  INTERNAL_JWT_CLIENT_ACTIVE_KID: optionalTrimmed,
  INTERNAL_JWT_ASSERTION_AUD: optionalTrimmed,
  INTERNAL_JWT_IDENTITY_BASE_URL: optionalTrimmed,
  INTERNAL_JWT_JWKS_URL: optionalTrimmed,
  INTERNAL_JWT_ISSUER: optionalTrimmed,
  INTERNAL_JWT_DEFAULT_AUDIENCE: optionalTrimmed,
});

export type InternalJwtClientEnv = z.output<typeof schema>;

export class InternalJwtClientConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InternalJwtClientConfigError';
  }
}

export function parseInternalJwtClientEnv(env: NodeJS.ProcessEnv): InternalJwtClientEnv {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new InternalJwtClientConfigError('Invalid internal JWT client configuration');
  }

  const config = parsed.data;
  if (!config.INTERNAL_JWT_CLIENT_ENABLED) {
    return config;
  }

  const required: Array<[keyof InternalJwtClientEnv, string | undefined]> = [
    ['INTERNAL_JWT_CLIENT_ID', config.INTERNAL_JWT_CLIENT_ID],
    ['INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM', config.INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM],
    ['INTERNAL_JWT_CLIENT_ACTIVE_KID', config.INTERNAL_JWT_CLIENT_ACTIVE_KID],
    ['INTERNAL_JWT_ASSERTION_AUD', config.INTERNAL_JWT_ASSERTION_AUD],
    ['INTERNAL_JWT_IDENTITY_BASE_URL', config.INTERNAL_JWT_IDENTITY_BASE_URL],
    ['INTERNAL_JWT_JWKS_URL', config.INTERNAL_JWT_JWKS_URL],
    ['INTERNAL_JWT_ISSUER', config.INTERNAL_JWT_ISSUER],
    ['INTERNAL_JWT_DEFAULT_AUDIENCE', config.INTERNAL_JWT_DEFAULT_AUDIENCE],
  ];

  const missing = required.filter(([, value]) => value === undefined).map(([key]) => key);
  if (missing.length > 0) {
    throw new InternalJwtClientConfigError(
      `Internal JWT client is enabled but missing: ${missing.join(', ')}`,
    );
  }

  return config;
}
