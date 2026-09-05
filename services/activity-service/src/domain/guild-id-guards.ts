import { ActivityError } from './errors.js';

/**
 * Domain must never embed live Discord guild snowflakes.
 * Any id listed here is rejected by test seed (fail-closed).
 * Keep empty — use the domain snowflake scan test to prevent hardcoding elsewhere.
 */
export const FORBIDDEN_HARDCODED_GUILD_IDS: ReadonlySet<string> = new Set();

export function assertGuildIdAllowedForTestSeed(guildId: string): void {
  const trimmed = guildId.trim();
  if (trimmed.length === 0) {
    throw new ActivityError('VALIDATION_FAILED', 'guildId is required');
  }
  if (FORBIDDEN_HARDCODED_GUILD_IDS.has(trimmed)) {
    throw new ActivityError('FORBIDDEN', 'guildId matches a forbidden hardcoded domain constant');
  }
}
