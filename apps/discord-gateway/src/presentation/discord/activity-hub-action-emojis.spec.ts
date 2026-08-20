import { describe, expect, it } from 'vitest';

import {
  OWNER_ASSET_UPLOAD_REQUIRED,
  formatHubActionEmojiMarkdown,
  hubActionEmojiOwnerStatus,
  hubActionIconPrefix,
  parseHubActionEmojiConfig,
} from './activity-hub-action-emojis.js';

describe('activity-hub-action-emojis', () => {
  it('returns empty map for missing or invalid JSON without throwing', () => {
    expect(parseHubActionEmojiConfig(undefined)).toEqual({});
    expect(parseHubActionEmojiConfig('')).toEqual({});
    expect(parseHubActionEmojiConfig('{')).toEqual({});
    expect(parseHubActionEmojiConfig('{"create":{"id":"1","name":"x"}}')).toEqual({});
  });

  it('parses valid snowflake emoji refs and notifications alias for inbox', () => {
    const map = parseHubActionEmojiConfig(
      JSON.stringify({
        create: { id: '111111111111111111', name: 'v2_create' },
        lfg: { id: '222222222222222222', name: 'v2_lfg' },
        mine: { id: '333333333333333333', name: 'v2_mine' },
        notifications: { id: '444444444444444444', name: 'v2_inbox' },
      }),
    );
    expect(map.create?.id).toBe('111111111111111111');
    expect(map.inbox?.name).toBe('v2_inbox');
    expect(formatHubActionEmojiMarkdown(map.create!)).toBe('<:v2_create:111111111111111111>');
    expect(hubActionIconPrefix('create', map)).toBe('<:v2_create:111111111111111111> ');
    expect(hubActionEmojiOwnerStatus(map)).toBeNull();
  });

  it('marks OWNER_ASSET_UPLOAD_REQUIRED when any action emoji is missing', () => {
    expect(hubActionEmojiOwnerStatus({})).toBe(OWNER_ASSET_UPLOAD_REQUIRED);
    expect(
      hubActionEmojiOwnerStatus({
        create: { id: '111111111111111111', name: 'v2_create' },
      }),
    ).toBe(OWNER_ASSET_UPLOAD_REQUIRED);
  });
});
