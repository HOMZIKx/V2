import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { upsertGuildInConfig, validateBotConfigDraft } from './bot-config.schema.js';
import { defaultBotConfigValues } from './capabilities.js';
import { VersionedConfigStore } from './versioned-config-store.js';

describe('guild config (Technika)', () => {
  it('validates GuildConfig and upserts into BotConfig.guilds', () => {
    const base = defaultBotConfigValues();
    const result = upsertGuildInConfig(base, '1534228693017432124', {
      enabled: true,
      displayName: 'LAB',
      modules: {
        characterTimers: true,
        kingdomWar: true,
        panels: true,
        channels: false,
      },
      rights: ['technika.config', 'technika.apply', 'discord.notify'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.guilds['1534228693017432124']?.enabled).toBe(true);
      expect(result.config.guilds['1534228693017432124']?.modules.characterTimers).toBe(true);
    }
  });

  it('rejects non-snowflake guildId', () => {
    const result = upsertGuildInConfig(defaultBotConfigValues(), 'not-a-guild', {
      enabled: true,
      modules: {
        characterTimers: true,
        kingdomWar: false,
        panels: true,
        channels: false,
      },
      rights: ['technika.config'],
    });
    expect(result.ok).toBe(false);
  });

  it('persists guilds via draft → apply in VersionedConfigStore', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'technika-guilds-'));
    const store = new VersionedConfigStore({ dataDir: dir });
    const draft = store.putDraft({
      guilds: {
        '1534228693017432124': {
          enabled: true,
          displayName: 'LAB',
          modules: {
            characterTimers: true,
            kingdomWar: false,
            panels: true,
            channels: false,
          },
          rights: ['technika.config', 'discord.notify', 'discord.panels'],
        },
      },
    });
    expect(draft.ok).toBe(true);
    const applied = store.apply();
    expect(applied.config.guilds['1534228693017432124']?.enabled).toBe(true);
    const validated = validateBotConfigDraft(applied.config);
    expect(validated.ok).toBe(true);
  });
});
