import { createHash, randomUUID } from 'node:crypto';

import {
  deliverHubPanel,
  type HubPanelDeliveryDeps,
  type HubPanelDeliveryMode,
} from '../../application/interactions/hub-panel-delivery.js';
import { renderActivityHubMessage } from '../../presentation/discord/activity-hub-renderer.js';
import { toComponentsV2Payload } from '../../presentation/discord/components-v2-payload.js';

export type HubPanelActor = {
  readonly discordUserId: string;
};

export type HubPanelRecord = {
  readonly id: string;
  readonly opaqueId?: string | null | undefined;
  readonly messageId?: string | null | undefined;
  readonly panelType?: string | undefined;
  readonly channelId?: string | undefined;
  readonly status?: string | undefined;
};

export type HubPanelActivityPort = {
  listHubProjectionPanels(
    guildId: string,
    actor: HubPanelActor,
  ): Promise<readonly HubPanelRecord[]>;
  getHubProjectionPendingOccurrence(
    panelId: string,
    actor: HubPanelActor,
  ): Promise<{ operationId: string; nonce: string } | null>;
  upsertHubProjectionPanel(
    body: Record<string, unknown>,
    actor: HubPanelActor & { idempotencyKey: string },
  ): Promise<HubPanelRecord>;
};

export type ExecuteHubPanelInput = {
  guildId: string;
  channelId: string;
  actorDiscordUserId: string;
  organizationId: string;
  signingSecret: string;
  preferScanFirst: boolean;
};

export type ExecuteHubPanelResult = {
  mode: HubPanelDeliveryMode;
  messageId: string;
};

function idem(userId: string, op: string, scope: string): string {
  return createHash('sha256').update(`${userId}:${op}:${scope}`).digest('hex').slice(0, 32);
}

function opaqueFromUuid(id: string): string {
  return id.replace(/-/g, '').toLowerCase().slice(0, 12);
}

function actorOf(userId: string): HubPanelActor {
  return { discordUserId: userId };
}

export async function executeHubPanelOperation(
  deps: HubPanelDeliveryDeps & {
    activityClient: HubPanelActivityPort;
    logger: HubPanelDeliveryDeps['logger'] & {
      info(message: string, meta?: Record<string, unknown>): void;
      error(message: string, meta?: Record<string, unknown>): void;
    };
  },
  input: ExecuteHubPanelInput,
): Promise<ExecuteHubPanelResult> {
  const actor = actorOf(input.actorDiscordUserId);
  const existing = await deps.activityClient.listHubProjectionPanels(input.guildId, actor);
  const hub = existing.find((row) => {
    return (
      (row.panelType === 'hub' || row.panelType === undefined) &&
      (row.channelId === undefined || row.channelId === input.channelId)
    );
  });

  let operationId: string = randomUUID();
  let nonce = operationId.replace(/-/g, '').slice(0, 25);
  if (hub?.id) {
    const pending = await deps.activityClient.getHubProjectionPendingOccurrence(hub.id, actor);
    if (pending !== null) {
      operationId = pending.operationId;
      nonce = pending.nonce;
    }
  }

  const panel = await deps.activityClient.upsertHubProjectionPanel(
    {
      organizationId: input.organizationId,
      discordGuildId: input.guildId,
      channelId: input.channelId,
      panelType: 'hub',
      status: 'publishing',
      operationId,
      nonce,
      correlationId: operationId,
      ...(hub?.messageId ? { messageId: hub.messageId } : {}),
    },
    {
      ...actor,
      idempotencyKey: idem(
        input.actorDiscordUserId,
        'panel-upsert',
        `${input.guildId}:${input.channelId}`,
      ),
    },
  );

  const opaquePanelId =
    typeof panel.opaqueId === 'string' && /^[a-f0-9]{12}$/.test(panel.opaqueId)
      ? panel.opaqueId
      : opaqueFromUuid(panel.id);

  const payload = toComponentsV2Payload(
    renderActivityHubMessage({
      opaquePanelId,
      signingSecret: input.signingSecret,
    }),
  );

  const knownMessageId =
    typeof panel.messageId === 'string'
      ? panel.messageId
      : typeof hub?.messageId === 'string'
        ? hub.messageId
        : null;

  const delivered = await deliverHubPanel(
    { gateway: deps.gateway, logger: deps.logger },
    {
      channelId: input.channelId,
      opaquePanelId,
      payload,
      nonce,
      knownMessageId,
      preferScanFirst: input.preferScanFirst,
    },
  );

  if (delivered.duplicateMessageIds.length > 0) {
    deps.logger.warn('Duplicate hub panel messages cleaned up', {
      guildId: input.guildId,
      channelId: input.channelId,
      opaquePanelId,
      canonicalMessageId: delivered.messageId,
      removedMessageIds: delivered.duplicateMessageIds,
    });
  }

  const occurrenceOutcome = delivered.mode === 'adopted' ? 'adopted' : 'sent';
  const ackSuffix = input.preferScanFirst ? 'panel-reconcile' : 'panel-ack';
  await deps.activityClient.upsertHubProjectionPanel(
    {
      organizationId: input.organizationId,
      discordGuildId: input.guildId,
      channelId: input.channelId,
      panelType: 'hub',
      messageId: delivered.messageId,
      status: 'active',
      operationId: `${operationId}:ack`,
      nonce,
      occurrenceOutcome,
      ...(delivered.duplicateMessageIds.length > 0
        ? {
            incident: {
              action: 'panel.duplicate_cleanup',
              details: {
                opaquePanelId,
                canonicalMessageId: delivered.messageId,
                removedMessageIds: delivered.duplicateMessageIds,
              },
            },
          }
        : {}),
    },
    {
      ...actor,
      idempotencyKey: idem(input.actorDiscordUserId, ackSuffix, delivered.messageId),
    },
  );

  return { mode: delivered.mode, messageId: delivered.messageId };
}
