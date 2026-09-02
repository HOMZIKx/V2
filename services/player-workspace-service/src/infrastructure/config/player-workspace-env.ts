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
        message: `must be boolean-like (got unrecognized value)`,
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
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PLAYER_WORKSPACE_DATABASE_URL: z
    .string()
    .optional()
    .transform((value, ctx) => {
      const trimmed = value?.trim();
      if (trimmed === undefined || trimmed === '') {
        ctx.addIssue({ code: 'custom', message: 'PLAYER_WORKSPACE_DATABASE_URL is required' });
        return z.NEVER;
      }
      return trimmed;
    }),
  PLAYER_WORKSPACE_SERVICE_PORT: z.coerce.number().int().positive().default(4500),
  PLAYER_WORKSPACE_SERVICE_HOST: z.string().min(1).default('127.0.0.1'),
  PLAYER_WORKSPACE_TRUST_ACTOR_HEADERS: booleanFromEnv(false),
  PLAYER_WORKSPACE_CLIENT_ASSERTION_MAX_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(60)
    .default(60),
  PLAYER_WORKSPACE_INBOUND_CLIENTS_JSON: optionalTrimmed,
  PLAYER_WORKSPACE_INBOUND_CLIENTS_B64: optionalTrimmed,
  PLAYER_WORKSPACE_ASSERTION_AUD: optionalTrimmed,
  PLAYER_WORKSPACE_REDIS_URL: optionalTrimmed,
  PLAYER_WORKSPACE_ASSERTION_JTI_REDIS_PREFIX: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === undefined || trimmed === ''
        ? 'v2:player-workspace:client-assertion:jti:'
        : trimmed;
    }),
  PLAYER_WORKSPACE_IDENTITY_BASE_URL: optionalTrimmed,
  PLAYER_WORKSPACE_IDENTITY_OWNERSHIP_ASSERTION_AUD: optionalTrimmed,
  PLAYER_WORKSPACE_TO_IDENTITY_CLIENT_ID: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === undefined || trimmed === '' ? 'v2.player-workspace-service' : trimmed;
    }),
  PLAYER_WORKSPACE_TO_IDENTITY_PRIVATE_KEY_PEM: optionalTrimmed,
  PLAYER_WORKSPACE_TO_IDENTITY_ACTIVE_KID: optionalTrimmed,
});

export type PlayerWorkspaceEnv = z.infer<typeof baseSchema> & {
  readonly inboundClientsJson: string | undefined;
};

export class PlayerWorkspaceConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PlayerWorkspaceConfigError';
  }
}

export function parsePlayerWorkspaceEnv(env: NodeJS.ProcessEnv): PlayerWorkspaceEnv {
  const parsed = baseSchema.safeParse(env);
  if (!parsed.success) {
    throw new PlayerWorkspaceConfigError(parsed.error.message);
  }
  const inboundFromB64 =
    parsed.data.PLAYER_WORKSPACE_INBOUND_CLIENTS_B64 !== undefined
      ? Buffer.from(parsed.data.PLAYER_WORKSPACE_INBOUND_CLIENTS_B64, 'base64').toString('utf8')
      : undefined;
  const inboundClientsJson = parsed.data.PLAYER_WORKSPACE_INBOUND_CLIENTS_JSON ?? inboundFromB64;
  return { ...parsed.data, inboundClientsJson };
}

export function redactSecrets(message: string, secrets: readonly (string | undefined)[]): string {
  let result = message;
  for (const secret of secrets) {
    if (secret !== undefined && secret.length > 0) {
      result = result.split(secret).join('[REDACTED]');
    }
  }
  return result;
}
