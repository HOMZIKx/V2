import fs from 'node:fs';

function replaceOnce(path, before, after, label) {
  const source = fs.readFileSync(path, 'utf8');
  if (source.includes(after)) return;
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Patch target not found: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Patch target is ambiguous: ${label}`);
  }
  fs.writeFileSync(
    path,
    source.slice(0, index) + after + source.slice(index + before.length),
    'utf8',
  );
}

replaceOnce(
  'apps/web/src/character-timer-discord-notify.ts',
  `export function scheduleCharacterTimerReminder(_input: {\n  readonly endsAtIso: string | null;\n  readonly reminderMinutesBefore: number;\n  readonly fire: () => void;\n}): (() => void) | null {\n  return null;\n}`,
  `export function scheduleCharacterTimerReminder(_input: {\n  readonly endsAtIso: string | null;\n  readonly reminderMinutesBefore: number;\n  readonly fire: () => void;\n}): (() => void) | null {\n  void _input;\n  return null;\n}`,
  'browser scheduler unused argument',
);

replaceOnce(
  'apps/web/src/character-timer-discord-notify.spec.ts',
  `    expect(postDiscordTimerResetNotify).toHaveBeenCalledWith(\n      expect.objectContaining({\n        recipientDiscordUserIds: ['223456789012345678'],\n        liveTimers: expect.arrayContaining([\n          expect.objectContaining({ id: 'timer-ksiega-1' }),\n          expect.objectContaining({ id: 'timer-kamien-1' }),\n        ]),\n      }),\n    );\n    expect(postDiscordTimerNotify).toHaveBeenCalledWith(\n      expect.objectContaining({\n        discordUserId: '123456789012345678',\n        characterId: 'nerwnicht',\n        timerId: 'timer-ksiega-1',\n        timerLabel: 'Księga umiejętności',\n        liveTimers: expect.arrayContaining([\n          expect.objectContaining({ id: 'timer-ksiega-1' }),\n          expect.objectContaining({ id: 'timer-kamien-1' }),\n        ]),\n        includeButtons: true,\n        kind: 'reset',\n      }),\n    );`,
  `    expect(postDiscordTimerResetNotify).toHaveBeenCalledWith(\n      expect.objectContaining({\n        recipientDiscordUserIds: ['223456789012345678'],\n      }),\n    );\n    const resetPayload = vi.mocked(postDiscordTimerResetNotify).mock.calls[0]?.[0];\n    expect(resetPayload?.liveTimers?.map((timer) => timer.id)).toEqual([\n      'timer-ksiega-1',\n      'timer-kamien-1',\n    ]);\n\n    expect(postDiscordTimerNotify).toHaveBeenCalledWith(\n      expect.objectContaining({\n        discordUserId: '123456789012345678',\n        characterId: 'nerwnicht',\n        timerId: 'timer-ksiega-1',\n        timerLabel: 'Księga umiejętności',\n        includeButtons: true,\n        kind: 'reset',\n      }),\n    );\n    const actorPayload = vi.mocked(postDiscordTimerNotify).mock.calls[0]?.[0];\n    expect(actorPayload?.liveTimers?.map((timer) => timer.id)).toEqual([\n      'timer-ksiega-1',\n      'timer-kamien-1',\n    ]);`,
  'typed live timer mock assertions',
);

console.log('Focused web build lint fixes applied.');
