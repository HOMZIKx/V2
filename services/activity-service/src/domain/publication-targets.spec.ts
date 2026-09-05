import { describe, expect, it } from 'vitest';

import { normalizePublicationTargets } from './publication-targets.js';

describe('normalizePublicationTargets', () => {
  it('returns home target alone', () => {
    expect(
      normalizePublicationTargets({
        homeGuildId: 'g-home',
        homeChannelId: 'c-home',
      }),
    ).toEqual([{ guildId: 'g-home', channelId: 'c-home' }]);
  });

  it('merges additional guilds and dedupes home', () => {
    const result = normalizePublicationTargets({
      homeGuildId: 'g-home',
      homeChannelId: 'c-home',
      targets: [
        { guildId: 'g-home', channelId: 'c-home-override' },
        { guildId: 'g-b', channelId: 'c-b', participantLimit: 4 },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result.find((t) => t.guildId === 'g-home')?.channelId).toBe('c-home-override');
    expect(result.find((t) => t.guildId === 'g-b')).toEqual({
      guildId: 'g-b',
      channelId: 'c-b',
      participantLimit: 4,
    });
  });
});
