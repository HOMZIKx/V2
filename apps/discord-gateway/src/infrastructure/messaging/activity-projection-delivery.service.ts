import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';

import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
} from '../../interface/discord/discord.tokens.js';
import {
  assertProjectionChannelAllowed,
  resolveAllowedProjectionGuild,
} from '../../interface/http/projection-channel-scope.js';
import { renderActivityEventMessage } from '../../presentation/discord/activity-event-renderer.js';
import { renderActivityHubMessage } from '../../presentation/discord/activity-hub-renderer.js';
import { toComponentsV2Payload } from '../../presentation/discord/components-v2-payload.js';
import type { DiscordGatewayConfig } from '../discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../discord/discord-js-adapter.js';
import { timingSafeEqualUtf8 } from '../security/timing-safe-equal.js';

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
  remove: z.boolean().optional(),
  name: z.string().min(1).optional(),
  typeLabel: z.string().min(1).optional(),
  statusLabel: z.string().min(1).optional(),
  startAtIso: z.string().min(1).optional(),
  endAtIso: z.string().nullable().optional(),
  scheduleLabel: z.string().min(1).nullable().optional(),
  scheduleKind: z.enum(['exact', 'range', 'flexible_period']).optional(),
  periodKey: z
    .enum(['today', 'tomorrow', 'this_week', 'weekend', 'flexible'])
    .nullable()
    .optional(),
  locationText: z.string().nullable().optional(),
  organizerLabel: z.string().min(1).optional(),
  coOrganizerLabel: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  occupiedSlots: z.number().int().nonnegative().optional(),
  participantLimit: z.number().int().positive().nullable().optional(),
  statusSummaries: z.array(z.object({ label: z.string(), count: z.number().int() })).optional(),
  participantPreview: z.array(z.string()).optional(),
  statusDefs: z
    .array(
      z.object({
        opaqueId: z.string().regex(/^[a-f0-9]{12}$/),
        label: z.string().min(1),
        occupiesSlot: z.boolean(),
      }),
    )
    .optional(),
  rsvpDisabled: z.boolean().optional(),
  secondaryDisabled: z.boolean().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  seriesOccurrenceIndex: z.number().int().nonnegative().nullable().optional(),
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
 * Shared projection apply path for HTTP deliver + RabbitMQ consumer.
 */
@Injectable()
export class ActivityProjectionDeliveryService {
  /** Bounded in-process dedupe for rapid retries within one process. */
  private readonly delivered = new Map<string, ProjectionDeliveryResult>();
  private static readonly DEDUPE_LIMIT = 2_000;

  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null,
  ) {}

  public async deliver(
    body: unknown,
    projectionSecret: string | undefined,
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
      this.rememberDelivered(parsed.data.outboxId, result);
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

  private rememberDelivered(outboxId: string, result: ProjectionDeliveryResult): void {
    this.delivered.set(outboxId, result);
    if (this.delivered.size <= ActivityProjectionDeliveryService.DEDUPE_LIMIT) {
      return;
    }
    const oldest = this.delivered.keys().next().value;
    if (oldest !== undefined) {
      this.delivered.delete(oldest);
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
        allowedGuildIds: this.config.activityAllowedGuildIds,
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
      allowedGuildIds: this.config.activityAllowedGuildIds,
      ...(event.guildId !== undefined ? { payloadGuildId: event.guildId } : {}),
    });
    await assertProjectionChannelAllowed({
      gateway,
      allowedGuildId,
      channelId: event.channelId,
    });

    if (event.remove === true) {
      if (!event.messageId) {
        return {
          status: 'delivered',
          outboxId: input.outboxId,
          channelId: event.channelId,
        };
      }
      try {
        await gateway.deleteChannelMessage(event.channelId, event.messageId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Already gone — treat as success (idempotent remove).
        if (!/10008|Unknown Message|404/i.test(message)) {
          throw error;
        }
      }
      return {
        status: 'delivered',
        outboxId: input.outboxId,
        messageId: event.messageId,
        channelId: event.channelId,
      };
    }

    if (
      event.name === undefined ||
      event.typeLabel === undefined ||
      event.statusLabel === undefined ||
      event.startAtIso === undefined ||
      event.organizerLabel === undefined ||
      event.occupiedSlots === undefined ||
      event.participantLimit === undefined ||
      event.statusSummaries === undefined ||
      event.statusDefs === undefined
    ) {
      throw new Error('Invalid projection payload.');
    }

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
        ...(event.visibility !== undefined ? { visibility: event.visibility } : {}),
        ...(event.seriesOccurrenceIndex !== undefined
          ? { seriesOccurrenceIndex: event.seriesOccurrenceIndex }
          : {}),
      }),
    );

    if (event.messageId) {
      try {
        await gateway.editComponentsV2Message(event.channelId, event.messageId, message);
        return {
          status: 'delivered',
          outboxId: input.outboxId,
          messageId: event.messageId,
          channelId: event.channelId,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        // Missing message → recreate (edit-in-place recovery).
        if (!/10008|Unknown Message|404/i.test(detail)) {
          throw error;
        }
      }
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
