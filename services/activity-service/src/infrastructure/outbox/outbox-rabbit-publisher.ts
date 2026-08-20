import {
  ACTIVITY_EVENTS_EXCHANGE,
  closeAmqp,
  connectAmqp,
  createConfirmChannel,
  declareActivityProjectionTopology,
  messageIdFromOutboxId,
  type ActivityProjectionEnvelope,
  type AmqpConnection,
} from '@v2/messaging';
import { randomUUID } from 'node:crypto';

import type { OutboxMessageRecord } from '../../application/ports/activity.ports.js';

export type RabbitPublishResult = 'confirmed' | 'nack' | 'error';

type ConfirmChannel = Awaited<ReturnType<typeof createConfirmChannel>>;

/**
 * Infrastructure adapter: publishes outbox rows to RabbitMQ with publisher confirms.
 * Domain/application must not import amqplib — only this adapter + @v2/messaging.
 */
export class ActivityOutboxRabbitPublisher {
  private connection: AmqpConnection | null = null;
  private channel: ConfirmChannel | null = null;
  private topologyReady = false;

  public constructor(private readonly rabbitUrl: string) {}

  public async ensureReady(): Promise<void> {
    if (this.channel !== null && this.topologyReady) {
      return;
    }
    if (this.connection === null) {
      this.connection = await connectAmqp(this.rabbitUrl);
    }
    if (this.channel === null) {
      this.channel = await createConfirmChannel(this.connection);
      await this.channel.prefetch(10);
    }
    await declareActivityProjectionTopology(this.channel);
    this.topologyReady = true;
  }

  public async publish(message: OutboxMessageRecord): Promise<RabbitPublishResult> {
    try {
      await this.ensureReady();
      const channel = this.channel;
      if (channel === null) {
        return 'error';
      }

      const envelope = buildEnvelopeFromOutbox(message);
      const body = Buffer.from(JSON.stringify(envelope), 'utf8');
      const routingKey = message.eventType;

      const confirmed = await new Promise<boolean>((resolve) => {
        channel.publish(
          ACTIVITY_EVENTS_EXCHANGE,
          routingKey,
          body,
          {
            contentType: 'application/json',
            messageId: envelope.messageId,
            persistent: true,
            type: message.eventType,
          },
          (err: Error | null) => {
            resolve(err === null);
          },
        );
      });
      return confirmed ? 'confirmed' : 'nack';
    } catch {
      this.topologyReady = false;
      this.channel = null;
      return 'error';
    }
  }

  public async close(): Promise<void> {
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
    this.topologyReady = false;
  }
}

function buildEnvelopeFromOutbox(message: OutboxMessageRecord): ActivityProjectionEnvelope {
  const payload = message.payload;
  const organizationId =
    typeof payload.organizationId === 'string' && payload.organizationId.length > 0
      ? payload.organizationId
      : 'unknown';
  const guildId =
    typeof payload.guildId === 'string' && payload.guildId.length > 0
      ? payload.guildId
      : 'unknown';
  const channelId =
    typeof payload.channelId === 'string' && payload.channelId.length > 0
      ? payload.channelId
      : typeof payload.publicationChannelId === 'string'
        ? payload.publicationChannelId
        : 'unknown';
  const opaqueProjectionId =
    typeof payload.opaqueId === 'string' ? payload.opaqueId : undefined;
  const modeRaw = payload.participantMode;
  const mode =
    modeRaw === 'separate' || modeRaw === 'shared' || modeRaw === 'single' ? modeRaw : 'single';

  return {
    envelopeVersion: 1,
    messageId: messageIdFromOutboxId(message.id),
    outboxId: message.id,
    eventType: message.eventType,
    occurredAt: new Date().toISOString(),
    organizationId,
    aggregateType: message.aggregateType,
    aggregateId: message.aggregateId,
    aggregateVersion: message.aggregateVersion,
    correlationId: randomUUID(),
    projection: {
      mode,
      targets: [{ guildId, channelId, ...(opaqueProjectionId ? { opaqueProjectionId } : {}) }],
    },
    payload,
  };
}
