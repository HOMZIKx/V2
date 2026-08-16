import { describe, expect, it, vi } from 'vitest';

import type { ActivityEventPublisherPort } from '../../application/ports/activity-event-publisher.port.js';
import type {
  ActivityRepositoryPort,
  ActivityTx,
  OutboxMessageRecord,
} from '../../application/ports/activity.ports.js';
import type { Clock } from '../../domain/clock.js';
import type { ActivityEnv } from '../config/activity-env.js';
import { ActivityOutboxDispatcher, buildProjectionDeliveryEnvelope } from './outbox-dispatcher.js';

function message(overrides: Partial<OutboxMessageRecord> = {}): OutboxMessageRecord {
  return {
    id: 'outbox-1',
    eventType: 'activity.activity.created.v1',
    aggregateType: 'activity',
    aggregateId: 'act-1',
    aggregateVersion: 2,
    payload: { guildId: 'guild-1', correlationId: 'corr-1' },
    status: 'claimed',
    attemptCount: 1,
    ...overrides,
  };
}

function baseEnv(overrides: Partial<ActivityEnv> = {}): ActivityEnv {
  return {
    ACTIVITY_DATABASE_URL: 'postgresql://activity:x@127.0.0.1:5432/activity',
    ACTIVITY_SERVICE_PORT: 4400,
    ACTIVITY_SERVICE_HOST: '127.0.0.1',
    ACTIVITY_ENABLED: false,
    ACTIVITY_OUTBOX_WORKER_ENABLED: true,
    ACTIVITY_OUTBOX_TRANSPORT: 'rabbitmq',
    RABBITMQ_URL: 'amqp://v2:pass@localhost:5672',
    ACTIVITY_AUTHORIZATION_BASE_URL: undefined,
    ACTIVITY_AUTHORIZATION_ASSERTION_AUD: undefined,
    ACTIVITY_TO_AUTHZ_CLIENT_ID: 'v2.activity-service',
    ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM: undefined,
    ACTIVITY_TO_AUTHZ_ACTIVE_KID: undefined,
    ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60,
    ACTIVITY_INBOUND_CLIENTS_JSON: undefined,
    ACTIVITY_ASSERTION_AUD: undefined,
    ACTIVITY_DISCORD_PROJECTION_BASE_URL: 'http://127.0.0.1:4100',
    ACTIVITY_DISCORD_GATEWAY_BASE_URL: undefined,
    ACTIVITY_PROJECTION_SHARED_SECRET: undefined,
    ACTIVITY_TO_DISCORD_CLIENT_ID: 'v2.activity-service',
    ACTIVITY_TO_DISCORD_PRIVATE_KEY_PEM: undefined,
    ACTIVITY_TO_DISCORD_ACTIVE_KID: undefined,
    ACTIVITY_DISCORD_ASSERTION_AUD: undefined,
    ACTIVITY_ALLOW_TEST_SEED: false,
    NODE_ENV: 'test',
    ...overrides,
  };
}

describe('buildProjectionDeliveryEnvelope', () => {
  it('lifts guildId and correlationId from payload', () => {
    expect(buildProjectionDeliveryEnvelope(message())).toMatchObject({
      outboxId: 'outbox-1',
      guildId: 'guild-1',
      correlationId: 'corr-1',
      attemptCount: 1,
    });
  });
});

describe('ActivityOutboxDispatcher rabbitmq transport', () => {
  it('publishes via publisher and completes outbox on confirm', async () => {
    const claimed = [message()];
    const completeOutbox = vi.fn().mockResolvedValue(undefined);
    const failOutbox = vi.fn().mockResolvedValue(undefined);
    const permanentFailOutbox = vi.fn().mockResolvedValue(undefined);
    const claimOutbox = vi.fn().mockResolvedValue(claimed);

    const repository: ActivityRepositoryPort = {
      withTransaction: async (fn) =>
        fn({
          claimOutbox,
          completeOutbox,
          failOutbox,
          permanentFailOutbox,
        } as unknown as ActivityTx),
    } as ActivityRepositoryPort;

    const publish = vi.fn().mockResolvedValue(undefined);
    const publisher: ActivityEventPublisherPort = {
      connect: vi.fn().mockResolvedValue(undefined),
      publish,
      close: vi.fn().mockResolvedValue(undefined),
    };

    const clock: Clock = { now: () => new Date('2026-08-16T12:00:00.000Z') };
    const dispatcher = new ActivityOutboxDispatcher(baseEnv(), repository, clock, publisher);

    await dispatcher.runOnce();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        outboxId: 'outbox-1',
        eventType: 'activity.activity.created.v1',
        guildId: 'guild-1',
        correlationId: 'corr-1',
      }),
    );
    expect(completeOutbox).toHaveBeenCalledWith('outbox-1');
    expect(failOutbox).not.toHaveBeenCalled();
  });

  it('fails outbox with backoff when publish throws', async () => {
    const claimed = [message()];
    const completeOutbox = vi.fn().mockResolvedValue(undefined);
    const failOutbox = vi.fn().mockResolvedValue(undefined);
    const claimOutbox = vi.fn().mockResolvedValue(claimed);

    const repository: ActivityRepositoryPort = {
      withTransaction: async (fn) =>
        fn({
          claimOutbox,
          completeOutbox,
          failOutbox,
          permanentFailOutbox: vi.fn(),
        } as unknown as ActivityTx),
    } as ActivityRepositoryPort;

    const publisher: ActivityEventPublisherPort = {
      connect: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockRejectedValue(new Error('broker down')),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const dispatcher = new ActivityOutboxDispatcher(
      baseEnv(),
      repository,
      { now: () => new Date('2026-08-16T12:00:00.000Z') },
      publisher,
    );

    await dispatcher.runOnce();

    expect(completeOutbox).not.toHaveBeenCalled();
    expect(failOutbox).toHaveBeenCalledWith(
      'outbox-1',
      'broker down',
      new Date('2026-08-16T12:00:05.000Z'),
    );
  });
});

describe('ActivityOutboxDispatcher http transport', () => {
  it('keeps HTTP deliver path and completes on 2xx', async () => {
    const claimed = [message()];
    const completeOutbox = vi.fn().mockResolvedValue(undefined);
    const claimOutbox = vi.fn().mockResolvedValue(claimed);

    const repository: ActivityRepositoryPort = {
      withTransaction: async (fn) =>
        fn({
          claimOutbox,
          completeOutbox,
          failOutbox: vi.fn(),
          permanentFailOutbox: vi.fn(),
        } as unknown as ActivityTx),
    } as ActivityRepositoryPort;

    const dispatcher = new ActivityOutboxDispatcher(
      baseEnv({
        ACTIVITY_OUTBOX_TRANSPORT: 'http',
        RABBITMQ_URL: undefined,
      }),
      repository,
      { now: () => new Date('2026-08-16T12:00:00.000Z') },
      null,
    );

    const fetchImpl: typeof fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
    });
    dispatcher.setFetchImpl(fetchImpl);

    await dispatcher.runOnce();
    expect(completeOutbox).toHaveBeenCalledWith('outbox-1');
  });
});
