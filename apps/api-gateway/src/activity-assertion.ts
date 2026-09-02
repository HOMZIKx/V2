import { randomUUID } from 'node:crypto';

import { importPKCS8, SignJWT } from 'jose';

import type { ActivityAssertionConfig } from './activity-proxy.tokens.js';

export async function buildActivityClientAssertion(
  config: ActivityAssertionConfig,
  actor: { readonly discordUserId?: string; readonly v2UserId?: string },
): Promise<string> {
  const key = await importPKCS8(config.privateKeyPem.replace(/\\n/g, '\n'), 'EdDSA');
  return new SignJWT({
    jti: randomUUID(),
    ...(actor.discordUserId !== undefined ? { actor_discord_user_id: actor.discordUserId } : {}),
    ...(actor.v2UserId !== undefined ? { actor_v2_user_id: actor.v2UserId } : {}),
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: config.activeKid })
    .setIssuer(config.clientId)
    .setSubject(config.clientId)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(key);
}

export function readActivityAssertionConfigFromEnv(
  env: NodeJS.ProcessEnv,
): ActivityAssertionConfig | null {
  const privateKeyPem = env.API_TO_ACTIVITY_PRIVATE_KEY_PEM?.trim();
  const activeKid = env.API_TO_ACTIVITY_ACTIVE_KID?.trim();
  const audience = env.ACTIVITY_ASSERTION_AUD?.trim();
  const clientId = env.API_TO_ACTIVITY_CLIENT_ID?.trim() || 'v2.api-gateway';
  if (
    privateKeyPem === undefined ||
    privateKeyPem.length === 0 ||
    activeKid === undefined ||
    activeKid.length === 0 ||
    audience === undefined ||
    audience.length === 0
  ) {
    return null;
  }
  return { clientId, privateKeyPem, activeKid, audience };
}
