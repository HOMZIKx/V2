import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire('/app/apps/api-gateway/package.json');
const { importPKCS8, SignJWT } = require('jose');

const pem = (process.env.API_TO_ACTIVITY_PRIVATE_KEY_PEM ?? '').replace(/\\n/g, '\n').trim();
const kid = process.env.API_TO_ACTIVITY_ACTIVE_KID ?? '';
const aud = process.env.ACTIVITY_ASSERTION_AUD ?? '';
const clientId = process.env.API_TO_ACTIVITY_CLIENT_ID ?? 'v2.api-gateway';
const activityBase = (process.env.ACTIVITY_SERVICE_BASE_URL ?? 'http://127.0.0.1:8080').replace(
  /\/$/,
  '',
);

const actorDiscord = '808066932753563668';
const actorV2 = '828ad2f2-6f54-48c9-8fe5-1b5c2d18f9fa';

const key = await importPKCS8(pem, 'EdDSA');
const assertion = await new SignJWT({
  jti: randomUUID(),
  actor_discord_user_id: actorDiscord,
  actor_v2_user_id: actorV2,
})
  .setProtectedHeader({ alg: 'EdDSA', kid })
  .setIssuer(clientId)
  .setSubject(clientId)
  .setAudience(aud)
  .setIssuedAt()
  .setExpirationTime('60s')
  .sign(key);

const response = await fetch(`${activityBase}/activity/v1/admin/guilds`, {
  headers: {
    accept: 'application/json',
    'x-actor-discord-user-id': actorDiscord,
    'x-actor-v2-user-id': actorV2,
    'activity-client-assertion': assertion,
  },
  signal: AbortSignal.timeout(10000),
});
const body = await response.text();
console.log('GATEWAY_PATH_GUILD_LIST HTTP', response.status, body.slice(0, 400));
process.exit(response.ok ? 0 : 1);
