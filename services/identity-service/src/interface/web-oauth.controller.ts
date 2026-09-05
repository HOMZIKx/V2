import {
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { IdentitySessionPort } from '../application/ports/identity.ports.js';
import * as identity from '../application/use-cases/identity.use-cases.js';
import { IdentityError } from '../domain/errors.js';
import type { AuthRuntime } from '../infrastructure/auth/create-better-auth.js';
import { isAllowedCallbackUrl } from '../infrastructure/config/callback-url.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import {
  AUTH_RUNTIME,
  IDENTITY_CONFIG,
  IDENTITY_SESSION_PORT,
} from './identity.tokens.js';
import { toWebHeaders } from './request-headers.js';

/**
 * Web ↔ Discord OAuth bridge for DESTILED (`apps/web`).
 *
 * Top-level GET navigation (not fetch→redirect) so the OAuth state cookie is
 * set on the same host as Discord's callback (`IDENTITY_AUTH_BASE_URL`).
 *
 * After Discord returns, Better Auth redirects to `returnTo`. Prefer
 * `/identity/web-bridge?to=<web origin>` so `/identity/me` runs same-origin
 * with the session cookie, then the bridge sends the viewer to the web app.
 */
@Controller('identity')
export class WebOauthController {
  public constructor(
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnv,
    @Inject(AUTH_RUNTIME) private readonly runtime: AuthRuntime | null,
    @Inject(IDENTITY_SESSION_PORT) private readonly port: IdentitySessionPort | null,
  ) {}

  @Get('web-oauth/discord')
  public async startDiscord(
    @Query('returnTo') returnTo: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (this.runtime === null || !this.config.IDENTITY_AUTH_ENABLED) {
      throw new NotFoundException();
    }

    const callbackURL =
      typeof returnTo === 'string' && returnTo.trim().length > 0
        ? returnTo.trim()
        : `${this.config.IDENTITY_AUTH_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:4200'}/identity/proof`;

    if (!isAllowedCallbackUrl(callbackURL, this.config)) {
      void reply.status(400).send({ error: 'invalid_return_to' });
      return;
    }

    const result = await this.runtime.auth.api.signInSocial({
      body: { provider: 'discord', callbackURL },
      returnHeaders: true,
    });

    const setCookies =
      typeof result.headers.getSetCookie === 'function' ? result.headers.getSetCookie() : [];
    if (setCookies.length > 0) {
      void reply.header('set-cookie', [...setCookies]);
    }

    const url = result.response.url;
    if (typeof url !== 'string' || url.length === 0) {
      void reply.status(500).send({ error: 'oauth_start_failed' });
      return;
    }

    void reply.redirect(url, 302);
  }

  /**
   * Same-origin post-login bridge: read session, then redirect to the web app
   * callback with viewer fields (dev-friendly when cookies are host-bound to :4200).
   * `to` must be an IDENTITY_TRUSTED_ORIGINS origin.
   */
  @Get('web-bridge')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  public async webBridge(
    @Query('to') to: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!this.config.IDENTITY_AUTH_ENABLED || this.port === null) {
      throw new NotFoundException();
    }

    const webOriginRaw = typeof to === 'string' ? to.trim() : '';
    if (!webOriginRaw) {
      void reply.status(400).send({ error: 'missing_to' });
      return;
    }

    let webOrigin: string;
    try {
      webOrigin = new URL(webOriginRaw).origin;
    } catch {
      void reply.status(400).send({ error: 'invalid_to' });
      return;
    }

    // Validate as a callback-style URL (origin + path) against trusted origins.
    if (!isAllowedCallbackUrl(`${webOrigin}/`, this.config)) {
      void reply.status(400).send({ error: 'untrusted_to' });
      return;
    }

    try {
      const user = await identity.getMe(this.port, toWebHeaders(request.headers));
      if (user === null) {
        void reply
          .status(200)
          .header('content-type', 'text/html; charset=utf-8')
          .send(renderBridgeError(webOrigin, 'Brak sesji Identity po Discord OAuth.'));
        return;
      }

      const accounts = await identity.listAccounts(this.port, toWebHeaders(request.headers));
      const discord = accounts.find((account) => account.provider === 'discord');
      const callback = new URL('/auth/callback', webOrigin);
      callback.searchParams.set('viewerId', user.id);
      callback.searchParams.set('displayName', user.name);
      if (discord?.accountId) {
        callback.searchParams.set('discordAccountId', discord.accountId);
      }

      void reply.redirect(callback.toString(), 302);
    } catch (error) {
      const message =
        error instanceof IdentityError ? error.code : 'identity_bridge_failed';
      void reply
        .status(200)
        .header('content-type', 'text/html; charset=utf-8')
        .send(renderBridgeError(webOrigin, `Nie udało się odczytać sesji (${message}).`));
    }
  }
}

function renderBridgeError(webOrigin: string, detail: string): string {
  const safeOrigin = webOrigin.replace(/"/g, '');
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DESTILED — logowanie</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 3rem auto; padding: 0 1rem; }
    a { color: inherit; }
  </style>
</head>
<body>
  <h1>Logowanie nie dokończone</h1>
  <p>${detail.replace(/</g, '&lt;')}</p>
  <p><a href="${safeOrigin}/">Wróć do DESTILED</a></p>
</body>
</html>`;
}
