import {
  defaultBotConfigValues,
  type BotConfigValues,
} from './capabilities.js';
import type { VersionedConfigStore } from './versioned-config-store.js';

/** Resolve active Technika bot config (characterTimers.* / timersNotify alias / kingdomWar.*). */
export function resolveActiveBotConfig(
  store: VersionedConfigStore | null | undefined,
): BotConfigValues {
  if (!store) {
    return defaultBotConfigValues();
  }
  return store.getActiveSnapshot().config;
}
