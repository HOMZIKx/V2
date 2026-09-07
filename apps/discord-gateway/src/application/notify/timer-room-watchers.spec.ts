import { beforeEach, describe, expect, it } from 'vitest';

import {
  listTimerRoomWatchersExcept,
  registerTimerRoomWatcher,
  resetTimerRoomWatchersForTests,
} from './timer-room-watchers.js';

describe('timer room watchers', () => {
  beforeEach(() => {
    resetTimerRoomWatchersForTests();
  });

  it('registers and skips actor', () => {
    registerTimerRoomWatcher({ mapKey: 'a1', channel: 1, discordUserId: '111111111111111111' });
    registerTimerRoomWatcher({ mapKey: 'a1', channel: 1, discordUserId: '222222222222222222' });
    expect(
      listTimerRoomWatchersExcept({
        mapKey: 'a1',
        channel: 1,
        exceptDiscordUserId: '111111111111111111',
      }),
    ).toEqual(['222222222222222222']);
  });
});
