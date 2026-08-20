import { describe, expect, it, vi } from 'vitest';

import {
  ACTIVITY_EVENTS_BINDING_KEY,
  ACTIVITY_EVENTS_DLX,
  ACTIVITY_EVENTS_EXCHANGE,
  ACTIVITY_EVENTS_RETRY_EXCHANGE,
  DISCORD_ACTIVITY_PROJECTIONS_DLQ,
  DISCORD_ACTIVITY_PROJECTIONS_QUEUE,
  DISCORD_ACTIVITY_PROJECTIONS_RETRY_QUEUE,
} from './activity-topology.js';
import { declareActivityProjectionTopology } from './declare-activity-topology.js';

describe('declareActivityProjectionTopology', () => {
  it('asserts exchanges, queues, and bindings', async () => {
    const assertExchange = vi.fn(() => Promise.resolve());
    const assertQueue = vi.fn(() => Promise.resolve());
    const bindQueue = vi.fn(() => Promise.resolve());
    const channel = { assertExchange, assertQueue, bindQueue };

    await declareActivityProjectionTopology(channel as never);

    expect(assertExchange).toHaveBeenCalledWith(ACTIVITY_EVENTS_EXCHANGE, 'topic', {
      durable: true,
    });
    expect(assertExchange).toHaveBeenCalledWith(ACTIVITY_EVENTS_RETRY_EXCHANGE, 'topic', {
      durable: true,
    });
    expect(assertExchange).toHaveBeenCalledWith(ACTIVITY_EVENTS_DLX, 'fanout', { durable: true });
    expect(assertQueue).toHaveBeenCalledWith(
      DISCORD_ACTIVITY_PROJECTIONS_QUEUE,
      expect.objectContaining({ durable: true }),
    );
    expect(assertQueue).toHaveBeenCalledWith(
      DISCORD_ACTIVITY_PROJECTIONS_RETRY_QUEUE,
      expect.objectContaining({ durable: true }),
    );
    expect(assertQueue).toHaveBeenCalledWith(DISCORD_ACTIVITY_PROJECTIONS_DLQ, {
      durable: true,
      arguments: { 'x-queue-type': 'quorum' },
    });
    expect(bindQueue).toHaveBeenCalledWith(
      DISCORD_ACTIVITY_PROJECTIONS_QUEUE,
      ACTIVITY_EVENTS_EXCHANGE,
      ACTIVITY_EVENTS_BINDING_KEY,
    );
  });
});
