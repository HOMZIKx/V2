import { Module } from '@nestjs/common';
import path from 'node:path';

import { VersionedConfigStore } from '../application/technika/versioned-config-store.js';
import type { DiscordGatewayConfig } from '../infrastructure/discord/discord-config.js';
import {
  createDiscordGatewayOrNull,
  DiscordBootstrapService,
  loadDiscordConfig,
} from './discord/discord-bootstrap.service.js';
import { MemberActivityVoiceBootstrapService } from './discord/member-activity-voice-bootstrap.service.js';
import { TeamKingdomWarBootstrapService } from './discord/team-kingdom-war-bootstrap.service.js';
import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
  MEMBER_ACTIVITY_COLLECTOR_TOKEN,
  MEMBER_ACTIVITY_STORE_TOKEN,
  TECHNIKA_CONFIG_STORE_TOKEN,
} from './discord/discord.tokens.js';
import { HealthController } from './http/health.controller.js';
import { NotifyController } from './http/notify.controller.js';
import { TeamKingdomWarController } from './http/team-kingdom-war.controller.js';
import { TechnikaCapabilitiesController } from './http/technika-capabilities.controller.js';
import { TechnikaConfigController } from './http/technika-config.controller.js';
import { TechnikaGuildPanelsController } from './http/technika-guild-panels.controller.js';
import { TechnikaGuildsController } from './http/technika-guilds.controller.js';
import { TechnikaPanelsController } from './http/technika-panels.controller.js';
import { MemberActivityController } from './http/member-activity.controller.js';
import { MemberActivityStore } from '../application/member-activity/member-activity-store.js';
import { MemberActivityCollector } from '../application/member-activity/member-activity-collector.js';
import { resolveActiveBotConfig } from '../application/technika/active-bot-config.js';
import { defaultMemberActivity } from '../application/technika/capabilities.js';

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
    NotifyController,
    TeamKingdomWarController,
    TechnikaCapabilitiesController,
    TechnikaConfigController,
    TechnikaGuildsController,
    TechnikaGuildPanelsController,
    TechnikaPanelsController,
    MemberActivityController,
  ],
  providers: [
    {
      provide: DISCORD_CONFIG_TOKEN,
      useFactory: () => loadDiscordConfig(),
    },
    {
      provide: TECHNIKA_CONFIG_STORE_TOKEN,
      useFactory: (config: DiscordGatewayConfig) =>
        new VersionedConfigStore({ dataDir: resolveTechnikaDataDir(config) }),
      inject: [DISCORD_CONFIG_TOKEN],
    },
    {
      provide: MEMBER_ACTIVITY_STORE_TOKEN,
      useFactory: (config: DiscordGatewayConfig) =>
        new MemberActivityStore(resolveTechnikaDataDir(config)),
      inject: [DISCORD_CONFIG_TOKEN],
    },
    {
      provide: MEMBER_ACTIVITY_COLLECTOR_TOKEN,
      useFactory: (activityStore: MemberActivityStore, store: VersionedConfigStore) =>
        new MemberActivityCollector(activityStore, () => {
          return resolveActiveBotConfig(store).memberActivity ?? defaultMemberActivity();
        }),
      inject: [MEMBER_ACTIVITY_STORE_TOKEN, TECHNIKA_CONFIG_STORE_TOKEN],
    },
    {
      provide: DISCORD_GATEWAY_TOKEN,
      useFactory: (
        config: DiscordGatewayConfig,
        store: VersionedConfigStore,
        collector: MemberActivityCollector,
      ) => createDiscordGatewayOrNull(config, store, collector),
      inject: [DISCORD_CONFIG_TOKEN, TECHNIKA_CONFIG_STORE_TOKEN, MEMBER_ACTIVITY_COLLECTOR_TOKEN],
    },
    DiscordBootstrapService,
    TeamKingdomWarBootstrapService,
    MemberActivityVoiceBootstrapService,
  ],
})
export class AppModule {}
