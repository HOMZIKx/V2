import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';

import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
} from '../../interface/discord/discord.tokens.js';
import type { DiscordGatewayConfig } from '../discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../discord/discord-js-adapter.js';
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

    const result = await this.gateway.sendDirectMessage(parsed.data.recipientDiscordUserId, {
      content,
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
