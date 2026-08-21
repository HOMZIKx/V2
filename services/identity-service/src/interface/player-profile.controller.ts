import { Body, Controller, Get, Inject, Post, Put, Req, UseFilters } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { PARTY_ROLE_KEYS } from '@v2/hub-core';

import type { IdentitySessionPort } from '../application/ports/identity.ports.js';
import * as identity from '../application/use-cases/identity.use-cases.js';
import { IdentityError } from '../domain/errors.js';
import type { PlayerProfileRepository } from '../infrastructure/persistence/player-profile.repository.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { IDENTITY_SESSION_PORT, PLAYER_PROFILE_REPOSITORY } from './identity.tokens.js';
import { toWebHeaders } from './request-headers.js';

const characterSchema = z.object({
  nickname: z.string().trim().min(1).max(64),
  classSpecKey: z.string().min(1).max(64),
  level: z.number().int().min(1).max(999).nullable().optional(),
  isDefault: z.boolean().optional(),
  partyRoles: z.array(z.enum(PARTY_ROLE_KEYS)).min(1).max(4),
});

const interestsSchema = z.object({
  interestKeys: z.array(z.string().min(1).max(64)).max(64),
});

@Controller('identity/v1/profile')
@UseFilters(IdentityExceptionFilter)
export class PlayerProfileController {
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
  public async getProfile(@Req() request: FastifyRequest) {
    const userId = await this.requireUserId(request);
    const repo = this.requireProfiles();
    const user = await identity.getMe(this.requirePort(), toWebHeaders(request.headers));
    await repo.ensureProfile(userId, user?.name ?? null);
    const profile = await repo.getProfile(userId);
    return { profile };
  }

  @Get('interests/catalog')
  public async interestCatalog(@Req() request: FastifyRequest) {
    await this.requireUserId(request);
    const catalog = await this.requireProfiles().listInterestCatalog();
    return { catalog };
  }

  @Put('interests')
  public async setInterests(@Req() request: FastifyRequest, @Body() body: unknown) {
    const userId = await this.requireUserId(request);
    const parsed = interestsSchema.safeParse(body);
    if (!parsed.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Invalid interests payload');
    }
    await this.requireProfiles().setUserInterests(userId, parsed.data.interestKeys);
    const profile = await this.requireProfiles().getProfile(userId);
    return { profile };
  }

  @Post('characters')
  public async createCharacter(@Req() request: FastifyRequest, @Body() body: unknown) {
    const userId = await this.requireUserId(request);
    const parsed = characterSchema.safeParse(body);
    if (!parsed.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Invalid character payload');
    }
    try {
      const id = await this.requireProfiles().upsertCharacter(userId, {
        nickname: parsed.data.nickname,
        classSpecKey: parsed.data.classSpecKey,
        level: parsed.data.level ?? null,
        isDefault: parsed.data.isDefault ?? false,
        partyRoles: parsed.data.partyRoles,
      });
      const profile = await this.requireProfiles().getProfile(userId);
      return { characterId: id, profile };
    } catch (error) {
      throw new IdentityError(
        'VALIDATION_FAILED',
        error instanceof Error ? error.message : 'Character validation failed',
      );
    }
  }
}
