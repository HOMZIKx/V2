import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

import type { GatewayHealthSnapshot } from '../../application/ports/gateway.ports.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import { DISCORD_CONFIG_TOKEN, DISCORD_GATEWAY_TOKEN } from '../discord/discord.tokens.js';

@Controller()
export class HealthController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null,
  ) {}

  @Get('health/live')
  public live(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('health/ready')
  public ready(): {
    readonly status: 'ok';
    readonly discordEnabled: boolean;
    readonly discordState: string;
  } {
    if (!this.config.DISCORD_ENABLED) {
      return {
        status: 'ok',
        discordEnabled: false,
        discordState: 'disabled',
      };
    }

    const snapshot = this.requireSnapshot();
    if (snapshot.state !== 'ready' || !snapshot.isolationOk) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        discordEnabled: true,
        discordState: snapshot.state,
        isolationOk: snapshot.isolationOk,
      });
    }

    return {
      status: 'ok',
      discordEnabled: true,
      discordState: snapshot.state,
    };
  }

  @Get('health/discord')
  public discord(): {
    readonly enabled: boolean;
    readonly state: string;
    readonly guildId: string;
    readonly pingMs: number | null;
    readonly uptimeSeconds: number;
    readonly commandsRegistered: boolean;
    readonly isolationOk: boolean;
    readonly lastError: string | null;
  } {
    if (!this.config.DISCORD_ENABLED || this.gateway === null) {
      return {
        enabled: false,
        state: 'disabled',
        guildId: this.config.DISCORD_TEST_GUILD_ID,
        pingMs: null,
        uptimeSeconds: 0,
        commandsRegistered: false,
        isolationOk: true,
        lastError: null,
      };
    }

    const snapshot = this.gateway.getSnapshot();
    return {
      enabled: snapshot.enabled,
      state: snapshot.state,
      guildId: snapshot.guildId,
      pingMs: snapshot.pingMs,
      uptimeSeconds: snapshot.uptimeSeconds,
      commandsRegistered: snapshot.commandsRegistered,
      isolationOk: snapshot.isolationOk,
      lastError: snapshot.lastError,
    };
  }

  private requireSnapshot(): GatewayHealthSnapshot {
    if (this.gateway === null) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        discordEnabled: true,
        discordState: 'failed',
      });
    }
    return this.gateway.getSnapshot();
  }
}
