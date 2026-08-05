import { describe, expect, it } from 'vitest';

import {
  AuthorizationConfigError,
  parseAuthorizationEnv,
  redactSecrets,
} from './authorization-env.js';

const baseEnv = (): NodeJS.ProcessEnv => ({
  AUTHORIZATION_DATABASE_URL: 'postgresql://authorization:pw@127.0.0.1:5432/authorization',
});

describe('parseAuthorizationEnv', () => {
  it('accepts disabled configuration with database url only', () => {
    const config = parseAuthorizationEnv(baseEnv());
    expect(config.AUTHORIZATION_ENABLED).toBe(false);
    expect(config.AUTHORIZATION_TRUST_WINDOW_SECONDS).toBe(120);
    expect(config.AUTHORIZATION_SYSTEM_CLIENT_ID).toBe('v2.authorization-service');
  });

  it('requires database url', () => {
    expect(() => parseAuthorizationEnv({})).toThrow(AuthorizationConfigError);
  });

  it('requires inbound and outbound fields when enabled', () => {
    expect(() =>
      parseAuthorizationEnv({
        ...baseEnv(),
        AUTHORIZATION_ENABLED: 'true',
      }),
    ).toThrow(AuthorizationConfigError);
  });

  it('accepts complete enabled configuration', () => {
    const config = parseAuthorizationEnv({
      ...baseEnv(),
      AUTHORIZATION_ENABLED: 'true',
      AUTHORIZATION_INBOUND_CLIENTS_JSON: '[]',
      AUTHORIZATION_SYSTEM_ACTIVE_KID: 'kid-1',
      AUTHORIZATION_SYSTEM_PRIVATE_KEY_PEM: 'pem',
      AUTHORIZATION_IDENTITY_BASE_URL: 'http://127.0.0.1:4200',
      AUTHORIZATION_IDENTITY_REVOKE_URL: 'http://127.0.0.1:4200/identity/v1/system/revoke-sessions',
    });
    expect(config.AUTHORIZATION_ENABLED).toBe(true);
  });

  it('rejects unrecognized boolean values', () => {
    expect(() => parseAuthorizationEnv({ ...baseEnv(), AUTHORIZATION_ENABLED: 'ture' })).toThrow(
      AuthorizationConfigError,
    );
  });
});

describe('redactSecrets', () => {
  it('masks credentials in connection strings', () => {
    const redacted = redactSecrets(
      'postgresql://authorization:superpw@127.0.0.1:5432/authorization',
    );
    expect(redacted).not.toContain('superpw');
    expect(redacted).toContain('[REDACTED]');
  });
});
