import { describe, expect, it, vi } from 'vitest';

import { RabbitMqActivityEventPublisher } from './rabbitmq-publisher.js';

type PublishCallback = (err: Error | null) => void;
type PublishCall = [
  exchange: string,
  routingKey: string,
  body: Buffer,
  options: Record<string, unknown>,
  callback: PublishCallback,
];

describe('RabbitMqActivityEventPublisher', () => {
  it('declares topology and publishes JSON with confirm headers', async () => {
    const publish = vi.fn(
      (_ex: string, _key: string, _body: Buffer, _opts: unknown, cb: PublishCallback): boolean => {
        cb(null);
        return true;
      },
    );
    const assertExchange = vi.fn().mockResolvedValue(undefined);
    const assertQueue = vi.fn().mockResolvedValue(undefined);
    const bindQueue = vi.fn().mockResolvedValue(undefined);
    const closeChannel = vi.fn().mockResolvedValue(undefined);
    const closeConnection = vi.fn().mockResolvedValue(undefined);

    const channel = {
      assertExchange,
      assertQueue,
      bindQueue,
      publish,
      close: closeChannel,
    };

    const connection = {
      createConfirmChannel: vi.fn().mockResolvedValue(channel),
      close: closeConnection,
    };

    const connectFn = vi.fn().mockResolvedValue(connection);

    const publisher = new RabbitMqActivityEventPublisher({
      url: 'amqp://v2:pass@localhost:5672',
      connectFn: connectFn as never,
    });

    await publisher.publish({
      outboxId: 'outbox-1',
      eventType: 'activity.activity.created.v1',
      aggregateType: 'activity',
      aggregateId: 'act-1',
      aggregateVersion: 2,
      payload: { guildId: 'guild-1' },
      attemptCount: 1,
      guildId: 'guild-1',
      correlationId: 'corr-1',
    });

    expect(connectFn).toHaveBeenCalledWith('amqp://v2:pass@localhost:5672');
    expect(assertExchange).toHaveBeenCalledWith('activity.events', 'topic', { durable: true });
    expect(assertExchange).toHaveBeenCalledWith('activity.events.dlx', 'topic', { durable: true });
    expect(assertQueue).toHaveBeenCalledWith(
      'activity.projection.discord',
      expect.objectContaining({
        durable: true,
      }),
    );
    const queueOptions = assertQueue.mock.calls.find(
      (call) => call[0] === 'activity.projection.discord',
    )?.[1] as { arguments?: Record<string, unknown> } | undefined;
    expect(queueOptions?.arguments).toMatchObject({
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': 'activity.events.dlx',
    });
    expect(bindQueue).toHaveBeenCalledWith(
      'activity.projection.discord',
      'activity.events',
      'activity.activity.projection_requested.v1',
    );
    expect(bindQueue).toHaveBeenCalledWith(
      'activity.projection.discord',
      'activity.events',
      'activity.panel.projection_repaired.v1',
    );

    expect(publish).toHaveBeenCalledTimes(1);
    const call = publish.mock.calls[0] as PublishCall | undefined;
    expect(call).toBeDefined();
    if (call === undefined) {
      throw new Error('expected publish call');
    }
    const [exchange, routingKey, body, options] = call;
    expect(exchange).toBe('activity.events');
    expect(routingKey).toBe('activity.activity.created.v1');
    expect(JSON.parse(body.toString('utf8'))).toMatchObject({
      outboxId: 'outbox-1',
      eventType: 'activity.activity.created.v1',
      guildId: 'guild-1',
    });
    expect(options).toMatchObject({
      contentType: 'application/json',
      messageId: 'outbox-1',
      type: 'activity.activity.created.v1',
      persistent: true,
      correlationId: 'corr-1',
      headers: {
        'x-guild-id': 'guild-1',
        'x-correlation-id': 'corr-1',
      },
    });

    await publisher.close();
    expect(closeChannel).toHaveBeenCalled();
    expect(closeConnection).toHaveBeenCalled();
  });

  it('rejects when confirm callback reports an error', async () => {
    const publish = vi.fn(
      (_ex: string, _key: string, _body: Buffer, _opts: unknown, cb: PublishCallback): boolean => {
        cb(new Error('nack'));
        return true;
      },
    );
    const channel = {
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
      publish,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connection = {
      createConfirmChannel: vi.fn().mockResolvedValue(channel),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const publisher = new RabbitMqActivityEventPublisher({
      url: 'amqp://localhost',
      connectFn: vi.fn().mockResolvedValue(connection) as never,
    });

    await expect(
      publisher.publish({
        outboxId: 'outbox-1',
        eventType: 'activity.activity.created.v1',
        aggregateType: 'activity',
        aggregateId: 'act-1',
        aggregateVersion: 1,
        payload: {},
      }),
    ).rejects.toThrow('nack');
  });
});
