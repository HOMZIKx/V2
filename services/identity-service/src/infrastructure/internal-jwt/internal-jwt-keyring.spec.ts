import { beforeAll, describe, expect, it } from 'vitest';

import { IdentityConfigError } from '../config/identity-env.js';
import { loadInternalJwtKeyring } from './internal-jwt-keyring.js';
import {
  buildTestInternalJwtKeyringJson,
  getIdentityTestFixtures,
  TEST_INTERNAL_ACTIVE_KID,
  TEST_INTERNAL_RETIRED_KID,
  TEST_INTERNAL_RETIRING_KID,
  type IdentityInternalJwtTestFixtures,
} from './test-fixtures.js';

describe('loadInternalJwtKeyring', () => {
  let fixtures: IdentityInternalJwtTestFixtures;

  beforeAll(async () => {
    fixtures = await getIdentityTestFixtures();
  });

  it('loads active and retiring keys and builds JWKS without private keys for retiring', async () => {
    const keyring = await loadInternalJwtKeyring(
      await buildTestInternalJwtKeyringJson({ includeRetired: true }),
      fixtures.TEST_INTERNAL_ACTIVE.kid,
    );

    expect(keyring.activeKid).toBe(fixtures.TEST_INTERNAL_ACTIVE.kid);
    expect(keyring.jwks.keys.map((key) => key.kid)).toEqual([
      TEST_INTERNAL_ACTIVE_KID,
      TEST_INTERNAL_RETIRING_KID,
    ]);
    expect(keyring.jwks.keys.map((key) => key.kid)).not.toContain(TEST_INTERNAL_RETIRED_KID);
    expect(keyring.keys.get(TEST_INTERNAL_RETIRING_KID)?.signingKey).toBeUndefined();
    expect(keyring.keys.get(TEST_INTERNAL_RETIRED_KID)?.signingKey).toBeUndefined();
    expect(keyring.keys.get(TEST_INTERNAL_ACTIVE_KID)?.signingKey).toBeDefined();
  });

  it('accepts retiring without private key', async () => {
    const json = JSON.stringify([
      {
        kid: fixtures.TEST_INTERNAL_ACTIVE.kid,
        status: 'active',
        private_key_pem: fixtures.TEST_INTERNAL_ACTIVE.privatePem,
        public_key_pem: fixtures.TEST_INTERNAL_ACTIVE.publicPem,
      },
      {
        kid: fixtures.TEST_INTERNAL_RETIRING.kid,
        status: 'retiring',
        public_key_pem: fixtures.TEST_INTERNAL_RETIRING.publicPem,
      },
    ]);

    const keyring = await loadInternalJwtKeyring(json, fixtures.TEST_INTERNAL_ACTIVE.kid);
    expect(keyring.keys.get(fixtures.TEST_INTERNAL_RETIRING.kid)?.status).toBe('retiring');
  });

  it('rejects private_key_pem on retiring records', async () => {
    const json = JSON.stringify([
      {
        kid: fixtures.TEST_INTERNAL_ACTIVE.kid,
        status: 'active',
        private_key_pem: fixtures.TEST_INTERNAL_ACTIVE.privatePem,
        public_key_pem: fixtures.TEST_INTERNAL_ACTIVE.publicPem,
      },
      {
        kid: fixtures.TEST_INTERNAL_RETIRING.kid,
        status: 'retiring',
        private_key_pem: fixtures.TEST_INTERNAL_RETIRING.privatePem,
        public_key_pem: fixtures.TEST_INTERNAL_RETIRING.publicPem,
      },
    ]);

    await expect(loadInternalJwtKeyring(json, fixtures.TEST_INTERNAL_ACTIVE.kid)).rejects.toThrow();
  });

  it('rejects private_key_pem on retired records', async () => {
    const json = JSON.stringify([
      {
        kid: fixtures.TEST_INTERNAL_ACTIVE.kid,
        status: 'active',
        private_key_pem: fixtures.TEST_INTERNAL_ACTIVE.privatePem,
        public_key_pem: fixtures.TEST_INTERNAL_ACTIVE.publicPem,
      },
      {
        kid: fixtures.TEST_INTERNAL_RETIRED.kid,
        status: 'retired',
        private_key_pem: fixtures.TEST_INTERNAL_RETIRED.privatePem,
        public_key_pem: fixtures.TEST_INTERNAL_RETIRED.publicPem,
      },
    ]);

    await expect(loadInternalJwtKeyring(json, fixtures.TEST_INTERNAL_ACTIVE.kid)).rejects.toThrow();
  });

  it('rejects active without private key', async () => {
    const json = JSON.stringify([
      {
        kid: fixtures.TEST_INTERNAL_ACTIVE.kid,
        status: 'active',
        public_key_pem: fixtures.TEST_INTERNAL_ACTIVE.publicPem,
      },
    ]);

    await expect(loadInternalJwtKeyring(json, fixtures.TEST_INTERNAL_ACTIVE.kid)).rejects.toThrow();
  });

  it('fails fast on duplicate kid', async () => {
    const json = JSON.stringify([
      {
        kid: fixtures.TEST_INTERNAL_ACTIVE.kid,
        status: 'active',
        private_key_pem: fixtures.TEST_INTERNAL_ACTIVE.privatePem,
        public_key_pem: fixtures.TEST_INTERNAL_ACTIVE.publicPem,
      },
      {
        kid: fixtures.TEST_INTERNAL_ACTIVE.kid,
        status: 'retiring',
        public_key_pem: fixtures.TEST_INTERNAL_RETIRING.publicPem,
      },
    ]);

    await expect(
      loadInternalJwtKeyring(json, fixtures.TEST_INTERNAL_ACTIVE.kid),
    ).rejects.toBeInstanceOf(IdentityConfigError);
  });

  it('fails fast when multiple active keys exist', async () => {
    const json = JSON.stringify([
      {
        kid: 'a',
        status: 'active',
        private_key_pem: fixtures.TEST_INTERNAL_ACTIVE.privatePem,
        public_key_pem: fixtures.TEST_INTERNAL_ACTIVE.publicPem,
      },
      {
        kid: 'b',
        status: 'active',
        private_key_pem: fixtures.TEST_INTERNAL_RETIRING.privatePem,
        public_key_pem: fixtures.TEST_INTERNAL_RETIRING.publicPem,
      },
    ]);

    await expect(loadInternalJwtKeyring(json, 'a')).rejects.toBeInstanceOf(IdentityConfigError);
  });

  it('fails fast on private/public mismatch', async () => {
    const json = JSON.stringify([
      {
        kid: fixtures.TEST_INTERNAL_ACTIVE.kid,
        status: 'active',
        private_key_pem: fixtures.TEST_INTERNAL_ACTIVE.privatePem,
        public_key_pem: fixtures.TEST_INTERNAL_RETIRING.publicPem,
      },
    ]);

    await expect(
      loadInternalJwtKeyring(json, fixtures.TEST_INTERNAL_ACTIVE.kid),
    ).rejects.toBeInstanceOf(IdentityConfigError);
  });
});
