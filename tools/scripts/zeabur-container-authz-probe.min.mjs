import { createPrivateKey, randomUUID, sign } from 'node:crypto';
const b = (x) =>
  Buffer.from(x).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
let u = process.env.ACTIVITY_AUTHORIZATION_BASE_URL ?? '';
u.endsWith('/') && (u = u.slice(0, -1));
const c = process.env.ACTIVITY_TO_AUTHZ_CLIENT_ID ?? 'v2.activity-service',
  k = process.env.ACTIVITY_TO_AUTHZ_ACTIVE_KID ?? '',
  a = process.env.ACTIVITY_AUTHORIZATION_ASSERTION_AUD ?? '',
  p = (process.env.ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM ?? '').replace(/\\n/g, '\n').trim(),
  n = Math.floor(Date.now() / 1e3),
  h = b(JSON.stringify({ alg: 'EdDSA', kid: k, typ: 'JWT' })),
  pl = b(JSON.stringify({ jti: randomUUID(), iss: c, sub: c, aud: a, iat: n, exp: n + 60 })),
  si = `${h}.${pl}`,
  as = `${si}.${b(sign(null, Buffer.from(si), createPrivateKey(p)))}`;
fetch(`${u}/authorization/v1/authorize`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'authorization-client-assertion': as },
  body: JSON.stringify({
    subject: { discordUserId: '000000000000000001' },
    permissionId: 'permission.activity.config.manage',
    scope: { type: 'guild', guildId: '1534228693017432124' },
    operationClass: 'sensitive',
  }),
  signal: AbortSignal.timeout(8e3),
})
  .then((r) =>
    r.text().then((t) => {
      console.log('HTTP', r.status, t.slice(0, 300));
      process.exit(r.ok ? 0 : 1);
    }),
  )
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
