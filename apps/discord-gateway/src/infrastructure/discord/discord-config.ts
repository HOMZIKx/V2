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
    DISCORD_TEST_GUILD_ID: z.string().optional().default('1534228693017432124'),
    DISCORD_TEST_OPERATOR_IDS: z.string().optional().default(''),
    DISCORD_COMPONENT_SIGNING_SECRET: z.string().optional().default(''),
    DISCORD_AUTO_REGISTER_GUILD_COMMANDS: z.preprocess(
      (value) => parseBoolean(value, false),
      z.boolean(),
    ),
    DISCORD_STRICT_GUILD_ISOLATION: z.preprocess((value) => parseBoolean(value, true), z.boolean()),
    DISCORD_STARTUP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    DISCORD_TEST_CHANNEL_ID: z.string().optional().default(''),
    APP_VERSION: z.string().optional().default('0.0.0-dev'),
    GIT_COMMIT_SHA: z.string().optional().default('unknown'),
  })
  .superRefine((config, ctx) => {
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
};

export function normalizeDiscordConfig(
  parsed: z.output<typeof DiscordGatewayConfigSchema>,
): DiscordGatewayConfig {
  return {
    ...parsed,
    operatorIds: parseOperatorIds(parsed.DISCORD_TEST_OPERATOR_IDS),
  };
}
