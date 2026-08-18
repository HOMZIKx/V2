import type { ActivityHttpClient } from '../../infrastructure/activity/activity-http-client.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import { executeHubPanelOperation } from '../../interface/discord/hub-panel-operation.js';

export type HubStartupReconcileConfig = {
  readonly DISCORD_ACTIVITY_ENABLED: boolean;
  readonly DISCORD_AUTO_RECONCILE_HUB_ON_STARTUP: boolean;
  readonly DISCORD_TEST_GUILD_ID: string;
  readonly DISCORD_TEST_CHANNEL_ID: string;
  readonly ACTIVITY_ORGANIZATION_ID: string;
  readonly DISCORD_COMPONENT_SIGNING_SECRET: string;
  readonly APP_VERSION: string;
  readonly GIT_COMMIT_SHA: string;
  readonly operatorIds: readonly string[];
};

export type HubStartupReconcileDeps = {
  readonly config: HubStartupReconcileConfig;
  readonly gateway: DiscordJsGatewayAdapter;
  readonly activityClient: ActivityHttpClient;
  readonly logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
};

/**
 * After gateway deploy/restart, refresh the stable Centrum hub message in place
 * (same contract as `/centrum-reconcile`, without operator slash command).
 */
export async function runStartupHubReconcile(deps: HubStartupReconcileDeps): Promise<void> {
  const { config, gateway, activityClient, logger } = deps;

  if (!config.DISCORD_ACTIVITY_ENABLED || !config.DISCORD_AUTO_RECONCILE_HUB_ON_STARTUP) {
    return;
  }

  const actorDiscordUserId = config.operatorIds[0];
  if (actorDiscordUserId === undefined) {
    logger.warn('Startup hub reconcile skipped: no test operator configured');
    return;
  }

  const guildId = config.DISCORD_TEST_GUILD_ID;
  const channelId = await resolveStartupHubChannelId(deps, guildId, actorDiscordUserId);
  if (channelId === null) {
    logger.info('Startup hub reconcile skipped: hub channel not configured', { guildId });
    return;
  }

  try {
    const delivered = await executeHubPanelOperation(
      {
        gateway,
        logger,
        activityClient,
      },
      {
        guildId,
        channelId,
        actorDiscordUserId,
        organizationId: config.ACTIVITY_ORGANIZATION_ID,
        signingSecret: config.DISCORD_COMPONENT_SIGNING_SECRET,
        preferScanFirst: true,
      },
    );
    logger.info('Startup hub reconcile completed', {
      guildId,
      channelId,
      mode: delivered.mode,
      messageId: delivered.messageId,
      rendererRevision: config.APP_VERSION,
      gitCommitSha: config.GIT_COMMIT_SHA,
    });
  } catch (error) {
    logger.warn('Startup hub reconcile failed; use /centrum-reconcile if the panel looks stale', {
      guildId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function resolveStartupHubChannelId(
  deps: HubStartupReconcileDeps,
  guildId: string,
  actorDiscordUserId: string,
): Promise<string | null> {
  const { activityClient, config } = deps;

  try {
    const panels = await activityClient.listPanels(guildId, { discordUserId: actorDiscordUserId });
    const hubPanel = panels.find((row) => {
      const panelType = (row as { panelType?: string }).panelType;
      const channelId = row.channelId;
      return (
        (panelType === 'hub' || panelType === undefined) &&
        typeof channelId === 'string' &&
        channelId.trim().length > 0
      );
    });
    if (hubPanel?.channelId !== undefined && hubPanel.channelId.trim().length > 0) {
      return hubPanel.channelId.trim();
    }
  } catch {
    // Activity may be warming up; fall through to env channel.
  }

  try {
    const guildConfig = await activityClient.getGuildConfig(guildId, {
      discordUserId: actorDiscordUserId,
    });
    const settings = guildConfig.settings as { hubChannelId?: string | null } | undefined;
    const fromSettings = settings?.hubChannelId?.trim();
    if (fromSettings !== undefined && fromSettings.length > 0) {
      return fromSettings;
    }
  } catch {
    // Guild defaults may not exist yet.
  }

  const fromEnv = config.DISCORD_TEST_CHANNEL_ID.trim();
  if (fromEnv.length > 0) {
    return fromEnv;
  }

  return null;
}
