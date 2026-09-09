import { describe, expect, it } from 'vitest';

import type {
  CharacterTimerPanelSnapshot,
  CharacterTimerPanelTimer,
} from '../../infrastructure/player-team/read-character-timer-panel.js';
import { renderCharacterTimerDailyPanel } from './character-timer-daily-panel-renderer.js';

function componentJson(message: { readonly components?: readonly unknown[] }): unknown[] {
  return (message.components ?? []).map((component) => {
    if (component && typeof component === 'object' && 'toJSON' in component) {
      const toJSON = (component as { toJSON: () => unknown }).toJSON;
      return toJSON.call(component);
    }
    return component;
  });
}

function serialized(message: { readonly components?: readonly unknown[] }): string {
  return JSON.stringify(componentJson(message));
}

function countDiscordComponents(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countDiscordComponents(item), 0);
  if (!value || typeof value !== 'object') return 0;

  const record = value as Record<string, unknown>;
  const own = typeof record.type === 'number' ? 1 : 0;
  const nested = Object.values(record).reduce((sum, item) => sum + countDiscordComponents(item), 0);
  return own + nested;
}

const snapshot: CharacterTimerPanelSnapshot = {
  workspaceId: 'team-destiled',
  workspaceName: 'Kuzyni',
  memberId: 'member-mateusz',
  selectedCharacterId: 'lucjan',
  selectedCharacter: {
    id: 'lucjan',
    name: 'Lucjan Desti',
    characterClass: 'warrior',
    skillPath: 'warrior_body',
    imagePath: '/game/characters/lucjan.png',
  },
  characters: [
    {
      id: 'lucjan',
      name: 'Lucjan Desti',
      characterClass: 'warrior',
      skillPath: 'warrior_body',
      imagePath: '/game/characters/lucjan.png',
    },
    {
      id: 'buff',
      name: 'Desti Buff',
      characterClass: 'shaman',
      skillPath: 'shaman_dragon',
      imagePath: null,
    },
    {
      id: 'ninja-blade',
      name: 'Desti Ninja',
      characterClass: 'ninja',
      skillPath: 'ninja_blade',
      imagePath: null,
    },
    {
      id: 'ninja-archery',
      name: 'Desti Archer',
      characterClass: 'ninja',
      skillPath: 'ninja_archery',
      imagePath: null,
    },
    {
      id: 'sura-magic',
      name: 'Desti BM',
      characterClass: 'sura',
      skillPath: 'sura_magic',
      imagePath: null,
    },
    {
      id: 'shaman-heal',
      name: 'Desti Heal',
      characterClass: 'shaman',
      skillPath: 'shaman_heal',
      imagePath: null,
    },
  ],
  timers: [
    {
      id: 'skill-book',
      characterId: 'lucjan',
      label: 'Księga umiejętności',
      status: 'ready',
      remainingLabel: 'gotowe',
      detail: 'Timer ręczny zespołu · co 5 min · tekst techniczny nie może wejść do PW',
      readyAtIso: '2026-09-09T17:00:00.000Z',
      iconPath: '/game/items/wiki/book.png',
      lastConfirmedAt: null,
    },
    {
      id: 'spirit-stone',
      characterId: 'lucjan',
      label: 'Kamień Duchowy',
      status: 'running',
      remainingLabel: '2 godz.',
      detail: null,
      readyAtIso: '2026-09-09T20:00:00.000Z',
      iconPath: '/game/items/wiki/stone.png',
      lastConfirmedAt: null,
    },
  ],
};

function readyIconTimer(index: number): CharacterTimerPanelTimer {
  return {
    id: `ready-${index}`,
    characterId: 'lucjan',
    label: `Timer ${index}`,
    status: 'ready',
    remainingLabel: 'gotowe',
    detail: null,
    readyAtIso: '2026-09-09T17:00:00.000Z',
    iconPath: `/game/items/wiki/timer-${index}.png`,
    lastConfirmedAt: null,
  };
}

describe('daily character timer PW panel', () => {
  it('renders one compact I DESTILED panel with player-facing labels only', () => {
    const message = renderCharacterTimerDailyPanel({
      snapshot,
      signingSecret: 'test-signing-secret',
      nowMs: Date.parse('2026-09-09T18:00:00.000Z'),
    });
    const json = serialized(message);

    expect(message.components).toHaveLength(1);
    expect(json).toContain('I DESTILED · TIMERY');
    expect(json).toContain('Lucjan Desti');
    expect(json).toContain('Wojownik · Body');
    expect(json).toContain('Księga umiejętności');
    expect(json).toContain('GOTOWE');
    expect(json).toContain('Kamień Duchowy');
    expect(json).toContain('W TRAKCIE');
    expect(json).toContain('https://desapp.zeabur.app/game/characters/lucjan.png');
    expect(json).toContain('https://desapp.zeabur.app/game/items/wiki/book.png');

    expect(json).not.toContain('warrior_body');
    expect(json).not.toContain('panel aktualizuje się');
    expect(json).not.toContain('natywnym timestampem');
    expect(json).not.toContain('Timer ręczny zespołu');
  });

  it('uses Polish labels for the skill-path keys stored by the app', () => {
    const message = renderCharacterTimerDailyPanel({
      snapshot,
      signingSecret: 'test-signing-secret',
      nowMs: Date.parse('2026-09-09T18:00:00.000Z'),
    });
    const json = serialized(message);

    expect(json).toContain('Ninja · Sztylety');
    expect(json).toContain('Ninja · Łuk');
    expect(json).toContain('Sura · BM');
    expect(json).toContain('Szaman · Leczenie');
    expect(json).not.toContain('Ninja · Blade');
    expect(json).not.toContain('Ninja · Archery');
    expect(json).not.toContain('Sura · Magic');
    expect(json).not.toContain('Szaman · Heal');
  });

  it('keeps character switching and only exposes completion actions for ready timers', () => {
    const message = renderCharacterTimerDailyPanel({
      snapshot,
      signingSecret: 'test-signing-secret',
      nowMs: Date.parse('2026-09-09T18:00:00.000Z'),
    });
    const json = serialized(message);

    expect(json).toContain('Postać · Lucjan Desti');
    expect(json).toContain('Desti Buff');
    expect(json).toContain('Szaman · Smok');
    expect(json).toContain('Zrobione · Księga umiejętności');
    expect(json).not.toContain('Zrobione · Kamień Duchowy');
    expect(json).toContain('Otwórz timery');
    expect(json).toContain('Przypomnij później');
  });

  it('stays within the Discord 40-component limit with twelve icon timers', () => {
    const stressSnapshot: CharacterTimerPanelSnapshot = {
      ...snapshot,
      timers: Array.from({ length: 12 }, (_, index) => readyIconTimer(index + 1)),
    };
    const message = renderCharacterTimerDailyPanel({
      snapshot: stressSnapshot,
      signingSecret: 'test-signing-secret',
      nowMs: Date.parse('2026-09-09T18:00:00.000Z'),
    });
    const jsonValue = componentJson(message);
    const json = JSON.stringify(jsonValue);

    expect(countDiscordComponents(jsonValue)).toBeLessThanOrEqual(40);
    for (let index = 1; index <= 12; index += 1) {
      expect(json).toContain(`Timer ${index}`);
      expect(json).toContain(`Zrobione · Timer ${index}`);
    }
  });
});
