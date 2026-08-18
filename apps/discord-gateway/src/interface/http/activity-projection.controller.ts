import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';

import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import { timingSafeEqualUtf8 } from '../../infrastructure/security/timing-safe-equal.js';
import { renderActivityEventMessage } from '../../presentation/discord/activity-event-renderer.js';
import { renderActivityHubMessage } from '../../presentation/discord/activity-hub-renderer.js';
import { toComponentsV2Payload } from '../../presentation/discord/components-v2-payload.js';
import { DISCORD_CONFIG_TOKEN, DISCORD_GATEWAY_TOKEN } from '../discord/discord.tokens.js';
import {
  assertProjectionChannelAllowed,
  resolveAllowedProjectionGuild,
} from './projection-channel-scope.js';

const deliverySchema = z.object({
  outboxId: z.string().min(1),
  eventType: z.string().min(1),
  aggregateId: z.string().min(1),
  aggregateVersion: z.number().int().nonnegative(),
  payload: z.record(z.string(), z.unknown()),
});

const hubPayloadSchema = z.object({
  kind: z.literal('hub').optional(),
  guildId: z.string().min(1).optional(),
  channelId: z.string().min(1),
  messageId: z.string().nullable().optional(),
  opaquePanelId: z.string().regex(/^[a-f0-9]{12}$/),
  nonce: z.string().max(25).optional(),
});

const eventPayloadSchema = z.object({
  kind: z.literal('event').optional(),
  guildId: z.string().min(1).optional(),
  channelId: z.string().min(1),
  messageId: z.string().nullable().optional(),
  opaqueEventId: z.string().regex(/^[a-f0-9]{12}$/),
  name: z.string().min(1),
  typeLabel: z.string().min(1),
  statusLabel: z.string().min(1),
  startAtIso: z.string().min(1),
  endAtIso: z.string().nullable().optional(),
  scheduleLabel: z.string().min(1).nullable().optional(),
  scheduleKind: z.enum(['exact', 'range', 'flexible_period']).optional(),
  periodKey: z
    .enum(['today', 'tomorrow', 'this_week', 'weekend', 'flexible'])
    .nullable()
    .optional(),
  locationText: z.string().nullable().optional(),
  organizerLabel: z.string().min(1),
  coOrganizerLabel: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  occupiedSlots: z.number().int().nonnegative(),
  participantLimit: z.number().int().positive().nullable(),
  statusSummaries: z.array(z.object({ label: z.string(), count: z.number().int() })),
  participantPreview: z.array(z.string()).optional(),
  statusDefs: z.array(
    z.object({
      opaqueId: z.string().regex(/^[a-f0-9]{12}$/),
      label: z.string().min(1),
      occupiesSlot: z.boolean(),
    }),
  ),
  rsvpDisabled: z.boolean().optional(),
  secondaryDisabled: z.boolean().optional(),
  nonce: z.string().max(25).optional(),
});

export type ProjectionDeliveryResult = {
  readonly status: 'delivered' | 'duplicate' | 'rate_limited' | 'upstream_error' | 'rejected';
  readonly outboxId: string;
  readonly messageId?: string;
  readonly channelId?: string;
  readonly detail?: string;
};

/**
 * Internal projection consumer — NOT a general "send message" API.
 * Accepts only typed hub/event projection payloads from activity-service.
 */
@Controller('internal/activity/v1/projections')
export class ActivityProjectionController {
  private readonly delivered = new Map<string, ProjectionDeliveryResult>();

  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null,
  ) {}

  @Post('deliver')
  @HttpCode(200)
  public async deliver(
    @Body() body: unknown,
    @Headers('x-activity-projection-secret') projectionSecret?: string,
  ): Promise<ProjectionDeliveryResult> {
    this.assertAuthorized(projectionSecret);

    if (!this.config.DISCORD_ENABLED || this.gateway === null) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        detail: 'Discord gateway is disabled.',
      });
    }

    const parsed = deliverySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(
        { status: 'rejected', detail: 'Invalid projection payload.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = this.delivered.get(parsed.data.outboxId);
    if (existing !== undefined) {
      return { ...existing, status: 'duplicate' };
    }

    try {
      const result = await this.applyProjection(parsed.data);
      this.delivered.set(parsed.data.outboxId, result);
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const classified = classifyDiscordError(parsed.data.outboxId, error);
      if (classified.status === 'rate_limited') {
        throw new HttpException(classified, HttpStatus.TOO_MANY_REQUESTS);
      }
      if (classified.status === 'upstream_error') {
        throw new HttpException(classified, HttpStatus.BAD_GATEWAY);
      }
      throw new HttpException(classified, HttpStatus.BAD_REQUEST);
    }
  }

  private assertAuthorized(projectionSecret: string | undefined): void {
    if (!this.config.DISCORD_ACTIVITY_ENABLED) {
      throw new UnauthorizedException('Discord activity projections are disabled.');
    }

    const expected = this.config.ACTIVITY_PROJECTION_SHARED_SECRET?.trim() ?? '';
    if (expected.length === 0) {
      throw new ServiceUnavailableException(
        'ACTIVITY_PROJECTION_SHARED_SECRET is not configured (fail closed).',
      );
    }
    if (projectionSecret === undefined || !timingSafeEqualUtf8(projectionSecret, expected)) {
      throw new UnauthorizedException('Invalid projection secret.');
    }
  }

  private async applyProjection(
    input: z.infer<typeof deliverySchema>,
  ): Promise<ProjectionDeliveryResult> {
    const gateway = this.gateway;
    if (gateway === null) {
      throw new Error('Gateway unavailable');
    }

    const kind =
      typeof input.payload.kind === 'string'
        ? input.payload.kind
        : input.eventType.includes('panel')
          ? 'hub'
          : 'event';

    if (kind === 'hub') {
      const hubParsed = hubPayloadSchema.safeParse(input.payload);
      if (!hubParsed.success) {
        throw new Error('Invalid projection payload.');
      }
      const hub = hubParsed.data;
      const allowedGuildId = resolveAllowedProjectionGuild({
        configuredGuildId: this.config.DISCORD_TEST_GUILD_ID,
        ...(hub.guildId !== undefined ? { payloadGuildId: hub.guildId } : {}),
      });
      await assertProjectionChannelAllowed({
        gateway,
        allowedGuildId,
        channelId: hub.channelId,
      });
      const message = toComponentsV2Payload(
        renderActivityHubMessage({
          opaquePanelId: hub.opaquePanelId,
          signingSecret: this.config.DISCORD_COMPONENT_SIGNING_SECRET,
        }),
      );
      if (hub.messageId) {
        await gateway.editComponentsV2Message(hub.channelId, hub.messageId, message);
        return {
          status: 'delivered',
          outboxId: input.outboxId,
          messageId: hub.messageId,
          channelId: hub.channelId,
        };
      }
      const published = await gateway.publishComponentsV2Message(
        hub.channelId,
        message,
        hub.nonce !== undefined ? { nonce: hub.nonce } : undefined,
      );
      return {
        status: 'delivered',
        outboxId: input.outboxId,
        messageId: published.messageId,
        channelId: published.channelId,
      };
    }

    const eventParsed = eventPayloadSchema.safeParse(input.payload);
    if (!eventParsed.success) {
      throw new Error('Invalid projection payload.');
    }
    const event = eventParsed.data;
    const allowedGuildId = resolveAllowedProjectionGuild({
      configuredGuildId: this.config.DISCORD_TEST_GUILD_ID,
      ...(event.guildId !== undefined ? { payloadGuildId: event.guildId } : {}),
    });
    await assertProjectionChannelAllowed({
      gateway,
      allowedGuildId,
      channelId: event.channelId,
    });
    const message = toComponentsV2Payload(
      renderActivityEventMessage({
        opaqueEventId: event.opaqueEventId,
        signingSecret: this.config.DISCORD_COMPONENT_SIGNING_SECRET,
        name: event.name,
        typeLabel: event.typeLabel,
        statusLabel: event.statusLabel,
        startAtIso: event.startAtIso,
        occupiedSlots: event.occupiedSlots,
        participantLimit: event.participantLimit,
        statusSummaries: event.statusSummaries,
        statusDefs: event.statusDefs,
        organizerLabel: event.organizerLabel,
        ...(event.endAtIso !== undefined ? { endAtIso: event.endAtIso } : {}),
        ...(event.scheduleLabel !== undefined && event.scheduleLabel !== null
          ? { scheduleLabel: event.scheduleLabel }
          : {}),
        ...(event.locationText !== undefined ? { locationText: event.locationText } : {}),
        ...(event.coOrganizerLabel !== undefined
          ? { coOrganizerLabel: event.coOrganizerLabel }
          : {}),
        ...(event.description !== undefined ? { description: event.description } : {}),
        ...(event.participantPreview !== undefined
          ? { participantPreview: event.participantPreview }
          : {}),
        ...(event.rsvpDisabled !== undefined ? { rsvpDisabled: event.rsvpDisabled } : {}),
        ...(event.secondaryDisabled !== undefined
          ? { secondaryDisabled: event.secondaryDisabled }
          : {}),
      }),
    );

    if (event.messageId) {
      await gateway.editComponentsV2Message(event.channelId, event.messageId, message);
      return {
        status: 'delivered',
        outboxId: input.outboxId,
        messageId: event.messageId,
        channelId: event.channelId,
      };
    }

    const published = await gateway.publishComponentsV2Message(
      event.channelId,
      message,
      event.nonce !== undefined ? { nonce: event.nonce } : undefined,
    );
    return {
      status: 'delivered',
      outboxId: input.outboxId,
      messageId: published.messageId,
      channelId: published.channelId,
    };
  }
}

function classifyDiscordError(outboxId: string, error: unknown): ProjectionDeliveryResult {
  const message = error instanceof Error ? error.message : 'unknown';
  let statusCode: number | undefined;
  if (typeof error === 'object' && error !== null) {
    if ('status' in error && typeof error.status === 'number') {
      statusCode = error.status;
    } else if ('httpStatus' in error && typeof error.httpStatus === 'number') {
      statusCode = error.httpStatus;
    }
  }

  if (statusCode === 429 || /429|rate.?limit/i.test(message)) {
    return { status: 'rate_limited', outboxId, detail: message };
  }
  if ((statusCode !== undefined && statusCode >= 500) || /5\d\d|ECONN|timeout/i.test(message)) {
    return { status: 'upstream_error', outboxId, detail: message };
  }
  return { status: 'rejected', outboxId, detail: message };
}
