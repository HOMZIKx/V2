import { pickCanonicalPanelMessageId } from '../../infrastructure/discord/panel-message-scan.js';
import type { ComponentsV2MessagePayload } from '../ports/gateway.ports.js';

export type HubPanelGatewayPort = {
  fetchChannelMessage?(
    channelId: string,
    messageId: string,
  ): Promise<{ id: string; channelId: string; content: string | null }>;
  findBotMessagesWithPanelOpaqueId?(
    channelId: string,
    opaquePanelId: string,
    options?: { limit?: number },
  ): Promise<Array<{ messageId: string; channelId: string }>>;
  editComponentsV2Message?(
    channelId: string,
    messageId: string,
    payload: ComponentsV2MessagePayload,
  ): Promise<void>;
  publishComponentsV2Message?(
    channelId: string,
    payload: ComponentsV2MessagePayload,
    options?: { nonce?: string },
  ): Promise<{ messageId: string; channelId: string }>;
  deleteChannelMessage?(channelId: string, messageId: string): Promise<void>;
};

export type HubPanelDeliveryLogger = {
  warn(message: string, meta?: Record<string, unknown>): void;
};

export type HubPanelDeliveryInput = {
  channelId: string;
  opaquePanelId: string;
  payload: ComponentsV2MessagePayload;
  nonce: string;
  knownMessageId?: string | null;
  /** Reconcile scans the channel before trusting DB message_id. */
  preferScanFirst?: boolean;
};

export type HubPanelDeliveryMode = 'updated' | 'adopted' | 'created';

export type HubPanelDeliveryResult = {
  messageId: string;
  mode: HubPanelDeliveryMode;
  duplicateMessageIds: string[];
};

export type HubPanelDeliveryDeps = {
  gateway: HubPanelGatewayPort;
  logger: HubPanelDeliveryLogger;
};

export async function deliverHubPanel(
  deps: HubPanelDeliveryDeps,
  input: HubPanelDeliveryInput,
): Promise<HubPanelDeliveryResult> {
  const gateway = deps.gateway;
  if (
    gateway.editComponentsV2Message === undefined ||
    gateway.publishComponentsV2Message === undefined ||
    gateway.findBotMessagesWithPanelOpaqueId === undefined
  ) {
    throw new Error('Gateway does not support hub panel delivery.');
  }

  const duplicateMessageIds: string[] = [];

  if (!input.preferScanFirst && input.knownMessageId) {
    const updated = await tryUpdateExistingMessage(deps, input, input.knownMessageId);
    if (updated !== null) {
      return { messageId: updated, mode: 'updated', duplicateMessageIds };
    }
  }

  const adopted = await adoptFromChannelScan(deps, input);
  if (adopted !== null) {
    return { ...adopted, duplicateMessageIds: adopted.duplicateMessageIds };
  }

  if (input.preferScanFirst && input.knownMessageId) {
    const updated = await tryUpdateExistingMessage(deps, input, input.knownMessageId);
    if (updated !== null) {
      return { messageId: updated, mode: 'updated', duplicateMessageIds };
    }
  }

  const published = await gateway.publishComponentsV2Message(input.channelId, input.payload, {
    nonce: input.nonce,
  });
  return { messageId: published.messageId, mode: 'created', duplicateMessageIds };
}

async function adoptFromChannelScan(
  deps: HubPanelDeliveryDeps,
  input: HubPanelDeliveryInput,
): Promise<(HubPanelDeliveryResult & { duplicateMessageIds: string[] }) | null> {
  const gateway = deps.gateway;
  const scanned = await gateway.findBotMessagesWithPanelOpaqueId!(
    input.channelId,
    input.opaquePanelId,
  );
  if (scanned.length === 0) {
    return null;
  }

  const messageIds = scanned.map((entry) => entry.messageId);
  const canonicalId = pickCanonicalPanelMessageId(messageIds);
  const duplicateMessageIds = messageIds.filter((id) => id !== canonicalId);
  for (const duplicateId of duplicateMessageIds) {
    await deleteDuplicateMessage(deps, input.channelId, duplicateId);
  }

  await gateway.editComponentsV2Message!(input.channelId, canonicalId, input.payload);
  const mode: HubPanelDeliveryMode = input.knownMessageId === canonicalId ? 'updated' : 'adopted';
  return { messageId: canonicalId, mode, duplicateMessageIds };
}

async function tryUpdateExistingMessage(
  deps: HubPanelDeliveryDeps,
  input: HubPanelDeliveryInput,
  messageId: string,
): Promise<string | null> {
  if (deps.gateway.fetchChannelMessage !== undefined) {
    try {
      await deps.gateway.fetchChannelMessage(input.channelId, messageId);
    } catch {
      return null;
    }
  }
  await deps.gateway.editComponentsV2Message!(input.channelId, messageId, input.payload);
  return messageId;
}

async function deleteDuplicateMessage(
  deps: HubPanelDeliveryDeps,
  channelId: string,
  messageId: string,
): Promise<void> {
  if (deps.gateway.deleteChannelMessage === undefined) {
    deps.logger.warn(
      'Cannot delete duplicate hub panel message — deleteChannelMessage unavailable',
      {
        channelId,
        messageId,
      },
    );
    return;
  }
  try {
    await deps.gateway.deleteChannelMessage(channelId, messageId);
  } catch (error) {
    deps.logger.warn('Failed to delete duplicate hub panel message', {
      channelId,
      messageId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
