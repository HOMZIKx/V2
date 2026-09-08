import { describe, expect, it, vi } from 'vitest';

import { defaultBotConfigValues } from '../../application/technika/capabilities.js';
import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../../infrastructure/discord/discord-config.js';
import { NotifyController } from './notify.controller.js';

const SECRET = 'local-notify-secret-at-least-16';

function enabledConfig() {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'true',
      DISCORD_APPLICATION_ID: '100000000000000001',
      DISCORD_TOKEN: 'discord-test-token-value-1234567890',
      DISCORD_TEST_GUILD_ID: '1534228693017432124',
      DISCORD_TEST_OPERATOR_IDS: '111111111111111111',
      DISCORD_COMPONENT_SIGNING_SECRET: 'x'.repeat(32),
      DISCORD_NOTIFY_SHARED_SECRET: SECRET,
    }),
  );
}

describe('NotifyController character timer runtime template', () => {
  it('uses the latest active Technika template on subsequent live DMs without restart', async () => {
    let template = 'FIRST {{characterName}} :: {{title}} :: {{otherTimersSummary}}';
    const store = {
      getActiveSnapshot: () => {
        const base = defaultBotConfigValues();
        const timers = {
          ...base.characterTimers,
          enabled: true,
          resetNotifyEnabled: true,
          messageTemplate: template,
        };
        return {
          revision: 1,
          status: 'active' as const,
          config: { ...base, characterTimers: timers, timersNotify: timers },
          updatedAt: new Date().toISOString(),
          hasDraft: false,
          canRollback: false,
        };
      },
    };
    const sendTimerNotify = vi.fn(
      async (_input: { readonly content: string }) => ({
        delivery: 'dm' as const,
        messageId: 'm1',
      }),
    );
    const controller = new NotifyController(
      enabledConfig(),
      { getSnapshot: () => ({ state: 'ready' }), sendTimerNotify } as never,
      store as never,
    );
    const body = {
      discordUserId: '111111111111111111',
      title: 'Kamień Duchowy gotowy',
      body: 'Timer jest gotowy.',
      deepLinkUrl: 'https://desapp.zeabur.app/teams/a/characters/b?view=timers',
      workspaceId: 'a',
      characterId: 'b',
      characterName: 'KuzynPasek',
      timerId: 'soul',
      timerLabel: 'Kamień Duchowy',
      kind: 'reminder' as const,
      liveTimers: [
        { id: 'book', label: 'Księga umiejętności', status: 'running', remainingLabel: '2h' },
      ],
    };

    await controller.notifyTimer(SECRET, { ...body, idempotencyKey: 'template-first' });
    expect(sendTimerNotify.mock.calls[0]?.[0]?.content).toContain('FIRST KuzynPasek');

    template = 'SECOND {{timerLabel}} :: {{deepLinkUrl}}';
    await controller.notifyTimer(SECRET, { ...body, idempotencyKey: 'template-second' });

    expect(sendTimerNotify).toHaveBeenCalledTimes(2);
    expect(sendTimerNotify.mock.calls[1]?.[0]?.content).toContain('SECOND Kamień Duchowy');
    expect(sendTimerNotify.mock.calls[1]?.[0]?.content).not.toContain('FIRST KuzynPasek');
  });
});