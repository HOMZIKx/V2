import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseFilters,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { IdentitySessionPort } from '../application/ports/identity.ports.js';
import * as identity from '../application/use-cases/identity.use-cases.js';
import { IdentityError } from '../domain/errors.js';
import type { PlayerProfileRepository } from '../infrastructure/persistence/player-profile.repository.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { IDENTITY_SESSION_PORT, PLAYER_PROFILE_REPOSITORY } from './identity.tokens.js';
import { toWebHeaders } from './request-headers.js';

const createAccountSchema = z.object({
  displayName: z.string().trim().min(1).max(64),
  description: z.string().trim().max(256).nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
});

const updateAccountSchema = z.object({
  displayName: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(256).nullable().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
});

/**
 * Player Toolkit — logical game accounts (private player data).
 */
@Controller('identity/v1/player/accounts')
@UseFilters(IdentityExceptionFilter)
export class PlayerAccountsController {
  public constructor(
    @Inject(IDENTITY_SESSION_PORT) private readonly port: IdentitySessionPort | null,
    @Inject(PLAYER_PROFILE_REPOSITORY)
    private readonly profiles: PlayerProfileRepository | null,
  ) {}

  private requirePort(): IdentitySessionPort {
    if (this.port === null) {
      throw new IdentityError('AUTH_DISABLED', 'Identity auth is disabled');
    }
    return this.port;
  }

  private requireProfiles(): PlayerProfileRepository {
    if (this.profiles === null) {
      throw new IdentityError('AUTH_DISABLED', 'Player profile store is unavailable');
    }
    return this.profiles;
  }

  private async requireUserId(request: FastifyRequest): Promise<string> {
    const user = await identity.getMe(this.requirePort(), toWebHeaders(request.headers));
    if (user === null) {
      throw new IdentityError('UNAUTHENTICATED');
    }
    return user.id;
  }

  @Get()
  public async listAccounts(@Req() request: FastifyRequest) {
    const userId = await this.requireUserId(request);
    const accounts = await this.requireProfiles().listGameAccounts(userId);
    return { accounts };
  }

  @Post()
  @HttpCode(200)
  public async createAccount(@Req() request: FastifyRequest, @Body() body: unknown) {
    const userId = await this.requireUserId(request);
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Nieprawidłowe dane konta');
    }
    try {
      const account = await this.requireProfiles().createGameAccount(userId, {
        displayName: parsed.data.displayName,
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.displayOrder !== undefined
          ? { displayOrder: parsed.data.displayOrder }
          : {}),
      });
      return { account };
    } catch (error) {
      throw new IdentityError(
        'VALIDATION_FAILED',
        error instanceof Error ? error.message : 'Nie udało się utworzyć konta',
      );
    }
  }

  @Put(':accountId')
  @HttpCode(200)
  public async updateAccount(
    @Req() request: FastifyRequest,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
  ) {
    const userId = await this.requireUserId(request);
    if (typeof accountId !== 'string' || accountId.trim().length === 0) {
      throw new IdentityError('VALIDATION_FAILED', 'Nieprawidłowy identyfikator konta');
    }
    const parsed = updateAccountSchema.safeParse(body);
    if (!parsed.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Nieprawidłowe dane konta');
    }
    try {
      const account = await this.requireProfiles().updateGameAccount(userId, accountId.trim(), {
        ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.displayOrder !== undefined
          ? { displayOrder: parsed.data.displayOrder }
          : {}),
      });
      return { account };
    } catch (error) {
      throw new IdentityError(
        'VALIDATION_FAILED',
        error instanceof Error ? error.message : 'Nie udało się zaktualizować konta',
      );
    }
  }

  @Post(':accountId/archive')
  @HttpCode(200)
  public async archiveAccount(
    @Req() request: FastifyRequest,
    @Param('accountId') accountId: string,
  ) {
    const userId = await this.requireUserId(request);
    if (typeof accountId !== 'string' || accountId.trim().length === 0) {
      throw new IdentityError('VALIDATION_FAILED', 'Nieprawidłowy identyfikator konta');
    }
    try {
      await this.requireProfiles().archiveGameAccount(userId, accountId.trim());
      const accounts = await this.requireProfiles().listGameAccounts(userId);
      return { accounts };
    } catch (error) {
      throw new IdentityError(
        'VALIDATION_FAILED',
        error instanceof Error ? error.message : 'Nie udało się zarchiwizować konta',
      );
    }
  }
}
