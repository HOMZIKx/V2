/**
 * Production trust-boundary scan — AllowAll / PassThrough must never be selected
 * for NODE_ENV=production + projection Centrum mode.
 */
import { describe, expect, it } from 'vitest';

import { parseActivityEnv } from '../config/activity-env.js';
import {
  createIdentityCharacterClient,
  DenyAllCharacterVerifyClient,
  PassThroughCharacterVerifyClient,
} from '../identity/identity-character-client.js';
import {
  AllowAllAuthorizationClient,
  createAuthorizePort,
  DenyAllAuthorizationClient,
} from './authorization-client.js';

const productionProjection = {
  ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
  NODE_ENV: 'production' as const,
  ACTIVITY_ENABLED: 'false',
  ACTIVITY_OUTBOX_WORKER_ENABLED: 'true',
  ACTIVITY_PROJECTION_SHARED_SECRET: 'projection-secret-at-least-32-chars!!',
  ACTIVITY_DISCORD_PROJECTION_BASE_URL: 'http://discord-gateway:8080',
  ACTIVITY_INBOUND_CLIENTS_JSON: JSON.stringify([
    {
      client_id: 'v2.discord-gateway',
      keys: [
        {
          kid: 'test',
          status: 'active',
          public_key_pem:
            '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=\n-----END PUBLIC KEY-----',
        },
      ],
      allowed_operations: ['activity_hub_projection', 'activity_read', 'activity_mutate'],
    },
  ]),
  ACTIVITY_REDIS_URL: 'redis://127.0.0.1:6379/3',
};

describe('production stub selection guard', () => {
  it('never selects AllowAllAuthorizationClient in production projection mode', () => {
    const env = parseActivityEnv(productionProjection);
    const port = createAuthorizePort(env);
    expect(port).toBeInstanceOf(DenyAllAuthorizationClient);
    expect(port).not.toBeInstanceOf(AllowAllAuthorizationClient);
  });

  it('never selects PassThroughCharacterVerifyClient in production projection mode', () => {
    const env = parseActivityEnv(productionProjection);
    const port = createIdentityCharacterClient(env);
    expect(port).toBeInstanceOf(DenyAllCharacterVerifyClient);
    expect(port).not.toBeInstanceOf(PassThroughCharacterVerifyClient);
  });
});
