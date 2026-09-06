import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, from, to) {
  const before = readFileSync(path, 'utf8');
  if (!before.includes(from)) {
    if (before.includes(to)) {
      console.log(`already fixed ${path}`);
      return;
    }
    throw new Error(`Expected pattern not found in ${path}: ${from.slice(0, 120)}`);
  }
  const after = before.replace(from, to);
  writeFileSync(path, after, 'utf8');
  console.log(`fixed ${path}`);
}

// exactOptionalPropertyTypes: member activity collector/store/query
replaceOnce(
  'apps/discord-gateway/src/application/member-activity/member-activity-collector.ts',
  '  readonly displayName?: string;\n};',
  '  readonly displayName?: string | undefined;\n};',
);

replaceOnce(
  'apps/discord-gateway/src/application/member-activity/member-activity-store.ts',
  '    readonly displayName?: string;\n    readonly at?: Date;\n  }): void {\n    if (input.minutes <= 0) return;',
  '    readonly displayName?: string | undefined;\n    readonly at?: Date;\n  }): void {\n    if (input.minutes <= 0) return;',
);
replaceOnce(
  'apps/discord-gateway/src/application/member-activity/member-activity-store.ts',
  '  }): Map<string, { messageCount: number; voiceMinutes: number; displayName?: string }> {\n    const out = new Map<string, { messageCount: number; voiceMinutes: number; displayName?: string }>();',
  '  }): Map<string, { messageCount: number; voiceMinutes: number; displayName?: string | undefined }> {\n    const out = new Map<string, { messageCount: number; voiceMinutes: number; displayName?: string | undefined }>();',
);

replaceOnce(
  'apps/discord-gateway/src/application/member-activity/member-activity-query.ts',
  "  const [y, m, d] = dayKey.split('-').map(Number);\n  const utc = Date.UTC(y, (m as number) - 1, d as number) + deltaDays * 86_400_000;",
  "  const [y = 1970, m = 1, d = 1] = dayKey.split('-').map(Number);\n  const utc = Date.UTC(y, m - 1, d) + deltaDays * 86_400_000;",
);
replaceOnce(
  'apps/discord-gateway/src/application/member-activity/member-activity-query.ts',
  '    readonly guildId?: string;\n    readonly window?: string;\n    readonly topN?: number;\n    readonly q?: string;\n    readonly full?: boolean;',
  '    readonly guildId?: string | undefined;\n    readonly window?: string | undefined;\n    readonly topN?: number | undefined;\n    readonly q?: string | undefined;\n    readonly full?: boolean | undefined;',
);
replaceOnce(
  'apps/discord-gateway/src/application/member-activity/member-activity-query.ts',
  '    readonly guildId?: string;\n    readonly window?: string;\n  }) {',
  '    readonly guildId?: string | undefined;\n    readonly window?: string | undefined;\n  }) {',
);

// Zod v4 + exact optional timer payload
replaceOnce(
  'apps/discord-gateway/src/application/notify/notify-payload.ts',
  '  sampleVars: z.record(z.union([z.string(), z.number()])).optional(),',
  '  sampleVars: z.record(z.string(), z.union([z.string(), z.number()])).optional(),',
);
replaceOnce(
  'apps/discord-gateway/src/application/notify/notify-payload.ts',
  '  readonly remainingLabel?: string;\n}): string {',
  '  readonly remainingLabel?: string | undefined;\n}): string {',
);

// Versioned config test may explicitly pass undefined clock.
replaceOnce(
  'apps/discord-gateway/src/application/technika/versioned-config-store.ts',
  '  readonly now?: () => Date;',
  '  readonly now?: (() => Date) | undefined;',
);

// discord.js edit content cannot be null under current MessageCreateOptions typing.
replaceOnce(
  'apps/discord-gateway/src/infrastructure/discord/discord-js-adapter.ts',
  '      content: input.message.content ?? null,',
  "      content: input.message.content ?? '',",
);

// Specs: array indexing is checked under noUncheckedIndexedAccess.
replaceOnce(
  'apps/discord-gateway/src/infrastructure/player-team/confirm-character-timer.spec.ts',
  '.state.workspaces[0].timers;',
  '.state.workspaces[0]!.timers;',
);
replaceOnce(
  'apps/discord-gateway/src/infrastructure/player-team/confirm-character-timer.spec.ts',
  ').state.workspaces[0].timers.find((t) => t.id === timerId)!;',
  ').state.workspaces[0]!.timers.find((t) => t.id === timerId)!;',
);

// Duplicate block-scoped variable in reminder branch.
replaceOnce(
  'apps/discord-gateway/src/interface/discord/interaction-router.ts',
  '      const minutes = snooze.reminderMinutesBefore;\n      const delayMs = minutes * 60_000;',
  '      const scheduledMinutes = snooze.reminderMinutesBefore;\n      const delayMs = scheduledMinutes * 60_000;',
);

// Web: literal tuple includes() vs general string.
replaceOnce(
  'apps/web/src/member-activity-guild.ts',
  '  const knownIds = MEMBER_ACTIVITY_KNOWN_GUILDS.map((g) => g.id);',
  '  const knownIds: readonly string[] = MEMBER_ACTIVITY_KNOWN_GUILDS.map((g) => g.id);',
);

// Web: Partial<T> preserves readonly modifiers; use mutable construction objects.
replaceOnce(
  'apps/web/src/player-store.ts',
  '  const nextPrefs: Partial<TeamNotifyPrefs> = { ...prev };',
  '  const nextPrefs: { characterTimers?: boolean; kingdomWar?: boolean } = { ...prev };',
);
replaceOnce(
  'apps/web/src/player-store.ts',
  '          const partial: Partial<TeamNotifyPrefs> = {};',
  '          const partial: { characterTimers?: boolean; kingdomWar?: boolean } = {};',
);

// noUncheckedIndexedAccess on regex capture.
replaceOnce(
  'apps/web/src/technik/appearance.ts',
  '  return Number.parseInt(m[1], 16);',
  '  return Number.parseInt(m[1]!, 16);',
);

// exactOptionalPropertyTypes: omit optional panel fields instead of assigning undefined.
replaceOnce(
  'apps/web/src/technik/panels-api.ts',
  "      channelId:\n        typeof p.channelId === 'string'\n          ? p.channelId\n          : fallbackChannelId,\n      kind: typeof p.kind === 'string' ? p.kind : undefined,",
  "      ...(typeof p.channelId === 'string'\n        ? { channelId: p.channelId }\n        : fallbackChannelId\n          ? { channelId: fallbackChannelId }\n          : {}),\n      ...(typeof p.kind === 'string' ? { kind: p.kind } : {}),",
);

// noUncheckedIndexedAccess: splice may theoretically return no item.
replaceOnce(
  'apps/web/src/technik/wyglad-page.tsx',
  '      const [item] = copy.splice(idx, 1);\n      copy.splice(nextIdx, 0, item);',
  '      const [item] = copy.splice(idx, 1);\n      if (!item) return prev;\n      copy.splice(nextIdx, 0, item);',
);

console.log('All known preview TypeScript fixes applied.');
