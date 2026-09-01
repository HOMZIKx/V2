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
import { decodeJwt } from 'jose';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { PARTY_ROLE_KEYS } from '@v2/hub-core';

import type { ClientAssertionPort } from '../application/ports/internal-token.ports.js';
import { IdentityError } from '../domain/errors.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import type { PlayerProfileRepository } from '../infrastructure/persistence/player-profile.repository.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import {
  CLIENT_ASSERTION_PORT,
  IDENTITY_CONFIG,
  PLAYER_PROFILE_REPOSITORY,
} from './identity.tokens.js';

const characterSchema = z.object({
  nickname: z.string().trim().min(1).max(64),
  classSpecKey: z.string().min(1).max(64),
  level: z.number().int().min(1).max(999).nullable().optional(),
  isDefault: z.boolean().optional(),
  partyRoles: z.array(z.enum(PARTY_ROLE_KEYS)).min(1).max(4),
});

function readClientAssertion(request: FastifyRequest): string | undefined {
  const assertionHeader = request.headers['identity-client-assertion'];
  if (typeof assertionHeader === 'string') {
    return assertionHeader;
  }
  if (Array.isArray(assertionHeader)) {
    return assertionHeader[0];
  }
  return undefined;
}

function readActorDiscordUserId(assertion: string): string {
  let payload: unknown;
  try {
    payload = decodeJwt(assertion);
  } catch {
    throw new IdentityError('CLIENT_ASSERTION_INVALID', 'Invalid assertion payload');
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new IdentityError('CLIENT_ASSERTION_INVALID', 'Invalid assertion payload');
  }
  const actor = (payload as Record<string, unknown>).actor_discord_user_id;
  if (typeof actor !== 'string' || actor.trim().length === 0) {
    throw new IdentityError('CLIENT_ASSERTION_INVALID', 'Missing actor_discord_user_id');
  }
  return actor.trim();
}

/**
 * S2S player profile for Discord gateway — session-less, assertion-bound to Discord actor.
 */
@Controller('identity/v1/internal/profile')
@UseFilters(IdentityExceptionFilter)
export class InternalProfileController {
  public constructor(
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnv,
    @Inject(PLAYER_PROFILE_REPOSITORY)
    private readonly profiles: PlayerProfileRepository | null,
    @Inject(CLIENT_ASSERTION_PORT) private readonly assertionPort: ClientAssertionPort | null,
  ) {}

  private requireEnabled(): {
    profiles: PlayerProfileRepository;
    assertionPort: ClientAssertionPort;
  } {
    if (!this.config.IDENTITY_INTERNAL_JWT_ENABLED) {
      throw new IdentityError('INTERNAL_JWT_DISABLED');
    }
    if (this.profiles === null || this.assertionPort === null) {
      throw new IdentityError('INTERNAL_JWT_DISABLED');
    }
    return { profiles: this.profiles, assertionPort: this.assertionPort };
  }

  private async verifyAssertion(
    request: FastifyRequest,
    expectedAudience: string,
  ): Promise<{ assertion: string; discordUserId: string }> {
    const { assertionPort } = this.requireEnabled();
    const assertion = readClientAssertion(request);
    if (assertion === undefined || assertion.length === 0) {
      throw new IdentityError(
        'CLIENT_ASSERTION_INVALID',
        'Missing Identity-Client-Assertion header',
      );
    }
    const replayTtl =
      this.config.IDENTITY_CLIENT_ASSERTION_MAX_TTL_SECONDS +
      this.config.IDENTITY_CLIENT_ASSERTION_CLOCK_SKEW_SECONDS;
    const verified = await assertionPort.verify(assertion, expectedAudience);
    await assertionPort.assertJtiOnce(verified.jti, replayTtl);
    return { assertion, discordUserId: readActorDiscordUserId(assertion) };
  }

  private async requireUserId(discordUserId: string): Promise<string> {
    const { profiles } = this.requireEnabled();
    const userId = await profiles.resolveUserIdByDiscordAccountId(discordUserId);
    if (userId === null) {
      throw new IdentityError('NOT_FOUND', 'Discord user has no linked identity profile');
    }
    return userId;
  }

  @Get()
  public async getProfile(@Req() request: FastifyRequest) {
    const readUrl = this.config.IDENTITY_INTERNAL_PROFILE_READ_URL;
    if (readUrl === undefined) {
      throw new IdentityError('INTERNAL_JWT_DISABLED', 'Internal profile read URL is not configured');
    }
    const { discordUserId } = await this.verifyAssertion(request, readUrl);
    const userId = await this.requireUserId(discordUserId);
    const { profiles } = this.requireEnabled();
    await profiles.ensureProfile(userId, null);
    const profile = await profiles.getProfile(userId);
    return { profile };
  }

  @Post('characters')
  @HttpCode(200)
  public async createCharacter(@Req() request: FastifyRequest, @Body() body: unknown) {
    const assertionAud = this.config.IDENTITY_INTERNAL_PROFILE_READ_URL;
    if (assertionAud === undefined) {
      throw new IdentityError(
        'INTERNAL_JWT_DISABLED',
        'Internal profile assertion audience is not configured',
      );
    }
    const parsed = characterSchema.safeParse(body);
    if (!parsed.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Invalid character payload');
    }
    const { discordUserId } = await this.verifyAssertion(request, assertionAud);
    const userId = await this.requireUserId(discordUserId);
    const { profiles } = this.requireEnabled();
    try {
      const characterId = await profiles.upsertCharacter(userId, {
        nickname: parsed.data.nickname,
        classSpecKey: parsed.data.classSpecKey,
        level: parsed.data.level ?? null,
        isDefault: parsed.data.isDefault ?? false,
        partyRoles: parsed.data.partyRoles,
      });
      const profile = await profiles.getProfile(userId);
      return { characterId, profile };
    } catch (error) {
      throw new IdentityError(
        'VALIDATION_FAILED',
        error instanceof Error ? error.message : 'Character validation failed',
      );
    }
  }

  @Put('characters/:characterId')
  @HttpCode(200)
  public async updateCharacter(
    @Req() request: FastifyRequest,
    @Param('characterId') characterId: string,
    @Body() body: unknown,
  ) {
    if (typeof characterId !== 'string' || characterId.trim().length === 0) {
      throw new IdentityError('VALIDATION_FAILED', 'Invalid character id');
    }
    const assertionAud = this.config.IDENTITY_INTERNAL_PROFILE_READ_URL;
    if (assertionAud === undefined) {
      throw new IdentityError(
        'INTERNAL_JWT_DISABLED',
        'Internal profile assertion audience is not configured',
      );
    }
    const parsed = characterSchema.safeParse(body);
    if (!parsed.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Invalid character payload');
    }
    const { discordUserId } = await this.verifyAssertion(request, assertionAud);
    const userId = await this.requireUserId(discordUserId);
    const { profiles } = this.requireEnabled();
    try {
      const id = await profiles.upsertCharacter(
        userId,
        {
          nickname: parsed.data.nickname,
          classSpecKey: parsed.data.classSpecKey,
          level: parsed.data.level ?? null,
          isDefault: parsed.data.isDefault ?? false,
          partyRoles: parsed.data.partyRoles,
        },
        characterId.trim(),
      );
      const profile = await profiles.getProfile(userId);
      return { characterId: id, profile };
    } catch (error) {
      throw new IdentityError(
        'VALIDATION_FAILED',
        error instanceof Error ? error.message : 'Character validation failed',
      );
    }
  }
}
