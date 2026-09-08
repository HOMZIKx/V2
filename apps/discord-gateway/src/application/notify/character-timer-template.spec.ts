import { describe, expect, it } from 'vitest';

import { defaultCharacterTimers } from '../technika/capabilities.js';
import { formatCharacterTimerTemplateContent } from './character-timer-template.js';

const payload = {
  discordUserId: '111111111111111111',
  title: 'Kamień Duchowy gotowy',
  body: 'Timer jest gotowy.',
  deepLinkUrl: 'https://desapp.zeabur.app/teams/a/characters/b?view=timers',
  workspaceId: 'a',
  characterId: 'b',
  characterName: 'KuzynPasek',
  timerId: 'soul',
  timerLabel: 'Kamień Duchowy',
  endsAt: '2026-09-08T18:00:00.000Z',
  liveTimers: [
    {
      id: 'soul',
      label: 'Kamień Duchowy',
      status: 'ready',
      remainingLabel: 'gotowe',
    },
    {
      id: 'book',
      label: 'Księga umiejętności',
      status: 'running',
      remainingLabel: '2h',
      readyAtIso: '2026-09-08T20:00:00.000Z',
    },
  ],
  kind: 'reminder' as const,
};

describe('formatCharacterTimerTemplateContent', () => {
  it('uses the configured Technika template and live variables', () => {
    const content = formatCharacterTimerTemplateContent(payload, {
      ...defaultCharacterTimers(),
      reminderMinutesBefore: 45,
      messageTemplate:
        'CUSTOM {{characterName}} | {{timerLabel}} | {{title}} | {{body}} | {{otherTimersSummary}} | {{deepLinkUrl}} | {{reminderMinutesBefore}}',
    });

    expect(content).toContain('CUSTOM KuzynPasek');
    expect(content).toContain('Kamień Duchowy');
    expect(content).toContain('Księga umiejętności');
    expect(content).toContain('https://desapp.zeabur.app/teams/a/characters/b?view=timers');
    expect(content).toContain('| 45');
  });

  it('keeps the default character timer template working', () => {
    const content = formatCharacterTimerTemplateContent(payload, defaultCharacterTimers());

    expect(content).toContain('DESTILED · Timer postaci');
    expect(content).toContain('Kamień Duchowy gotowy');
    expect(content).toContain('Timer jest gotowy.');
    expect(content).toContain('Księga umiejętności');
  });
});
