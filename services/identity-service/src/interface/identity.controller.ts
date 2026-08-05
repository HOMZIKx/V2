import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { IdentitySessionPort } from '../application/ports/identity.ports.js';
import * as identity from '../application/use-cases/identity.use-cases.js';
import { IdentityError } from '../domain/errors.js';
import {
  type IdentityUserView,
  type LinkedAccountView,
  isSupportedProvider,
} from '../domain/identity-models.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { IDENTITY_CONFIG, IDENTITY_SESSION_PORT } from './identity.tokens.js';
import { toWebHeaders } from './request-headers.js';

const providerSchema = z.string().refine(isSupportedProvider, 'unsupported provider');
const accountIdSchema = z.string().min(1).max(256);
const callbackSchema = z.string().url().max(2048);

@Controller('identity')
@UseFilters(IdentityExceptionFilter)
export class IdentityController {
  public constructor(
    @Inject(IDENTITY_SESSION_PORT) private readonly port: IdentitySessionPort | null,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnv,
  ) {}

  private requirePort(): IdentitySessionPort {
    if (this.port === null) {
      throw new IdentityError('AUTH_DISABLED', 'Identity auth is disabled');
    }
    return this.port;
  }

  @Get('me')
  public async me(@Req() request: FastifyRequest): Promise<IdentityUserView> {
    const port = this.requirePort();
    const user = await identity.getMe(port, toWebHeaders(request.headers));
    if (user === null) {
      throw new IdentityError('UNAUTHENTICATED');
    }
    return user;
  }

  @Get('accounts')
  public async accounts(@Req() request: FastifyRequest): Promise<{ accounts: LinkedAccountView[] }> {
    const port = this.requirePort();
    const accounts = await identity.listAccounts(port, toWebHeaders(request.headers));
    return { accounts };
  }

  @Post('link/:provider')
  public async link(
    @Param('provider') provider: string,
    @Req() request: FastifyRequest,
    @Body() body: unknown,
    @Query('callbackURL') callbackQuery?: string,
  ): Promise<{ url: string }> {
    const port = this.requirePort();

    const parsedProvider = providerSchema.safeParse(provider);
    if (!parsedProvider.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Unsupported provider');
    }

    const bodyCallback =
      typeof body === 'object' && body !== null && 'callbackURL' in body
        ? (body as { callbackURL?: unknown }).callbackURL
        : undefined;
    const rawCallback = callbackQuery ?? bodyCallback ?? this.config.IDENTITY_AUTH_BASE_URL;

    const parsedCallback = callbackSchema.safeParse(rawCallback);
    if (!parsedCallback.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Invalid callbackURL');
    }

    return identity.startLink(
      port,
      parsedProvider.data,
      toWebHeaders(request.headers),
      parsedCallback.data,
    );
  }

  @Delete('accounts/:accountId')
  @HttpCode(204)
  public async unlink(
    @Param('accountId') accountId: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    const port = this.requirePort();
    const parsed = accountIdSchema.safeParse(accountId);
    if (!parsed.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Invalid accountId');
    }
    await identity.unlinkAccount(port, parsed.data, toWebHeaders(request.headers));
  }

  @Post('logout')
  @HttpCode(200)
  public async logout(@Req() request: FastifyRequest): Promise<{ status: 'ok' }> {
    const port = this.requirePort();
    await identity.logoutCurrent(port, toWebHeaders(request.headers));
    return { status: 'ok' };
  }

  @Post('logout-all')
  @HttpCode(200)
  public async logoutAll(@Req() request: FastifyRequest): Promise<{ status: 'ok' }> {
    const port = this.requirePort();
    await identity.logoutAll(port, toWebHeaders(request.headers));
    return { status: 'ok' };
  }
}
