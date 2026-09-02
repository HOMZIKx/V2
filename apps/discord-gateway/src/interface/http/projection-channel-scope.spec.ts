import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  assertProjectionChannelAllowed,
  resolveAllowedProjectionGuild,
} from './projection-channel-scope.js';

const allowedGuild = '1534228693017432124';

describe('resolveAllowedProjectionGuild', () => {
  it('uses the configured P4 guild', () => {
    expect(resolveAllowedProjectionGuild({ configuredGuildId: allowedGuild })).toBe(allowedGuild);
  });

  it('rejects a payload guild outside the configured P4 guild', () => {
    expect(() =>
      resolveAllowedProjectionGuild({
        configuredGuildId: allowedGuild,
        payloadGuildId: '999',
      }),
    ).toThrow(HttpException);
  });

  it('allows a payload guild listed in multi-guild allowlist', () => {
    expect(
      resolveAllowedProjectionGuild({
        configuredGuildId: allowedGuild,
        allowedGuildIds: [allowedGuild, 'guild-b'],
        payloadGuildId: 'guild-b',
      }),
    ).toBe('guild-b');
  });
});

describe('assertProjectionChannelAllowed', () => {
  it('allows a valid guild channel', async () => {
    const validate = vi.fn(() => Promise.resolve({ ok: true, code: 'CHANNEL_OK' as const }));
    await expect(
      assertProjectionChannelAllowed({
        gateway: { validateActivityPublishChannel: validate },
        allowedGuildId: allowedGuild,
        channelId: 'c-ok',
      }),
    ).resolves.toBeUndefined();
    expect(validate).toHaveBeenCalledWith(allowedGuild, 'c-ok');
  });

  it('rejects a channel from another guild', async () => {
    await expect(
      assertProjectionChannelAllowed({
        gateway: {
          validateActivityPublishChannel: () =>
            Promise.resolve({ ok: false, code: 'CHANNEL_WRONG_GUILD' }),
        },
        allowedGuildId: allowedGuild,
        channelId: 'c-other',
      }),
    ).rejects.toMatchObject({
      status: 403,
      response: { detail: 'Channel is outside the allowed guild.' },
    });
  });

  it('rejects a DM or unsupported channel', async () => {
    await expect(
      assertProjectionChannelAllowed({
        gateway: {
          validateActivityPublishChannel: () =>
            Promise.resolve({ ok: false, code: 'CHANNEL_UNSUPPORTED' }),
        },
        allowedGuildId: allowedGuild,
        channelId: 'dm-1',
      }),
    ).rejects.toMatchObject({ status: 400, response: { detail: 'Channel type is not allowed.' } });
  });

  it('rejects missing bot permissions', async () => {
    await expect(
      assertProjectionChannelAllowed({
        gateway: {
          validateActivityPublishChannel: () =>
            Promise.resolve({ ok: false, code: 'BOT_PERMISSION_MISSING' }),
        },
        allowedGuildId: allowedGuild,
        channelId: 'c-locked',
      }),
    ).rejects.toMatchObject({
      status: 403,
      response: { detail: 'Bot is missing required channel permissions.' },
    });
  });
});
