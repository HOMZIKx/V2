import type { ActivityProjectionDeliveryV1 } from '@v2/contracts';

/**
 * Application port for publishing activity projection delivery envelopes.
 * Implementations may use RabbitMQ; domain/application must not import amqplib.
 */
export interface ActivityEventPublisherPort {
  /**
   * Ensures broker topology exists and the client is connected.
   * Safe to call multiple times.
   */
  connect(): Promise<void>;

  /**
   * Publishes with broker confirms. Resolves only after a positive confirm.
   * Rejects on nack, channel/connection failure, or timeout.
   */
  publish(envelope: ActivityProjectionDeliveryV1): Promise<void>;

  close(): Promise<void>;
}
