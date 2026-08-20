import type { Channel } from 'amqplib';

import {
  ACTIVITY_EVENTS_BINDING_KEY,
  ACTIVITY_EVENTS_DLX,
  ACTIVITY_EVENTS_EXCHANGE,
  ACTIVITY_EVENTS_RETRY_EXCHANGE,
  ACTIVITY_PROJECTION_RETRY_TTL_MS,
  DISCORD_ACTIVITY_PROJECTIONS_DLQ,
  DISCORD_ACTIVITY_PROJECTIONS_QUEUE,
  DISCORD_ACTIVITY_PROJECTIONS_RETRY_QUEUE,
} from './activity-topology.js';

/**
 * Assert durable Activity projection topology (idempotent).
 * Quorum queues require RabbitMQ 3.8+ with quorum enabled (compose default_queue_type).
 */
export async function declareActivityProjectionTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(ACTIVITY_EVENTS_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(ACTIVITY_EVENTS_RETRY_EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(ACTIVITY_EVENTS_DLX, 'fanout', { durable: true });

  await channel.assertQueue(DISCORD_ACTIVITY_PROJECTIONS_QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': ACTIVITY_EVENTS_DLX,
    },
  });

  await channel.assertQueue(DISCORD_ACTIVITY_PROJECTIONS_RETRY_QUEUE, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-message-ttl': ACTIVITY_PROJECTION_RETRY_TTL_MS,
      'x-dead-letter-exchange': ACTIVITY_EVENTS_EXCHANGE,
      'x-dead-letter-routing-key': ACTIVITY_EVENTS_BINDING_KEY,
    },
  });

  await channel.assertQueue(DISCORD_ACTIVITY_PROJECTIONS_DLQ, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
    },
  });

  await channel.bindQueue(
    DISCORD_ACTIVITY_PROJECTIONS_QUEUE,
    ACTIVITY_EVENTS_EXCHANGE,
    ACTIVITY_EVENTS_BINDING_KEY,
  );
  await channel.bindQueue(
    DISCORD_ACTIVITY_PROJECTIONS_RETRY_QUEUE,
    ACTIVITY_EVENTS_RETRY_EXCHANGE,
    ACTIVITY_EVENTS_BINDING_KEY,
  );
  await channel.bindQueue(DISCORD_ACTIVITY_PROJECTIONS_DLQ, ACTIVITY_EVENTS_DLX, '');
}
