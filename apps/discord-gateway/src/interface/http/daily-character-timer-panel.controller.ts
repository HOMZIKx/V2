import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { createLogger } from '@v2/observability';

import {
  cancelCharacterTimerReminder,
  scheduleCharacterTimerReminder,
} from '../../application/notify/character-timer-reminders.js';
import {
  getDailyCharacterTimerPanelConfig,
  replaceDailyCharacterTimerPanelConfig,
} from '../../application/notify/daily-character-timer-panel-registry.js';
import { refreshExistingDailyCharacterTimerPanels } from '../../application/notify/daily-character-timer-panel-runtime.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
} from '../discord/discord.tokens.js';

const HEADER_NAME = 'x-notify-secret';
const logger = createLogger('daily-character-timer-panels');

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function snowflakes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter((id) => /^\d{17,20}$/.test(id)),
    ),
  ].slice(0, 40);
}

@Controller('notify')
export class DailyCharacterTimerPanelController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Inject(DISCORD_GATEWAY_TOKEN) private readonly gateway: DiscordJsGatewayAdapter | null,
  ) {}

  private assertSecret(secret: string | undefined): void {
    if (!secretMatches(secret, this.config.DISCORD_NOTIFY_SHARED_SECRET)) {
      throw new UnauthorizedException({ ok: false, error: 'invalid_notify_secret' });
    }
  }

  @Post('daily-timer-panel-config')
  public setConfig(
    @Headers(HEADER_NAME) secret: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertSecret(secret);
    const row = asRecord(body);
    const workspaceId = typeof row?.workspaceId === 'string' ? row.workspaceId.trim() : '';
    const dailyTime = typeof row?.dailyTime === 'string' ? row.dailyTime.trim() : '';
    const config = replaceDailyCharacterTimerPanelConfig({
      workspaceId,
      dailyTime,
      recipients: snowflakes(row?.recipients),
    });
    if (!config) {
      throw new BadRequestException({ ok: false, error: 'invalid_daily_timer_panel_config' });
    }
    return { ok: true, config };
  }

  @Post('daily-timer-panel-config/get')
  public getConfig(
    @Headers(HEADER_NAME) secret: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertSecret(secret);
    const row = asRecord(body);
    const workspaceId = typeof row?.workspaceId === 'string' ? row.workspaceId.trim() : '';
    if (!workspaceId) {
      throw new BadRequestException({ ok: false, error: 'workspace_id_required' });
    }
    return { ok: true, config: getDailyCharacterTimerPanelConfig(workspaceId) };
  }

  @Post('daily-timer-panel-refresh')
  public async refresh(
    @Headers(HEADER_NAME) secret: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertSecret(secret);
    if (!this.config.DISCORD_ENABLED || !this.gateway) {
      throw new ServiceUnavailableException({ ok: false, error: 'discord_disabled' });
    }
    const row = asRecord(body);
    const workspaceId = typeof row?.workspaceId === 'string' ? row.workspaceId.trim() : '';
    if (!workspaceId) {
      throw new BadRequestException({ ok: false, error: 'workspace_id_required' });
    }

    const timerId = typeof row?.timerId === 'string' ? row.timerId.trim() : '';
    const endsAt = typeof row?.endsAt === 'string' ? row.endsAt.trim() : '';
    const panelConfig = getDailyCharacterTimerPanelConfig(workspaceId);
    const schedulerUser = panelConfig?.recipients[0] ?? null;
    const readyAtMs = endsAt ? Date.parse(endsAt) : Number.NaN;

    if (timerId && schedulerUser && Number.isFinite(readyAtMs)) {
      cancelCharacterTimerReminder(schedulerUser, timerId);
      const deps = {
        logger,
        send: async () => {
          await refreshExistingDailyCharacterTimerPanels({
            config: this.config,
            gateway: this.gateway!,
            logger,
            workspaceId,
          });
        },
      };
      const warningDelay = readyAtMs - Date.now() - 10 * 60_000;
      if (warningDelay > 5_000) {
        scheduleCharacterTimerReminder(
          {
            discordUserId: schedulerUser,
            timerId,
            label: `${timerId}:warning`,
            workspaceId,
            delayMs: warningDelay,
          },
          deps,
        );
      }
      const readyDelay = readyAtMs - Date.now();
      if (readyDelay > 5_000) {
        scheduleCharacterTimerReminder(
          {
            discordUserId: schedulerUser,
            timerId,
            label: `${timerId}:ready`,
            workspaceId,
            delayMs: readyDelay,
          },
          deps,
        );
      }
    }

    const result = await refreshExistingDailyCharacterTimerPanels({
      config: this.config,
      gateway: this.gateway,
      logger,
      workspaceId,
    });
    return { ok: true, ...result };
  }
}
