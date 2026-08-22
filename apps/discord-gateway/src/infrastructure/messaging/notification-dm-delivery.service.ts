import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { z } from 'zod';

import { LFG_DUNGEON_ACTIVITY_TYPES } from '@v2/hub-core';
import { NotificationDeliveryActionsSchema } from '@v2/notification-core';

import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
} from '../../interface/discord/discord.tokens.js';
import type { DiscordGatewayConfig } from '../discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../discord/discord-js-adapter.js';
import { createLfgDmCustomId } from '../security/lfg-dm-signed-custom-id.js';
import { timingSafeEqualUtf8 } from '../security/timing-safe-equal.js';

const deliverSchema = z.object({
  outboxId: z.string().min(1).optional(),
  inboxItemId: z.string().min(1),
  recipientDiscordUserId: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  deepLink: z.string().max(512).nullable().optional(),
  notificationClass: z.enum(['DISCOVERY', 'TRANSACTIONAL', 'SYSTEM_SECURITY']),
  kind: z.string().min(1),
  guildId: z.string().min(1).optional(),
  deliveryActions: NotificationDeliveryActionsSchema.optional(),
});

export type NotificationDmDeliveryResult = {
  readonly status: 'delivered' | 'fallback_inbox' | 'rejected' | 'rate_limited' | 'upstream_error';
  readonly outboxId: string;
  readonly detail?: string;
};

@Injectable()
export class NotificationDmDeliveryService {
  public constructor(
    @Inject(DISCORD_GATEWAY_TOKEN) private readonly gateway: DiscordJsGatewayAdapter | null,
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
  ) {}

  public async deliver(
    body: unknown,
    projectionSecret: string | undefined,
  ): Promise<NotificationDmDeliveryResult> {
    this.assertAuthorized(projectionSecret);
    const record =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
    const payloadRecord =
      record !== null &&
      typeof record.payload === 'object' &&
      record.payload !== null &&
      !Array.isArray(record.payload)
        ? (record.payload as Record<string, unknown>)
        : null;
    const unwrapped =
      payloadRecord !== null
        ? {
            ...payloadRecord,
            ...(typeof record?.outboxId === 'string' ? { outboxId: record.outboxId } : {}),
          }
        : body;
    const parsed = deliverSchema.safeParse(unwrapped);
    if (!parsed.success) {
      return { status: 'rejected', outboxId: 'unknown', detail: 'Invalid notification payload.' };
    }
    const outboxId = parsed.data.outboxId ?? parsed.data.inboxItemId;
    if (this.gateway === null) {
      return {
        status: 'fallback_inbox',
        outboxId,
        detail: 'Discord gateway unavailable; Inbox remains SoT.',
      };
    }

    const content = [
      `**${parsed.data.title}**`,
      parsed.data.body,
      parsed.data.deepLink !== undefined &&
      parsed.data.deepLink !== null &&
      parsed.data.deepLink.length > 0
        ? `Link: ${parsed.data.deepLink}`
        : null,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    const components = buildDeliveryActionComponents(
      parsed.data.deliveryActions,
      parsed.data.guildId,
      parsed.data.notificationClass,
      this.config.DISCORD_COMPONENT_SIGNING_SECRET,
    );

    const result = await this.gateway.sendDirectMessage(parsed.data.recipientDiscordUserId, {
      content,
      ...(components !== undefined ? { components } : {}),
    });

    if (result.ok) {
      return { status: 'delivered', outboxId };
    }

    if (result.code === 'DM_BLOCKED' || result.code === 'DM_CLOSED') {
      return {
        status: 'fallback_inbox',
        outboxId,
        ...(result.detail !== undefined ? { detail: result.detail } : {}),
      };
    }

    if (result.code === 'RATE_LIMITED') {
      return {
        status: 'rate_limited',
        outboxId,
        ...(result.detail !== undefined ? { detail: result.detail } : {}),
      };
    }

    return {
      status: 'upstream_error',
      outboxId,
      ...(result.detail !== undefined ? { detail: result.detail } : {}),
    };
  }

  private assertAuthorized(projectionSecret: string | undefined): void {
    if (!this.config.DISCORD_ACTIVITY_ENABLED) {
      throw new UnauthorizedException('Discord activity projections are disabled.');
    }
    const expected = this.config.ACTIVITY_PROJECTION_SHARED_SECRET;
    if (expected === undefined || expected.trim().length === 0) {
      throw new UnauthorizedException('Projection secret not configured.');
    }
    if (projectionSecret === undefined || !timingSafeEqualUtf8(projectionSecret, expected)) {
      throw new UnauthorizedException('Invalid projection secret.');
    }
  }
}

function buildDeliveryActionComponents(
  deliveryActions: z.infer<typeof NotificationDeliveryActionsSchema> | undefined,
  payloadGuildId: string | undefined,
  notificationClass: 'DISCOVERY' | 'TRANSACTIONAL' | 'SYSTEM_SECURITY',
  signingSecret: string,
): ActionRowBuilder<ButtonBuilder>[] | undefined {
  if (deliveryActions === undefined) {
    return undefined;
  }
  const guildId = deliveryActions.guildId ?? payloadGuildId;
  if (guildId === undefined || guildId.length === 0) {
    return undefined;
  }
  const { activityOpaqueId, activityTypeKey } = deliveryActions;
  const secret = signingSecret;
  const buttons = [
    new ButtonBuilder()
      .setCustomId(createLfgDmCustomId(activityOpaqueId, 'join', secret, guildId))
      .setLabel('Dołącz')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(createLfgDmCustomId(activityOpaqueId, 'view', secret, guildId))
      .setLabel('Zobacz')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(createLfgDmCustomId(activityOpaqueId, 'suppress', secret, guildId))
      .setLabel('Nie teraz')
      .setStyle(ButtonStyle.Secondary),
  ];
  if (notificationClass === 'DISCOVERY') {
    const dungeonLabel =
      LFG_DUNGEON_ACTIVITY_TYPES.find((entry) => entry.key === activityTypeKey)?.label ??
      activityTypeKey;
    buttons.push(
      new ButtonBuilder()
        .setCustomId(createLfgDmCustomId(activityOpaqueId, 'mute', secret, activityTypeKey))
        .setLabel(`Wycisz ${dungeonLabel}`)
        .setStyle(ButtonStyle.Danger),
    );
  }
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)];
}
