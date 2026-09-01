import { z } from 'zod';

const snowflakeSchema = z.string().regex(/^\d{17,20}$/, 'Must be a Discord snowflake');

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  throw new Error(`Expected boolean, received ${typeof value === 'string' ? value : typeof value}`);
}

export function parseOperatorIds(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim().length === 0) {
    return [];
  }

  const ids = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const unique = [...new Set(ids)];
  for (const id of unique) {
    snowflakeSchema.parse(id);
  }
  return unique;
}

export const DiscordGatewayConfigSchema = z
  .object({
    DISCORD_GATEWAY_PORT: z.coerce.number().int().positive().default(4100),
    DISCORD_GATEWAY_HOST: z.string().min(1).default('127.0.0.1'),
    DISCORD_ENABLED: z.preprocess((value) => parseBoolean(value, false), z.boolean()),
    DISCORD_APPLICATION_ID: z.string().optional().default(''),
    DISCORD_TOKEN: z.string().optional().default(''),
    DISCORD_TEST_GUILD_ID: z.string().optional().default(''),
    DISCORD_TEST_OPERATOR_IDS: z.string().optional().default(''),
    DISCORD_COMPONENT_SIGNING_SECRET: z.string().optional().default(''),
    DISCORD_AUTO_REGISTER_GUILD_COMMANDS: z.preprocess(
      (value) => parseBoolean(value, false),
      z.boolean(),
    ),
    DISCORD_STRICT_GUILD_ISOLATION: z.preprocess((value) => parseBoolean(value, true), z.boolean()),
    DISCORD_STARTUP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    DISCORD_TEST_CHANNEL_ID: z.string().optional().default(''),
    DISCORD_AUTHORIZATION_SYNC_ENABLED: z.preprocess(
      (value) => parseBoolean(value, false),
      z.boolean(),
    ),
    AUTHORIZATION_BASE_URL: z.string().optional(),
    DISCORD_TO_AUTHZ_CLIENT_ID: z.string().min(1).default('v2.discord-gateway'),
    DISCORD_TO_AUTHZ_PRIVATE_KEY_PEM: z.string().optional(),
    DISCORD_TO_AUTHZ_ACTIVE_KID: z.string().optional(),
    AUTHORIZATION_ASSERTION_AUD: z.string().optional(),
    DISCORD_CLIENT_ASSERTION_MAX_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(60)
      .default(60),
    DISCORD_ACTIVITY_ENABLED: z.preprocess((value) => parseBoolean(value, false), z.boolean()),
    DISCORD_AUTO_RECONCILE_HUB_ON_STARTUP: z.preprocess(
      (value) => parseBoolean(value, true),
      z.boolean(),
    ),
    /** Extra guild IDs allowed for multi-guild projections (comma-separated). Home = DISCORD_TEST_GUILD_ID. */
    DISCORD_ACTIVITY_ALLOWED_GUILD_IDS: z.string().optional().default(''),
    /** When set, discord-gateway consumes Activity projection envelopes from RabbitMQ. */
    DISCORD_ACTIVITY_RABBITMQ_URL: z.string().optional().default(''),
    ACTIVITY_SERVICE_BASE_URL: z.string().optional().default('http://127.0.0.1:4400'),
    ACTIVITY_CLIENT_MODE: z.enum(['headers', 'assertion']).optional().default('headers'),
    ACTIVITY_ORGANIZATION_ID: z.string().optional().default(''),
    /** Mirrors activity-service ACTIVITY_ENABLED for local projection guard path. */
    ACTIVITY_ENABLED: z.preprocess((value) => parseBoolean(value, false), z.boolean()),
    /** Mirrors activity-service ACTIVITY_ALLOW_TEST_SEED for /centrum-seed. */
    ACTIVITY_ALLOW_TEST_SEED: z.preprocess((value) => parseBoolean(value, false), z.boolean()),
    NODE_ENV: z.enum(['development', 'test', 'production']).optional().default('development'),
    ACTIVITY_PROJECTION_SHARED_SECRET: z.string().optional().default(''),
    DISCORD_TO_ACTIVITY_CLIENT_ID: z.string().optional().default('v2.discord-gateway'),
    DISCORD_TO_ACTIVITY_PRIVATE_KEY_PEM: z.string().optional(),
    DISCORD_TO_ACTIVITY_ACTIVE_KID: z.string().optional(),
    ACTIVITY_ASSERTION_AUD: z.string().optional(),
    IDENTITY_SERVICE_BASE_URL: z.string().optional().default('http://127.0.0.1:4200'),
    DISCORD_TO_IDENTITY_CLIENT_ID: z.string().optional().default('v2.discord-gateway'),
    DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM: z.string().optional(),
    DISCORD_TO_IDENTITY_ACTIVE_KID: z.string().optional(),
    IDENTITY_ASSERTION_AUD: z.string().optional(),
    APP_VERSION: z.string().optional().default('0.0.0-dev'),
    GIT_COMMIT_SHA: z.string().optional().default('unknown'),
  })
  .superRefine((config, ctx) => {
    if (config.DISCORD_ACTIVITY_ENABLED) {
      try {
        new URL(config.ACTIVITY_SERVICE_BASE_URL);
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['ACTIVITY_SERVICE_BASE_URL'],
          message:
            'ACTIVITY_SERVICE_BASE_URL must be a valid URL when Discord activity is enabled.',
        });
      }
      if (config.ACTIVITY_ORGANIZATION_ID.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['ACTIVITY_ORGANIZATION_ID'],
          message: 'ACTIVITY_ORGANIZATION_ID is required when Discord activity is enabled.',
        });
      }
      if (config.ACTIVITY_PROJECTION_SHARED_SECRET.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['ACTIVITY_PROJECTION_SHARED_SECRET'],
          message:
            'ACTIVITY_PROJECTION_SHARED_SECRET is required when Discord activity is enabled.',
        });
      }
      if (config.ACTIVITY_CLIENT_MODE === 'assertion') {
        const pem = config.DISCORD_TO_ACTIVITY_PRIVATE_KEY_PEM ?? '';
        if (!pem.includes('BEGIN PRIVATE KEY')) {
          ctx.addIssue({
            code: 'custom',
            path: ['DISCORD_TO_ACTIVITY_PRIVATE_KEY_PEM'],
            message:
              'DISCORD_TO_ACTIVITY_PRIVATE_KEY_PEM is required when ACTIVITY_CLIENT_MODE=assertion.',
          });
        }
        if (
          config.DISCORD_TO_ACTIVITY_ACTIVE_KID === undefined ||
          config.DISCORD_TO_ACTIVITY_ACTIVE_KID.trim().length === 0
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['DISCORD_TO_ACTIVITY_ACTIVE_KID'],
            message:
              'DISCORD_TO_ACTIVITY_ACTIVE_KID is required when ACTIVITY_CLIENT_MODE=assertion.',
          });
        }
        if (
          config.ACTIVITY_ASSERTION_AUD === undefined ||
          config.ACTIVITY_ASSERTION_AUD.trim().length === 0
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['ACTIVITY_ASSERTION_AUD'],
            message: 'ACTIVITY_ASSERTION_AUD is required when ACTIVITY_CLIENT_MODE=assertion.',
          });
        }
        const identityPem = config.DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM ?? '';
        if (!identityPem.includes('BEGIN PRIVATE KEY')) {
          ctx.addIssue({
            code: 'custom',
            path: ['DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM'],
            message:
              'DISCORD_TO_IDENTITY_PRIVATE_KEY_PEM is required when ACTIVITY_CLIENT_MODE=assertion.',
          });
        }
        if (
          config.DISCORD_TO_IDENTITY_ACTIVE_KID === undefined ||
          config.DISCORD_TO_IDENTITY_ACTIVE_KID.trim().length === 0
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['DISCORD_TO_IDENTITY_ACTIVE_KID'],
            message:
              'DISCORD_TO_IDENTITY_ACTIVE_KID is required when ACTIVITY_CLIENT_MODE=assertion.',
          });
        }
        if (
          config.IDENTITY_ASSERTION_AUD === undefined ||
          config.IDENTITY_ASSERTION_AUD.trim().length === 0
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['IDENTITY_ASSERTION_AUD'],
            message: 'IDENTITY_ASSERTION_AUD is required when ACTIVITY_CLIENT_MODE=assertion.',
          });
        }
      }
    }

    if (config.DISCORD_AUTHORIZATION_SYNC_ENABLED) {
      if (
        config.AUTHORIZATION_BASE_URL === undefined ||
        config.AUTHORIZATION_BASE_URL.trim().length === 0
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['AUTHORIZATION_BASE_URL'],
          message: 'AUTHORIZATION_BASE_URL is required when Discord Authorization sync is enabled.',
        });
      } else {
        try {
          new URL(config.AUTHORIZATION_BASE_URL);
        } catch {
          ctx.addIssue({
            code: 'custom',
            path: ['AUTHORIZATION_BASE_URL'],
            message: 'AUTHORIZATION_BASE_URL must be a valid URL.',
          });
        }
      }

      const pem = config.DISCORD_TO_AUTHZ_PRIVATE_KEY_PEM ?? '';
      if (!pem.includes('BEGIN PRIVATE KEY')) {
        ctx.addIssue({
          code: 'custom',
          path: ['DISCORD_TO_AUTHZ_PRIVATE_KEY_PEM'],
          message:
            'DISCORD_TO_AUTHZ_PRIVATE_KEY_PEM (PKCS8) is required when Discord Authorization sync is enabled.',
        });
      }

      if (
        config.DISCORD_TO_AUTHZ_ACTIVE_KID === undefined ||
        config.DISCORD_TO_AUTHZ_ACTIVE_KID.trim().length === 0
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['DISCORD_TO_AUTHZ_ACTIVE_KID'],
          message:
            'DISCORD_TO_AUTHZ_ACTIVE_KID is required when Discord Authorization sync is enabled.',
        });
      }
    }

    if (!config.DISCORD_ENABLED) {
      return;
    }

    if (!snowflakeSchema.safeParse(config.DISCORD_APPLICATION_ID).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['DISCORD_APPLICATION_ID'],
        message: 'Required Discord application snowflake when Discord is enabled.',
      });
    }

    if (config.DISCORD_TOKEN.trim().length < 20) {
      ctx.addIssue({
        code: 'custom',
        path: ['DISCORD_TOKEN'],
        message: 'DISCORD_TOKEN is required when Discord is enabled.',
      });
    }

    if (!snowflakeSchema.safeParse(config.DISCORD_TEST_GUILD_ID).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['DISCORD_TEST_GUILD_ID'],
        message: 'DISCORD_TEST_GUILD_ID must be a valid snowflake when Discord is enabled.',
      });
    }

    try {
      const operators = parseOperatorIds(config.DISCORD_TEST_OPERATOR_IDS);
      if (operators.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['DISCORD_TEST_OPERATOR_IDS'],
          message: 'At least one operator snowflake is required when Discord is enabled.',
        });
      }
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['DISCORD_TEST_OPERATOR_IDS'],
        message: 'DISCORD_TEST_OPERATOR_IDS must be a comma-separated list of snowflakes.',
      });
    }

    const secret = Buffer.from(config.DISCORD_COMPONENT_SIGNING_SECRET, 'utf8');
    if (secret.byteLength < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['DISCORD_COMPONENT_SIGNING_SECRET'],
        message: 'DISCORD_COMPONENT_SIGNING_SECRET must contain at least 32 bytes of entropy.',
      });
    }
  });

export type DiscordGatewayConfigInput = z.input<typeof DiscordGatewayConfigSchema>;
export type DiscordGatewayConfig = z.output<typeof DiscordGatewayConfigSchema> & {
  operatorIds: string[];
  activityAllowedGuildIds: string[];
};

export function normalizeDiscordConfig(
  parsed: z.output<typeof DiscordGatewayConfigSchema>,
): DiscordGatewayConfig {
  const privateKeyPem =
    parsed.DISCORD_TO_ACTIVITY_PRIVATE_KEY_PEM !== undefined
      ? parsed.DISCORD_TO_ACTIVITY_PRIVATE_KEY_PEM.replace(/\\n/g, '\n')
      : undefined;
  const activityAllowedGuildIds = parseAllowedGuildIds(
    parsed.DISCORD_TEST_GUILD_ID,
    parsed.DISCORD_ACTIVITY_ALLOWED_GUILD_IDS,
  );
  return {
    ...parsed,
    ...(privateKeyPem !== undefined ? { DISCORD_TO_ACTIVITY_PRIVATE_KEY_PEM: privateKeyPem } : {}),
    operatorIds: parseOperatorIds(parsed.DISCORD_TEST_OPERATOR_IDS),
    activityAllowedGuildIds,
  };
}

function parseAllowedGuildIds(homeGuildId: string, extraCsv: string): string[] {
  const ids = new Set<string>();
  if (homeGuildId.trim().length > 0) {
    ids.add(homeGuildId.trim());
  }
  for (const part of extraCsv.split(',')) {
    const id = part.trim();
    if (id.length > 0) {
      ids.add(id);
    }
  }
  return [...ids];
}
