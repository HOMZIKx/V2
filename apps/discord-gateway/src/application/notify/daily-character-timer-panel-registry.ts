import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveGatewayPersistenceBaseDir } from './gateway-persistence.js';

const VERSION = 1 as const;
const MAX_WORKSPACES = 100;
const MAX_RECIPIENTS = 40;

export type DailyCharacterTimerPanelConfig = {
  readonly workspaceId: string;
  readonly dailyTime: string;
  readonly recipients: readonly string[];
};

export type DailyCharacterTimerPanelMessage = {
  readonly workspaceId: string;
  readonly discordUserId: string;
  readonly dayKey: string;
  readonly messageId: string;
  readonly selectedCharacterId: string | null;
};

type PersistShape = {
  readonly version: 1;
  readonly configs: Record<string, { dailyTime: string; recipients: string[] }>;
  readonly panels: Record<string, DailyCharacterTimerPanelMessage>;
};

const configs = new Map<string, DailyCharacterTimerPanelConfig>();
const panels = new Map<string, DailyCharacterTimerPanelMessage>();
let loaded = false;

function isSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

function normalizeWorkspaceId(value: string): string | null {
  const id = value.trim();
  if (!id || id.length > 96 || !/^[a-zA-Z0-9._-]+$/.test(id)) return null;
  return id;
}

function normalizeTime(value: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${match[1]}:${match[2]}`;
}

function panelKey(workspaceId: string, discordUserId: string): string {
  return `${workspaceId}:${discordUserId}`;
}

function persistPath(): string {
  const { baseDir, status } = resolveGatewayPersistenceBaseDir();
  const base = status.temporaryFallback
    ? join(baseDir, 'destiled-daily-character-timer-panels')
    : join(baseDir, 'daily-character-timer-panels');
  if (!existsSync(base)) mkdirSync(base, { recursive: true });
  return join(base, 'state-v1.json');
}

function load(): void {
  if (loaded) return;
  loaded = true;
  configs.clear();
  panels.clear();
  try {
    const raw = readFileSync(persistPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistShape>;
    if (parsed.version !== VERSION) return;
    if (parsed.configs && typeof parsed.configs === 'object') {
      for (const [rawWorkspaceId, rawConfig] of Object.entries(parsed.configs)) {
        if (configs.size >= MAX_WORKSPACES) break;
        const workspaceId = normalizeWorkspaceId(rawWorkspaceId);
        const dailyTime = normalizeTime(rawConfig?.dailyTime ?? '');
        if (!workspaceId || !dailyTime || !Array.isArray(rawConfig?.recipients)) continue;
        const recipients = [...new Set(rawConfig.recipients.filter(isSnowflake))].slice(
          0,
          MAX_RECIPIENTS,
        );
        configs.set(workspaceId, { workspaceId, dailyTime, recipients });
      }
    }
    if (parsed.panels && typeof parsed.panels === 'object') {
      for (const rawPanel of Object.values(parsed.panels)) {
        if (!rawPanel || typeof rawPanel !== 'object') continue;
        const workspaceId = normalizeWorkspaceId(rawPanel.workspaceId ?? '');
        const discordUserId =
          typeof rawPanel.discordUserId === 'string' ? rawPanel.discordUserId : '';
        const dayKey = typeof rawPanel.dayKey === 'string' ? rawPanel.dayKey : '';
        const messageId = typeof rawPanel.messageId === 'string' ? rawPanel.messageId : '';
        if (!workspaceId || !isSnowflake(discordUserId) || !dayKey || !messageId) continue;
        panels.set(panelKey(workspaceId, discordUserId), {
          workspaceId,
          discordUserId,
          dayKey,
          messageId,
          selectedCharacterId:
            typeof rawPanel.selectedCharacterId === 'string' && rawPanel.selectedCharacterId.trim()
              ? rawPanel.selectedCharacterId.trim()
              : null,
        });
      }
    }
  } catch {
    // fresh registry
  }
}

function save(): void {
  try {
    const configObject: PersistShape['configs'] = {};
    const panelObject: PersistShape['panels'] = {};
    for (const [workspaceId, config] of configs) {
      configObject[workspaceId] = {
        dailyTime: config.dailyTime,
        recipients: [...config.recipients],
      };
    }
    for (const [key, panel] of panels) panelObject[key] = panel;
    const target = persistPath();
    const tmp = `${target}.${process.pid}.tmp`;
    writeFileSync(
      tmp,
      JSON.stringify({
        version: VERSION,
        configs: configObject,
        panels: panelObject,
      } satisfies PersistShape),
      'utf8',
    );
    renameSync(tmp, target);
  } catch {
    // memory remains authoritative until restart
  }
}

export function replaceDailyCharacterTimerPanelConfig(input: {
  readonly workspaceId: string;
  readonly dailyTime: string;
  readonly recipients: readonly string[];
}): DailyCharacterTimerPanelConfig | null {
  load();
  const workspaceId = normalizeWorkspaceId(input.workspaceId);
  const dailyTime = normalizeTime(input.dailyTime);
  if (!workspaceId || !dailyTime) return null;
  if (!configs.has(workspaceId) && configs.size >= MAX_WORKSPACES) return null;
  const recipients = [
    ...new Set(input.recipients.map((id) => id.trim()).filter(isSnowflake)),
  ].slice(0, MAX_RECIPIENTS);
  const config = {
    workspaceId,
    dailyTime,
    recipients,
  } satisfies DailyCharacterTimerPanelConfig;
  configs.set(workspaceId, config);
  for (const [key, panel] of panels) {
    if (panel.workspaceId === workspaceId && !recipients.includes(panel.discordUserId)) {
      panels.delete(key);
    }
  }
  save();
  return config;
}

export function getDailyCharacterTimerPanelConfig(
  workspaceId: string,
): DailyCharacterTimerPanelConfig | null {
  load();
  return configs.get(workspaceId) ?? null;
}

export function listDailyCharacterTimerPanelConfigs(): readonly DailyCharacterTimerPanelConfig[] {
  load();
  return [...configs.values()];
}

export function getDailyCharacterTimerPanelMessage(
  workspaceId: string,
  discordUserId: string,
): DailyCharacterTimerPanelMessage | null {
  load();
  return panels.get(panelKey(workspaceId, discordUserId)) ?? null;
}

export function saveDailyCharacterTimerPanelMessage(input: DailyCharacterTimerPanelMessage): void {
  load();
  panels.set(panelKey(input.workspaceId, input.discordUserId), input);
  save();
}

export function setDailyCharacterTimerPanelSelectedCharacter(
  workspaceId: string,
  discordUserId: string,
  selectedCharacterId: string,
): void {
  load();
  const key = panelKey(workspaceId, discordUserId);
  const current = panels.get(key);
  if (!current) return;
  panels.set(key, { ...current, selectedCharacterId });
  save();
}

export function resetDailyCharacterTimerPanelRegistryForTests(): void {
  configs.clear();
  panels.clear();
  loaded = true;
  save();
}
