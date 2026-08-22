import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { IdentityError } from '../domain/errors.js';
import { isSupportedProvider } from '../domain/identity-models.js';
import type { AuthRuntime } from '../infrastructure/auth/create-better-auth.js';
import { isAllowedCallbackUrl } from '../infrastructure/config/callback-url.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { AUTH_RUNTIME, IDENTITY_CONFIG } from './identity.tokens.js';

/**
 * Top-level Discord OAuth start for apps/web (and other trusted WWW origins).
 * Same cookie/state constraints as the proof harness — browser must navigate here.
 */
@Controller('identity')
@UseFilters(IdentityExceptionFilter)
export class WebOauthController {
  public constructor(
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnv,
    @Inject(AUTH_RUNTIME) private readonly runtime: AuthRuntime | null,
  ) {}

  @Get('oauth/:provider')
  public async startOAuth(
    @Param('provider') provider: string,
    @Query('callbackURL') callbackURL: string | undefined,
    @Headers('accept') accept: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (this.runtime === null || !this.config.IDENTITY_AUTH_ENABLED) {
      throw new NotFoundException();
    }
    if (!isSupportedProvider(provider)) {
      throw new NotFoundException();
    }

    const fallback =
      this.config.IDENTITY_AUTH_BASE_URL !== undefined
        ? `${this.config.IDENTITY_AUTH_BASE_URL.replace(/\/$/, '')}/`
        : undefined;
    const parsedCallback = z
      .string()
      .url()
      .max(2048)
      .safeParse(callbackURL ?? fallback);
    if (!parsedCallback.success) {
      this.rejectCallback(reply, accept, 'Invalid callbackURL', callbackURL);
      return;
    }
    if (!isAllowedCallbackUrl(parsedCallback.data, this.config)) {
      this.rejectCallback(
        reply,
        accept,
        'callbackURL is not an allowed origin',
        parsedCallback.data,
      );
      return;
    }

    const result = await this.runtime.auth.api.signInSocial({
      body: { provider, callbackURL: parsedCallback.data },
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

  private rejectCallback(
    reply: FastifyReply,
    accept: string | undefined,
    message: string,
    callbackURL: string | undefined,
  ): void {
    const prefersHtml = (accept ?? '').includes('text/html');
    if (!prefersHtml) {
      throw new IdentityError('VALIDATION_FAILED', message);
    }

    const trusted = this.config.IDENTITY_TRUSTED_ORIGINS.join(', ') || '(empty)';
    const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"/><title>V2 login</title>
<style>
body{font-family:system-ui,sans-serif;background:#111;color:#eee;max-width:42rem;margin:3rem auto;padding:0 1rem;line-height:1.45}
code{background:#222;padding:.1rem .35rem;border-radius:4px}
a{color:#f0a46a}
</style></head><body>
<h1>Logowanie Discord zablokowane</h1>
<p><strong>${escapeHtml(message)}</strong></p>
<p>Callback: <code>${escapeHtml(callbackURL ?? '(brak)')}</code></p>
<p>Control Center otwieraj wyłącznie z dozwolonego originu, np.
<a href="https://v2-admin.zeabur.app/">https://v2-admin.zeabur.app/</a>
(nie z lokalnego <code>localhost</code> przeciwko produkcyjnemu API).</p>
<p>Na Zeabur w <code>identity-service</code> ustaw
<code>IDENTITY_TRUSTED_ORIGINS</code> na:
<code>https://v2-web.zeabur.app,https://v2-admin.zeabur.app</code>
i zrób redeploy Identity.</p>
<p>Aktualna lista trusted origins (serwer): <code>${escapeHtml(trusted)}</code></p>
</body></html>`;
    void reply.status(400).type('text/html; charset=utf-8').send(html);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
