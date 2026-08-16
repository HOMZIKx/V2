import { Inject, Injectable, Optional } from '@nestjs/common';

import {
  classifyDiscordProjectionError,
  eventPayloadSchema,
  hubPayloadSchema,
  type ProjectionDeliveryEnvelope,
  type ProjectionDeliveryResult,
} from '../../application/activity/activity-projection-envelope.js';
import {
  DISCORD_CONFIG_TOKEN,
  DISCORD_GATEWAY_TOKEN,
} from '../../interface/discord/discord.tokens.js';
import { renderActivityEventMessage } from '../../presentation/discord/activity-event-renderer.js';
import { renderActivityHubMessage } from '../../presentation/discord/activity-hub-renderer.js';
import { toComponentsV2Payload } from '../../presentation/discord/components-v2-payload.js';
import type { DiscordGatewayConfig } from '../discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../discord/discord-js-adapter.js';

/**
 * Applies Discord hub/event projections idempotently by outboxId.
 *
 * Transport notes:
 * - HTTP `POST /internal/activity/v1/projections/deliver` = operator / reconcile / diagnostic path
 * - RabbitMQ consumer on `activity.projection.discord` = normal async path
 */
@Injectable()
export class ActivityProjectionDeliveryService {
  private readonly delivered = new Map<string, ProjectionDeliveryResult>();

  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    @Optional()
    @Inject(DISCORD_GATEWAY_TOKEN)
    private readonly gateway: DiscordJsGatewayAdapter | null,
  ) {}

  public async deliver(input: ProjectionDeliveryEnvelope): Promise<ProjectionDeliveryResult> {
    const existing = this.delivered.get(input.outboxId);
    if (existing !== undefined) {
      return { ...existing, status: 'duplicate' };
    }

    if (!this.config.DISCORD_ENABLED || this.gateway === null) {
      return {
        status: 'upstream_error',
        outboxId: input.outboxId,
        detail: 'Discord gateway is disabled.',
      };
    }

    try {
      const kind =
        typeof input.payload.kind === 'string'
          ? input.payload.kind
          : input.eventType.includes('panel')
            ? 'hub'
            : 'event';
      const shape =
        kind === 'hub'
          ? hubPayloadSchema.safeParse(input.payload)
          : eventPayloadSchema.safeParse(input.payload);
      if (!shape.success) {
        return {
          status: 'rejected',
          outboxId: input.outboxId,
          detail: 'Projection payload is incomplete for Discord apply.',
        };
      }

      const result = await this.applyProjection(input);
      this.delivered.set(input.outboxId, result);
      return result;
    } catch (error) {
      return classifyDiscordProjectionError(input.outboxId, error);
    }
  }

  /** Test seam: inspect idempotency cache size. */
  public deliveredCount(): number {
    return this.delivered.size;
  }

  private async applyProjection(
    input: ProjectionDeliveryEnvelope,
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
      const hub = hubPayloadSchema.parse(input.payload);
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

    const event = eventPayloadSchema.parse(input.payload);
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
