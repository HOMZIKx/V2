import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  ACTIVITY_EVENTS_DLX,
  ACTIVITY_EVENTS_EXCHANGE,
  ACTIVITY_EVENTS_EXCHANGE_TYPE,
  ACTIVITY_PROJECTION_DISCORD_BINDING_KEYS,
  ACTIVITY_PROJECTION_DISCORD_DLQ,
  ACTIVITY_PROJECTION_DISCORD_QUEUE,
} from '@v2/contracts';
import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';

import {
  isRetryableProjectionStatus,
  projectionDeliveryEnvelopeSchema,
} from '../../application/activity/activity-projection-envelope.js';
import { DISCORD_CONFIG_TOKEN } from '../../interface/discord/discord.tokens.js';
import type { DiscordGatewayConfig } from '../discord/discord-config.js';
import { ActivityProjectionDeliveryService } from './activity-projection-delivery.service.js';

export const ACTIVITY_PROJECTION_MAX_RETRIES = 5;
export const ACTIVITY_PROJECTION_RETRY_HEADER = 'x-retry-count';

export type AmqpConnectFn = (url: string) => Promise<ChannelModel>;

/**
 * Consumes activity projection envelopes from RabbitMQ and applies them via
 * {@link ActivityProjectionDeliveryService}.
 */
@Injectable()
export class ActivityProjectionRabbitMqConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityProjectionRabbitMqConsumer.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connectFn: AmqpConnectFn = (url) => amqp.connect(url);

  public constructor(
    @Inject(DISCORD_CONFIG_TOKEN) private readonly config: DiscordGatewayConfig,
    private readonly delivery: ActivityProjectionDeliveryService,
  ) {}

  /** Test seam for AMQP connect. */
  public setConnectFn(connectFn: AmqpConnectFn): void {
    this.connectFn = connectFn;
  }

  public async onModuleInit(): Promise<void> {
    if (!this.config.activityProjectionConsumerEnabled) {
      this.logger.log('Activity projection RabbitMQ consumer disabled');
      return;
    }

    const url = this.config.RABBITMQ_URL.trim();
    if (url.length === 0) {
      this.logger.warn(
        'Activity projection consumer enabled but RABBITMQ_URL is empty; skipping connect',
      );
      return;
    }

    try {
      this.connection = await this.connectFn(url);
      this.channel = await this.connection.createChannel();
      await this.assertTopology(this.channel);
      await this.channel.consume(ACTIVITY_PROJECTION_DISCORD_QUEUE, (msg) => {
        void this.onMessage(msg);
      });
      this.logger.log('Activity projection RabbitMQ consumer started', {
        queue: ACTIVITY_PROJECTION_DISCORD_QUEUE,
        exchange: ACTIVITY_EVENTS_EXCHANGE,
      });
    } catch (error) {
      this.logger.error('Failed to start activity projection RabbitMQ consumer', {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.closeQuietly();
      throw error;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.closeQuietly();
  }

  /** Test seam: process one already-decoded message against a mock channel. */
  public async handleConsumedMessage(channel: Channel, msg: ConsumeMessage): Promise<void> {
    await this.processMessage(channel, msg);
  }

  private async onMessage(msg: ConsumeMessage | null): Promise<void> {
    const channel = this.channel;
    if (msg === null || channel === null) {
      return;
    }
    try {
      await this.processMessage(channel, msg);
    } catch (error) {
      this.logger.error('Unhandled projection consumer error; nacking without requeue', {
        error: error instanceof Error ? error.message : String(error),
      });
      try {
        channel.nack(msg, false, false);
      } catch {
        // channel may already be closed
      }
    }
  }

  private async processMessage(channel: Channel, msg: ConsumeMessage): Promise<void> {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(msg.content.toString('utf8')) as unknown;
    } catch {
      this.logger.warn('Projection message JSON parse failed; routing to DLQ', {
        correlation: messageCorrelationId(msg),
      });
      this.publishToDlq(channel, msg, 'invalid_json');
      channel.ack(msg);
      return;
    }

    const parsed = projectionDeliveryEnvelopeSchema.safeParse(parsedJson);
    if (!parsed.success) {
      this.logger.warn('Projection envelope rejected; routing to DLQ', {
        correlation: messageCorrelationId(msg),
      });
      this.publishToDlq(channel, msg, 'invalid_envelope');
      channel.ack(msg);
      return;
    }

    const envelope = parsed.data;
    const guildId =
      envelope.guildId ??
      (typeof envelope.payload.guildId === 'string' ? envelope.payload.guildId : undefined);

    this.logger.log('Projection message consumed', {
      outboxId: envelope.outboxId,
      eventType: envelope.eventType,
      guildId,
      correlation: messageCorrelationId(msg),
    });

    if (!isProjectionApplyEvent(envelope.eventType)) {
      this.logger.log('Non-projection activity event acked without Discord apply', {
        outboxId: envelope.outboxId,
        eventType: envelope.eventType,
        guildId,
        correlation: messageCorrelationId(msg),
      });
      channel.ack(msg);
      return;
    }

    const result = await this.delivery.deliver(envelope);

    if (result.status === 'delivered' || result.status === 'duplicate') {
      channel.ack(msg);
      return;
    }

    if (isRetryableProjectionStatus(result.status)) {
      const retryCount = readRetryCount(msg) + 1;
      if (retryCount >= ACTIVITY_PROJECTION_MAX_RETRIES) {
        this.logger.warn('Projection retries exhausted; routing to DLQ', {
          outboxId: envelope.outboxId,
          eventType: envelope.eventType,
          guildId,
          status: result.status,
          retryCount,
          correlation: messageCorrelationId(msg),
        });
        this.publishToDlq(channel, msg, result.status);
        channel.ack(msg);
        return;
      }

      this.logger.warn('Projection delivery retryable; requeue with incremented retry count', {
        outboxId: envelope.outboxId,
        eventType: envelope.eventType,
        guildId,
        status: result.status,
        retryCount,
        correlation: messageCorrelationId(msg),
      });
      const republishProps = readMessagePublishProperties(msg);
      channel.publish(
        ACTIVITY_EVENTS_EXCHANGE,
        msg.fields.routingKey || envelope.eventType,
        msg.content,
        {
          persistent: true,
          contentType: republishProps.contentType,
          headers: {
            ...republishProps.headers,
            [ACTIVITY_PROJECTION_RETRY_HEADER]: retryCount,
          },
          ...(republishProps.correlationId !== undefined
            ? { correlationId: republishProps.correlationId }
            : {}),
          ...(republishProps.messageId !== undefined
            ? { messageId: republishProps.messageId }
            : {}),
          ...(republishProps.timestamp !== undefined
            ? { timestamp: republishProps.timestamp }
            : {}),
        },
      );
      channel.ack(msg);
      return;
    }

    this.logger.warn('Projection delivery permanent failure; routing to DLQ', {
      outboxId: envelope.outboxId,
      eventType: envelope.eventType,
      guildId,
      status: result.status,
      correlation: messageCorrelationId(msg),
    });
    this.publishToDlq(channel, msg, result.status);
    channel.ack(msg);
  }

  private async assertTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(ACTIVITY_EVENTS_EXCHANGE, ACTIVITY_EVENTS_EXCHANGE_TYPE, {
      durable: true,
    });
    await channel.assertExchange(ACTIVITY_EVENTS_DLX, ACTIVITY_EVENTS_EXCHANGE_TYPE, {
      durable: true,
    });
    await channel.assertQueue(ACTIVITY_PROJECTION_DISCORD_DLQ, {
      durable: true,
      arguments: { 'x-queue-type': 'quorum' },
    });
    await channel.bindQueue(
      ACTIVITY_PROJECTION_DISCORD_DLQ,
      ACTIVITY_EVENTS_DLX,
      ACTIVITY_PROJECTION_DISCORD_DLQ,
    );
    await channel.assertQueue(ACTIVITY_PROJECTION_DISCORD_QUEUE, {
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': ACTIVITY_EVENTS_DLX,
        'x-dead-letter-routing-key': ACTIVITY_PROJECTION_DISCORD_DLQ,
      },
    });
    for (const key of ACTIVITY_PROJECTION_DISCORD_BINDING_KEYS) {
      await channel.bindQueue(ACTIVITY_PROJECTION_DISCORD_QUEUE, ACTIVITY_EVENTS_EXCHANGE, key);
    }
  }

  private publishToDlq(channel: Channel, msg: ConsumeMessage, reason: string): void {
    const props = readMessagePublishProperties(msg);
    channel.sendToQueue(ACTIVITY_PROJECTION_DISCORD_DLQ, msg.content, {
      persistent: true,
      contentType: props.contentType,
      headers: {
        ...props.headers,
        'x-death-reason': reason,
      },
      ...(props.correlationId !== undefined ? { correlationId: props.correlationId } : {}),
      ...(props.messageId !== undefined ? { messageId: props.messageId } : {}),
      ...(props.timestamp !== undefined ? { timestamp: props.timestamp } : {}),
    });
    this.logger.warn('Projection message published to DLQ', {
      reason,
      correlation: props.correlationId,
      queue: ACTIVITY_PROJECTION_DISCORD_DLQ,
    });
  }

  private async closeQuietly(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    if (channel !== null) {
      try {
        await channel.close();
      } catch {
        // ignore
      }
    }
    if (connection !== null) {
      try {
        await connection.close();
      } catch {
        // ignore
      }
    }
  }
}

function coerceOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function coerceOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function coerceMessageHeaders(headers: unknown): Record<string, unknown> {
  if (headers !== null && typeof headers === 'object' && !Array.isArray(headers)) {
    return headers as Record<string, unknown>;
  }
  return {};
}

function readMessagePublishProperties(msg: ConsumeMessage): {
  contentType: string;
  correlationId: string | undefined;
  messageId: string | undefined;
  timestamp: number | undefined;
  headers: Record<string, unknown>;
} {
  return {
    contentType: coerceOptionalString(msg.properties.contentType) ?? 'application/json',
    correlationId: coerceOptionalString(msg.properties.correlationId),
    messageId: coerceOptionalString(msg.properties.messageId),
    timestamp: coerceOptionalNumber(msg.properties.timestamp),
    headers: coerceMessageHeaders(msg.properties.headers),
  };
}

function messageCorrelationId(msg: ConsumeMessage): string | undefined {
  return coerceOptionalString(msg.properties.correlationId);
}

function readRetryCount(msg: ConsumeMessage): number {
  const raw = coerceMessageHeaders(msg.properties.headers)[ACTIVITY_PROJECTION_RETRY_HEADER];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

function isProjectionApplyEvent(eventType: string): boolean {
  return eventType.includes('.projection_') || eventType.includes('.panel.');
}
