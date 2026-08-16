import { describe, expect, it, vi } from 'vitest';

import { deliverHubPanel } from './hub-panel-delivery.js';

const channelId = '222222222222222222';
const opaquePanelId = 'a1b2c3d4e5f6';
const payload = { components: [], flags: 1 << 15 };
const nonce = 'abc123nonce456789012345';

function makeGateway(overrides: Record<string, unknown> = {}) {
  return {
    fetchChannelMessage: vi.fn(() =>
      Promise.resolve({ id: 'msg-known', channelId, content: null }),
    ),
    findBotMessagesWithPanelOpaqueId: vi.fn(() => Promise.resolve([])),
    editComponentsV2Message: vi.fn(() => Promise.resolve(undefined)),
    publishComponentsV2Message: vi.fn(() => Promise.resolve({ messageId: 'msg-new', channelId })),
    deleteChannelMessage: vi.fn(() => Promise.resolve(undefined)),
    ...overrides,
  };
}

describe('deliverHubPanel', () => {
  it('adopts existing scanned message without publishing', async () => {
    const gateway = makeGateway({
      findBotMessagesWithPanelOpaqueId: vi.fn(() =>
        Promise.resolve([{ messageId: 'msg-adopt', channelId }]),
      ),
    });
    const result = await deliverHubPanel(
      { gateway, logger: { warn: vi.fn() } },
      { channelId, opaquePanelId, payload, nonce, knownMessageId: null },
    );
    expect(result.mode).toBe('adopted');
    expect(result.messageId).toBe('msg-adopt');
    expect(gateway.publishComponentsV2Message).not.toHaveBeenCalled();
    expect(gateway.editComponentsV2Message).toHaveBeenCalledWith(channelId, 'msg-adopt', payload);
  });

  it('crash-window: adopts findable message when DB message id is missing', async () => {
    const gateway = makeGateway({
      findBotMessagesWithPanelOpaqueId: vi.fn(() =>
        Promise.resolve([{ messageId: 'msg-after-crash', channelId }]),
      ),
    });
    const result = await deliverHubPanel(
      { gateway, logger: { warn: vi.fn() } },
      { channelId, opaquePanelId, payload, nonce, knownMessageId: null, preferScanFirst: true },
    );
    expect(result).toEqual({
      messageId: 'msg-after-crash',
      mode: 'adopted',
      duplicateMessageIds: [],
    });
    expect(gateway.publishComponentsV2Message).not.toHaveBeenCalled();
  });

  it('updates in place when known message id is valid', async () => {
    const gateway = makeGateway();
    const result = await deliverHubPanel(
      { gateway, logger: { warn: vi.fn() } },
      { channelId, opaquePanelId, payload, nonce, knownMessageId: 'msg-known' },
    );
    expect(result.mode).toBe('updated');
    expect(result.messageId).toBe('msg-known');
    expect(gateway.findBotMessagesWithPanelOpaqueId).not.toHaveBeenCalled();
    expect(gateway.publishComponentsV2Message).not.toHaveBeenCalled();
  });

  it('does not duplicate when retry uses same nonce path (publish skipped after adopt)', async () => {
    const gateway = makeGateway({
      findBotMessagesWithPanelOpaqueId: vi.fn(() =>
        Promise.resolve([{ messageId: 'msg-existing', channelId }]),
      ),
    });
    await deliverHubPanel(
      { gateway, logger: { warn: vi.fn() } },
      { channelId, opaquePanelId, payload, nonce, knownMessageId: null },
    );
    expect(gateway.publishComponentsV2Message).not.toHaveBeenCalled();
  });

  it('cleans duplicate matches and keeps canonical newest message', async () => {
    const gateway = makeGateway({
      findBotMessagesWithPanelOpaqueId: vi.fn(() =>
        Promise.resolve([
          { messageId: '100', channelId },
          { messageId: '9999999999999999999', channelId },
        ]),
      ),
    });
    const logger = { warn: vi.fn() };
    const result = await deliverHubPanel(
      { gateway, logger },
      { channelId, opaquePanelId, payload, nonce, knownMessageId: null, preferScanFirst: true },
    );
    expect(result.messageId).toBe('9999999999999999999');
    expect(result.duplicateMessageIds).toEqual(['100']);
    expect(gateway.deleteChannelMessage).toHaveBeenCalledWith(channelId, '100');
  });

  it('repairs with new publish when message deleted and scan finds nothing', async () => {
    const gateway = makeGateway({
      fetchChannelMessage: vi.fn(() => Promise.reject(new Error('Unknown Message'))),
      findBotMessagesWithPanelOpaqueId: vi.fn(() => Promise.resolve([])),
    });
    const result = await deliverHubPanel(
      { gateway, logger: { warn: vi.fn() } },
      {
        channelId,
        opaquePanelId,
        payload,
        nonce,
        knownMessageId: 'msg-deleted',
        preferScanFirst: true,
      },
    );
    expect(result.mode).toBe('created');
    expect(result.messageId).toBe('msg-new');
    expect(gateway.publishComponentsV2Message).toHaveBeenCalledWith(channelId, payload, { nonce });
  });
});
