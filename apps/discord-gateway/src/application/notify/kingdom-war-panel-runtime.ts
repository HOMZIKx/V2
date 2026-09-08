import type { DMChannel, MessageCreateOptions, MessageEditOptions } from 'discord.js';

import type { KingdomWarConfig } from '../technika/capabilities.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import type { TeamWorkspaceContext } from '../../infrastructure/player-team/read-team-workspace-context.js';
import { renderKingdomWarReminder } from '../../presentation/discord/kingdom-war-renderer.js';
import {
  currentKingdomWarPanelDayKey,
  getKingdomWarPanelMessage,
  getKingdomWarPanelSelections,
  saveKingdomWarPanelMessage,
} from './kingdom-war-panel-registry.js';

export type WarPanelLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
};

type GatewayInternals = {
  readonly client: {
    readonly users: {
      fetch(userId: string): Promise<{ createDM(): Promise<DMChannel> }>;
    };
  };
};

function gatewayClient(gateway: DiscordJsGatewayAdapter): GatewayInternals['client'] {
  return (gateway as unknown as GatewayInternals).client;
}

async function channelFor(gateway: DiscordJsGatewayAdapter, discordUserId: string): Promise<DMChannel> {
  const user = await gatewayClient(gateway).users.fetch(discordUserId);
  return user.createDM();
}

async function upsertWarPanelForUser(input: {
  readonly gateway: DiscordJsGatewayAdapter;
  readonly discordConfig: DiscordGatewayConfig;
  readonly warConfig: KingdomWarConfig;
  readonly context: TeamWorkspaceContext;
  readonly discordUserId: string;
  readonly dayKey: string;
  readonly logger: WarPanelLogger;
  readonly createIfMissing: boolean;
  readonly actorName?: string;
  readonly actorAction?: string;
}): Promise<boolean> {
  const rendered = renderKingdomWarReminder({
    config: { ...input.warConfig, notifyMinutesBefore: 30 },
    signingSecret: input.discordConfig.DISCORD_COMPONENT_SIGNING_SECRET,
    workspaceId: input.context.workspaceId,
    workspaceName: input.context.workspaceName,
    selections: getKingdomWarPanelSelections(input.context.workspaceId),
    roster: input.context.roster,
    viewerDiscordUserId: input.discordUserId,
    ...(input.actorName ? { actorName: input.actorName } : {}),
    ...(input.actorAction ? { actorAction: input.actorAction } : {}),
  });

  const stored = getKingdomWarPanelMessage(input.context.workspaceId, input.discordUserId);
  if (stored?.dayKey === input.dayKey) {
    try {
      const channel = await channelFor(input.gateway, input.discordUserId);
      const message = await channel.messages.fetch(stored.messageId);
      await message.edit(rendered as MessageEditOptions);
      return true;
    } catch {
      // message removed; create a replacement below if allowed
    }
  }
  if (!input.createIfMissing) return false;

  try {
    const channel = await channelFor(input.gateway, input.discordUserId);
    const message = await channel.send(rendered as MessageCreateOptions);
    saveKingdomWarPanelMessage({
      workspaceId: input.context.workspaceId,
      discordUserId: input.discordUserId,
      dayKey: input.dayKey,
      messageId: message.id,
    });
    return true;
  } catch (error) {
    input.logger.warn('Kingdom war panel DM failed', {
      workspaceId: input.context.workspaceId,
      discordUserId: input.discordUserId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

export async function publishKingdomWarPanels(input: {
  readonly gateway: DiscordJsGatewayAdapter;
  readonly discordConfig: DiscordGatewayConfig;
  readonly warConfig: KingdomWarConfig;
  readonly context: TeamWorkspaceContext;
  readonly dayKey?: string;
  readonly logger: WarPanelLogger;
}): Promise<number> {
  const dayKey = input.dayKey ?? currentKingdomWarPanelDayKey();
  let updated = 0;
  for (const discordUserId of input.context.recipients) {
    const ok = await upsertWarPanelForUser({ ...input, discordUserId, dayKey, createIfMissing: true });
    if (ok) updated += 1;
  }
  return updated;
}

export async function refreshKingdomWarPanels(input: {
  readonly gateway: DiscordJsGatewayAdapter;
  readonly discordConfig: DiscordGatewayConfig;
  readonly warConfig: KingdomWarConfig;
  readonly context: TeamWorkspaceContext;
  readonly logger: WarPanelLogger;
  readonly actorName?: string;
  readonly actorAction?: string;
}): Promise<number> {
  const dayKey = currentKingdomWarPanelDayKey();
  let updated = 0;
  for (const discordUserId of input.context.recipients) {
    const ok = await upsertWarPanelForUser({
      ...input,
      discordUserId,
      dayKey,
      createIfMissing: false,
    });
    if (ok) updated += 1;
  }
  return updated;
}
