import {
  ACTIVITY_EVENTS_DLX,
  ACTIVITY_EVENTS_EXCHANGE,
  ACTIVITY_EVENTS_EXCHANGE_TYPE,
  ACTIVITY_PROJECTION_DISCORD_BINDING_KEYS,
  ACTIVITY_PROJECTION_DISCORD_DLQ,
  ACTIVITY_PROJECTION_DISCORD_QUEUE,
} from '@v2/contracts';
import type { Channel } from 'amqplib';

/**
 * Declares Activity P4.5 RabbitMQ topology (idempotent assert*).
 * Quorum queues + DLX/DLQ per D-012.
 */
export async function assertActivityRabbitMqTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(ACTIVITY_EVENTS_EXCHANGE, ACTIVITY_EVENTS_EXCHANGE_TYPE, {
    durable: true,
  });
  await channel.assertExchange(ACTIVITY_EVENTS_DLX, ACTIVITY_EVENTS_EXCHANGE_TYPE, {
    durable: true,
  });

  await channel.assertQueue(ACTIVITY_PROJECTION_DISCORD_QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': ACTIVITY_EVENTS_DLX,
      'x-dead-letter-routing-key': ACTIVITY_PROJECTION_DISCORD_DLQ,
    },
  });

  await channel.assertQueue(ACTIVITY_PROJECTION_DISCORD_DLQ, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
    },
  });

  for (const key of ACTIVITY_PROJECTION_DISCORD_BINDING_KEYS) {
    await channel.bindQueue(ACTIVITY_PROJECTION_DISCORD_QUEUE, ACTIVITY_EVENTS_EXCHANGE, key);
  }

  await channel.bindQueue(
    ACTIVITY_PROJECTION_DISCORD_DLQ,
    ACTIVITY_EVENTS_DLX,
    ACTIVITY_PROJECTION_DISCORD_DLQ,
  );
}
