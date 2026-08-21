import { describe, expect, it, vi } from 'vitest';

import type { ActivityEnv } from '../config/activity-env.js';
import { ActivityOutboxDispatcher, PROJECTION_SECRET_HEADER } from './outbox-dispatcher.js';

function makeConfig(overrides: Record<string, unknown> = {}): ActivityEnv {
  return {
    ACTIVITY_OUTBOX_WORKER_ENABLED: true,
    ACTIVITY_OUTBOX_TRANSPORT: 'http',
    ACTIVITY_DISCORD_PROJECTION_BASE_URL: 'http://127.0.0.1:4100',
    ACTIVITY_PROJECTION_SHARED_SECRET: 'proj-secret',
    ACTIVITY_ENABLED: false,
    ACTIVITY_CLIENT_ASSERTION_MAX_TTL_SECONDS: 60,
    ACTIVITY_TO_DISCORD_CLIENT_ID: 'v2.activity-service',
    ...overrides,
  } as ActivityEnv;
}

function makeMessage() {
  return {
    id: 'outbox-1',
    eventType: 'activity.activity.projection_requested.v1',
    aggregateType: 'activity',
    aggregateId: 'act-1',
    aggregateVersion: 1,
    payload: { kind: 'hub', channelId: 'c1', opaquePanelId: 'a1b2c3d4e5f6' },
    attemptCount: 1,
  };
}

describe('ActivityOutboxDispatcher projection secret contract', () => {
  it('sends x-activity-projection-secret on deliver', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'delivered', messageId: 'm1', channelId: 'c1' }), {
        status: 200,
      }),
    );
    const completeOutbox = vi.fn().mockResolvedValue(undefined);
    const upsertActivityProjection = vi.fn().mockResolvedValue({});
    const repository = {
      withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          claimOutbox: () =>
            Promise.resolve([
              {
                ...makeMessage(),
                payload: {
                  kind: 'event',
                  guildId: 'g1',
                  channelId: 'c1',
                  opaqueEventId: 'a1b2c3d4e5f6',
                  name: 'Raid',
                },
              },
            ]),
          completeOutbox,
          upsertActivityProjection,
          failOutbox: vi.fn(),
          permanentFailOutbox: vi.fn(),
        }),
      ),
    };
    const dispatcher = new ActivityOutboxDispatcher(makeConfig(), repository as never, {
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });
    dispatcher.setFetchImpl(fetchImpl);
    await dispatcher.runOnce();

    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers[PROJECTION_SECRET_HEADER]).toBe('proj-secret');
    expect(completeOutbox).toHaveBeenCalledOnce();
    expect(upsertActivityProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'm1',
        status: 'delivered',
        channelId: 'c1',
        guildId: 'g1',
      }),
    );
  });

  it('completes domain events without calling Discord deliver', async () => {
    const fetchImpl = vi.fn();
    const completeOutbox = vi.fn().mockResolvedValue(undefined);
    const repository = {
      withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          claimOutbox: () =>
            Promise.resolve([
              {
                id: 'outbox-domain',
                eventType: 'activity.activity.created.v1',
                aggregateType: 'activity',
                aggregateId: 'act-1',
                aggregateVersion: 1,
                payload: { activityId: 'act-1' },
                attemptCount: 1,
              },
            ]),
          completeOutbox,
          failOutbox: vi.fn(),
          permanentFailOutbox: vi.fn(),
        }),
      ),
    };
    const dispatcher = new ActivityOutboxDispatcher(makeConfig(), repository as never, {
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });
    dispatcher.setFetchImpl(fetchImpl);
    await dispatcher.runOnce();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(completeOutbox).toHaveBeenCalledOnce();
  });

  it('fail-fast onModuleInit when secret missing', async () => {
    const dispatcher = new ActivityOutboxDispatcher(
      makeConfig({ ACTIVITY_PROJECTION_SHARED_SECRET: undefined }),
      { withTransaction: vi.fn() } as never,
      { now: () => new Date() },
    );
    await expect(dispatcher.onModuleInit()).rejects.toThrow(/ACTIVITY_PROJECTION_SHARED_SECRET/);
  });
});
