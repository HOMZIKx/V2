import { describe, expect, it } from 'vitest';

import { renderKingdomWarReminder } from './kingdom-war-renderer.js';
import { renderTimerNotifyMessage } from './timer-notify-renderer.js';

function componentRows(message: { readonly components?: readonly unknown[] }): Array<{
  readonly components?: Array<{ readonly label?: string; readonly disabled?: boolean }>;
}> {
  return (message.components ?? []).map((component) => {
    if (component && typeof component === 'object' && 'toJSON' in component) {
      const toJSON = (component as { toJSON: () => unknown }).toJSON;
      return toJSON.call(component) as {
        components?: Array<{ label?: string; disabled?: boolean }>;
      };
    }
    return component as { components?: Array<{ label?: string; disabled?: boolean }> };
  });
}

describe('team coordination Discord renderers', () => {
  it('renders timer names as actions and disables a future timer', () => {
    const message = renderTimerNotifyMessage({
      payload: {
        discordUserId: '111111111111111111',
        title: 'Timery',
        body: 'Stan',
        deepLinkUrl: 'https://desapp.zeabur.app/teams/a/characters/b?view=timers',
        workspaceId: 'a',
        characterId: 'b',
        timerId: 'due',
        timerLabel: 'Kamień Duchowy',
        liveTimers: [
          {
            id: 'due',
            label: 'Kamień Duchowy',
            status: 'ready',
            remainingLabel: 'gotowe',
          },
          {
            id: 'future',
            label: 'Księga umiejętności',
            status: 'running',
            remainingLabel: 'w toku',
            readyAtIso: '2099-01-01T00:00:00.000Z',
          },
        ],
        includeButtons: true,
      },
      content: 'test',
      signingSecret: 'test-signing-secret',
      includeButtons: true,
    });

    const rows = componentRows(message);
    const buttons = rows.flatMap((row) => row.components ?? []);
    expect(buttons.some((button) => button.label === 'Kamień Duchowy' && button.disabled === false)).toBe(true);
    expect(
      buttons.some(
        (button) => button.label === 'Księga umiejętności' && button.disabled === true,
      ),
    ).toBe(true);
    expect(buttons.some((button) => button.label === 'Otwórz timery')).toBe(true);
  });

  it('renders war roster as named buttons and disables claimed characters', () => {
    const message = renderKingdomWarReminder({
      config: {
        enabled: true,
        warAt: '20:00',
        notifyMinutesBefore: 30,
        maxClaimsPerUser: 3,
        messageTemplate: 'Start {{warAt}}',
      },
      signingSecret: 'test-signing-secret',
      claims: { kuzyn: '111111111111111111' },
      roster: [
        { id: 'kuzyn', name: 'KuzynPasek' },
        { id: 'szaman', name: 'SzamanBuff' },
      ],
    });

    const rows = componentRows(message);
    const buttons = rows.flatMap((row) => row.components ?? []);
    expect(buttons.some((button) => button.label === 'KuzynPasek' && button.disabled === true)).toBe(true);
    expect(buttons.some((button) => button.label === 'SzamanBuff' && button.disabled === false)).toBe(true);
    expect(String(message.content)).toContain('KuzynPasek');
    expect(String(message.content)).toContain('SzamanBuff');
  });
});
