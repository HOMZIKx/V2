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
import { createLogger } from '@v2/observability';
import { timingSafeEqual } from 'node:crypto';

import {
  scheduleCharacterTimerReminder,
  type CharacterTimerReminderDeps,
} from '../../application/notify/character-timer-reminders.js';
import { formatCharacterTimerTemplateContent } from '../../application/notify/character-timer-template.js';
import {
  listKingdomWarRecipients,
  mergeTeamCoordinationRecipients,
  replaceKingdomWarRecipients,
} from '../../application/notify/kingdom-war-recipients.js';
import {
  claimNotifyIdempotencyKey,
  releaseNotifyIdempotencyKey,
} from '../../application/notify/notify-idempotency.js';
import {
  formatTimerNotifyContent,
  isCharacterProgressTimerPayload,
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
import { resolveActiveBotConfig } from '../../application/technika/active-bot-config.js';
import { resolveCharacterTimersConfig } from '../../application/technika/capabilities.js';
import { evaluateTeamScopedModuleGate } from '../../application/technika/guild-module-gate.js';
import type { VersionedConfigStore } from '../../application/technika/versioned-config-store.js';
import {
  NotifyDmClosedError,
  type DiscordJsGatewayAdapter,
} from '../../infrastructure/discord/discord-js-adapter.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import { markCharacterTimerReadyInWorkspace } from '../../infrastructure/player-team/mark-character-timer-ready.js';
import { renderTimerNotifyMessage } from '../../presentation/discord/timer-notify-renderer.js';
import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
  TECHNIKA_CONFIG_STORE_TOKEN,
} from '../discord/discord.tokens.js';

const HEADER_NAME = 'x-notify-secret';
const reminderLogger = createLogger('character-timer-reminders');

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

function recipientList(body: unknown): string[] {
  return body &&
    typeof body === 'object' &&
    Array.isArray((body as { recipients?: unknown }).recipients)
    ? (body as { recipients: unknown[] }).recipients
        .filter((id): id is string => typeof id === 'string')
        .slice(0, 40)
    : [];
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

  private formatNotifyContent(payload: TimerNotifyPayload): string {
    if (!isCharacterProgressTimerPayload(payload)) {
      return formatTimerNotifyContent(payload);
    }
    const characterTimers = resolveCharacterTimersConfig(this.botConfig());
    return formatCharacterTimerTemplateContent(payload, characterTimers);
  }

  private reminderDeps(gateway: DiscordJsGatewayAdapter): CharacterTimerReminderDeps {
    return {
      logger: reminderLogger,
      send: async (job) => {
        if (job.workspaceId) {
          const stateUpdated = await markCharacterTimerReadyInWorkspace({
            baseUrl: this.config.PLAYER_TEAM_BASE_URL,
            demoViewerHeader: this.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
            viewerId: job.discordUserId,
            workspaceId: job.workspaceId,
            timerId: job.timerId,
          }).catch(() => false);
          if (!stateUpdated) {
            reminderLogger.warn('Character timer reached ready time but shared state update failed', {
              workspaceId: job.workspaceId,
              timerId: job.timerId,
            });
          }
        }

        const payload: TimerNotifyPayload = {
          discordUserId: job.discordUserId,
          title: `${job.label}${job.characterName ? ` · ${job.characterName}` : ''}`,
          body: 'Timer jest gotowy, ale pozostaje zablokowany do jawnego odświeżenia przez zespół.',
          deepLinkUrl: job.deepLinkUrl ?? 'https://desapp.zeabur.app/timers',
          ...(job.workspaceId ? { workspaceId: job.workspaceId } : {}),
          ...(job.characterId ? { characterId: job.characterId } : {}),
          ...(job.characterName ? { characterName: job.characterName } : {}),
          timerId: job.timerId,
          timerLabel: job.label,
          endsAt: new Date(job.fireAtMs).toISOString(),
          kind: 'reminder',
          includeButtons: true,
          idempotencyKey: `char-timer-ready:${job.timerId}:${job.discordUserId}:${job.fireAtMs}`,
        };
        const content = this.formatNotifyContent(payload);
        const message = renderTimerNotifyMessage({
          payload,
          content,
          signingSecret: this.config.DISCORD_COMPONENT_SIGNING_SECRET,
          includeButtons: true,
        });
        await gateway.sendTimerNotify({
          discordUserId: job.discordUserId,
          content: message.content ?? content,
          ...(message.components ? { components: message.components } : {}),
        });
      },
    };
  }

  private scheduleCompletionDm(
    gateway: DiscordJsGatewayAdapter,
    payload: TimerNotifyPayload,
  ): void {
    if (payload.kind !== 'reset' || !payload.timerId || !payload.endsAt) return;
    const endsAtMs = Date.parse(payload.endsAt);
    if (!Number.isFinite(endsAtMs)) return;
    const delayMs = endsAtMs - Date.now();
    if (delayMs <= 0 || delayMs > 24 * 3_600_000) return;

    scheduleCharacterTimerReminder(
      {
        discordUserId: payload.discordUserId,
        timerId: payload.timerId,
        label: payload.timerLabel ?? payload.title,
        characterName: payload.characterName ?? null,
        characterId: payload.characterId ?? null,
        workspaceId: payload.workspaceId ?? null,
        deepLinkUrl: payload.deepLinkUrl,
        delayMs,
      },
      this.reminderDeps(gateway),
    );
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
   * Merge explicit current player-team members into the durable bot coordination
   * audience. This endpoint never enumerates a Discord guild.
   */
  @Post('team-recipients')
  public syncTeamRecipients(
    @Headers(HEADER_NAME) notifySecret: string | undefined,
    @Body() body: unknown,
  ): { readonly ok: true; readonly count: number } {
    this.assertNotifySecret(notifySecret);
    const result = mergeTeamCoordinationRecipients(recipientList(body));
    return { ok: true, count: result.count };
  }

  /**
   * Replace kingdom-war DM recipients from an explicit web snapshot.
   * HARD: empty list => scheduler sends nothing. Never accepts a guild fan-out flag.
   */
  @Post('kingdom-war-recipients')
  public syncKingdomWarRecipients(
    @Headers(HEADER_NAME) notifySecret: string | undefined,
    @Body() body: unknown,
  ): { readonly ok: true; readonly count: number } {
    this.assertNotifySecret(notifySecret);
    const result = replaceKingdomWarRecipients(recipientList(body));
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
    const resetGate = evaluateTeamScopedModuleGate({
      config: live,
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

    // Character-timer path: ONLY explicit team recipients from web/shared player-team.
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
      const content = this.formatNotifyContent(single);
      const message = renderTimerNotifyMessage({
        payload: single,
        content,
        signingSecret: this.config.DISCORD_COMPONENT_SIGNING_SECRET,
        includeButtons: wantButtons && shouldIncludeTimerButtons(single),
      });
      this.scheduleCompletionDm(gateway, single);
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
    const isCharacter = isCharacterProgressTimerPayload(payload);
    if (isCharacter || payload.kind === 'reset' || payload.kind === 'reminder') {
      const gate = evaluateTeamScopedModuleGate({
        config: live,
        module: 'characterTimers',
        right: 'discord.notify',
      });
      if (!gate.allowed) {
        throw new ServiceUnavailableException({
          ok: false,
          error: 'character_timers_guild_gate_blocked',
          reason: gate.reason,
        });
      }
    }
    if (payload.kind === 'reset' || payload.kind === 'reminder') {
      if (!characterTimers.enabled) {
        throw new ServiceUnavailableException({
          ok: false,
          error: 'character_timers_disabled',
        });
      }
      if (payload.kind === 'reset' && !characterTimers.resetNotifyEnabled) {
        throw new ServiceUnavailableException({
          ok: false,
          error: 'character_timer_reset_notify_disabled',
        });
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

    const content = this.formatNotifyContent(payload);
    const wantButtons = isCharacter
      ? shouldIncludeTimerButtons(payload)
      : live['notify-timer-dm-action-buttons'] && shouldIncludeTimerButtons(payload);
    const message = renderTimerNotifyMessage({
      payload,
      content,
      signingSecret: this.config.DISCORD_COMPONENT_SIGNING_SECRET,
      includeButtons: wantButtons,
    });

    this.scheduleCompletionDm(gateway, payload);
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
