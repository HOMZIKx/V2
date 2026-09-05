import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { WebOauthController } from './web-oauth.controller.js';

const baseConfig = {
  IDENTITY_AUTH_BASE_PATH: '/api/auth',
  IDENTITY_AUTH_BASE_URL: 'http://127.0.0.1:4200',
  IDENTITY_AUTH_ENABLED: true,
  IDENTITY_TRUSTED_ORIGINS: ['http://127.0.0.1:3000', 'http://localhost:3000'],
  NODE_ENV: 'development',
} as IdentityEnv;

function mockReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  };
  return reply;
}

describe('WebOauthController', () => {
  it('404s when auth is disabled', async () => {
    const controller = new WebOauthController(
      { ...baseConfig, IDENTITY_AUTH_ENABLED: false },
      null,
      null,
    );
    const reply = mockReply();
    await expect(controller.startDiscord(undefined, reply as never)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects returnTo outside trusted origins', async () => {
    const signInSocial = vi.fn();
    const controller = new WebOauthController(
      baseConfig,
      { auth: { api: { signInSocial } } } as never,
      null,
    );
    const reply = mockReply();
    await controller.startDiscord('https://evil.example/phish', reply as never);
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(signInSocial).not.toHaveBeenCalled();
  });

  it('starts Discord OAuth with trusted returnTo and forwards set-cookie', async () => {
    const signInSocial = vi.fn().mockResolvedValue({
      headers: {
        getSetCookie: () => ['v2.identity.state=abc; Path=/; HttpOnly'],
      },
      response: { url: 'https://discord.com/oauth2/authorize?x=1' },
    });
    const controller = new WebOauthController(
      baseConfig,
      { auth: { api: { signInSocial } } } as never,
      null,
    );
    const reply = mockReply();
    const returnTo =
      'http://127.0.0.1:4200/identity/web-bridge?to=http%3A%2F%2F127.0.0.1%3A3000';
    await controller.startDiscord(returnTo, reply as never);
    expect(signInSocial).toHaveBeenCalledWith({
      body: { provider: 'discord', callbackURL: returnTo },
      returnHeaders: true,
    });
    expect(reply.header).toHaveBeenCalledWith('set-cookie', [
      'v2.identity.state=abc; Path=/; HttpOnly',
    ]);
    expect(reply.redirect).toHaveBeenCalledWith('https://discord.com/oauth2/authorize?x=1', 302);
  });

  it('allows returnTo on identity base origin (web-bridge)', async () => {
    const signInSocial = vi.fn().mockResolvedValue({
      headers: { getSetCookie: () => [] },
      response: { url: 'https://discord.com/oauth2/authorize?x=1' },
    });
    const controller = new WebOauthController(
      baseConfig,
      { auth: { api: { signInSocial } } } as never,
      null,
    );
    const reply = mockReply();
    await controller.startDiscord(
      'http://127.0.0.1:4200/identity/web-bridge?to=http://127.0.0.1:3000',
      reply as never,
    );
    expect(reply.redirect).toHaveBeenCalled();
  });
});
