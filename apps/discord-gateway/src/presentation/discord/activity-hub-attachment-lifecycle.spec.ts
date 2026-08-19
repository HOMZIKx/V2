import { AttachmentBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { deliverHubPanel } from '../../application/interactions/hub-panel-delivery.js';
import { createPanelCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';

import { ACTIVITY_HUB_ASSET_KEYS } from './activity-hub-assets.js';
import { renderActivityHubMessage } from './activity-hub-renderer.js';
import { toComponentsV2Payload } from './components-v2-payload.js';

const channelId = '222222222222222222';
const opaquePanelId = 'a1b2c3d4e5f6';
const signingSecret = 'test-signing-secret-at-least-32-bytes-long!!';
const nonce = 'abc123nonce456789012345';
const messageId = '9999999999999999999';

const EXPECTED_ATTACHMENT_NAMES = [
  'centrum-aktywnosci-icon.webp',
  'moje-aktywnosci-icon.webp',
  'powiadomienia-icon.webp',
  'szukam-ekipy-icon.webp',
  'utworz-wydarzenie-icon.webp',
];

function buildHubPayload() {
  return toComponentsV2Payload(renderActivityHubMessage({ opaquePanelId, signingSecret }));
}

function extractAttachmentNames(payload: { files?: readonly unknown[] }): string[] {
  return (payload.files ?? [])
    .filter((file): file is AttachmentBuilder => file instanceof AttachmentBuilder)
    .map((file) => file.name ?? '')
    .sort();
}

function extractSignedCustomIds(payload: { components?: readonly unknown[] }): string[] {
  const json = JSON.stringify(payload.components ?? []);
  const matches = json.match(/"custom_id"\s*:\s*"[^"]+"/g) ?? [];
  return matches.map((entry) => entry.replace(/^"custom_id"\s*:\s*"/, '').replace(/"$/, ''));
}

describe('activity hub attachment lifecycle', () => {
  it('keeps exactly five hub attachments across publish and three reconcile/edit cycles', async () => {
    const hubPayload = buildHubPayload();
    const signedCustomIds = extractSignedCustomIds(hubPayload);
    expect(signedCustomIds).toHaveLength(4);

    const editPayloads: Array<{ files?: readonly unknown[]; attachments?: readonly unknown[] }> =
      [];
    const publish = vi.fn(() => Promise.resolve({ messageId, channelId }));
    const editComponentsV2Message = vi.fn((_ch: string, _id: string, payload: unknown) => {
      const typed = payload as { files?: readonly unknown[]; attachments?: readonly unknown[] };
      const entry: { files?: readonly unknown[]; attachments?: readonly unknown[] } = {};
      if (typed.files !== undefined) {
        entry.files = typed.files;
      }
      if (typed.attachments !== undefined) {
        entry.attachments = typed.attachments;
      }
      editPayloads.push(entry);
      return Promise.resolve(undefined);
    });
    const findBotMessagesWithPanelOpaqueId = vi.fn(() =>
      Promise.resolve([{ messageId, channelId }]),
    );
    const gateway = {
      fetchChannelMessage: vi.fn(() =>
        Promise.resolve({ id: messageId, channelId, content: null }),
      ),
      findBotMessagesWithPanelOpaqueId,
      editComponentsV2Message,
      publishComponentsV2Message: publish,
      deleteChannelMessage: vi.fn(() => Promise.resolve(undefined)),
    };

    const first = await deliverHubPanel(
      { gateway, logger: { warn: vi.fn() } },
      {
        channelId,
        opaquePanelId,
        payload: hubPayload,
        nonce,
        knownMessageId: messageId,
      },
    );
    expect(first.mode).toBe('updated');
    expect(publish).not.toHaveBeenCalled();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const result = await deliverHubPanel(
        { gateway, logger: { warn: vi.fn() } },
        {
          channelId,
          opaquePanelId,
          payload: buildHubPayload(),
          nonce,
          knownMessageId: messageId,
          preferScanFirst: true,
        },
      );
      expect(result.messageId).toBe(messageId);
      expect(result.mode).toBe('updated');
      expect(result.duplicateMessageIds).toEqual([]);
    }

    expect(publish).not.toHaveBeenCalled();
    expect(editComponentsV2Message).toHaveBeenCalledTimes(4);

    for (const payload of editPayloads) {
      expect(extractAttachmentNames(payload)).toEqual(EXPECTED_ATTACHMENT_NAMES);
      expect(payload.files).toHaveLength(ACTIVITY_HUB_ASSET_KEYS.length);
      expect(new Set(extractAttachmentNames(payload)).size).toBe(5);
    }

    const lastPayload = buildHubPayload();
    expect(extractSignedCustomIds(lastPayload)).toEqual(signedCustomIds);

    const serialized = JSON.stringify(lastPayload.components ?? []);
    expect(serialized).toContain('attachment://centrum-aktywnosci-icon.webp');
    expect(serialized).toContain('attachment://utworz-wydarzenie-icon.webp');
    expect(serialized).toContain('attachment://szukam-ekipy-icon.webp');
    expect(serialized).toContain('attachment://moje-aktywnosci-icon.webp');
    expect(serialized).toContain('attachment://powiadomienia-icon.webp');

    const actionRows = JSON.stringify(lastPayload.components ?? []);
    expect(actionRows).toContain(`"style":${ButtonStyle.Secondary}`);
    expect(actionRows).not.toContain(`"style":${ButtonStyle.Primary}`);
    expect(actionRows).toContain(createPanelCustomId(opaquePanelId, 'create', signingSecret));
    expect(actionRows).toContain(createPanelCustomId(opaquePanelId, 'lfg', signingSecret));
    expect(actionRows).toContain(createPanelCustomId(opaquePanelId, 'mine', signingSecret));
    expect(actionRows).toContain(createPanelCustomId(opaquePanelId, 'inbox', signingSecret));

    const container = (
      lastPayload.components?.[0] as { toJSON: () => Record<string, unknown> }
    ).toJSON();
    const sections = ((container.components as Array<Record<string, unknown>>) ?? []).filter(
      (component) => component.type === ComponentType.Section,
    );
    expect(sections).toHaveLength(5);
  });
});
