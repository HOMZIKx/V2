import { GatewayIntentBits, Routes, type Guild } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type {
  AuthorizationSyncPort,
  AuthzDiscordEventInput,
} from '../../application/ports/authorization-sync.port.js';
import { DiscordGatewayConfigSchema, normalizeDiscordConfig } from './discord-config.js';
import {
  assertAllowedGatewayIntents,
  assertOnlyGuildsIntent,
  buildDiscordEventKey,
  DiscordJsGatewayAdapter,
} from './discord-js-adapter.js';

function makeConfig() {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'true',
      DISCORD_APPLICATION_ID: '100000000000000001',
      DISCORD_TOKEN: 'discord-test-token-value-1234567890',
      DISCORD_TEST_GUILD_ID: '1534228693017432124',
      DISCORD_TEST_OPERATOR_IDS: '111111111111111111',
      DISCORD_COMPONENT_SIGNING_SECRET: 'x'.repeat(32),
    }),
  );
}

describe('DiscordJsGatewayAdapter', () => {
  it('permits Guilds-only when sync is off and Guilds+GuildMembers when sync is on', () => {
    expect(() => assertAllowedGatewayIntents([GatewayIntentBits.Guilds], false)).not.toThrow();
    expect(() => assertOnlyGuildsIntent([GatewayIntentBits.Guilds])).not.toThrow();
    expect(() =>
      assertAllowedGatewayIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers], true),
    ).not.toThrow();
    expect(() =>
      assertAllowedGatewayIntents(
        [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
        false,
      ),
    ).toThrow();
    expect(() => assertAllowedGatewayIntents([GatewayIntentBits.Guilds], true)).toThrow();
    expect(() =>
      assertAllowedGatewayIntents(
        [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildPresences,
        ],
        true,
      ),
    ).toThrow();
  });

  it('starts as disabled without login when Discord is off', async () => {
    const config = normalizeDiscordConfig(
      DiscordGatewayConfigSchema.parse({ DISCORD_ENABLED: 'false' }),
    );
    const adapter = new DiscordJsGatewayAdapter({
      config,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      onInteraction: () => Promise.resolve(),
    });
    await adapter.start();
    expect(adapter.getState()).toBe('disabled');
    await adapter.stop();
    expect(adapter.getState()).toBe('disabled');
  });

  it('registers commands only through guild routes', async () => {
    const adapter = new DiscordJsGatewayAdapter({
      config: makeConfig(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      onInteraction: () => Promise.resolve(),
    });

    const restPut = vi.fn(() => Promise.resolve([{ id: '1', name: 'status' }]));
    Object.defineProperty(adapter, 'rest', {
      value: { put: restPut },
    });

    const route = Routes.applicationGuildCommands('100000000000000001', '1534228693017432124');
    expect(route.includes('/guilds/')).toBe(true);
    expect(Routes.applicationCommands('100000000000000001').includes('/guilds/')).toBe(false);

    const result = await adapter.putGuildCommands('1534228693017432124', [
      { name: 'status', description: 'x', version: 'p1.0.0' },
    ]);
    expect(result[0]?.name).toBe('status');
    const calls = restPut.mock.calls as unknown as Array<[unknown]>;
    const firstArg = calls[0]?.[0];
    expect(typeof firstArg === 'string' ? firstArg : '').toContain('/guilds/');
  });
});

function makeSyncMock(): {
  port: AuthorizationSyncPort;
  applyDiscordEvent: ReturnType<typeof vi.fn>;
} {
  const applyDiscordEvent = vi.fn(() => Promise.resolve());
  return {
    port: {
      registerGuild: vi.fn(() => Promise.resolve()),
      applyDiscordEvent,
      reconcileGuild: vi.fn(() => Promise.resolve()),
    },
    applyDiscordEvent,
  };
}

function makeAdapterWithSync(port: AuthorizationSyncPort): DiscordJsGatewayAdapter {
  return new DiscordJsGatewayAdapter({
    config: makeConfig(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    onInteraction: () => Promise.resolve(),
    authorizationSync: port,
  });
}

const GUILD_ID = '1534228693017432124';

describe('buildDiscordEventKey', () => {
  it('produces the same key for the same member update payload (idempotent replay)', () => {
    const key1 = buildDiscordEventKey('guild_member_update', [GUILD_ID, 'u1'], {
      roleIds: ['r2', 'r1'].sort(),
      status: 'active',
    });
    const key2 = buildDiscordEventKey('guild_member_update', [GUILD_ID, 'u1'], {
      roleIds: ['r1', 'r2'].sort(),
      status: 'active',
    });
    expect(key1).toBe(key2);
    expect(key1.startsWith(`dg:guild_member_update:${GUILD_ID}:u1:`)).toBe(true);
  });

  it('produces different keys when the roles differ', () => {
    const key1 = buildDiscordEventKey('guild_member_update', [GUILD_ID, 'u1'], {
      roleIds: ['r1'],
      status: 'active',
    });
    const key2 = buildDiscordEventKey('guild_member_update', [GUILD_ID, 'u1'], {
      roleIds: ['r1', 'r2'],
      status: 'active',
    });
    expect(key1).not.toBe(key2);
  });

  it('is deterministic regardless of object key ordering in the payload', () => {
    const key1 = buildDiscordEventKey(
      'guild_role_update',
      [GUILD_ID],
      [{ discordRoleId: 'r1', nameCache: 'Member' }],
    );
    const key2 = buildDiscordEventKey(
      'guild_role_update',
      [GUILD_ID],
      [{ nameCache: 'Member', discordRoleId: 'r1' }],
    );
    expect(key1).toBe(key2);
  });

  it('includes membership epoch in remove keys (defaults to 0)', () => {
    expect(buildDiscordEventKey('guild_member_remove', [GUILD_ID, 'u1', 0])).toBe(
      `dg:guild_member_remove:${GUILD_ID}:u1:0`,
    );
  });
});

describe('DiscordJsGatewayAdapter guild lifecycle events', () => {
  it('sends guild_unavailable (not detach) when GuildDelete reports available === false', async () => {
    const { port, applyDiscordEvent } = makeSyncMock();
    const adapter = makeAdapterWithSync(port);

    const guild = { id: GUILD_ID, available: false } as unknown as Guild;
    await (adapter as unknown as { handleGuildDelete(g: Guild): Promise<void> }).handleGuildDelete(
      guild,
    );

    expect(applyDiscordEvent).toHaveBeenCalledTimes(1);
    const input = applyDiscordEvent.mock.calls[0]?.[0] as AuthzDiscordEventInput;
    expect(input.payload).toEqual({ kind: 'guild_unavailable' });
    expect(input.eventType).toBe('guild_unavailable');
    expect(input.eventKey).toBe(`dg:guild_unavailable:${GUILD_ID}:0`);
  });

  it('sends guild_detach when GuildDelete is a confirmed removal (available !== false)', async () => {
    const { port, applyDiscordEvent } = makeSyncMock();
    const adapter = makeAdapterWithSync(port);

    const guild = { id: GUILD_ID, available: true } as unknown as Guild;
    await (adapter as unknown as { handleGuildDelete(g: Guild): Promise<void> }).handleGuildDelete(
      guild,
    );

    expect(applyDiscordEvent).toHaveBeenCalledTimes(1);
    const input = applyDiscordEvent.mock.calls[0]?.[0] as AuthzDiscordEventInput;
    expect(input.payload).toEqual({ kind: 'guild_detach' });
    expect(input.eventType).toBe('guild_delete');
    expect(input.eventKey).toBe(`dg:guild_detach:${GUILD_ID}:0`);
  });

  it('replays the same event key across repeated GuildDelete outage events (retry)', async () => {
    const { port, applyDiscordEvent } = makeSyncMock();
    const adapter = makeAdapterWithSync(port);

    const guild = { id: GUILD_ID, available: false } as unknown as Guild;
    const handle = (
      adapter as unknown as { handleGuildDelete(g: Guild): Promise<void> }
    ).handleGuildDelete.bind(adapter);
    await handle(guild);
    await handle(guild);

    const keys = applyDiscordEvent.mock.calls.map(
      (call) => (call[0] as AuthzDiscordEventInput).eventKey,
    );
    expect(keys).toEqual([
      `dg:guild_unavailable:${GUILD_ID}:0`,
      `dg:guild_unavailable:${GUILD_ID}:0`,
    ]);
  });

  it('leave → rejoin → leave uses a new remove key for the second leave', async () => {
    const { port, applyDiscordEvent } = makeSyncMock();
    const adapter = makeAdapterWithSync(port);
    const internals = adapter as unknown as {
      handleMemberRemove(m: { id: string; guild: Guild }): Promise<void>;
      handleMemberUpsert(
        m: {
          id: string;
          guild: Guild;
          roles: { cache: Map<string, unknown> };
          joinedTimestamp: number | null;
        },
        t: 'guild_member_add' | 'guild_member_update',
      ): Promise<void>;
    };

    const guild = { id: GUILD_ID } as Guild;
    const member = {
      id: 'u-leave',
      guild,
      roles: { cache: new Map([[GUILD_ID, {}]]) },
      joinedTimestamp: 1_700_000_000_000,
    };

    await internals.handleMemberRemove(member);
    await internals.handleMemberUpsert(member, 'guild_member_add');
    await internals.handleMemberRemove(member);

    const removeKeys = applyDiscordEvent.mock.calls
      .map((call) => call[0] as AuthzDiscordEventInput)
      .filter((input) => input.eventType === 'guild_member_remove')
      .map((input) => input.eventKey);

    expect(removeKeys).toEqual([
      `dg:guild_member_remove:${GUILD_ID}:u-leave:0`,
      `dg:guild_member_remove:${GUILD_ID}:u-leave:1`,
    ]);
  });

  it('unavailable → reconcile → unavailable uses a new unavailable key', async () => {
    const { port, applyDiscordEvent } = makeSyncMock();
    const adapter = makeAdapterWithSync(port);
    const internals = adapter as unknown as {
      handleGuildDelete(g: Guild): Promise<void>;
      registerAndReconcile(g: Guild): Promise<void>;
      buildGuildSnapshot(g: Guild): Promise<{
        members: Array<{ discordUserId: string; roleIds: string[]; status: 'active' }>;
        roles: Array<{ discordRoleId: string; nameCache: string }>;
      }>;
    };

    // Avoid real Discord cache fetches during reconcile.
    internals.buildGuildSnapshot = () => Promise.resolve({ members: [], roles: [] });

    const outage = { id: GUILD_ID, available: false } as unknown as Guild;
    await internals.handleGuildDelete(outage);
    await internals.registerAndReconcile({ id: GUILD_ID } as Guild);
    await internals.handleGuildDelete(outage);

    const unavailableKeys = applyDiscordEvent.mock.calls
      .map((call) => call[0] as AuthzDiscordEventInput)
      .filter((input) => input.payload.kind === 'guild_unavailable')
      .map((input) => input.eventKey);

    expect(unavailableKeys).toEqual([
      `dg:guild_unavailable:${GUILD_ID}:0`,
      `dg:guild_unavailable:${GUILD_ID}:1`,
    ]);
  });

  it('detach → reconnect → detach uses a new detach key', async () => {
    const { port, applyDiscordEvent } = makeSyncMock();
    const adapter = makeAdapterWithSync(port);
    const internals = adapter as unknown as {
      handleGuildDelete(g: Guild): Promise<void>;
      registerAndReconcile(g: Guild): Promise<void>;
      buildGuildSnapshot(g: Guild): Promise<{
        members: Array<{ discordUserId: string; roleIds: string[]; status: 'active' }>;
        roles: Array<{ discordRoleId: string; nameCache: string }>;
      }>;
    };

    internals.buildGuildSnapshot = () => Promise.resolve({ members: [], roles: [] });

    const detached = { id: GUILD_ID, available: true } as unknown as Guild;
    await internals.handleGuildDelete(detached);
    await internals.registerAndReconcile({ id: GUILD_ID } as Guild);
    await internals.handleGuildDelete(detached);

    const detachKeys = applyDiscordEvent.mock.calls
      .map((call) => call[0] as AuthzDiscordEventInput)
      .filter((input) => input.payload.kind === 'guild_detach')
      .map((input) => input.eventKey);

    expect(detachKeys).toEqual([`dg:guild_detach:${GUILD_ID}:0`, `dg:guild_detach:${GUILD_ID}:1`]);
  });
});
