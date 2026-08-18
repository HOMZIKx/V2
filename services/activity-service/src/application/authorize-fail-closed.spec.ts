import { describe, expect, it } from 'vitest';

import { ActivityError } from '../domain/errors.js';
import { authorizeOrFailClosed, requireAllowed } from './authorize-fail-closed.js';
import type { AuthorizePort, AuthorizeRequest, AuthorizeResult } from './ports/activity.ports.js';

const request: AuthorizeRequest = {
  subject: { discordUserId: 'u1' },
  permissionId: 'activity.config.manage',
  scope: { type: 'guild', guildId: 'guild-1' },
  operationClass: 'sensitive',
};

describe('authorizeOrFailClosed', () => {
  it('returns the authorization decision when the port succeeds', async () => {
    const authorize: AuthorizePort = {
      authorize: (): Promise<AuthorizeResult> =>
        Promise.resolve({
          allowed: false,
          permissionId: request.permissionId,
          decision: 'deny',
        }),
    };
    await expect(authorizeOrFailClosed(authorize, request)).resolves.toMatchObject({
      allowed: false,
      decision: 'deny',
    });
  });

  it('maps unexpected authorization failures to CONFIG_INVALID', async () => {
    const authorize: AuthorizePort = {
      authorize: (): Promise<AuthorizeResult> => Promise.reject(new Error('ECONNRESET')),
    };
    await expect(authorizeOrFailClosed(authorize, request)).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
    });
  });

  it('preserves ActivityError from the authorization client', async () => {
    const authorize: AuthorizePort = {
      authorize: (): Promise<AuthorizeResult> =>
        Promise.reject(new ActivityError('CLIENT_ASSERTION_INVALID', 'bad assertion')),
    };
    await expect(authorizeOrFailClosed(authorize, request)).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_INVALID',
    });
  });
});

describe('requireAllowed', () => {
  it('fails closed on deny', async () => {
    const authorize: AuthorizePort = {
      authorize: (): Promise<AuthorizeResult> =>
        Promise.resolve({
          allowed: false,
          permissionId: request.permissionId,
          decision: 'deny',
        }),
    };
    await expect(requireAllowed(authorize, request)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
