import { Body, Controller, Inject, Post, Req, UseFilters } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { IdentitySessionPort } from '../application/ports/identity.ports.js';
import * as identity from '../application/use-cases/identity.use-cases.js';
import { IdentityError } from '../domain/errors.js';
import type { PlayerProfileRepository } from '../infrastructure/persistence/player-profile.repository.js';
import { IdentityExceptionFilter } from './identity-exception.filter.js';
import { IDENTITY_SESSION_PORT, PLAYER_PROFILE_REPOSITORY } from './identity.tokens.js';
import { toWebHeaders } from './request-headers.js';

const resolveDiscordSchema = z.object({
  discordUserId: z.string().trim().min(17).max(20).regex(/^\d+$/),
});

@Controller('identity/v1/directory')
@UseFilters(IdentityExceptionFilter)
export class DirectoryController {
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

  @Post('resolve-discord')
  public async resolveDiscord(@Req() request: FastifyRequest, @Body() body: unknown) {
    await this.requireUserId(request);
    const parsed = resolveDiscordSchema.safeParse(body);
    if (!parsed.success) {
      throw new IdentityError('VALIDATION_FAILED', 'Invalid discordUserId');
    }

    const entry = await this.requireProfiles().resolveDiscordDirectoryEntry(
      parsed.data.discordUserId,
    );
    if (entry === null) {
      throw new IdentityError('NOT_FOUND', 'Discord account not linked to V2 identity');
    }

    return { entry };
  }
}
