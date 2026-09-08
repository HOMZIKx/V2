import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { VoiceState } from 'discord.js';

import type { MemberActivityCollector } from '../../application/member-activity/member-activity-collector.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import {
  DISCORD_GATEWAY_TOKEN,
  MEMBER_ACTIVITY_COLLECTOR_TOKEN,
} from './discord.tokens.js';

const VOICE_CACHE_RECONCILE_MS = 60_000;

type RuntimeGuildWithVoiceStates = {
  readonly voiceStates: {
    readonly cache: ReadonlyMap<string, VoiceState>;
  };
};

type GatewayVoiceCacheInternals = {
  readonly client: {
    readonly guilds: {
      readonly cache: ReadonlyMap<string, RuntimeGuildWithVoiceStates>;
    };
  };
};

/**
 * Discord does not replay VoiceStateUpdate for members who were already on VC
 * when this process connected. Seed those open sessions once the application is
 * fully bootstrapped and periodically re-check the cache so collection can also
 * recover after a live config disable/enable cycle.
 */
@Injectable()
export class MemberActivityVoiceBootstrapService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MemberActivityVoiceBootstrapService.name);
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;

  public constructor(
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null,
    @Inject(MEMBER_ACTIVITY_COLLECTOR_TOKEN)
    private readonly collector: MemberActivityCollector,
  ) {}

  public onApplicationBootstrap(): void {
    this.recoverCurrentVoiceSessions(true);
    this.reconcileTimer = setInterval(() => {
      this.recoverCurrentVoiceSessions(false);
    }, VOICE_CACHE_RECONCILE_MS);
    this.reconcileTimer.unref();
  }

  public onApplicationShutdown(): void {
    if (this.reconcileTimer !== null) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    // Persist every full minute accumulated before a graceful deploy/restart.
    this.collector.flushAllOpenSessions();
  }

  private recoverCurrentVoiceSessions(logZero: boolean): void {
    if (this.gateway === null || this.gateway.getState() !== 'ready') {
      return;
    }

    try {
      const internals = this.gateway as unknown as GatewayVoiceCacheInternals;
      const states: VoiceState[] = [];
      for (const guild of internals.client.guilds.cache.values()) {
        states.push(...guild.voiceStates.cache.values());
      }
      const seeded = this.collector.seedCurrentVoiceStates(states);
      if (seeded > 0 || logZero) {
        this.logger.log(
          `Recovered ${seeded} active member-activity voice session(s) from Discord cache.`,
        );
      }
    } catch (error) {
      // Recovery is best-effort. A cache-shape regression must not take the bot
      // or the HTTP gateway down; regular VoiceStateUpdate events will still be
      // collected and the error remains visible in runtime logs.
      this.logger.warn(
        `Unable to recover active member-activity voice sessions: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
