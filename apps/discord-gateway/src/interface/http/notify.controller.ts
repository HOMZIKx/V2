import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Optional,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

import { resolveActiveBotConfig } from '../../application/technika/active-bot-config.js';
import { resolveCharacterTimersConfig } from '../../application/technika/capabilities.js';
import { evaluateGuildModuleGate } from '../../application/technika/guild-module-gate.js';
import type { VersionedConfigStore } from '../../application/technika/versioned-config-store.js';
import {
  claimNotifyIdempotencyKey,
  releaseNotifyIdempotencyKey,
} from '../../application/notify/notify-idempotency.js';
import {
  formatTimerNotifyContent,
  shouldIncludeTimerButtons,
  TimerNotifyPayloadSchema,
  TimerResetNotifyPayloadSchema,
  TimerWatchPayloadSchema,
  type TimerNotifyPayload,
} from '../../application/notify/notify-payload.js';
import {
  listTimerRoomWatchersExcept,
  registerTimerRoomWatcher,
} from '../../application/notify/timer-room-watchers.js';
import {
  listKingdomWarRecipients,
  replaceKingdomWarRecipients,
} from '../../application/notify/kingdom-war-recipients.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import {
  NotifyDmClosedError,
  type DiscordJsGatewayAdapter,
} from '../../infrastructure/discord/discord-js-adapter.js';
import { renderTimerNotifyMessage } from '../../presentation/discord/timer-notify-renderer.js';
import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
  TECHNIKA_CONFIG_STORE_TOKEN,
} from '../discord/discord.tokens.js';

const HEADER_NAME = 'x-notify-secret';

function secretsMatch(provided: string | undefined, expected: string): boolean {
  if (!provided || expected.length === 0) {
    return false;
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return timingSafeEqual(a, b);
}

@Controller('notify')
export class NotifyController {
  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null,
    @Optional()
    @Inject(TECHNIKA_CONFIG_STORE_TOKEN)
    private readonly technikaStore: VersionedConfigStore | null = null,
  ) {}

  private botConfig() {
    return resolveActiveBotConfig(this.technikaStore);
  }


  private assertNotifySecret(notifySecret: string | undefined): void {
    if (!secretsMatch(notifySecret, this.config.DISCORD_NOTIFY_SHARED_SECRET)) {
      throw new UnauthorizedException({
        ok: false,
        error: 'invalid_notify_secret',
        hint: 'Set header x-notify-secret to match DISCORD_NOTIFY_SHARED_SECRET.',
      });
    }
  }

  private assertGatewayReady(): DiscordJsGatewayAdapter {
    if (!this.config.DISCORD_ENABLED || this.gateway === null) {
      throw new ServiceUnavailableException({
        ok: false,
        error: 'discord_disabled',
      });
    }
    const snapshot = this.gateway.getSnapshot();
    if (snapshot.state !== 'ready') {
      throw new ServiceUnavailableException({
        ok: false,
        error: 'discord_not_ready',
        discordState: snapshot.state,
      });
    }
    return this.gateway;
  }

  @Post('timer-watch')
  public watchTimerRoom(
    @Headers(HEADER_NAME) notifySecret: string | undefined,
    @Body() body: unknown,
  ): { readonly ok: true } {
    this.assertNotifySecret(notifySecret);
    const parsed = TimerWatchPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: 'invalid_payload',
        details: parsed.error.flatten(),
      });
    }
    registerTimerRoomWatcher(parsed.data);
    return { ok: true };
  }

  /**
   * Replace kingdom-war DM recipients (team notifyPrefs.kingdomWar allowlist from web).
   * HARD: empty list => scheduler sends nothing. Never accepts a guild fan-out flag.
   */
  @Post('kingdom-war-recipients')
  public syncKingdomWarRecipients(
    @Headers(HEADER_NAME) notifySecret: string | undefined,
    @Body() body: unknown,
  ): { readonly ok: true; readonly count: number } {
    this.assertNotifySecret(notifySecret);
    const recipients =
      body &&
      typeof body === 'object' &&
      Array.isArray((body as { recipients?: unknown }).recipients)
        ? ((body as { recipients: unknown[] }).recipients
            .filter((id): id is string => typeof id === 'string')
            .slice(0, 40))
        : [];
    const result = replaceKingdomWarRecipients(recipients);
    return { ok: true, count: result.count };
  }

  @Post('kingdom-war-recipients/list')
  public listWarRecipients(
    @Headers(HEADER_NAME) notifySecret: string | undefined,
  ): { readonly ok: true; readonly recipients: readonly string[] } {
    this.assertNotifySecret(notifySecret);
    return { ok: true, recipients: listKingdomWarRecipients() };
  }

  @Post('timer-reset')
  public async notifyTimerReset(
    @Headers(HEADER_NAME) notifySecret: string | undefined,
    @Body() body: unknown,
  ): Promise<{
    readonly ok: true;
    readonly sent: number;
    readonly skipped: number;
    readonly duplicate: boolean;
  }> {
    this.assertNotifySecret(notifySecret);
    const live = this.botConfig();
    const characterTimers = resolveCharacterTimersConfig(live);
    if (!live['notify-timer-enabled'] || !characterTimers.enabled || !characterTimers.resetNotifyEnabled) {
      return { ok: true, sent: 0, skipped: 0, duplicate: false };
    }
    const resetGate = evaluateGuildModuleGate({
      config: live,
      guildId: this.config.DISCORD_TEST_GUILD_ID,
      module: 'characterTimers',
      right: 'discord.notify',
    });
    if (!resetGate.allowed) {
      return { ok: true, sent: 0, skipped: 0, duplicate: false };
    }

    const parsed = TimerResetNotifyPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: 'invalid_payload',
        details: parsed.error.flatten(),
      });
    }

    const payload = parsed.data;
    if (payload.idempotencyKey) {
      const claimed = claimNotifyIdempotencyKey(payload.idempotencyKey);
      if (!claimed) {
        return { ok: true, sent: 0, skipped: 0, duplicate: true };
      }
    }

    // Character-timer path (workspaceId/timerId): ONLY explicit prefs-filtered recipients from web.
    // Legacy map-room watchers remain for mapKey rooms — never expand to guild roster.
    const isCharacterTimerPath = Boolean(
      payload.workspaceId || payload.timerId || payload.characterId,
    );
    const recipients = isCharacterTimerPath
      ? (payload.recipientDiscordUserIds ?? [])
      : (payload.recipientDiscordUserIds ??
          (payload.mapKey && payload.channel !== undefined
            ? listTimerRoomWatchersExcept({
                mapKey: payload.mapKey,
                channel: payload.channel,
                exceptDiscordUserId: payload.actorDiscordUserId,
              })
            : []));

    // Legacy map rooms only — never register character EQ timers as map watchers.
    if (payload.mapKey && payload.channel !== undefined) {
      registerTimerRoomWatcher({
        mapKey: payload.mapKey,
        channel: payload.channel,
        discordUserId: payload.actorDiscordUserId,
      });
    }

    if (recipients.length === 0) {
      return { ok: true, sent: 0, skipped: 0, duplicate: false };
    }

    const gateway = this.assertGatewayReady();
    let sent = 0;
    let skipped = 0;
    const wantButtons = isCharacterTimerPath
      ? true
      : live['notify-timer-dm-action-buttons'];

    for (const discordUserId of recipients) {
      const single: TimerNotifyPayload = {
        discordUserId,
        title: payload.title,
        body: payload.body,
        deepLinkUrl: payload.deepLinkUrl,
        mapKey: payload.mapKey,
        channel: payload.channel,
        timerKey: payload.timerKey,
        workspaceId: payload.workspaceId,
        characterId: payload.characterId,
        characterName: payload.characterName,
        timerId: payload.timerId,
        timerLabel: payload.timerLabel,
        endsAt: payload.endsAt,
        kind: 'reset',
        includeButtons: wantButtons,
        ...(payload.actorName ? { actorName: payload.actorName } : {}),
        ...(payload.roomSummary ? { roomSummary: payload.roomSummary } : {}),
        ...(payload.liveTimers ? { liveTimers: payload.liveTimers } : {}),
      };
      const content = formatTimerNotifyContent(single);
      const message = renderTimerNotifyMessage({
        payload: single,
        content,
        signingSecret: this.config.DISCORD_COMPONENT_SIGNING_SECRET,
        includeButtons: wantButtons && shouldIncludeTimerButtons(single),
      });
      try {
        await gateway.sendTimerNotify({
          discordUserId,
          content: message.content ?? content,
          ...(message.components ? { components: message.components } : {}),
        });
        sent += 1;
      } catch (error) {
        if (error instanceof NotifyDmClosedError) {
          skipped += 1;
          continue;
        }
        if (payload.idempotencyKey) {
          releaseNotifyIdempotencyKey(payload.idempotencyKey);
        }
        throw new ServiceUnavailableException({
          ok: false,
          error: 'discord_send_failed',
          detail: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    return { ok: true, sent, skipped, duplicate: false };
  }

  @Post('timer')
  public async notifyTimer(
    @Headers(HEADER_NAME) notifySecret: string | undefined,
    @Body() body: unknown,
  ): Promise<{
    readonly ok: true;
    readonly delivery: 'dm' | 'channel';
    readonly duplicate: boolean;
    readonly messageId: string | null;
    readonly skipped?: 'dms_closed';
  }> {
    this.assertNotifySecret(notifySecret);
    const live = this.botConfig();
    if (!live['notify-timer-enabled']) {
      throw new ServiceUnavailableException({
        ok: false,
        error: 'notify_timer_disabled',
        hint: 'Technika: notify-timer-enabled=false',
      });
    }

    const gateway = this.assertGatewayReady();

    const parsed = TimerNotifyPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: 'invalid_payload',
        details: parsed.error.flatten(),
      });
    }

    const payload: TimerNotifyPayload = parsed.data;

    const characterTimers = resolveCharacterTimersConfig(live);
    const isCharacter = Boolean(payload.timerId && (payload.characterId || payload.workspaceId));
    if (isCharacter || payload.kind === 'reset' || payload.kind === 'reminder') {
      const gate = evaluateGuildModuleGate({
        config: live,
        guildId: this.config.DISCORD_TEST_GUILD_ID,
        module: 'characterTimers',
        right: 'discord.notify',
      });
      if (!gate.allowed) {
        return {
          ok: true,
          delivery: payload.discordChannelId ? 'channel' : 'dm',
          duplicate: false,
          messageId: null,
        };
      }
    }
    if (payload.kind === 'reset' || payload.kind === 'reminder') {
      if (!characterTimers.enabled) {
        return {
          ok: true,
          delivery: payload.discordChannelId ? 'channel' : 'dm',
          duplicate: false,
          messageId: null,
        };
      }
      if (payload.kind === 'reset' && !characterTimers.resetNotifyEnabled) {
        return {
          ok: true,
          delivery: payload.discordChannelId ? 'channel' : 'dm',
          duplicate: false,
          messageId: null,
        };
      }
    }

    if (payload.mapKey && payload.channel !== undefined) {
      registerTimerRoomWatcher({
        mapKey: payload.mapKey,
        channel: payload.channel,
        discordUserId: payload.discordUserId,
      });
    }

    if (payload.idempotencyKey) {
      const claimed = claimNotifyIdempotencyKey(payload.idempotencyKey);
      if (!claimed) {
        return {
          ok: true,
          delivery: payload.discordChannelId ? 'channel' : 'dm',
          duplicate: true,
          messageId: null,
        };
      }
    }

    const content = formatTimerNotifyContent(payload);
    const wantButtons = isCharacter
      ? shouldIncludeTimerButtons(payload)
      : live['notify-timer-dm-action-buttons'] && shouldIncludeTimerButtons(payload);
    const message = renderTimerNotifyMessage({
      payload,
      content,
      signingSecret: this.config.DISCORD_COMPONENT_SIGNING_SECRET,
      includeButtons: wantButtons,
    });

    try {
      const result = await gateway.sendTimerNotify({
        discordUserId: payload.discordUserId,
        content: message.content ?? content,
        ...(payload.discordChannelId ? { discordChannelId: payload.discordChannelId } : {}),
        ...(message.components ? { components: message.components } : {}),
      });

      return {
        ok: true,
        delivery: result.delivery,
        duplicate: false,
        messageId: result.messageId,
      };
    } catch (error) {
      if (error instanceof NotifyDmClosedError) {
        if (payload.idempotencyKey) {
          releaseNotifyIdempotencyKey(payload.idempotencyKey);
        }
        return {
          ok: true,
          delivery: 'dm',
          duplicate: false,
          messageId: null,
          skipped: 'dms_closed',
        };
      }
      throw new ServiceUnavailableException({
        ok: false,
        error: 'discord_send_failed',
        detail: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
