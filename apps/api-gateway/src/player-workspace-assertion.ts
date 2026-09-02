import { randomUUID } from 'node:crypto';

import { importPKCS8, SignJWT } from 'jose';

import type { PlayerWorkspaceAssertionConfig } from './player-workspace-proxy.tokens.js';

export async function buildPlayerWorkspaceClientAssertion(
  config: PlayerWorkspaceAssertionConfig,
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

export function readPlayerWorkspaceAssertionConfigFromEnv(
  env: NodeJS.ProcessEnv,
): PlayerWorkspaceAssertionConfig | null {
  const privateKeyPem = env.API_TO_PLAYER_WORKSPACE_PRIVATE_KEY_PEM?.trim();
  const activeKid = env.API_TO_PLAYER_WORKSPACE_ACTIVE_KID?.trim();
  const audience = env.PLAYER_WORKSPACE_ASSERTION_AUD?.trim();
  const clientId = env.API_TO_PLAYER_WORKSPACE_CLIENT_ID?.trim() || 'v2.api-gateway';
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
