import { Controller, Get, Headers, Inject, Optional, UnauthorizedException } from '@nestjs/common';

import { IDENTITY_SERVICE_BASE_URL } from './activity-proxy.tokens.js';
import { resolveSessionActor } from './session-actor.resolver.js';

/**
 * WWW session probe for apps/web (does not expose Identity cookies or tokens).
 */
@Controller('session')
export class SessionController {
  public constructor(
    @Optional()
    @Inject(IDENTITY_SERVICE_BASE_URL)
    private readonly identityBaseUrl: string | null = null,
  ) {}

  @Get('me')
  public async me(@Headers('cookie') cookie: string | undefined): Promise<{
    authenticated: true;
    v2UserId: string;
    discordUserId: string;
    displayName: string | null;
    avatarUrl: string | null;
  }> {
    const actor = await resolveSessionActor(cookie, this.identityBaseUrl);
    if (actor === null) {
      throw new UnauthorizedException('Not signed in');
    }
    return {
      authenticated: true,
      v2UserId: actor.v2UserId,
      discordUserId: actor.discordUserId,
      displayName: actor.displayName,
      avatarUrl: actor.avatarUrl,
    };
  }
}
