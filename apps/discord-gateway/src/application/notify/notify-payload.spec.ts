import { describe, expect, it } from 'vitest';

import {
  formatTimerNotifyContent,
  shouldIncludeTimerButtons,
  TimerNotifyPayloadSchema,
} from './notify-payload.js';

describe('TimerNotifyPayload', () => {
  it('accepts a minimal valid payload', () => {
    const parsed = TimerNotifyPayloadSchema.parse({
      discordUserId: '111111111111111111',
      title: 'Metin gotowy',
      body: 'Okno respawnu właśnie się otworzyło.',
      deepLinkUrl: 'http://127.0.0.1:3000/timers',
    });
    expect(parsed.discordUserId).toBe('111111111111111111');
  });

  it('rejects invalid snowflake', () => {
    const result = TimerNotifyPayloadSchema.safeParse({
      discordUserId: 'not-a-id',
      title: 'x',
      body: 'y',
      deepLinkUrl: 'http://127.0.0.1:3000/timers',
    });
    expect(result.success).toBe(false);
  });

  it('formats Polish DM content with deep link and room summary', () => {
    const content = formatTimerNotifyContent({
      discordUserId: '111111111111111111',
      title: 'Timer zbity',
      body: 'Ktoś potwierdził zbicie w pokoju.',
      deepLinkUrl: 'http://127.0.0.1:3000/timers',
      mapKey: 'a1',
      channel: 2,
      timerKey: 'metin-1',
      actorName: 'Mateusz',
      roomSummary: ['Boss X — odliczanie', 'Metin Y — okno'],
    });
    expect(content).toContain('DESTILED · Timer');
    expect(content).toContain('Ktoś potwierdził zbicie w pokoju.');
    expect(content).toContain('Mapa: a1 · CH2');
    expect(content).toContain('Inne timery w pokoju:');
    expect(content).toContain('Boss X — odliczanie');
    expect(content).toContain('http://127.0.0.1:3000/timers');
  });

  it('includes buttons by default when timer coordinates present', () => {
    expect(
      shouldIncludeTimerButtons({
        discordUserId: '111111111111111111',
        title: 't',
        body: 'b',
        deepLinkUrl: 'http://127.0.0.1:3000/timers',
        mapKey: 'a1',
        channel: 1,
        timerKey: 'metin-a1-ch1-x',
      }),
    ).toBe(true);
    expect(
      shouldIncludeTimerButtons({
        discordUserId: '111111111111111111',
        title: 't',
        body: 'b',
        deepLinkUrl: 'http://127.0.0.1:3000/timers',
        includeButtons: false,
        mapKey: 'a1',
        channel: 1,
        timerKey: 'metin-a1-ch1-x',
      }),
    ).toBe(false);
  });
});
