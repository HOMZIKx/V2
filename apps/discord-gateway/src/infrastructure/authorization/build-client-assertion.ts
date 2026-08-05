import { randomUUID } from 'node:crypto';

import { importPKCS8, SignJWT } from 'jose';

export type DiscordToAuthzAssertionConfig = {
  readonly clientId: string;
  readonly privateKeyPem: string;
  readonly activeKid: string;
  readonly audience: string;
  /** Max TTL in seconds; clamped to <= 60. */
  readonly ttlSeconds: number;
};

/**
 * Signs a short-lived Discord Gateway -> Authorization system client assertion
 * (EdDSA, iss=sub=clientId, aud exact, jti UUID, TTL <= 60s).
 */
export async function buildDiscordToAuthzAssertion(
  config: DiscordToAuthzAssertionConfig,
): Promise<string> {
  const ttl = Math.min(Math.max(1, config.ttlSeconds), 60);
  const key = await importPKCS8(config.privateKeyPem, 'EdDSA');
  return new SignJWT({ jti: randomUUID() })
    .setProtectedHeader({ alg: 'EdDSA', kid: config.activeKid })
    .setIssuer(config.clientId)
    .setSubject(config.clientId)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(key);
}
