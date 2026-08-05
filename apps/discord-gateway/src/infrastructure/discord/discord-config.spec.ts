import { afterEach, describe, expect, it } from 'vitest';

import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
  parseOperatorIds,
} from './discord-config.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function enabledEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    DISCORD_ENABLED: 'true',
    DISCORD_APPLICATION_ID: '100000000000000001',
    DISCORD_TOKEN: 'discord-test-token-value-1234567890',
    DISCORD_TEST_GUILD_ID: '1534228693017432124',
    DISCORD_TEST_OPERATOR_IDS: '111111111111111111,222222222222222222',
    DISCORD_COMPONENT_SIGNING_SECRET: 'x'.repeat(32),
    ...overrides,
  };
}

describe('discord config', () => {
  it('allows disabled mode without secrets', () => {
    const parsed = DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'false',
    });
    expect(parsed.DISCORD_ENABLED).toBe(false);
    expect(normalizeDiscordConfig(parsed).operatorIds).toEqual([]);
  });

  it('requires secrets when enabled', () => {
    const result = DiscordGatewayConfigSchema.safeParse({
      DISCORD_ENABLED: 'true',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid enabled configuration', () => {
    const parsed = DiscordGatewayConfigSchema.parse(enabledEnv());
    const normalized = normalizeDiscordConfig(parsed);
    expect(normalized.DISCORD_TEST_GUILD_ID).toBe('1534228693017432124');
    expect(normalized.operatorIds).toEqual(['111111111111111111', '222222222222222222']);
  });

  it('deduplicates operator ids', () => {
    expect(parseOperatorIds('111111111111111111,111111111111111111, 222222222222222222')).toEqual([
      '111111111111111111',
      '222222222222222222',
    ]);
  });

  it('rejects invalid operator snowflakes', () => {
    expect(() => parseOperatorIds('not-a-snowflake')).toThrow();
  });

  it('requires signing secret entropy when enabled', () => {
    const result = DiscordGatewayConfigSchema.safeParse(
      enabledEnv({ DISCORD_COMPONENT_SIGNING_SECRET: 'too-short' }),
    );
    expect(result.success).toBe(false);
  });
});
