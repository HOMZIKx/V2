import {
  ACTIVITY_EVENTS_DLX,
  ACTIVITY_EVENTS_EXCHANGE,
  ACTIVITY_EVENTS_EXCHANGE_TYPE,
  ACTIVITY_PROJECTION_DISCORD_BINDING_KEYS,
  ACTIVITY_PROJECTION_DISCORD_DLQ,
  ACTIVITY_PROJECTION_DISCORD_QUEUE,
} from '@v2/contracts';
import type { Channel, ConsumeMessage } from 'amqplib';
import { describe, expect, it, vi } from 'vitest';

/* eslint-disable @typescript-eslint/unbound-method -- vitest expect() on vi.fn() channel mocks */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- expect.objectContaining() matchers are typed as any */

import { DiscordGatewayConfigSchema, normalizeDiscordConfig } from '../discord/discord-config.js';
import { ActivityProjectionDeliveryService } from './activity-projection-delivery.service.js';
import {
  ACTIVITY_PROJECTION_MAX_RETRIES,
  ACTIVITY_PROJECTION_RETRY_HEADER,
  ActivityProjectionRabbitMqConsumer,
} from './activity-projection-rabbitmq.consumer.js';

const secret = 's'.repeat(32);

function makeConfig(overrides: Record<string, string> = {}) {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'true',
      DISCORD_APPLICATION_ID: '100000000000000001',
      DISCORD_TOKEN: 'discord-test-token-value-1234567890',
      DISCORD_TEST_GUILD_ID: '1534228693017432124',
      DISCORD_TEST_OPERATOR_IDS: '111111111111111111',
      DISCORD_COMPONENT_SIGNING_SECRET: secret,
      DISCORD_ACTIVITY_ENABLED: 'true',
      ACTIVITY_ORGANIZATION_ID: 'org-test',
      ACTIVITY_CLIENT_MODE: 'headers',
      RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
      ...overrides,
    }),
  );
}

function makeMessage(body: unknown, headers: Record<string, unknown> = {}): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(body), 'utf8'),
    fields: {
      deliveryTag: 1,
      redelivered: false,
      exchange: ACTIVITY_EVENTS_EXCHANGE,
      routingKey: 'activity.projection.requested.v1',
      consumerTag: 'ctag',
    },
    properties: {
      contentType: 'application/json',
      contentEncoding: undefined,
      headers,
      deliveryMode: undefined,
      priority: undefined,
      correlationId: 'corr-1',
      replyTo: undefined,
      expiration: undefined,
      messageId: 'msg-1',
      timestamp: undefined,
      type: undefined,
      userId: undefined,
      appId: undefined,
      clusterId: undefined,
    },
  };
}

function makeChannel(): Channel {
  return {
    ack: vi.fn(),
    nack: vi.fn(),
    publish: vi.fn(() => true),
    sendToQueue: vi.fn(() => true),
    assertExchange: vi.fn(() => Promise.resolve({ exchange: 'x' })),
    assertQueue: vi.fn(() => Promise.resolve({ queue: 'q', messageCount: 0, consumerCount: 0 })),
    bindQueue: vi.fn(() => Promise.resolve({})),
    consume: vi.fn(() => Promise.resolve({ consumerTag: 'ctag' })),
    close: vi.fn(() => Promise.resolve(undefined)),
  } as unknown as Channel;
}

describe('ActivityProjectionRabbitMqConsumer', () => {
  it('acks successful deliveries and is idempotent on duplicate outboxId', async () => {
    const publishGateway = vi.fn(() => Promise.resolve({ messageId: 'm1', channelId: 'c1' }));
    const config = makeConfig();
    const delivery = new ActivityProjectionDeliveryService(config, {
      publishComponentsV2Message: publishGateway,
      editComponentsV2Message: vi.fn(),
    } as never);
    const consumer = new ActivityProjectionRabbitMqConsumer(config, delivery);
    const channel = makeChannel();
    const body = {
      outboxId: 'outbox-rmq-1',
      eventType: 'activity.panel.projection_repaired.v1',
      aggregateType: 'panel',
      aggregateId: 'panel-1',
      aggregateVersion: 1,
      guildId: '1534228693017432124',
      payload: {
        kind: 'hub',
        channelId: 'c1',
        opaquePanelId: 'a1b2c3d4e5f6',
      },
    };

    await consumer.handleConsumedMessage(channel, makeMessage(body));
    await consumer.handleConsumedMessage(channel, makeMessage(body));

    expect(publishGateway).toHaveBeenCalledOnce();
    expect(channel.ack).toHaveBeenCalledTimes(2);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('republishes retryable failures with incremented x-retry-count then acks', async () => {
    const config = makeConfig();
    const delivery = {
      deliver: vi.fn(() =>
        Promise.resolve({
          status: 'rate_limited' as const,
          outboxId: 'outbox-retry',
          detail: '429',
        }),
      ),
    };
    const consumer = new ActivityProjectionRabbitMqConsumer(
      config,
      delivery as unknown as ActivityProjectionDeliveryService,
    );
    const channel = makeChannel();
    const body = {
      outboxId: 'outbox-retry',
      eventType: 'activity.activity.projection_requested.v1',
      aggregateType: 'activity',
      aggregateId: 'act-1',
      aggregateVersion: 1,
      payload: { kind: 'event' },
    };

    await consumer.handleConsumedMessage(
      channel,
      makeMessage(body, { [ACTIVITY_PROJECTION_RETRY_HEADER]: 1 }),
    );

    expect(channel.publish).toHaveBeenCalledWith(
      ACTIVITY_EVENTS_EXCHANGE,
      'activity.projection.requested.v1',
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({ [ACTIVITY_PROJECTION_RETRY_HEADER]: 2 }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledOnce();
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('routes to DLQ after max retries for retryable failures', async () => {
    const config = makeConfig();
    const delivery = {
      deliver: vi.fn(() =>
        Promise.resolve({
          status: 'upstream_error' as const,
          outboxId: 'outbox-max',
          detail: '502',
        }),
      ),
    };
    const consumer = new ActivityProjectionRabbitMqConsumer(
      config,
      delivery as unknown as ActivityProjectionDeliveryService,
    );
    const channel = makeChannel();
    const body = {
      outboxId: 'outbox-max',
      eventType: 'activity.activity.projection_requested.v1',
      aggregateType: 'activity',
      aggregateId: 'act-1',
      aggregateVersion: 1,
      payload: {},
    };

    await consumer.handleConsumedMessage(
      channel,
      makeMessage(body, {
        [ACTIVITY_PROJECTION_RETRY_HEADER]: ACTIVITY_PROJECTION_MAX_RETRIES - 1,
      }),
    );

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      ACTIVITY_PROJECTION_DISCORD_DLQ,
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-death-reason': 'upstream_error' }),
      }),
    );
    expect(channel.ack).toHaveBeenCalledOnce();
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('routes permanent rejections to DLQ and acks', async () => {
    const config = makeConfig();
    const delivery = {
      deliver: vi.fn(() =>
        Promise.resolve({
          status: 'rejected' as const,
          outboxId: 'outbox-bad',
          detail: 'bad payload',
        }),
      ),
    };
    const consumer = new ActivityProjectionRabbitMqConsumer(
      config,
      delivery as unknown as ActivityProjectionDeliveryService,
    );
    const channel = makeChannel();

    await consumer.handleConsumedMessage(
      channel,
      makeMessage({
        outboxId: 'outbox-bad',
        eventType: 'activity.activity.projection_requested.v1',
        aggregateType: 'activity',
        aggregateId: 'act-1',
        aggregateVersion: 1,
        payload: { kind: 'event' },
      }),
    );

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      ACTIVITY_PROJECTION_DISCORD_DLQ,
      expect.any(Buffer),
      expect.any(Object),
    );
    expect(channel.ack).toHaveBeenCalledOnce();
  });

  it('asserts topology and consumes when enabled onModuleInit', async () => {
    const channel = makeChannel();
    const connection = {
      createChannel: vi.fn(() => Promise.resolve(channel)),
      close: vi.fn(() => Promise.resolve(undefined)),
    };
    const connectFn = vi.fn(() => Promise.resolve(connection));
    const config = makeConfig();
    const delivery = new ActivityProjectionDeliveryService(config, null);
    const consumer = new ActivityProjectionRabbitMqConsumer(config, delivery);
    consumer.setConnectFn(connectFn as never);

    await consumer.onModuleInit();

    expect(connectFn).toHaveBeenCalledWith('amqp://guest:guest@localhost:5672');
    expect(channel.assertExchange).toHaveBeenCalledWith(
      ACTIVITY_EVENTS_EXCHANGE,
      ACTIVITY_EVENTS_EXCHANGE_TYPE,
      {
        durable: true,
      },
    );
    expect(channel.assertExchange).toHaveBeenCalledWith(
      ACTIVITY_EVENTS_DLX,
      ACTIVITY_EVENTS_EXCHANGE_TYPE,
      {
        durable: true,
      },
    );
    expect(channel.assertQueue).toHaveBeenCalledWith(
      ACTIVITY_PROJECTION_DISCORD_QUEUE,
      expect.objectContaining({
        durable: true,
        arguments: expect.objectContaining({
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': ACTIVITY_EVENTS_DLX,
          'x-dead-letter-routing-key': ACTIVITY_PROJECTION_DISCORD_DLQ,
        }),
      }),
    );
    for (const key of ACTIVITY_PROJECTION_DISCORD_BINDING_KEYS) {
      expect(channel.bindQueue).toHaveBeenCalledWith(
        ACTIVITY_PROJECTION_DISCORD_QUEUE,
        ACTIVITY_EVENTS_EXCHANGE,
        key,
      );
    }
    expect(channel.consume).toHaveBeenCalledWith(
      ACTIVITY_PROJECTION_DISCORD_QUEUE,
      expect.any(Function),
    );

    await consumer.onModuleDestroy();
    expect(channel.close).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });

  it('skips connect when consumer disabled', async () => {
    const connectFn = vi.fn();
    const config = makeConfig({
      DISCORD_ACTIVITY_PROJECTION_CONSUMER_ENABLED: 'false',
    });
    const delivery = new ActivityProjectionDeliveryService(config, null);
    const consumer = new ActivityProjectionRabbitMqConsumer(config, delivery);
    consumer.setConnectFn(connectFn as never);

    await consumer.onModuleInit();
    expect(connectFn).not.toHaveBeenCalled();
  });
});
