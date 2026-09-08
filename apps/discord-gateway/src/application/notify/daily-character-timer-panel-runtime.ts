import type { DMChannel, MessageCreateOptions, MessageEditOptions } from 'discord.js';

import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import type { DiscordGatewayConfig } from '../../infrastructure/discord/discord-config.js';
import { readCharacterTimerPanelFromBot } from '../../infrastructure/player-team/read-character-timer-panel.js';
import { renderCharacterTimerDailyPanel } from '../../presentation/discord/character-timer-daily-panel-renderer.js';
import {
  getDailyCharacterTimerPanelConfig,
  getDailyCharacterTimerPanelMessage,
  listDailyCharacterTimerPanelConfigs,
  saveDailyCharacterTimerPanelMessage,
  setDailyCharacterTimerPanelSelectedCharacter,
  type DailyCharacterTimerPanelConfig,
} from './daily-character-timer-panel-registry.js';

export type DailyPanelLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
};

type GatewayInternals = {
  readonly client: {
    readonly users: {
      fetch(userId: string): Promise<{
        createDM(): Promise<DMChannel>;
      }>;
    };
  };
};

export function warsawClock(now = new Date()): { readonly hhmm: string; readonly dayKey: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    hhmm: `${get('hour')}:${get('minute')}`,
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function gatewayClient(gateway: DiscordJsGatewayAdapter): GatewayInternals['client'] {
  return (gateway as unknown as GatewayInternals).client;
}

async function dmChannel(gateway: DiscordJsGatewayAdapter, discordUserId: string): Promise<DMChannel> {
  const user = await gatewayClient(gateway).users.fetch(discordUserId);
  return user.createDM();
}

async function sendPanel(
  gateway: DiscordJsGatewayAdapter,
  discordUserId: string,
  message: MessageCreateOptions,
): Promise<string> {
  const channel = await dmChannel(gateway, discordUserId);
  const sent = await channel.send(message);
  return sent.id;
}

async function editPanel(
  gateway: DiscordJsGatewayAdapter,
  discordUserId: string,
  messageId: string,
  message: MessageEditOptions,
): Promise<boolean> {
  try {
    const channel = await dmChannel(gateway, discordUserId);
    const existing = await channel.messages.fetch(messageId);
    await existing.edit(message);
    return true;
  } catch {
    return false;
  }
}

export async function upsertDailyCharacterTimerPanel(input: {
  readonly config: DiscordGatewayConfig;
  readonly gateway: DiscordJsGatewayAdapter;
  readonly logger: DailyPanelLogger;
  readonly workspaceId: string;
  readonly discordUserId: string;
  readonly dayKey: string;
  readonly selectedCharacterId?: string | null;
  readonly createIfMissing: boolean;
}): Promise<boolean> {
  const stored = getDailyCharacterTimerPanelMessage(input.workspaceId, input.discordUserId);
  if (!input.createIfMissing && (!stored || stored.dayKey !== input.dayKey)) return false;

  const selectedCharacterId = input.selectedCharacterId ?? stored?.selectedCharacterId ?? null;
  const snapshot = await readCharacterTimerPanelFromBot({
    baseUrl: input.config.PLAYER_TEAM_BASE_URL,
    demoViewerHeader: input.config.PLAYER_TEAM_DEMO_VIEWER_HEADER,
    viewerId: input.discordUserId,
    workspaceId: input.workspaceId,
    selectedCharacterId,
  });
  if (!snapshot) {
    input.logger.warn('Daily timer panel skipped — workspace snapshot unavailable', {
      workspaceId: input.workspaceId,
      discordUserId: input.discordUserId,
    });
    return false;
  }

  const rendered = renderCharacterTimerDailyPanel({
    snapshot,
    signingSecret: input.config.DISCORD_COMPONENT_SIGNING_SECRET,
  });

  if (stored?.dayKey === input.dayKey) {
    const edited = await editPanel(
      input.gateway,
      input.discordUserId,
      stored.messageId,
      rendered as MessageEditOptions,
    );
    if (edited) {
      saveDailyCharacterTimerPanelMessage({
        ...stored,
        selectedCharacterId: snapshot.selectedCharacterId,
      });
      return true;
    }
  }

  if (!input.createIfMissing) return false;
  try {
    const messageId = await sendPanel(input.gateway, input.discordUserId, rendered);
    saveDailyCharacterTimerPanelMessage({
      workspaceId: input.workspaceId,
      discordUserId: input.discordUserId,
      dayKey: input.dayKey,
      messageId,
      selectedCharacterId: snapshot.selectedCharacterId,
    });
    return true;
  } catch (error) {
    input.logger.warn('Daily timer panel DM failed', {
      workspaceId: input.workspaceId,
      discordUserId: input.discordUserId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

export async function publishDailyCharacterTimerPanels(input: {
  readonly config: DiscordGatewayConfig;
  readonly gateway: DiscordJsGatewayAdapter;
  readonly logger: DailyPanelLogger;
  readonly panelConfig: DailyCharacterTimerPanelConfig;
  readonly dayKey: string;
}): Promise<{ readonly sentOrUpdated: number }> {
  let sentOrUpdated = 0;
  for (const discordUserId of input.panelConfig.recipients) {
    const ok = await upsertDailyCharacterTimerPanel({
      config: input.config,
      gateway: input.gateway,
      logger: input.logger,
      workspaceId: input.panelConfig.workspaceId,
      discordUserId,
      dayKey: input.dayKey,
      createIfMissing: true,
    });
    if (ok) sentOrUpdated += 1;
  }
  return { sentOrUpdated };
}

export async function refreshExistingDailyCharacterTimerPanels(input: {
  readonly config: DiscordGatewayConfig;
  readonly gateway: DiscordJsGatewayAdapter;
  readonly logger: DailyPanelLogger;
  readonly workspaceId: string;
  readonly now?: Date;
}): Promise<{ readonly updated: number }> {
  const panelConfig = getDailyCharacterTimerPanelConfig(input.workspaceId);
  if (!panelConfig) return { updated: 0 };
  const { dayKey, hhmm } = warsawClock(input.now);
  const createIfMissing = hhmm >= panelConfig.dailyTime;
  let updated = 0;
  for (const discordUserId of panelConfig.recipients) {
    const ok = await upsertDailyCharacterTimerPanel({
      config: input.config,
      gateway: input.gateway,
      logger: input.logger,
      workspaceId: input.workspaceId,
      discordUserId,
      dayKey,
      createIfMissing,
    });
    if (ok) updated += 1;
  }
  return { updated };
}

export async function switchDailyCharacterTimerPanelCharacter(input: {
  readonly config: DiscordGatewayConfig;
  readonly gateway: DiscordJsGatewayAdapter;
  readonly logger: DailyPanelLogger;
  readonly workspaceId: string;
  readonly discordUserId: string;
  readonly characterId: string;
  readonly dayKey?: string;
}): Promise<boolean> {
  const dayKey = input.dayKey ?? warsawClock().dayKey;
  setDailyCharacterTimerPanelSelectedCharacter(
    input.workspaceId,
    input.discordUserId,
    input.characterId,
  );
  return upsertDailyCharacterTimerPanel({
    config: input.config,
    gateway: input.gateway,
    logger: input.logger,
    workspaceId: input.workspaceId,
    discordUserId: input.discordUserId,
    dayKey,
    selectedCharacterId: input.characterId,
    createIfMissing: false,
  });
}

export class DailyCharacterTimerPanelScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  public constructor(
    private readonly deps: {
      readonly config: DiscordGatewayConfig;
      readonly gateway: DiscordJsGatewayAdapter;
      readonly logger: DailyPanelLogger;
      readonly intervalMs?: number;
    },
  ) {}

  public start(): void {
    if (this.timer) return;
    const intervalMs = this.deps.intervalMs ?? 60_000;
    const run = () => {
      void this.tick().catch((error: unknown) => {
        this.deps.logger.warn('Daily timer panel scheduler tick failed', {
          error: error instanceof Error ? error.message : 'unknown',
        });
      });
    };
    run();
    this.timer = setInterval(run, intervalMs);
    this.timer.unref?.();
    this.deps.logger.info('Daily timer panel scheduler started', { intervalMs });
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  public async tick(now = new Date()): Promise<number> {
    const { hhmm, dayKey } = warsawClock(now);
    let total = 0;
    for (const panelConfig of listDailyCharacterTimerPanelConfigs()) {
      if (panelConfig.recipients.length === 0 || hhmm < panelConfig.dailyTime) continue;
      const result = await publishDailyCharacterTimerPanels({
        config: this.deps.config,
        gateway: this.deps.gateway,
        logger: this.deps.logger,
        panelConfig,
        dayKey,
      });
      total += result.sentOrUpdated;
    }
    return total;
  }
}
