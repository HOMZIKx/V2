import { describe, expect, it } from 'vitest';

import { parseActivityEnv } from '../config/activity-env.js';
import {
  createIdentityCharacterClient,
  DenyAllCharacterVerifyClient,
  PassThroughCharacterVerifyClient,
} from './identity-character-client.js';

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

describe('createIdentityCharacterClient — production trust boundary', () => {
  it('B: production projection mode rejects client sessionRoles without Identity S2S', async () => {
    const env = parseActivityEnv(projectionEnv);
    const port = createIdentityCharacterClient(env);
    expect(port).toBeInstanceOf(DenyAllCharacterVerifyClient);
    expect(port).not.toBeInstanceOf(PassThroughCharacterVerifyClient);
    await expect(
      port.resolveCharacter({
        discordUserId: '808066932753563668',
        characterId: '11111111-1111-4111-8111-111111111111',
        sessionRoles: ['TANK', 'BUFF', 'DPS'],
      }),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'DEPENDENCY_UNAVAILABLE'
      );
    });
  });

  it('allows pass-through only outside production when ACTIVITY_ENABLED=false', () => {
    const env = parseActivityEnv({
      ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
      NODE_ENV: 'test',
      ACTIVITY_ENABLED: 'false',
    });
    const port = createIdentityCharacterClient(env);
    expect(port).toBeInstanceOf(PassThroughCharacterVerifyClient);
  });
});
