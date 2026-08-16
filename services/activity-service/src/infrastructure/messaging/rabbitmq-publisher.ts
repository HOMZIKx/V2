import { ACTIVITY_EVENTS_EXCHANGE, type ActivityProjectionDeliveryV1 } from '@v2/contracts';
import { connect, type ChannelModel, type ConfirmChannel, type Options } from 'amqplib';

import type { ActivityEventPublisherPort } from '../../application/ports/activity-event-publisher.port.js';
import { assertActivityRabbitMqTopology } from './rabbitmq-topology.js';

export type AmqpConnectFn = typeof connect;

export interface RabbitMqActivityEventPublisherOptions {
  readonly url: string;
  /** Test seam — defaults to amqplib.connect */
  readonly connectFn?: AmqpConnectFn;
}

/**
 * Publishes activity projection delivery envelopes to `activity.events`
 * with publisher confirms. Does not log payload bodies.
 */
export class RabbitMqActivityEventPublisher implements ActivityEventPublisherPort {
  private readonly url: string;
  private readonly connectFn: AmqpConnectFn;
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private connectPromise: Promise<void> | null = null;

  public constructor(options: RabbitMqActivityEventPublisherOptions) {
    this.url = options.url;
    this.connectFn = options.connectFn ?? connect;
  }

  public async connect(): Promise<void> {
    if (this.channel !== null) {
      return;
    }
    if (this.connectPromise !== null) {
      await this.connectPromise;
      return;
    }
    this.connectPromise = this.open();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  public async publish(envelope: ActivityProjectionDeliveryV1): Promise<void> {
    await this.connect();
    const channel = this.channel;
    if (channel === null) {
      throw new Error('RabbitMQ confirm channel is not open');
    }

    const body = Buffer.from(JSON.stringify(envelope), 'utf8');
    const headers: Record<string, string> = {};
    if (envelope.guildId !== undefined) {
      headers['x-guild-id'] = envelope.guildId;
    }
    if (envelope.correlationId !== undefined) {
      headers['x-correlation-id'] = envelope.correlationId;
    }

    const publishOptions: Options.Publish = {
      contentType: 'application/json',
      messageId: envelope.outboxId,
      type: envelope.eventType,
      persistent: true,
      headers,
      ...(envelope.correlationId !== undefined ? { correlationId: envelope.correlationId } : {}),
    };

    await new Promise<void>((resolve, reject) => {
      channel.publish(ACTIVITY_EVENTS_EXCHANGE, envelope.eventType, body, publishOptions, (err) => {
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        resolve();
      });
    });
  }

  public async close(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;
    if (channel !== null) {
      await channel.close().catch(() => undefined);
    }
    if (connection !== null) {
      await connection.close().catch(() => undefined);
    }
  }

  private async open(): Promise<void> {
    const connection = await this.connectFn(this.url);
    const channel = await connection.createConfirmChannel();
    await assertActivityRabbitMqTopology(channel);
    this.connection = connection;
    this.channel = channel;
  }
}
