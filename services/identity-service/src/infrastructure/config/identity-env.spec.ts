import { describe, expect, it } from 'vitest';

import { IdentityConfigError, parseIdentityEnv, redactSecrets } from './identity-env.js';

const validSecret = 'a'.repeat(32);

const enabledEnv = (): NodeJS.ProcessEnv => ({
  IDENTITY_AUTH_ENABLED: 'true',
  IDENTITY_DATABASE_URL: 'postgresql://identity:pw@127.0.0.1:5432/identity',
  IDENTITY_REDIS_URL: 'redis://127.0.0.1:6379/1',
  IDENTITY_AUTH_BASE_URL: 'http://127.0.0.1:4200',
  IDENTITY_TRUSTED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
  IDENTITY_BETTER_AUTH_SECRET: validSecret,
  IDENTITY_DISCORD_CLIENT_ID: 'discord-id',
  IDENTITY_DISCORD_CLIENT_SECRET: 'discord-secret',
});

describe('parseIdentityEnv — disabled', () => {
  it('boots with defaults and no secrets when auth is disabled', () => {
    const config = parseIdentityEnv({});
    expect(config.IDENTITY_AUTH_ENABLED).toBe(false);
    expect(config.IDENTITY_DATABASE_URL).toBeUndefined();
    expect(config.IDENTITY_REDIS_URL).toBe('redis://127.0.0.1:6379/1');
    expect(config.IDENTITY_AUTH_BASE_PATH).toBe('/api/auth');
    expect(config.IDENTITY_COOKIE_PREFIX).toBe('v2.identity');
  });

  it('parses trusted origins into a list', () => {
    const config = parseIdentityEnv({ IDENTITY_TRUSTED_ORIGINS: 'http://a.test, http://b.test' });
    expect(config.IDENTITY_TRUSTED_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });
});

describe('parseIdentityEnv — enabled', () => {
  it('accepts a complete enabled configuration', () => {
    const config = parseIdentityEnv(enabledEnv());
    expect(config.IDENTITY_AUTH_ENABLED).toBe(true);
    expect(config.IDENTITY_DATABASE_URL).toContain('identity');
  });

  it('fails fast when the secret is too short', () => {
    expect(() =>
      parseIdentityEnv({ ...enabledEnv(), IDENTITY_BETTER_AUTH_SECRET: 'short' }),
    ).toThrow(IdentityConfigError);
  });

  it('fails fast when Discord credentials are missing', () => {
    const env = enabledEnv();
    delete env.IDENTITY_DISCORD_CLIENT_SECRET;
    expect(() => parseIdentityEnv(env)).toThrow(IdentityConfigError);
  });

  it('does not require a second OAuth provider when Discord is configured', () => {
    const config = parseIdentityEnv(enabledEnv());
    expect(config.IDENTITY_AUTH_ENABLED).toBe(true);
    expect(config.IDENTITY_DISCORD_CLIENT_ID).toBe('discord-id');
  });

  it('fails fast when the database url is missing', () => {
    const env = enabledEnv();
    delete env.IDENTITY_DATABASE_URL;
    expect(() => parseIdentityEnv(env)).toThrow(IdentityConfigError);
  });

  it('requires https base url in production', () => {
    expect(() => parseIdentityEnv({ ...enabledEnv(), NODE_ENV: 'production' })).toThrow(
      IdentityConfigError,
    );
  });

  it('rejects localhost trusted origins in production', () => {
    expect(() =>
      parseIdentityEnv({
        ...enabledEnv(),
        NODE_ENV: 'production',
        IDENTITY_AUTH_BASE_URL: 'https://identity.example',
        IDENTITY_TRUSTED_ORIGINS: 'https://app.example,http://localhost:3000',
      }),
    ).toThrow(IdentityConfigError);
  });

  it('accepts https production configuration without localhost', () => {
    const config = parseIdentityEnv({
      ...enabledEnv(),
      NODE_ENV: 'production',
      IDENTITY_AUTH_BASE_URL: 'https://identity.example',
      IDENTITY_TRUSTED_ORIGINS: 'https://app.example',
    });
    expect(config.IDENTITY_AUTH_ENABLED).toBe(true);
  });

  it('fails on unrecognized boolean values instead of silently disabling auth', () => {
    expect(() => parseIdentityEnv({ IDENTITY_AUTH_ENABLED: 'ture' })).toThrow(IdentityConfigError);
    expect(() => parseIdentityEnv({ IDENTITY_AUTH_ENABLED: 'enabled' })).toThrow(
      IdentityConfigError,
    );
    expect(parseIdentityEnv({ IDENTITY_AUTH_ENABLED: 'false' }).IDENTITY_AUTH_ENABLED).toBe(false);
    expect(parseIdentityEnv({ IDENTITY_AUTH_ENABLED: '0' }).IDENTITY_AUTH_ENABLED).toBe(false);
  });

  it('never includes secret values in the thrown message', () => {
    try {
      parseIdentityEnv({ ...enabledEnv(), IDENTITY_BETTER_AUTH_SECRET: 'short-secret-value' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(IdentityConfigError);
      expect((error as Error).message).not.toContain('short-secret-value');
    }
  });
});

describe('redactSecrets', () => {
  it('masks credentials embedded in connection strings', () => {
    const redacted = redactSecrets('postgresql://identity:superpw@127.0.0.1:5432/identity');
    expect(redacted).not.toContain('superpw');
    expect(redacted).toContain('[REDACTED]');
  });

  it('masks sensitive KEY=value assignments', () => {
    const redacted = redactSecrets('IDENTITY_BETTER_AUTH_SECRET=not-a-real-credential');
    expect(redacted).not.toContain('not-a-real-credential');
  });

  it('masks explicitly provided secret literals', () => {
    const redacted = redactSecrets('token is topsecretvalue here', ['topsecretvalue']);
    expect(redacted).not.toContain('topsecretvalue');
  });
});
