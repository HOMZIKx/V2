import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  decideGuildInventory,
  initialDevGuilds,
  resolveGuildListUserMessage,
} from './guild-inventory.js';

const guildA = { id: 'guild-a', name: 'Alpha' };
const guildB = { id: 'guild-b', name: 'Bravo' };

describe('decideGuildInventory', () => {
  it('keeps configured DEV guild A when remote fails and shows a retryable error', () => {
    const decision = decideGuildInventory({
      mode: 'dev-actor',
      sessionGuilds: [guildA],
      currentGuildId: 'guild-a',
      remote: { kind: 'error', message: 'down', detail: 'CONFIG_INVALID · HTTP 503' },
    });
    expect(decision.guilds).toEqual([guildA]);
    expect(decision.selectedGuildId).toBe('guild-a');
    expect(decision.devFallbackActive).toBe(true);
    expect(decision.loadState.kind).toBe('error');
    if (decision.loadState.kind !== 'error') {
      throw new Error('expected error state');
    }
    expect(decision.loadState.message).toContain('lokalną listę deweloperską');
    expect(decision.loadState.message).not.toContain('VITE_');
  });

  it('does not treat identity-cookie empty result as a failure or use DEV guilds', () => {
    const decision = decideGuildInventory({
      mode: 'identity-cookie',
      sessionGuilds: [guildA],
      currentGuildId: null,
      remote: { kind: 'ok', guilds: [] },
    });
    expect(decision.guilds).toEqual([]);
    expect(decision.selectedGuildId).toBeNull();
    expect(decision.loadState).toEqual({ kind: 'empty' });
    expect(decision.devFallbackActive).toBe(false);
  });

  it('shows an explicit identity-cookie API failure without DEV fallback', () => {
    const decision = decideGuildInventory({
      mode: 'identity-cookie',
      sessionGuilds: [guildA],
      currentGuildId: 'guild-a',
      remote: { kind: 'error', message: 'down', detail: 'HTTP 503' },
    });
    expect(decision.guilds).toEqual([]);
    expect(decision.selectedGuildId).toBeNull();
    expect(decision.loadState.kind).toBe('error');
    if (decision.loadState.kind !== 'error') {
      throw new Error('expected error state');
    }
    expect(decision.loadState.message).toBe('Nie udało się pobrać listy serwerów.');
    expect(JSON.stringify(decision.guilds)).not.toContain('guild-a');
    expect(JSON.stringify(decision.guilds)).not.toContain('Alpha');
  });

  it('maps configuration and authorization failures to distinct owner-facing copy', () => {
    expect(
      resolveGuildListUserMessage({
        message: 'Discord guild metadata connection is not configured',
        detail: 'CONFIGURATION_INVALID · HTTP 503',
        code: 'CONFIGURATION_INVALID',
      }),
    ).toBe('Błąd konfiguracji połączenia wewnętrznego z Discordem.');
    expect(
      resolveGuildListUserMessage({
        message: 'Authorization is unavailable',
        detail: 'AUTHORIZATION_UNAVAILABLE · HTTP 503',
        code: 'AUTHORIZATION_UNAVAILABLE',
      }),
    ).toBe('Autoryzacja jest niedostępna — nie można zweryfikować uprawnień do serwerów.');
    expect(
      resolveGuildListUserMessage({
        message: 'Discord gateway is unreachable for guild metadata',
        detail: 'DISCORD_GATEWAY_UNAVAILABLE · HTTP 503',
        code: 'DISCORD_GATEWAY_UNAVAILABLE',
      }),
    ).toBe('Discord Gateway jest niedostępny.');
  });

  it('maps Discord metadata dependency failures to owner-facing copy', () => {
    expect(
      resolveGuildListUserMessage({
        message: 'Discord guild metadata is unavailable',
        detail: 'CONFIG_INVALID · HTTP 503',
        code: 'CONFIG_INVALID',
      }),
    ).toBe('Nie udało się pobrać serwerów z Discorda.');
    const decision = decideGuildInventory({
      mode: 'identity-cookie',
      sessionGuilds: [guildA],
      currentGuildId: null,
      remote: {
        kind: 'error',
        message: 'Discord guild metadata is unavailable',
        detail: 'CONFIG_INVALID · HTTP 503',
        code: 'CONFIG_INVALID',
      },
    });
    expect(decision.loadState.kind).toBe('error');
    if (decision.loadState.kind !== 'error') {
      throw new Error('expected error state');
    }
    expect(decision.loadState.message).toBe('Nie udało się pobrać serwerów z Discorda.');
    expect(decision.guilds).toEqual([]);
  });

  it('maps session failures without exposing env configuration hints', () => {
    expect(
      resolveGuildListUserMessage({
        message: 'Actor identity required',
        detail: 'UNAUTHENTICATED · HTTP 401',
        code: 'UNAUTHENTICATED',
      }),
    ).toBe('Nie udało się potwierdzić sesji.');
  });

  it('uses only authorized remote guilds on success', () => {
    const decision = decideGuildInventory({
      mode: 'dev-actor',
      sessionGuilds: [guildA, guildB],
      currentGuildId: 'guild-b',
      remote: { kind: 'ok', guilds: [guildA] },
    });
    expect(decision.guilds).toEqual([guildA]);
    expect(decision.selectedGuildId).toBe('guild-a');
    expect(decision.loadState).toEqual({ kind: 'ready', devFallbackActive: false });
    expect(JSON.stringify(decision.guilds)).not.toContain('guild-b');
    expect(JSON.stringify(decision.guilds)).not.toContain('Bravo');
  });

  it('does not seed identity-cookie mode from DEV env guilds', () => {
    expect(
      initialDevGuilds({
        mode: 'identity-cookie',
        actorDiscordUserId: null,
        guilds: [guildA],
        orgId: null,
      }),
    ).toEqual([]);
    expect(
      initialDevGuilds({
        mode: 'dev-actor',
        actorDiscordUserId: 'actor-1',
        guilds: [guildA],
        orgId: null,
      }),
    ).toEqual([guildA]);
  });

  it('AdminShell distinguishes empty authorized guilds from API failure', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'AdminShell.tsx'),
      'utf8',
    );
    expect(source).toContain('Brak serwerów, którymi możesz zarządzać.');
    expect(source).toContain('Spróbuj ponownie');
    expect(source).not.toContain('ustaw listę deweloperską');
    expect(source).toContain('DEV_FALLBACK_ONLY');
    expect(source).not.toContain('VITE_ADMIN_DEV_GUILDS');
  });
});
