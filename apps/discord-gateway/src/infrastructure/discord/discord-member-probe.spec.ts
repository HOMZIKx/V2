import { describe, expect, it, vi } from 'vitest';

import { probeDiscordGuildMember } from './discord-member-probe.js';

const config = { DISCORD_TOKEN: 'test-bot-token' };

describe('probeDiscordGuildMember', () => {
  it('returns true for an existing guild member', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(
      probeDiscordGuildMember(config, '1543972927719080016', '808066932753563668', fetchImpl),
    ).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://discord.com/api/v10/guilds/1543972927719080016/members/808066932753563668',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ authorization: 'Bot test-bot-token' }),
      }),
    );
  });

  it('returns false only for Discord 404 member-not-found', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 404 }));

    await expect(
      probeDiscordGuildMember(config, '1543972927719080016', '808066932753563668', fetchImpl),
    ).resolves.toBe(false);
  });

  it('propagates gateway/API failures instead of treating them as a kick', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }));

    await expect(
      probeDiscordGuildMember(config, '1543972927719080016', '808066932753563668', fetchImpl),
    ).rejects.toThrow('discord_member_probe_503');
  });
});
