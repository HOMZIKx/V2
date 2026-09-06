import { Module } from '@nestjs/common';
import path from 'node:path';

import { VersionedConfigStore } from '../application/technika/versioned-config-store.js';
import type { DiscordGatewayConfig } from '../infrastructure/discord/discord-config.js';
import {
  createDiscordGatewayOrNull,
  DiscordBootstrapService,
  loadDiscordConfig,
} from './discord/discord-bootstrap.service.js';
import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
  TECHNIKA_CONFIG_STORE_TOKEN,
} from './discord/discord.tokens.js';
import { HealthController } from './http/health.controller.js';
import { TechnikaCapabilitiesController } from './http/technika-capabilities.controller.js';
import { TechnikaConfigController } from './http/technika-config.controller.js';

function resolveTechnikaDataDir(config: DiscordGatewayConfig): string {
  if (config.DISCORD_GATEWAY_DATA_DIR.trim().length > 0) {
    return path.resolve(config.DISCORD_GATEWAY_DATA_DIR);
  }
  const local = path.resolve(process.cwd(), 'data');
  const fromApp = path.resolve(process.cwd(), 'apps/discord-gateway/data');
  const normalized = process.cwd().replace(/\\/g, '/');
  return normalized.endsWith('/apps/discord-gateway') ? local : fromApp;
}

@Module({
  controllers: [
    HealthController,
    TechnikaCapabilitiesController,
    TechnikaConfigController,
  ],
  providers: [
    {
      provide: DISCORD_CONFIG_TOKEN,
      useFactory: () => loadDiscordConfig(),
    },
    {
      provide: DISCORD_GATEWAY_TOKEN,
      useFactory: (config: DiscordGatewayConfig) => createDiscordGatewayOrNull(config),
      inject: [DISCORD_CONFIG_TOKEN],
    },
    {
      provide: TECHNIKA_CONFIG_STORE_TOKEN,
      useFactory: (config: DiscordGatewayConfig) =>
        new VersionedConfigStore({ dataDir: resolveTechnikaDataDir(config) }),
      inject: [DISCORD_CONFIG_TOKEN],
    },
    DiscordBootstrapService,
  ],
})
export class AppModule {}
