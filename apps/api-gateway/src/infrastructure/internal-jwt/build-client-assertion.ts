import { importPKCS8, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

import type { InternalJwtClientEnv } from './internal-jwt-client-env.js';

export async function buildClientAssertion(config: InternalJwtClientEnv): Promise<string> {
  const privatePem = config.INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM;
  const clientId = config.INTERNAL_JWT_CLIENT_ID;
  const kid = config.INTERNAL_JWT_CLIENT_ACTIVE_KID;
  const audience = config.INTERNAL_JWT_ASSERTION_AUD;

  if (
    privatePem === undefined ||
    clientId === undefined ||
    kid === undefined ||
    audience === undefined
  ) {
    throw new Error('Internal JWT client is not configured');
  }

  const key = await importPKCS8(privatePem, 'EdDSA');
  return new SignJWT({ jti: randomUUID() })
    .setProtectedHeader({ alg: 'EdDSA', kid })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(key);
}
