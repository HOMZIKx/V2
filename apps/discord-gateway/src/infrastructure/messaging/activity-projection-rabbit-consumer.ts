import {
  ACTIVITY_EVENTS_BINDING_KEY,
  ACTIVITY_EVENTS_RETRY_EXCHANGE,
  closeAmqp,
  connectAmqp,
  createChannel,
  declareActivityProjectionTopology,
  DISCORD_ACTIVITY_PROJECTIONS_QUEUE,
  parseActivityProjectionEnvelope,
  type AmqpConnection,
} from '@v2/messaging';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import type { DiscordGatewayConfig } from '../discord/discord-config.js';
import { DISCORD_CONFIG_TOKEN } from '../../interface/discord/discord.tokens.js';
import {
  ActivityProjectionDeliveryService,
  type ProjectionDeliveryResult,
} from './activity-projection-delivery.service.js';

type AmqpChannel = Awaited<ReturnType<typeof createChannel>>;

/**
 * Consumes Activity projection envelopes from RabbitMQ and applies them via
 * the same delivery path as HTTP /internal/.../deliver (dedupe + guild scope).
 */
@Injectable()
export class ActivityProjectionRabbitConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityProjectionRabbitConsumer.name);
  private connection: AmqpConnection | null = null;
  private channel: AmqpChannel | null = null;
  private consumerTag: string | null = null;

  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    private readonly delivery: ActivityProjectionDeliveryService,
  ) {}

  public async onModuleInit(): Promise<void> {
    const url = this.config.DISCORD_ACTIVITY_RABBITMQ_URL.trim();
    if (url.length === 0) {
      this.logger.log('DISCORD_ACTIVITY_RABBITMQ_URL unset; RMQ projection consumer idle.');
      return;
    }
    if (!this.config.DISCORD_ACTIVITY_ENABLED) {
      this.logger.log('Discord activity disabled; RMQ projection consumer idle.');
      return;
    }

    try {
      this.connection = await connectAmqp(url);
      this.channel = await createChannel(this.connection);
      await this.channel.prefetch(5);
      await declareActivityProjectionTopology(this.channel);
      const { consumerTag } = await this.channel.consume(
        DISCORD_ACTIVITY_PROJECTIONS_QUEUE,
        (msg) => {
          void this.handleMessage(msg);
        },
        { noAck: false },
      );
      this.consumerTag = consumerTag;
      this.logger.log(`Consuming ${DISCORD_ACTIVITY_PROJECTIONS_QUEUE}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start RMQ projection consumer: ${message}`);
    }
  }

  public async onModuleDestroy(): Promise<void> {
    try {
      if (this.channel !== null && this.consumerTag !== null) {
        await this.channel.cancel(this.consumerTag);
      }
    } catch {
      // ignore
    }
    try {
      await this.channel?.close();
    } catch {
      // ignore
    }
    this.channel = null;
    if (this.connection !== null) {
      await closeAmqp(this.connection);
      this.connection = null;
    }
  }

  private async handleMessage(
    msg: {
      content: Buffer;
      fields: { redelivered: boolean };
      properties: { headers?: Record<string, unknown> | undefined };
    } | null,
  ): Promise<void> {
    const channel = this.channel;
    if (msg === null || channel === null) {
      return;
    }

    let envelope;
    try {
      envelope = parseActivityProjectionEnvelope(JSON.parse(msg.content.toString('utf8')));
    } catch {
      channel.nack(msg as never, false, false);
      this.logger.warn('Poison projection envelope -> DLQ (nack no-requeue)');
      return;
    }

    try {
      const target = envelope.projection.targets[0];
      const deliveryBody = {
        outboxId: envelope.outboxId,
        eventType: envelope.eventType,
        aggregateId: envelope.aggregateId,
        aggregateVersion: envelope.aggregateVersion,
        payload: {
          ...envelope.payload,
          kind: typeof envelope.payload.kind === 'string' ? envelope.payload.kind : 'event',
          ...(target !== undefined
            ? { guildId: target.guildId, channelId: target.channelId }
            : {}),
        },
      };

      const secret = this.config.ACTIVITY_PROJECTION_SHARED_SECRET;
      const result: ProjectionDeliveryResult = await this.delivery.deliver(deliveryBody, secret);

      if (result.status === 'delivered' || result.status === 'duplicate') {
        channel.ack(msg as never);
        return;
      }

      if (result.status === 'rate_limited' || result.status === 'upstream_error') {
        await this.retryOrDlq(msg);
        return;
      }

      channel.nack(msg as never, false, false);
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status: unknown }).status)
          : undefined;
      if (status === 429 || status === 502 || status === 503) {
        await this.retryOrDlq(msg);
        return;
      }
      if (status === 400 || status === 401 || status === 403) {
        channel.nack(msg as never, false, false);
        return;
      }
      await this.retryOrDlq(msg);
    }
  }

  private async retryOrDlq(msg: {
    content: Buffer;
    properties: { headers?: Record<string, unknown> | undefined };
  }): Promise<void> {
    const channel = this.channel;
    if (channel === null) {
      return;
    }
    const headers = msg.properties.headers ?? {};
    const deaths = Array.isArray(headers['x-death']) ? headers['x-death'].length : 0;
    if (deaths >= 5) {
      channel.nack(msg as never, false, false);
      this.logger.warn('Projection retries exhausted -> DLQ');
      return;
    }
    channel.publish(ACTIVITY_EVENTS_RETRY_EXCHANGE, ACTIVITY_EVENTS_BINDING_KEY, msg.content, {
      persistent: true,
      headers,
    });
    channel.ack(msg as never);
  }
}
