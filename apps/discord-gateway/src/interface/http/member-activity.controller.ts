import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Inject,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

import { MemberActivityCollector } from '../../application/member-activity/member-activity-collector.js';
import { MemberActivityQuery } from '../../application/member-activity/member-activity-query.js';
import { MemberActivityStore } from '../../application/member-activity/member-activity-store.js';
import { resolveActiveBotConfig } from '../../application/technika/active-bot-config.js';
import {
  defaultMemberActivity,
  type MemberActivityConfig,
} from '../../application/technika/capabilities.js';
import type { VersionedConfigStore } from '../../application/technika/versioned-config-store.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import {
  DISCORD_CONFIG_TOKEN,
  MEMBER_ACTIVITY_COLLECTOR_TOKEN,
  MEMBER_ACTIVITY_STORE_TOKEN,
  TECHNIKA_CONFIG_STORE_TOKEN,
} from '../discord/discord.tokens.js';

function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (!provided || expected.length === 0) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

@Controller('discord/v1/member-activity')
export class MemberActivityController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly envConfig: DiscordGatewayConfig,
    @Inject(TECHNIKA_CONFIG_STORE_TOKEN) private readonly store: VersionedConfigStore,
    @Inject(MEMBER_ACTIVITY_STORE_TOKEN) private readonly activityStore: MemberActivityStore,
    @Inject(MEMBER_ACTIVITY_COLLECTOR_TOKEN)
    private readonly activityCollector: MemberActivityCollector,
  ) {}

  private cfg(): MemberActivityConfig {
    return resolveActiveBotConfig(this.store).memberActivity ?? defaultMemberActivity();
  }

  private query(): MemberActivityQuery {
    return new MemberActivityQuery(this.activityStore, () => this.cfg());
  }

  private flushLiveVoiceMinutes(): void {
    // A user can stay on VC for hours without emitting another VoiceStateUpdate.
    // Flush open sessions before reading stats so the dashboard does not show 0
    // until that user finally disconnects from voice.
    this.activityCollector.flushAllOpenSessions();
  }

  /** Dashboard: top N + own stats. Windows: 7d|14d|30d|since_bot. */
  @Get('me')
  public me(
    @Query('discordUserId') discordUserIdRaw: string | undefined,
    @Query('guildId') guildId: string | undefined,
    @Query('window') window: string | undefined,
  ) {
    const discordUserId = (discordUserIdRaw ?? '').trim();
    if (!/^\d{17,20}$/.test(discordUserId)) {
      throw new BadRequestException({ ok: false, error: 'invalid_discord_user_id' });
    }
    this.flushLiveVoiceMinutes();
    return this.query().me({ discordUserId, guildId, window });
  }

  /**
   * Ranking from daily buckets.
   * Dashboard: topN (default config.topN), window 7d|14d|30d.
   * Technika: full=1 + x-technika-secret, optional q=, window also since_bot.
   */
  @Get('ranking')
  public ranking(
    @Headers('x-technika-secret') technikaSecret: string | undefined,
    @Query('guildId') guildId: string | undefined,
    @Query('window') window: string | undefined,
    @Query('topN') topNRaw: string | undefined,
    @Query('q') q: string | undefined,
    @Query('full') fullRaw: string | undefined,
  ) {
    const wantFull = fullRaw === '1' || fullRaw === 'true';
    if (wantFull) {
      if (!secretsMatch(technikaSecret, this.envConfig.DISCORD_TECHNIKA_SHARED_SECRET)) {
        throw new UnauthorizedException({ ok: false, error: 'invalid_technika_secret' });
      }
    }
    const topN = topNRaw && /^\d+$/.test(topNRaw) ? Number(topNRaw) : undefined;
    this.flushLiveVoiceMinutes();
    return this.query().ranking({ guildId, window, topN, q, full: wantFull });
  }
}
