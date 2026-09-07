import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetLiveBotConfigForTests } from '../../application/config/live-bot-config.js';
import { resetNotifyIdempotencyWindow } from '../../application/notify/notify-idempotency.js';
import { resetTimerRoomWatchersForTests } from '../../application/notify/timer-room-watchers.js';
import { defaultBotConfigValues } from '../../application/technika/capabilities.js';
import {
  DiscordGatewayConfigSchema,
  normalizeDiscordConfig,
} from '../../infrastructure/discord/discord-config.js';
import { NotifyController } from './notify.controller.js';

function mockTechnikaStore(overrides: Record<string, unknown> = {}) {
  const base = defaultBotConfigValues();
  const timers = {
    ...base.timersNotify,
    enabled: true,
    resetNotifyEnabled: true,
    ...((overrides.timersNotify as object) ?? {}),
    ...((overrides.characterTimers as object) ?? {}),
  };
  const config = {
    ...base,
    ...overrides,
    timersNotify: timers,
    characterTimers: timers,
    'notify-timer-dm-action-buttons': true,
  };
  return {
    getActiveSnapshot: () => ({
      revision: 1,
      status: 'active' as const,
      config,
      updatedAt: new Date().toISOString(),
      hasDraft: false,
      canRollback: false,
    }),
  };
}

const SECRET = 'local-notify-secret-at-least-16';

function disabledConfig() {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'false',
      DISCORD_NOTIFY_SHARED_SECRET: SECRET,
    }),
  );
}

function enabledConfig(secret = SECRET) {
  return normalizeDiscordConfig(
    DiscordGatewayConfigSchema.parse({
      DISCORD_ENABLED: 'true',
      DISCORD_APPLICATION_ID: '100000000000000001',
      DISCORD_TOKEN: 'discord-test-token-value-1234567890',
      DISCORD_TEST_GUILD_ID: '1534228693017432124',
      DISCORD_TEST_OPERATOR_IDS: '111111111111111111',
      DISCORD_COMPONENT_SIGNING_SECRET: 'x'.repeat(32),
      DISCORD_NOTIFY_SHARED_SECRET: secret,
    }),
  );
}

const validBody = {
  discordUserId: '111111111111111111',
  title: 'Timer gotowy',
  body: 'Metin wszedł w okno respawnu.',
  deepLinkUrl: 'http://127.0.0.1:3000/timers',
  idempotencyKey: 'test-key-1',
};

describe('NotifyController', () => {
  beforeEach(() => {
    resetNotifyIdempotencyWindow();
    resetTimerRoomWatchersForTests();
    resetLiveBotConfigForTests();
  });

  it('rejects missing or wrong secret', async () => {
    const controller = new NotifyController(enabledConfig(), {
      getSnapshot: () => ({ state: 'ready' }),
      sendTimerNotify: vi.fn(),
    } as never);
    await expect(controller.notifyTimer(undefined, validBody)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.notifyTimer('wrong', validBody)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when discord disabled', async () => {
    const controller = new NotifyController(disabledConfig(), null);
    await expect(controller.notifyTimer(SECRET, validBody)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects invalid payload', async () => {
    const controller = new NotifyController(enabledConfig(), {
      getSnapshot: () => ({ state: 'ready' }),
      sendTimerNotify: vi.fn(),
    } as never);
    await expect(
      controller.notifyTimer(SECRET, { ...validBody, discordUserId: 'bad' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sends DM and ignores duplicate idempotency key', async () => {
    const sendTimerNotify = vi.fn((input: { readonly content: string }) => {
      void input;
      return Promise.resolve({
        delivery: 'dm' as const,
        messageId: 'm1',
      });
    });
    const controller = new NotifyController(enabledConfig(), {
      getSnapshot: () => ({ state: 'ready' }),
      sendTimerNotify,
    } as never);

    const first = await controller.notifyTimer(SECRET, validBody);
    expect(first).toEqual({
      ok: true,
      delivery: 'dm',
      duplicate: false,
      messageId: 'm1',
    });
    expect(sendTimerNotify).toHaveBeenCalledTimes(1);
    expect(sendTimerNotify.mock.calls[0]?.[0]?.content).toContain('DESTILED');
    expect(sendTimerNotify.mock.calls[0]?.[0]?.content).toContain('http://127.0.0.1:3000/timers');

    const second = await controller.notifyTimer(SECRET, validBody);
    expect(second.duplicate).toBe(true);
    expect(second.messageId).toBeNull();
    expect(sendTimerNotify).toHaveBeenCalledTimes(1);
  });

  it('fails gracefully when Discord DMs are closed', async () => {
    const { NotifyDmClosedError } =
      await import('../../infrastructure/discord/discord-js-adapter.js');
    const sendTimerNotify = vi.fn(() => Promise.reject(new NotifyDmClosedError()));
    const controller = new NotifyController(enabledConfig(), {
      getSnapshot: () => ({ state: 'ready' }),
      sendTimerNotify,
    } as never);

    const result = await controller.notifyTimer(SECRET, {
      ...validBody,
      idempotencyKey: 'dm-closed-1',
    });
    expect(result).toEqual({
      ok: true,
      delivery: 'dm',
      duplicate: false,
      messageId: null,
      skipped: 'dms_closed',
    });
  });

  it('registers watchers and fans out reset notify with buttons', async () => {
    const sendTimerNotify = vi.fn(() => Promise.resolve({ delivery: 'dm', messageId: 'm-reset' }));
    const controller = new NotifyController(
      enabledConfig(),
      {
        getSnapshot: () => ({ state: 'ready' }),
        sendTimerNotify,
      } as never,
      mockTechnikaStore() as never,
    );

    controller.watchTimerRoom(SECRET, {
      discordUserId: '222222222222222222',
      mapKey: 'a1',
      channel: 1,
    });

    const result = await controller.notifyTimerReset(SECRET, {
      actorDiscordUserId: '111111111111111111',
      title: 'Zbicie',
      body: 'Tester potwierdził zbicie.',
      deepLinkUrl: 'http://127.0.0.1:3000/timers',
      mapKey: 'a1',
      channel: 1,
      timerKey: 'metin-a1-ch1-x',
      roomSummary: ['Inny — okno'],
    });
    expect(result.ok).toBe(true);
    expect(result.sent).toBe(1);
    expect(sendTimerNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: '222222222222222222',
        components: expect.any(Array) as unknown as readonly unknown[],
      }),
    );
  });
});
