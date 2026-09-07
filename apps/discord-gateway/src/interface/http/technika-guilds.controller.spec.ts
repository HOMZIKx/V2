import { UnauthorizedException } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VersionedConfigStore } from '../../application/technika/versioned-config-store.js';
import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../../infrastructure/discord/discord-config.js';
import type { DiscordJsGatewayAdapter } from '../../infrastructure/discord/discord-js-adapter.js';
import { TechnikaGuildsController } from './technika-guilds.controller.js';

const GUILD_ID = '1543972927719080016';
const USER_ID = '808066932753563668';
const SECRET = 'local-technika-secret-16+';

function config() {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'true',
      DISCORD_APPLICATION_ID: '123456789012345678',
      DISCORD_TOKEN: 'test-discord-token-that-is-long-enough',
      DISCORD_TEST_GUILD_ID: GUILD_ID,
      DISCORD_TEST_OPERATOR_IDS: USER_ID,
      DISCORD_COMPONENT_SIGNING_SECRET: '12345678901234567890123456789012',
      DISCORD_TECHNIKA_SHARED_SECRET: SECRET,
      DISCORD_STRICT_GUILD_ISOLATION: 'true',
    }),
  );
}

function gateway(): DiscordJsGatewayAdapter {
  return {
    getSnapshot: () => ({ state: 'ready' }),
    refreshJoinedGuildDirectory: vi.fn().mockResolvedValue([]),
    listJoinedGuildSummaries: () => [
      { id: GUILD_ID, name: 'Destiled', memberCount: 1 },
    ],
  } as unknown as DiscordJsGatewayAdapter;
}

describe('TechnikaGuildsController member probe', () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function create(): TechnikaGuildsController {
    const dir = mkdtempSync(path.join(tmpdir(), 'technika-guilds-http-'));
    dirs.push(dir);
    return new TechnikaGuildsController(
      config(),
      new VersionedConfigStore({ dataDir: dir }),
      gateway(),
    );
  }

  it('requires the server-side Technika secret', async () => {
    const controller = create();
    await expect(controller.getGuildMember(undefined, GUILD_ID, USER_ID)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns member=true for a live Discord member', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 })),
    );
    const controller = create();

    await expect(controller.getGuildMember(SECRET, GUILD_ID, USER_ID)).resolves.toEqual({
      guildId: GUILD_ID,
      userId: USER_ID,
      member: true,
    });
  });

  it('returns member=false for a definitive Discord 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 404 })),
    );
    const controller = create();

    await expect(controller.getGuildMember(SECRET, GUILD_ID, USER_ID)).resolves.toEqual({
      guildId: GUILD_ID,
      userId: USER_ID,
      member: false,
    });
  });
});
