import {
  Controller,
  Get,
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
      throw new IdentityError('VALIDATION_FAILED', 'Invalid callbackURL');
    }
    if (!isAllowedCallbackUrl(parsedCallback.data, this.config)) {
      throw new IdentityError('VALIDATION_FAILED', 'callbackURL is not an allowed origin');
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
}
