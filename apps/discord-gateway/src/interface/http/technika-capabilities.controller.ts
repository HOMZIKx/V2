import { Controller, Get, Inject } from '@nestjs/common';

import { listCapabilitiesForApi } from '../../application/technika/capabilities.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import { DISCORD_CONFIG_TOKEN } from '../discord/discord.tokens.js';

@Controller('discord/v1')
export class TechnikaCapabilitiesController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly envConfig: DiscordGatewayConfig,
  ) {}

  /**
   * Read-only capability schema for Technika UI (Kuzyn).
   * Public — no secrets in schema or response (WEB_ACCESS).
   */
  @Get('capabilities')
  public listCapabilities(): ReturnType<typeof listCapabilitiesForApi> {
    return listCapabilitiesForApi(this.envConfig.DISCORD_STRICT_GUILD_ISOLATION);
  }
}
