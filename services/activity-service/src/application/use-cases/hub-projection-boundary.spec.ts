import { describe, expect, it, vi } from 'vitest';

import type { ActorSubject } from '../../application/ports/activity.ports.js';
import { ActivityError } from '../../domain/errors.js';
import { ACTIVITY_PERMISSIONS } from '../../domain/permissions.js';
import { ActivityUseCases } from './activity.use-cases.js';

describe('Hub projection path — isolation from product ops', () => {
  const actor: ActorSubject = { discordUserId: '808066932753563668' };

  it('C: hub projection list does not call AuthorizePort and returns hub panels only', async () => {
    const authorize = {
      authorize: vi.fn(() =>
        Promise.resolve({
          allowed: false,
          permissionId: ACTIVITY_PERMISSIONS.PANEL_MANAGE,
          decision: 'deny' as const,
        }),
      ),
    };
    const listPanels = vi.fn(() =>
      Promise.resolve([
        {
          id: '11111111-1111-4111-8111-111111111111',
          opaqueId: 'abcabcabcabc',
          organizationId: 'org-1',
          discordGuildId: '1534228693017432124',
          channelId: 'chan-1',
          panelType: 'hub',
          messageId: 'msg-1',
          status: 'active',
          payloadVersion: 1,
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          opaqueId: 'defdefdefdef',
          organizationId: 'org-1',
          discordGuildId: '1534228693017432124',
          channelId: 'chan-2',
          panelType: 'event',
          messageId: 'msg-2',
          status: 'active',
          payloadVersion: 1,
        },
      ]),
    );
    const listing = new ActivityUseCases({
      repository: {
        withTransaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ listPanels }),
      },
      authorize,
      characterVerify: { resolveCharacter: vi.fn() },
      clock: { now: () => new Date('2026-08-31T00:00:00.000Z') },
      nodeEnv: 'production',
      allowTestSeed: false,
    } as never);

    const hubs = await listing.listHubProjectionPanels('1534228693017432124');
    expect(hubs).toHaveLength(1);
    expect(hubs[0]?.panelType).toBe('hub');
    expect(authorize.authorize).not.toHaveBeenCalled();
  });

  it('D: hub projection capability does not unlock create/LFG product mutations', async () => {
    const authorize = {
      authorize: vi.fn(() =>
        Promise.resolve({
          allowed: false,
          permissionId: ACTIVITY_PERMISSIONS.CREATE,
          decision: 'deny' as const,
        }),
      ),
    };
    const useCases = new ActivityUseCases({
      repository: {
        withTransaction: () => {
          throw new Error('should not reach repository for denied create');
        },
      },
      authorize,
      characterVerify: {
        resolveCharacter: vi.fn(() =>
          Promise.reject(new ActivityError('DEPENDENCY_UNAVAILABLE', 'disabled')),
        ),
      },
      clock: { now: () => new Date('2026-08-31T00:00:00.000Z') },
      nodeEnv: 'production',
      allowTestSeed: false,
    } as never);

    await expect(
      useCases.createDraft({ guildId: '1534228693017432124', payload: {} }, { actor }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      useCases.upsertHubProjectionPanel(
        {
          organizationId: 'org-1',
          discordGuildId: '',
          channelId: 'chan',
        },
        { actor },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
