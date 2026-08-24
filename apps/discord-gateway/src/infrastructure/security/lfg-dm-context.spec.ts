import { describe, expect, it } from 'vitest';

import { opaqueIdFromUuid } from '@v2/hub-core';

import { decodeLfgDmContext, encodeLfgDmContext } from './lfg-dm-context.js';
import { createLfgDmCustomId, parseLfgDmCustomId } from './lfg-dm-signed-custom-id.js';

const secret = 's'.repeat(32);
const activityOpaque = 'a1b2c3d4e5f6';
const intentOpaque = opaqueIdFromUuid('22222222-2222-4222-8222-222222222222');
const guildId = '1534228693017432124';

describe('lfg-dm-context + signed custom ids', () => {
  it('round-trips intent context with role under 100 chars', () => {
    const param = encodeLfgDmContext({
      kind: 'intent',
      intentOpaqueId: intentOpaque,
      guildId,
      partyRole: 'BUFF',
    });
    const raw = createLfgDmCustomId(activityOpaque, 'join', secret, param);
    expect(raw.length).toBeLessThanOrEqual(100);
    const parsed = parseLfgDmCustomId(raw, secret);
    expect(decodeLfgDmContext(parsed.param)).toEqual({
      kind: 'intent',
      intentOpaqueId: intentOpaque,
      guildId,
      partyRole: 'BUFF',
    });
  });

  it('parses legacy guildId:role ephemeral context', () => {
    expect(decodeLfgDmContext(`${guildId}:TANK`)).toEqual({
      kind: 'ephemeral',
      guildId,
      partyRole: 'TANK',
    });
  });

  it('rejoins multi-segment params when parsing signed ids', () => {
    const raw = createLfgDmCustomId(activityOpaque, 'join', secret, `${guildId}:DPS`);
    const parsed = parseLfgDmCustomId(raw, secret);
    expect(parsed.param).toBe(`${guildId}:DPS`);
  });
});
