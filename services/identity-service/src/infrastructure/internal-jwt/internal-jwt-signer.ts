import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

import type { IdentityEnv } from '../config/identity-env.js';
import { getActiveSigningKey, type InternalJwtKeyring } from './internal-jwt-keyring.js';

export interface IssuedInternalToken {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
  readonly tokenType: 'Bearer';
}

export async function signInternalJwt(
  keyring: InternalJwtKeyring,
  config: IdentityEnv,
  userId: string,
  audience: string,
): Promise<IssuedInternalToken> {
  const activeKey = getActiveSigningKey(keyring);
  const jti = randomUUID();
  const expiresInSeconds = config.IDENTITY_INTERNAL_JWT_TTL_SECONDS;

  const accessToken = await new SignJWT({ jti })
    .setProtectedHeader({ alg: 'EdDSA', kid: activeKey.kid })
    .setSubject(userId)
    .setIssuer(config.IDENTITY_INTERNAL_JWT_ISSUER ?? '')
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(activeKey.signingKey);

  return { accessToken, expiresInSeconds, tokenType: 'Bearer' };
}
