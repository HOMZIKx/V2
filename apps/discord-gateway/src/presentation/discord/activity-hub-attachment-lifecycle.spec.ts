import { AttachmentBuilder, ComponentType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { deliverHubPanel } from '../../application/interactions/hub-panel-delivery.js';
import { createPanelCustomId } from '../../infrastructure/security/activity-signed-custom-id.js';

import { buildActivityHubMessageAttachmentFiles } from './activity-hub-assets.js';
import { renderActivityHubMessage } from './activity-hub-renderer.js';
import { toComponentsV2Payload } from './components-v2-payload.js';

const channelId = '222222222222222222';
const opaquePanelId = 'a1b2c3d4e5f6';
const signingSecret = 'test-signing-secret-at-least-32-bytes-long!!';
const nonce = 'abc123nonce456789012345';
const messageId = '9999999999999999999';

const EXPECTED_ATTACHMENT_NAMES = buildActivityHubMessageAttachmentFiles()
  .map((file) => file.name ?? '')
  .sort();

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
  it('keeps header attachment and signed module select across publish and three reconcile/edit cycles', async () => {
    const hubPayload = buildHubPayload();
    const signedCustomIds = extractSignedCustomIds(hubPayload);
    expect(signedCustomIds).toEqual([createPanelCustomId(opaquePanelId, 'module', signingSecret)]);

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
      expect(payload.files).toHaveLength(EXPECTED_ATTACHMENT_NAMES.length);
      expect(new Set(extractAttachmentNames(payload)).size).toBe(EXPECTED_ATTACHMENT_NAMES.length);
    }

    const lastPayload = buildHubPayload();
    expect(extractSignedCustomIds(lastPayload)).toEqual(signedCustomIds);

    const serialized = JSON.stringify(lastPayload.components ?? []);
    expect(serialized).toContain('attachment://centrum-aktywnosci-icon.png');
    expect(serialized).not.toContain('attachment://utworz-wydarzenie-icon.png');
    expect(serialized).not.toContain('attachment://szukam-ekipy-icon.png');
    expect(serialized).not.toContain('attachment://moje-aktywnosci-icon.png');
    expect(serialized).not.toContain('attachment://powiadomienia-icon.png');

    expect(serialized).toContain(createPanelCustomId(opaquePanelId, 'module', signingSecret));

    const container = (
      lastPayload.components?.[0] as { toJSON: () => Record<string, unknown> }
    ).toJSON();
    const components = (container.components as Array<Record<string, unknown>>) ?? [];
    const actionRows = components.filter((component) => component.type === ComponentType.ActionRow);
    expect(actionRows).toHaveLength(1);
    const select = ((actionRows[0]!.components as Array<Record<string, unknown>>) ?? [])[0];
    expect(select?.type).toBe(ComponentType.StringSelect);
    expect(select?.custom_id).toBe(createPanelCustomId(opaquePanelId, 'module', signingSecret));
  });
});
