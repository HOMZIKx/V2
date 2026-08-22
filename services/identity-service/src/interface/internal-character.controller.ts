import { Body, Controller, HttpCode, Inject, Post, Req, UseFilters } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { PARTY_ROLE_KEYS } from '@v2/hub-core';

import type { ClientAssertionPort } from '../application/ports/internal-token.ports.js';
import { IdentityError } from '../domain/errors.js';
import {
  assertValidClassSpecKey,
  assertValidPartyRoles,
  resolveClassSpecLabel,
} from '../domain/player-profile.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import type { PlayerProfileRepository } from '../infrastructure/persistence/player-profile.repository.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import {
  CLIENT_ASSERTION_PORT,
  IDENTITY_CONFIG,
  PLAYER_PROFILE_REPOSITORY,
} from './identity.tokens.js';

const resolveBodySchema = z.object({
  discordUserId: z.string().min(1).max(32),
  characterId: z.string().uuid(),
  sessionRoles: z.array(z.enum(PARTY_ROLE_KEYS)).min(1).max(4),
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

/**
 * S2S character resolve for Activity LFG — verifies ownership and canonical roles.
 * Caller must present client assertion whose aud equals IDENTITY_CHARACTER_RESOLVE_URL.
 */
@Controller('identity/v1/internal')
@UseFilters(IdentityExceptionFilter)
export class InternalCharacterController {
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

  @Post('character/resolve')
  @HttpCode(200)
  public async resolveCharacter(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
  ): Promise<{
    characterId: string;
    classSpecKey: string;
    classSpecLabel: string;
    supportedPartyRoles: readonly string[];
    sessionRoles: readonly string[];
  }> {
    const { profiles, assertionPort } = this.requireEnabled();
    const parsed = resolveBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Invalid character resolve payload');
    }

    const resolveUrl = this.config.IDENTITY_CHARACTER_RESOLVE_URL;
    if (resolveUrl === undefined) {
      throw new IdentityError('INTERNAL_JWT_DISABLED', 'Character resolve URL is not configured');
    }

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

    const verified = await assertionPort.verify(assertion, resolveUrl);
    await assertionPort.assertJtiOnce(verified.jti, replayTtl);

    const userId = await profiles.resolveUserIdByDiscordAccountId(parsed.data.discordUserId);
    if (userId === null) {
      throw new IdentityError('NOT_FOUND', 'Discord user has no linked identity profile');
    }

    const character = await profiles.getCharacterForUser(userId, parsed.data.characterId);
    if (character === null) {
      throw new IdentityError('NOT_FOUND', 'Character not found for user');
    }

    try {
      assertValidClassSpecKey(character.classSpecKey);
    } catch {
      throw new IdentityError('VALIDATION_FAILED', 'Character class/spec is disabled or unknown');
    }

    const supportedPartyRoles = assertValidPartyRoles(character.partyRoles);
    const sessionRoles = assertValidPartyRoles(parsed.data.sessionRoles);
    for (const role of sessionRoles) {
      if (!supportedPartyRoles.includes(role)) {
        throw new IdentityError(
          'VALIDATION_FAILED',
          `Session role ${role} is not supported by character`,
        );
      }
    }

    return {
      characterId: character.id,
      classSpecKey: character.classSpecKey,
      classSpecLabel: resolveClassSpecLabel(character.classSpecKey),
      supportedPartyRoles,
      sessionRoles,
    };
  }
}
