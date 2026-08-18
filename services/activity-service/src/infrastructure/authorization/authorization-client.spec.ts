import { describe, expect, it } from 'vitest';

import type { AuthorizeRequest } from '../../application/ports/activity.ports.js';
import { parseActivityEnv } from '../config/activity-env.js';
import {
  AllowAllAuthorizationClient,
  createAuthorizePort,
  DenyAllAuthorizationClient,
} from './authorization-client.js';

const request: AuthorizeRequest = {
  subject: { discordUserId: 'u1' },
  permissionId: 'activity.config.manage',
  scope: { type: 'guild', guildId: 'guild-1' },
  operationClass: 'sensitive',
};

describe('createAuthorizePort', () => {
  it('denies all permissions in production when ACTIVITY_ENABLED=false', async () => {
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
