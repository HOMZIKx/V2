import { beforeEach, describe, expect, it, vi } from 'vitest';

const connect = vi.fn();
const createChannel = vi.fn();
const createConfirmChannel = vi.fn();
const close = vi.fn();

vi.mock('amqplib', () => ({
  default: {
    connect,
  },
}));

describe('amqp-connection helpers', () => {
  beforeEach(() => {
    connect.mockReset();
    createChannel.mockReset();
    createConfirmChannel.mockReset();
    close.mockReset();
  });

  it('connects, creates channels, and closes', async () => {
    const connection = {
      createChannel,
      createConfirmChannel,
      close,
    };
    connect.mockResolvedValue(connection);
    createChannel.mockResolvedValue({ kind: 'channel' });
    createConfirmChannel.mockResolvedValue({ kind: 'confirm' });

    const {
      closeAmqp,
      connectAmqp,
      createChannel: createChannelHelper,
      createConfirmChannel: createConfirmHelper,
    } = await import('./amqp-connection.js');

    const conn = await connectAmqp('amqp://localhost');
    expect(connect).toHaveBeenCalledWith('amqp://localhost');
    await expect(createChannelHelper(conn)).resolves.toEqual({ kind: 'channel' });
    await expect(createConfirmHelper(conn)).resolves.toEqual({ kind: 'confirm' });
    await closeAmqp(conn);
    expect(close).toHaveBeenCalledOnce();
  });
});
