import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildTestInternalJwtKeyringJson,
  buildTestServiceClientsJson,
  getIdentityTestFixtures,
  TEST_INTERNAL_JWT_ISSUE_URL,
  TEST_INTERNAL_JWT_ISSUER,
  type IdentityInternalJwtTestFixtures,
} from '../internal-jwt/test-fixtures.js';
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
    expect(config.IDENTITY_SYSTEM_REVOKE_URL).toBe(
      'http://127.0.0.1:4200/identity/v1/system/revoke-sessions',
    );
    expect(config.IDENTITY_AUTHORIZATION_ENABLED).toBe(false);
    expect(config.IDENTITY_TO_AUTHZ_CLIENT_ID).toBe('v2.identity-service');
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

describe('parseIdentityEnv — internal JWT', () => {
  let fixtures: IdentityInternalJwtTestFixtures;
  let keyringJson: string;
  let clientsJson: string;

  beforeAll(async () => {
    fixtures = await getIdentityTestFixtures();
    keyringJson = await buildTestInternalJwtKeyringJson();
    clientsJson = await buildTestServiceClientsJson();
  });

  const internalJwtEnv = (): NodeJS.ProcessEnv => ({
    ...enabledEnv(),
    IDENTITY_INTERNAL_JWT_ENABLED: 'true',
    IDENTITY_INTERNAL_JWT_ISSUER: TEST_INTERNAL_JWT_ISSUER,
    IDENTITY_INTERNAL_JWT_ISSUE_URL: TEST_INTERNAL_JWT_ISSUE_URL,
    IDENTITY_INTERNAL_JWT_KEYRING_JSON: keyringJson,
    IDENTITY_INTERNAL_JWT_ACTIVE_KID: fixtures.TEST_INTERNAL_ACTIVE.kid,
    IDENTITY_SERVICE_CLIENTS_JSON: clientsJson,
  });

  it('accepts complete internal JWT configuration', () => {
    const config = parseIdentityEnv(internalJwtEnv());
    expect(config.IDENTITY_INTERNAL_JWT_ENABLED).toBe(true);
    expect(config.IDENTITY_INTERNAL_JWT_TTL_SECONDS).toBe(300);
  });

  it('requires auth enabled when internal JWT is enabled', () => {
    expect(() =>
      parseIdentityEnv({
        IDENTITY_INTERNAL_JWT_ENABLED: 'true',
        IDENTITY_INTERNAL_JWT_ISSUER: TEST_INTERNAL_JWT_ISSUER,
        IDENTITY_INTERNAL_JWT_ISSUE_URL: TEST_INTERNAL_JWT_ISSUE_URL,
        IDENTITY_INTERNAL_JWT_KEYRING_JSON: keyringJson,
        IDENTITY_INTERNAL_JWT_ACTIVE_KID: fixtures.TEST_INTERNAL_ACTIVE.kid,
        IDENTITY_SERVICE_CLIENTS_JSON: clientsJson,
      }),
    ).toThrow(IdentityConfigError);
  });
});

describe('parseIdentityEnv — authorization gate', () => {
  let fixtures: IdentityInternalJwtTestFixtures;

  beforeAll(async () => {
    fixtures = await getIdentityTestFixtures();
  });

  it('requires Authz client signing material when enabled', () => {
    expect(() =>
      parseIdentityEnv({
        ...enabledEnv(),
        IDENTITY_AUTHORIZATION_ENABLED: 'true',
      }),
    ).toThrow(IdentityConfigError);
  });

  it('accepts complete authorization gate configuration', () => {
    const config = parseIdentityEnv({
      ...enabledEnv(),
      IDENTITY_AUTHORIZATION_ENABLED: 'true',
      IDENTITY_AUTHORIZATION_BASE_URL: 'http://127.0.0.1:4300',
      IDENTITY_AUTHORIZATION_ASSERTION_AUD: 'http://127.0.0.1:4300/authorization/v1',
      IDENTITY_TO_AUTHZ_PRIVATE_KEY_PEM: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.privatePem,
      IDENTITY_TO_AUTHZ_ACTIVE_KID: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.kid,
    });
    expect(config.IDENTITY_AUTHORIZATION_ENABLED).toBe(true);
    expect(config.IDENTITY_TO_AUTHZ_CLIENT_ID).toBe('v2.identity-service');
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
