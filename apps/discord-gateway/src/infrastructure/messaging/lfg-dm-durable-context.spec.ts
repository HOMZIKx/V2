import { describe, expect, it, vi } from 'vitest';

import { opaqueIdFromUuid } from '@v2/hub-core';

import { ActivityInteractionHandler } from '../../interface/discord/activity-interaction-handler.js';
import { decodeLfgDmContext } from '../security/lfg-dm-context.js';
import { createLfgDmCustomId, parseLfgDmCustomId } from '../security/lfg-dm-signed-custom-id.js';
import { buildDeliveryActionComponents } from './notification-dm-delivery.service.js';

const secret = 's'.repeat(32);
const activityOpaque = 'a1b2c3d4e5f6';
const guildId = '1534228693017432124';
const intentId = '22222222-2222-4222-8222-222222222222';
const intentOpaque = opaqueIdFromUuid(intentId);
const characterB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const characterA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const activityId = '11111111-1111-4111-8111-111111111111';

describe('LFG durable DM context end-to-end', () => {
  it('preserves intent opaque + role from notification payload through signed buttons', () => {
    const rows = buildDeliveryActionComponents(
      {
        template: 'lfg_match',
        activityId,
        activityOpaqueId: activityOpaque,
        guildId,
        organizationId: 'org-1',
        activityTypeKey: 'azrael',
        fingerprint: 'fp-1',
        intentId,
        intentOpaqueId: intentOpaque,
        eligiblePartyRoles: ['BUFF', 'DPS'],
        suggestedPartyRole: 'BUFF',
      },
      guildId,
      'DISCOVERY',
      secret,
    );
    expect(rows).toBeDefined();
    const joinButtons = rows![0]!.toJSON().components ?? [];
    expect(joinButtons).toHaveLength(2);
    const buffButton = joinButtons.find((b) => (b as { label?: string }).label === 'BUFF');
    expect(buffButton).toBeDefined();
    const parsed = parseLfgDmCustomId(
      String((buffButton as { custom_id?: string }).custom_id),
      secret,
    );
    const ctx = decodeLfgDmContext(parsed.param);
    expect(ctx).toEqual({
      kind: 'intent',
      intentOpaqueId: intentOpaque,
      guildId,
      partyRole: 'BUFF',
    });
  });

  it('uses intentId join path and ignores profile default character (CHARACTER_A vs CHARACTER_B)', async () => {
    const rows = buildDeliveryActionComponents(
      {
        template: 'lfg_match',
        activityId,
        activityOpaqueId: activityOpaque,
        guildId,
        organizationId: 'org-1',
        activityTypeKey: 'azrael',
        fingerprint: 'fp-1',
        intentId,
        intentOpaqueId: intentOpaque,
        eligiblePartyRoles: ['BUFF'],
        suggestedPartyRole: 'BUFF',
      },
      guildId,
      'DISCOVERY',
      secret,
    );
    const joinCustomId = String(
      (rows![0]!.toJSON().components?.[0] as { custom_id?: string } | undefined)?.custom_id,
    );
    const parsed = parseLfgDmCustomId(joinCustomId, secret);
    const ctx = decodeLfgDmContext(parsed.param);
    expect(ctx?.partyRole).toBe('BUFF');

    const joinLfg = vi.fn().mockResolvedValue({ participationId: 'p1' });
    const resolveLfgIntentByOpaque = vi.fn().mockResolvedValue({
      id: intentId,
      opaqueId: intentOpaque,
      guildId,
      organizationId: 'org-1',
      characterId: characterB,
      sessionRoles: ['BUFF'],
      activityTypeKey: 'azrael',
    });
    const resolveActivityByOpaque = vi.fn().mockResolvedValue({
      id: activityId,
      guildId,
      name: 'Dungeon',
      startAt: '2026-08-22T18:00:00.000Z',
    });
    const getGuildConfig = vi.fn().mockResolvedValue({
      statuses: [{ id: 'status-1', active: true, selectableByMember: true, behavior: 'confirmed' }],
    });

    const handler = new ActivityInteractionHandler({
      activityClient: {
        joinLfg,
        resolveLfgIntentByOpaque,
        resolveActivityByOpaque,
        getGuildConfig,
      } as never,
      config: {
        DISCORD_COMPONENT_SIGNING_SECRET: secret,
        DISCORD_TEST_GUILD_ID: guildId,
        ACTIVITY_ORGANIZATION_ID: 'org-1',
      } as never,
      identityClient: {
        getProfile: vi.fn().mockResolvedValue({
          activeCharacterId: characterA,
          defaultCharacterId: characterA,
          characters: [
            { id: characterA, sessionRoles: ['DPS'] },
            { id: characterB, sessionRoles: ['BUFF'] },
          ],
        }),
      } as never,
      gateway: {} as never,
      logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    });

    const interaction = {
      customId: joinCustomId,
      user: { id: 'user-1' },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };

    await (
      handler as unknown as {
        handleLfgDmComponent: (i: typeof interaction) => Promise<void>;
      }
    ).handleLfgDmComponent(interaction);

    expect(resolveLfgIntentByOpaque).toHaveBeenCalledWith(
      intentOpaque,
      guildId,
      expect.any(Object),
    );
    expect(joinLfg).toHaveBeenCalledOnce();
    const joinBody = joinLfg.mock.calls[0]![0] as {
      intentId?: string;
      characterId?: string;
      partyRoleKey: string;
    };
    expect(joinBody.intentId).toBe(intentId);
    expect(joinBody.characterId).toBeUndefined();
    expect(joinBody.partyRoleKey).toBe('BUFF');
  });

  it('suppresses exact intent when durable intent context is present', async () => {
    const suppressCustomId = createLfgDmCustomId(
      activityOpaque,
      'suppress',
      secret,
      `i.${intentOpaque}.${guildId}`,
    );
    const suppressLfgMatch = vi.fn().mockResolvedValue({ suppressed: true });
    const resolveActivityByOpaque = vi.fn().mockResolvedValue({ id: activityId, guildId });

    const handler = new ActivityInteractionHandler({
      activityClient: {
        suppressLfgMatch,
        resolveActivityByOpaque,
        resolveLfgIntentByOpaque: vi.fn().mockResolvedValue({ id: intentId }),
      } as never,
      config: {
        DISCORD_COMPONENT_SIGNING_SECRET: secret,
        DISCORD_TEST_GUILD_ID: guildId,
      } as never,
      identityClient: null,
      gateway: {} as never,
      logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    });

    const interaction = {
      customId: suppressCustomId,
      user: { id: 'user-1' },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };

    await (
      handler as unknown as {
        handleLfgDmComponent: (i: typeof interaction) => Promise<void>;
      }
    ).handleLfgDmComponent(interaction);

    expect(suppressLfgMatch).toHaveBeenCalledWith(
      activityId,
      { guildId, intentId },
      expect.any(Object),
    );
  });

  it('uses stored watch characterId for full-group slot reopen join', async () => {
    const watchId = '44444444-4444-4444-8444-444444444444';
    const watchOpaque = opaqueIdFromUuid(watchId);
    const watchCharacter = characterB;
    const joinCustomId = createLfgDmCustomId(
      activityOpaque,
      'join',
      secret,
      `w.${watchOpaque}.${guildId}.BUFF`,
    );

    const joinLfg = vi.fn().mockResolvedValue({ participationId: 'p1' });
    const resolveLfgFullGroupWatchByOpaque = vi.fn().mockResolvedValue({
      id: watchId,
      opaqueId: watchOpaque,
      guildId,
      characterId: watchCharacter,
      sessionRoles: ['BUFF'],
    });
    const resolveActivityByOpaque = vi.fn().mockResolvedValue({
      id: activityId,
      guildId,
      name: 'Dungeon',
      startAt: '2026-08-22T18:00:00.000Z',
    });
    const getGuildConfig = vi.fn().mockResolvedValue({
      statuses: [{ id: 'status-1', active: true, selectableByMember: true, behavior: 'confirmed' }],
    });

    const handler = new ActivityInteractionHandler({
      activityClient: {
        joinLfg,
        resolveLfgFullGroupWatchByOpaque,
        resolveActivityByOpaque,
        getGuildConfig,
      } as never,
      config: {
        DISCORD_COMPONENT_SIGNING_SECRET: secret,
        DISCORD_TEST_GUILD_ID: guildId,
      } as never,
      identityClient: {
        getProfile: vi.fn().mockResolvedValue({
          activeCharacterId: characterA,
          defaultCharacterId: characterA,
        }),
      } as never,
      gateway: {} as never,
      logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    });

    const interaction = {
      customId: joinCustomId,
      user: { id: 'user-1' },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };

    await (
      handler as unknown as {
        handleLfgDmComponent: (i: typeof interaction) => Promise<void>;
      }
    ).handleLfgDmComponent(interaction);

    expect(resolveLfgFullGroupWatchByOpaque).toHaveBeenCalledWith(
      watchOpaque,
      guildId,
      expect.any(Object),
    );
    const joinBody = joinLfg.mock.calls[0]![0] as {
      intentId?: string;
      characterId?: string;
      fullGroupWatchId?: string;
      partyRoleKey: string;
    };
    expect(joinBody.intentId).toBeUndefined();
    expect(joinBody.characterId).toBeUndefined();
    expect(joinBody.fullGroupWatchId).toBe(watchId);
    expect(joinBody.partyRoleKey).toBe('BUFF');
  });

  it('mutes dungeon activity type via mutedActivityTypeKeys (not interest keys)', async () => {
    const muteCustomId = createLfgDmCustomId(activityOpaque, 'mute', secret, 'azrael');
    const updateNotificationPreferences = vi.fn().mockResolvedValue({});
    const resolveActivityByOpaque = vi.fn().mockResolvedValue({
      id: activityId,
      guildId,
      activityTypeKey: 'azrael',
    });

    const handler = new ActivityInteractionHandler({
      activityClient: {
        updateNotificationPreferences,
        resolveActivityByOpaque,
      } as never,
      config: {
        DISCORD_COMPONENT_SIGNING_SECRET: secret,
        DISCORD_TEST_GUILD_ID: guildId,
      } as never,
      identityClient: null,
      gateway: {} as never,
      logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    });

    const interaction = {
      customId: muteCustomId,
      user: { id: 'user-1' },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };

    await (
      handler as unknown as {
        handleLfgDmComponent: (i: typeof interaction) => Promise<void>;
      }
    ).handleLfgDmComponent(interaction);

    expect(updateNotificationPreferences).toHaveBeenCalledWith(
      { guildId, mutedActivityTypeKeys: ['azrael'] },
      expect.any(Object),
    );
  });
});
