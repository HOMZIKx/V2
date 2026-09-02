import { describe, expect, it, vi } from 'vitest';

import { runStartupHubReconcile } from './hub-startup-reconcile.js';

const baseConfig = {
  DISCORD_ACTIVITY_ENABLED: true,
  DISCORD_AUTO_RECONCILE_HUB_ON_STARTUP: true,
  DISCORD_TEST_GUILD_ID: '1534228693017432124',
  DISCORD_TEST_CHANNEL_ID: '',
  ACTIVITY_ORGANIZATION_ID: 'org-test',
  DISCORD_COMPONENT_SIGNING_SECRET: 'x'.repeat(32),
  APP_VERSION: '0.1.0-test',
  GIT_COMMIT_SHA: 'abc1234',
  operatorIds: ['808066932753563668'],
} as const;

describe('runStartupHubReconcile', () => {
  it('skips when auto reconcile is disabled', async () => {
    const activityClient = { listHubProjectionPanels: vi.fn() };
    await runStartupHubReconcile({
      config: { ...baseConfig, DISCORD_AUTO_RECONCILE_HUB_ON_STARTUP: false },
      gateway: {} as never,
      activityClient: activityClient as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    expect(activityClient.listHubProjectionPanels).not.toHaveBeenCalled();
  });

  it('skips when hub channel cannot be resolved', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const activityClient = {
      listHubProjectionPanels: vi.fn(() => Promise.resolve([])),
      getGuildConfig: vi.fn(() => Promise.reject(new Error('not found'))),
    };

    await runStartupHubReconcile({
      config: baseConfig,
      gateway: {} as never,
      activityClient: activityClient as never,
      logger,
    });

    expect(logger.info).toHaveBeenCalledWith(
      'Startup hub reconcile skipped: hub channel not configured',
      expect.objectContaining({ guildId: baseConfig.DISCORD_TEST_GUILD_ID }),
    );
  });

  it('reconciles hub panel on startup when channel is known', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const panelId = '11111111-1111-4111-8111-111111111111';
    const activityClient = {
      listHubProjectionPanels: vi.fn(() =>
        Promise.resolve([
          {
            id: panelId,
            panelType: 'hub',
            channelId: 'chan-hub',
            messageId: 'msg-old',
            opaqueId: 'abcabcabcabc',
          },
        ]),
      ),
      getHubProjectionPendingOccurrence: vi.fn(() => Promise.resolve(null)),
      upsertHubProjectionPanel: vi.fn((body: Record<string, unknown>) =>
        Promise.resolve({
          id: panelId,
          opaqueId: 'abcabcabcabc',
          messageId: body.messageId ?? 'msg-old',
        }),
      ),
    };

    const gateway = {
      findBotMessagesWithPanelOpaqueId: vi.fn(() => Promise.resolve([])),
      editComponentsV2Message: vi.fn(() => Promise.resolve()),
      publishComponentsV2Message: vi.fn(() =>
        Promise.resolve({ messageId: 'msg-old', channelId: 'chan-hub' }),
      ),
      deleteChannelMessage: vi.fn(() => Promise.resolve()),
    };

    await runStartupHubReconcile({
      config: baseConfig,
      gateway: gateway as never,
      activityClient: activityClient as never,
      logger,
    });

    expect(gateway.editComponentsV2Message).toHaveBeenCalledOnce();
    const editCall = gateway.editComponentsV2Message.mock.calls[0] as
      [string, string, { flags?: number; files?: Array<{ name?: string | null }> }] | undefined;
    const editPayload = editCall?.[2];
    expect(editPayload?.flags).toBe(1 << 15);
    expect(editPayload?.files?.some((file) => file.name === 'centrum-aktywnosci-icon.png')).toBe(
      true,
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Startup hub reconcile completed',
      expect.objectContaining({ channelId: 'chan-hub', mode: 'updated' }),
    );
  });
});
