import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { IdentitySessionPort } from '../application/ports/identity.ports.js';
import { IdentityError } from '../domain/errors.js';
import type { IdentityUserView } from '../domain/identity-models.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { IdentityController } from './identity.controller.js';

const config = { IDENTITY_AUTH_BASE_URL: 'http://127.0.0.1:4200' } as IdentityEnv;
const request = { headers: { cookie: 'v2.identity.session=abc' } } as unknown as FastifyRequest;

const user: IdentityUserView = {
  id: 'u1',
  name: 'User',
  email: null,
  emailSynthetic: true,
  emailVerified: false,
  image: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function spies() {
  return {
    getMe: vi.fn().mockResolvedValue(user),
    listAccounts: vi.fn().mockResolvedValue([]),
    startLink: vi.fn().mockResolvedValue({ url: 'https://provider.test/auth' }),
    unlinkAccount: vi.fn().mockResolvedValue(undefined),
    logoutCurrent: vi.fn().mockResolvedValue(undefined),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    revokeAllSessionsForUser: vi.fn().mockResolvedValue(undefined),
  };
}

function controllerWith(mock: IdentitySessionPort): IdentityController {
  return new IdentityController(mock, config);
}

describe('IdentityController', () => {
  it('returns the current user', async () => {
    await expect(controllerWith(spies()).me(request)).resolves.toEqual(user);
  });

  it('throws UNAUTHENTICATED when no session', async () => {
    const mock = spies();
    mock.getMe = vi.fn().mockResolvedValue(null);
    await expect(controllerWith(mock).me(request)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('throws AUTH_DISABLED when the port is null', async () => {
    const controller = new IdentityController(null, config);
    await expect(controller.me(request)).rejects.toMatchObject({ code: 'AUTH_DISABLED' });
  });

  it('lists accounts', async () => {
    await expect(controllerWith(spies()).accounts(request)).resolves.toEqual({ accounts: [] });
  });

  it('starts linking a valid provider', async () => {
    const mock = spies();
    const result = await controllerWith(mock).link('discord', request, {
      callbackURL: 'http://cb.test/done',
    });
    expect(result.url).toBe('https://provider.test/auth');
    expect(mock.startLink).toHaveBeenCalledWith(
      'discord',
      expect.any(Headers),
      'http://cb.test/done',
    );
  });

  it('rejects an unsupported provider before hitting the port', async () => {
    const mock = spies();
    await expect(controllerWith(mock).link('github', request, {})).rejects.toBeInstanceOf(
      IdentityError,
    );
    expect(mock.startLink).not.toHaveBeenCalled();
  });

  it('rejects an invalid callbackURL', async () => {
    await expect(
      controllerWith(spies()).link('discord', request, { callbackURL: 'not-a-url' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('falls back to the base url when no callback is given', async () => {
    const mock = spies();
    await controllerWith(mock).link('google', request, {});
    expect(mock.startLink).toHaveBeenCalledWith(
      'google',
      expect.any(Headers),
      'http://127.0.0.1:4200',
    );
  });

  it('unlinks a valid account id', async () => {
    const mock = spies();
    await controllerWith(mock).unlink('acc-1', request);
    expect(mock.unlinkAccount).toHaveBeenCalledWith('acc-1', expect.any(Headers));
  });

  it('rejects an empty account id', async () => {
    await expect(controllerWith(spies()).unlink('', request)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('logs out current and all sessions', async () => {
    const mock = spies();
    const controller = controllerWith(mock);
    await expect(controller.logout(request)).resolves.toEqual({ status: 'ok' });
    await expect(controller.logoutAll(request)).resolves.toEqual({ status: 'ok' });
    expect(mock.logoutCurrent).toHaveBeenCalledOnce();
    expect(mock.logoutAll).toHaveBeenCalledOnce();
  });
});
