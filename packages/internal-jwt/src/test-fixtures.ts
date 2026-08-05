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

export const TEST_ISSUER = 'http://127.0.0.1:4200';
export const TEST_AUDIENCE = 'v2.api-gateway';

export const TEST_INTERNAL_ACTIVE_KID = 'internal-active';
export const TEST_INTERNAL_RETIRING_KID = 'internal-retiring';
export const TEST_SERVICE_GATEWAY_ACTIVE_KID = 'service-gateway-active';
export const TEST_SERVICE_GATEWAY_RETIRING_KID = 'service-gateway-retiring';

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

export interface SharedInternalJwtTestFixtures {
  readonly TEST_INTERNAL_ACTIVE: TestKeyFixture;
  readonly TEST_INTERNAL_RETIRING: TestKeyFixture;
  readonly TEST_SERVICE_GATEWAY_ACTIVE: TestKeyFixture;
  readonly TEST_SERVICE_GATEWAY_RETIRING: TestKeyFixture;
}

let sharedFixtures: Promise<SharedInternalJwtTestFixtures> | undefined;

export function getSharedTestFixtures(): Promise<SharedInternalJwtTestFixtures> {
  sharedFixtures ??= (async (): Promise<SharedInternalJwtTestFixtures> => ({
    TEST_INTERNAL_ACTIVE: await createEphemeralKeyFixture(TEST_INTERNAL_ACTIVE_KID),
    TEST_INTERNAL_RETIRING: await createEphemeralKeyFixture(TEST_INTERNAL_RETIRING_KID),
    TEST_SERVICE_GATEWAY_ACTIVE: await createEphemeralKeyFixture(TEST_SERVICE_GATEWAY_ACTIVE_KID),
    TEST_SERVICE_GATEWAY_RETIRING: await createEphemeralKeyFixture(
      TEST_SERVICE_GATEWAY_RETIRING_KID,
    ),
  }))();
  return sharedFixtures;
}

/** @deprecated Prefer getSharedTestFixtures(); kept name for gradual call-site updates. */
export async function loadTestFixtures(): Promise<SharedInternalJwtTestFixtures> {
  return getSharedTestFixtures();
}
