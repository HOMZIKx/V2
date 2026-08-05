/**
 * TEST-ONLY ephemeral Ed25519 fixtures — generated at runtime, never committed as PEMs.
 */
import { exportJWK, exportPKCS8, exportSPKI, generateKeyPair, type JWK } from 'jose';

export interface TestKeyFixture {
  readonly kid: string;
  readonly privatePem: string;
  readonly publicPem: string;
  readonly publicJwk: JWK;
}

export const TEST_INTERNAL_JWT_ISSUER = 'http://127.0.0.1:4200';
export const TEST_INTERNAL_JWT_ISSUE_URL = 'http://127.0.0.1:4200/identity/internal-token';
export const TEST_GATEWAY_CLIENT_ID = 'v2.api-gateway';
export const TEST_GATEWAY_AUDIENCE = 'v2.api-gateway';
export const TEST_OTHER_CLIENT_ID = 'v2.other-service';
export const TEST_OTHER_AUDIENCE = 'v2.other-service';

export const TEST_INTERNAL_ACTIVE_KID = 'internal-active';
export const TEST_INTERNAL_RETIRING_KID = 'internal-retiring';
export const TEST_INTERNAL_RETIRED_KID = 'internal-retired';
export const TEST_SERVICE_GATEWAY_ACTIVE_KID = 'service-gateway-active';
export const TEST_SERVICE_GATEWAY_RETIRING_KID = 'service-gateway-retiring';
export const TEST_SERVICE_OTHER_ACTIVE_KID = 'service-other-active';

export async function createEphemeralKeyFixture(kid: string): Promise<TestKeyFixture> {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
    extractable: true,
  });
  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);
  const publicJwk = {
    ...(await exportJWK(publicKey)),
    kid,
    alg: 'EdDSA',
    use: 'sig',
  } as JWK;
  return { kid, privatePem, publicPem, publicJwk };
}

export interface IdentityInternalJwtTestFixtures {
  readonly TEST_INTERNAL_ACTIVE: TestKeyFixture;
  readonly TEST_INTERNAL_RETIRING: TestKeyFixture;
  readonly TEST_INTERNAL_RETIRED: TestKeyFixture;
  readonly TEST_SERVICE_GATEWAY_ACTIVE: TestKeyFixture;
  readonly TEST_SERVICE_GATEWAY_RETIRING: TestKeyFixture;
  readonly TEST_SERVICE_OTHER_ACTIVE: TestKeyFixture;
}

let fixturesPromise: Promise<IdentityInternalJwtTestFixtures> | undefined;

export function getIdentityTestFixtures(): Promise<IdentityInternalJwtTestFixtures> {
  fixturesPromise ??= (async (): Promise<IdentityInternalJwtTestFixtures> => ({
    TEST_INTERNAL_ACTIVE: await createEphemeralKeyFixture(TEST_INTERNAL_ACTIVE_KID),
    TEST_INTERNAL_RETIRING: await createEphemeralKeyFixture(TEST_INTERNAL_RETIRING_KID),
    TEST_INTERNAL_RETIRED: await createEphemeralKeyFixture(TEST_INTERNAL_RETIRED_KID),
    TEST_SERVICE_GATEWAY_ACTIVE: await createEphemeralKeyFixture(TEST_SERVICE_GATEWAY_ACTIVE_KID),
    TEST_SERVICE_GATEWAY_RETIRING: await createEphemeralKeyFixture(
      TEST_SERVICE_GATEWAY_RETIRING_KID,
    ),
    TEST_SERVICE_OTHER_ACTIVE: await createEphemeralKeyFixture(TEST_SERVICE_OTHER_ACTIVE_KID),
  }))();
  return fixturesPromise;
}

export async function buildTestServiceClientsJson(): Promise<string> {
  const f = await getIdentityTestFixtures();
  return JSON.stringify([
    {
      client_id: TEST_GATEWAY_CLIENT_ID,
      allowed_audiences: [TEST_GATEWAY_AUDIENCE],
      keys: [
        {
          kid: f.TEST_SERVICE_GATEWAY_ACTIVE.kid,
          status: 'active',
          public_key_pem: f.TEST_SERVICE_GATEWAY_ACTIVE.publicPem,
        },
        {
          kid: f.TEST_SERVICE_GATEWAY_RETIRING.kid,
          status: 'retiring',
          public_key_pem: f.TEST_SERVICE_GATEWAY_RETIRING.publicPem,
        },
      ],
    },
    {
      client_id: TEST_OTHER_CLIENT_ID,
      allowed_audiences: [TEST_OTHER_AUDIENCE],
      keys: [
        {
          kid: f.TEST_SERVICE_OTHER_ACTIVE.kid,
          status: 'active',
          public_key_pem: f.TEST_SERVICE_OTHER_ACTIVE.publicPem,
        },
      ],
    },
  ]);
}

export async function buildTestInternalJwtKeyringJson(options?: {
  readonly includeRetired?: boolean;
}): Promise<string> {
  const f = await getIdentityTestFixtures();
  const records: Array<Record<string, string>> = [
    {
      kid: f.TEST_INTERNAL_ACTIVE.kid,
      status: 'active',
      private_key_pem: f.TEST_INTERNAL_ACTIVE.privatePem,
      public_key_pem: f.TEST_INTERNAL_ACTIVE.publicPem,
    },
    {
      kid: f.TEST_INTERNAL_RETIRING.kid,
      status: 'retiring',
      public_key_pem: f.TEST_INTERNAL_RETIRING.publicPem,
    },
  ];
  if (options?.includeRetired === true) {
    records.push({
      kid: f.TEST_INTERNAL_RETIRED.kid,
      status: 'retired',
      public_key_pem: f.TEST_INTERNAL_RETIRED.publicPem,
    });
  }
  return JSON.stringify(records);
}
