import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { AuthorizeRequest } from '../../application/ports/activity.ports.js';
import { parseActivityEnv } from '../config/activity-env.js';
import {
  AllowAllAuthorizationClient,
  createAuthorizePort,
  DenyAllAuthorizationClient,
  HttpAuthorizationClient,
} from './authorization-client.js';

const request: AuthorizeRequest = {
  subject: { discordUserId: 'u1' },
  permissionId: 'activity.config.manage',
  scope: { type: 'guild', guildId: 'guild-1' },
  operationClass: 'sensitive',
};

const projectionEnv = {
  ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
  NODE_ENV: 'production' as const,
  ACTIVITY_ENABLED: 'false',
  ACTIVITY_OUTBOX_WORKER_ENABLED: 'true',
  ACTIVITY_PROJECTION_SHARED_SECRET: 'projection-secret-at-least-32-chars!!',
  ACTIVITY_DISCORD_PROJECTION_BASE_URL: 'http://discord-gateway:8080',
  ACTIVITY_INBOUND_CLIENTS_JSON: '[]',
  ACTIVITY_REDIS_URL: 'redis://127.0.0.1:6379/3',
};

describe('createAuthorizePort', () => {
  it('denies all permissions in production when ACTIVITY_ENABLED=false and projection mode is off', async () => {
    const env = parseActivityEnv({
      ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
      NODE_ENV: 'production',
      ACTIVITY_ENABLED: 'false',
    });
    const port = createAuthorizePort(env);
    expect(port).toBeInstanceOf(DenyAllAuthorizationClient);
    await expect(port.authorize(request)).resolves.toMatchObject({
      allowed: false,
      decision: 'deny',
    });
  });

  it('A: production projection Centrum mode does NOT auto-allow Activity authorization', async () => {
    const env = parseActivityEnv(projectionEnv);
    const port = createAuthorizePort(env);
    expect(port).toBeInstanceOf(DenyAllAuthorizationClient);
    expect(port).not.toBeInstanceOf(AllowAllAuthorizationClient);
    await expect(port.authorize(request)).resolves.toMatchObject({
      allowed: false,
      decision: 'deny',
    });
  });

  it('allows all permissions only outside production when ACTIVITY_ENABLED=false', async () => {
    const env = parseActivityEnv({
      ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
      NODE_ENV: 'test',
      ACTIVITY_ENABLED: 'false',
    });
    const port = createAuthorizePort(env);
    expect(port).toBeInstanceOf(AllowAllAuthorizationClient);
    await expect(port.authorize(request)).resolves.toMatchObject({
      allowed: true,
      decision: 'allow',
    });
  });
});

describe('HttpAuthorizationClient', () => {
  it('treats identity pair CONFLICT as deny instead of upstream failure', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const client = new HttpAuthorizationClient({
      baseUrl: 'http://127.0.0.1:4300',
      assertionAud: 'http://127.0.0.1:4300/authorization/v1/authorize',
      clientId: 'v2.activity-service',
      kid: 'test-kid',
      privateKeyPem,
      maxTtlSeconds: 60,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'CONFLICT',
              message: 'Discord and V2 identity pair does not match',
            },
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ),
    });

    await expect(client.authorize(request)).resolves.toMatchObject({
      allowed: false,
      decision: 'deny',
    });
  });
});
