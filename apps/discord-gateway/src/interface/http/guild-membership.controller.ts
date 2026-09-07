import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  ServiceUnavailableException,
} from '@nestjs/common';
import { REST, Routes } from 'discord.js';

import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import { DISCORD_CONFIG_TOKEN } from '../discord/discord.tokens.js';
import { assertTechnikaSecret, TECHNIKA_SECRET_HEADER } from './technika-auth.js';

function discordErrorCode(error: unknown): string | number | null {
  if (!error || typeof error !== 'object') return null;
  const record = error as { code?: unknown; rawError?: { code?: unknown } };
  const value = record.code ?? record.rawError?.code;
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

@Controller('discord/v1/guilds')
export class GuildMembershipController {
  private readonly rest: REST;

  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
  ) {
    this.rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
  }

  @Get(':guildId/members/:userId')
  public async getMembership(
    @Headers(TECHNIKA_SECRET_HEADER) secret: string | undefined,
    @Param('guildId') guildId: string,
    @Param('userId') userId: string,
  ): Promise<{
    readonly ok: true;
    readonly member: true;
    readonly guildId: string;
    readonly userId: string;
  }> {
    assertTechnikaSecret(secret, this.config.DISCORD_TECHNIKA_SHARED_SECRET);

    if (!/^\d{17,20}$/.test(guildId)) {
      throw new BadRequestException({ ok: false, error: 'invalid_guild_id' });
    }
    if (!/^\d{17,20}$/.test(userId)) {
      throw new BadRequestException({ ok: false, error: 'invalid_user_id' });
    }

    try {
      await this.rest.get(Routes.guildMember(guildId, userId));
      return { ok: true, member: true, guildId, userId };
    } catch (error) {
      const code = discordErrorCode(error);
      if (code === 10007 || code === '10007') {
        throw new NotFoundException({
          ok: false,
          error: 'member_not_found',
          guildId,
          userId,
        });
      }

      throw new ServiceUnavailableException({
        ok: false,
        error: 'discord_membership_unavailable',
        guildId,
      });
    }
  }
}
