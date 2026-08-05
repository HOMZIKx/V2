import { beforeAll, describe, expect, it } from 'vitest';

import { IdentityConfigError } from '../config/identity-env.js';
import { loadServiceClientRegistry } from './service-client-registry.js';
import {
  buildTestServiceClientsJson,
  getIdentityTestFixtures,
  TEST_GATEWAY_CLIENT_ID,
  type IdentityInternalJwtTestFixtures,
} from './test-fixtures.js';

describe('loadServiceClientRegistry', () => {
  let fixtures: IdentityInternalJwtTestFixtures;

  beforeAll(async () => {
    fixtures = await getIdentityTestFixtures();
  });

  it('loads gateway client with active and retiring keys', async () => {
    const registry = await loadServiceClientRegistry(await buildTestServiceClientsJson());
    const client = registry.clients.get(TEST_GATEWAY_CLIENT_ID);
    expect(client?.allowedAudiences).toContain('v2.api-gateway');
    expect(client?.keys.get(fixtures.TEST_SERVICE_GATEWAY_ACTIVE.kid)?.status).toBe('active');
  });

  it('fails fast on duplicate global kid', async () => {
    const json = JSON.stringify([
      {
        client_id: 'v2.one',
        allowed_audiences: ['v2.one'],
        keys: [
          {
            kid: 'dup',
            status: 'active',
            public_key_pem: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.publicPem,
          },
        ],
      },
      {
        client_id: 'v2.two',
        allowed_audiences: ['v2.two'],
        keys: [
          {
            kid: 'dup',
            status: 'active',
            public_key_pem: fixtures.TEST_SERVICE_GATEWAY_ACTIVE.publicPem,
          },
        ],
      },
    ]);

    await expect(loadServiceClientRegistry(json)).rejects.toBeInstanceOf(IdentityConfigError);
  });
});
