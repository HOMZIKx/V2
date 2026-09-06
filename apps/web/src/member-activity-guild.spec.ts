import { describe, expect, it } from 'vitest';

import {
  DESTILED_GUILD_ID,
  SOJUSZ_GUILD_ID,
  pickMemberActivityGuildFromIds,
} from './member-activity-guild.js';

describe('member activity guild resolution', () => {
  it('prefers Destiled when member of both Destiled and Sojusz', () => {
    const hit = pickMemberActivityGuildFromIds([SOJUSZ_GUILD_ID, DESTILED_GUILD_ID]);
    expect(hit?.guildId).toBe(DESTILED_GUILD_ID);
    expect(hit?.guildName).toBe('Destiled');
  });

  it('uses Sojusz when that is the only known guild', () => {
    const hit = pickMemberActivityGuildFromIds([SOJUSZ_GUILD_ID]);
    expect(hit?.guildId).toBe(SOJUSZ_GUILD_ID);
  });

  it('returns null when no known guilds (honest empty)', () => {
    expect(pickMemberActivityGuildFromIds([])).toBeNull();
    expect(pickMemberActivityGuildFromIds(['999999999999999999'])).toBeNull();
  });
});
