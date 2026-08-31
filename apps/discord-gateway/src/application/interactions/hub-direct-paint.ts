import { deliverHubPanel, type HubPanelDeliveryDeps } from './hub-panel-delivery.js';
import {
  findHubPanelInMessages,
  PANEL_MESSAGE_SCAN_DEFAULT_LIMIT,
  type ScannedChannelMessage,
} from '../../infrastructure/discord/panel-message-scan.js';
import { renderActivityHubMessage } from '../../presentation/discord/activity-hub-renderer.js';
import { toComponentsV2Payload } from '../../presentation/discord/components-v2-payload.js';

export type HubDirectPaintGatewayPort = HubPanelDeliveryDeps['gateway'] & {
  scanChannelMessages?(
    channelId: string,
    options?: { limit?: number },
  ): Promise<readonly ScannedChannelMessage[]>;
  fetchApplication?(): Promise<{ botUserId: string }>;
};

export type HubDirectPaintInput = {
  channelId: string;
  signingSecret: string;
  botUserId?: string;
};

export type HubDirectPaintResult = {
  messageId: string;
  opaquePanelId: string;
  mode: 'updated' | 'adopted';
};

/**
 * Emergency hub repaint when Activity panel API is unavailable (403 / warmup).
 * Scans the hub channel, reuses the existing panel opaque id, edits message in place.
 */
export async function runDirectHubPaintFallback(
  deps: HubPanelDeliveryDeps & {
    gateway: HubDirectPaintGatewayPort;
  },
  input: HubDirectPaintInput,
): Promise<HubDirectPaintResult | null> {
  const gateway = deps.gateway;
  if (gateway.scanChannelMessages === undefined) {
    return null;
  }

  const botUserId =
    input.botUserId ??
    (gateway.fetchApplication !== undefined
      ? (await gateway.fetchApplication()).botUserId
      : undefined);
  if (botUserId === undefined || botUserId.length === 0) {
    return null;
  }

  const scanned = await gateway.scanChannelMessages(input.channelId, {
    limit: PANEL_MESSAGE_SCAN_DEFAULT_LIMIT,
  });
  const found = findHubPanelInMessages(scanned, botUserId, input.signingSecret);
  if (found === null) {
    return null;
  }

  const payload = toComponentsV2Payload(
    renderActivityHubMessage({
      opaquePanelId: found.opaquePanelId,
      signingSecret: input.signingSecret,
    }),
  );

  const nonce = `hub-direct-${Date.now()}`;
  const delivered = await deliverHubPanel(
    { gateway: deps.gateway, logger: deps.logger },
    {
      channelId: input.channelId,
      opaquePanelId: found.opaquePanelId,
      payload,
      nonce,
      knownMessageId: found.messageId,
      preferScanFirst: true,
    },
  );

  return {
    messageId: delivered.messageId,
    opaquePanelId: found.opaquePanelId,
    mode: delivered.mode === 'created' ? 'updated' : delivered.mode,
  };
}
