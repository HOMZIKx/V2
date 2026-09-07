import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, from, to) {
  const before = readFileSync(path, 'utf8');
  if (!before.includes(from)) {
    if (before.includes(to)) {
      console.log(`already fixed ${path}`);
      return;
    }
    throw new Error(`Expected pattern not found in ${path}: ${from.slice(0, 140)}`);
  }
  writeFileSync(path, before.replace(from, to), 'utf8');
  console.log(`fixed ${path}`);
}

// Do not reference ESLint plugins that are not part of the shared flat config.
// For the dependency cases we can express safely, make the dependencies explicit.
replaceOnce(
  'apps/web/app/member-discord-activity.tsx',
  '    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve on account id only\n  }, [discordUserId]);',
  '  }, [discordUserId, viewer]);',
);
replaceOnce(
  'apps/web/src/technik/bot-config-page.tsx',
  '  useEffect(() => {\n    void load();\n    // initial load only\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, []);',
  '  useEffect(() => {\n    void load();\n  }, [load]);',
);
replaceOnce(
  'apps/web/src/technik/wyglad-page.tsx',
  '    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once on mount\n  }, []);',
  '  }, []);',
);
replaceOnce(
  'apps/web/src/technik/wyglad-page.tsx',
  '                        // eslint-disable-next-line @next/next/no-img-element\n                        <img',
  '                        <img',
);

// Vitest mocks return promises but do not need async functions with no await.
replaceOnce(
  'apps/web/src/character-timer-discord-notify.spec.ts',
  'vi.fn(async () => (',
  'vi.fn(() => Promise.resolve(',
);
replaceOnce(
  'apps/web/src/character-timer-discord-notify.spec.ts',
  'postDiscordTimerResetNotify: vi.fn(async () => ({ ok: true, sent: 1 })),',
  'postDiscordTimerResetNotify: vi.fn(() => Promise.resolve({ ok: true, sent: 1 })),',
);
replaceOnce(
  'apps/web/src/discord-notify-api.spec.ts',
  '      vi.fn(async () =>\n        new Response(',
  '      vi.fn(() =>\n        Promise.resolve(new Response(',
);
replaceOnce(
  'apps/web/src/discord-notify-api.spec.ts',
  "          { status: 200, headers: { 'content-type': 'application/json' } },\n        ),\n      ),",
  "          { status: 200, headers: { 'content-type': 'application/json' } },\n        )),\n      ),",
);
replaceOnce(
  'apps/web/src/discord-notify-api.spec.ts',
  "        async () =>\n          new Response(JSON.stringify({ ok: false, error: 'invalid_notify_secret' }), {",
  "        () =>\n          Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'invalid_notify_secret' }), {",
);
replaceOnce(
  'apps/web/src/discord-notify-api.spec.ts',
  "            headers: { 'content-type': 'application/json' },\n          }),\n      ),",
  "            headers: { 'content-type': 'application/json' },\n          })),\n      ),",
);

// Unknown JSON must be narrowed before converting to text.
replaceOnce(
  'apps/web/src/discord-membership-watchdog.ts',
  "      const err = String(o.error ?? o.code ?? '').toLowerCase();",
  "      const rawError = typeof o.error === 'string' ? o.error : typeof o.code === 'string' ? o.code : '';\n      const err = rawError.toLowerCase();",
);
replaceOnce(
  'apps/web/src/technik/appearance.ts',
  "  const action = String(p.action ?? '');",
  "  const action = typeof p.action === 'string' ? p.action : '';",
);
replaceOnce(
  'apps/web/src/technik/appearance.ts',
  "  const styleRaw = String(p.style ?? 'secondary');",
  "  const styleRaw = typeof p.style === 'string' ? p.style : 'secondary';",
);
replaceOnce(
  'apps/web/src/technik/guild-roles-api.ts',
  "      id: String(r.id ?? ''),",
  "      id: typeof r.id === 'string' ? r.id : '',",
);
replaceOnce(
  'apps/web/src/technik/member-activity-api.ts',
  "      : String(r.name ?? r.username ?? 'Gracz');",
  "      : typeof r.name === 'string'\n        ? r.name\n        : typeof r.username === 'string'\n          ? r.username\n          : 'Gracz';",
);
replaceOnce(
  'apps/web/src/technik/member-activity-api.ts',
  "    discordUserId: String(r.discordUserId ?? r.userId ?? r.id ?? ''),",
  "    discordUserId:\n      typeof r.discordUserId === 'string'\n        ? r.discordUserId\n        : typeof r.userId === 'string'\n          ? r.userId\n          : typeof r.id === 'string'\n            ? r.id\n            : '',",
);
replaceOnce(
  'apps/web/src/technik/technik-access.ts',
  "        const id = String(o.discordUserId ?? o.id ?? '');",
  "        const id =\n          typeof o.discordUserId === 'string'\n            ? o.discordUserId\n            : typeof o.id === 'string'\n              ? o.id\n              : '';",
);

// Panels API: all external fields are unknown until narrowed.
replaceOnce(
  'apps/web/src/technik/panels-api.ts',
  'function mapChannels(parsed: Record<string, unknown>): PanelChannel[] {',
  "function stringField(value: unknown, fallback = ''): string {\n  if (typeof value === 'string') return value;\n  if (typeof value === 'number' && Number.isFinite(value)) return String(value);\n  return fallback;\n}\n\nfunction mapChannels(parsed: Record<string, unknown>): PanelChannel[] {",
);
replaceOnce(
  'apps/web/src/technik/panels-api.ts',
  "      id: String(c.id ?? ''),\n      name: typeof c.name === 'string' ? c.name : String(c.id ?? ''),",
  "      id: stringField(c.id),\n      name: typeof c.name === 'string' ? c.name : stringField(c.id),",
);
replaceOnce(
  'apps/web/src/technik/panels-api.ts',
  "      messageId: String(p.messageId ?? p.id ?? p.panelId ?? ''),\n      panelId: String(p.panelId ?? p.messageId ?? p.id ?? ''),",
  '      messageId: stringField(p.messageId ?? p.id ?? p.panelId),\n      panelId: stringField(p.panelId ?? p.messageId ?? p.id),',
);
replaceOnce(
  'apps/web/src/technik/panels-api.ts',
  '  if (Array.isArray(body.enabledActions)) {\n    payload.enabledActions = [...body.enabledActions];\n  }\n  if (Array.isArray(body.customButtons)) {\n    payload.customButtons = body.customButtons.map((b) => ({ ...b }));\n  }',
  '  if (body.enabledActions) {\n    payload.enabledActions = [...body.enabledActions];\n  }\n  if (body.customButtons) {\n    payload.customButtons = body.customButtons.map((b) => ({ ...b }));\n  }',
);
replaceOnce(
  'apps/web/src/technik/panels-api.ts',
  "          messageId: String(parsed.messageId ?? ''),\n          jumpUrl: typeof parsed.jumpUrl === 'string' ? parsed.jumpUrl : '',\n          channelId: String(parsed.channelId ?? body.channelId),\n          panelId: String(parsed.panelId ?? parsed.messageId ?? ''),",
  "          messageId: stringField(parsed.messageId),\n          jumpUrl: typeof parsed.jumpUrl === 'string' ? parsed.jumpUrl : '',\n          channelId: stringField(parsed.channelId, body.channelId),\n          panelId: stringField(parsed.panelId ?? parsed.messageId),",
);
replaceOnce(
  'apps/web/src/technik/panels-api.ts',
  "        messageId: String(parsed.messageId ?? ''),\n        jumpUrl: typeof parsed.jumpUrl === 'string' ? parsed.jumpUrl : '',\n        channelId: String(parsed.channelId ?? body.channelId),",
  "        messageId: stringField(parsed.messageId),\n        jumpUrl: typeof parsed.jumpUrl === 'string' ? parsed.jumpUrl : '',\n        channelId: stringField(parsed.channelId, body.channelId),",
);
replaceOnce(
  'apps/web/src/technik/panels-api.ts',
  '        messageId: String(parsed.messageId ?? body.panelId),',
  '        messageId: stringField(parsed.messageId, body.panelId),',
);
replaceOnce(
  'apps/web/src/technik/panels-api.ts',
  '        data: { deleted: true, messageId: String(parsed.messageId ?? body.messageId) },',
  '        data: { deleted: true, messageId: stringField(parsed.messageId, body.messageId) },',
);
replaceOnce(
  'apps/web/src/technik/panels-api.ts',
  '      data: { deleted: true, messageId: String(parsed.messageId ?? body.messageId) },',
  '      data: { deleted: true, messageId: stringField(parsed.messageId, body.messageId) },',
);

// Remove genuine lint issues instead of suppressing them.
replaceOnce(
  'apps/web/src/player-store.ts',
  '  const { avatarNote: _drop, ...restViewer } = state.viewer;',
  '  const { avatarNote: _drop, ...restViewer } = state.viewer;\n  void _drop;',
);
replaceOnce(
  'apps/web/src/technik/cykliczne-page.tsx',
  'onChange={() => patchRules({ closeAt: value as CloseAt })}',
  'onChange={() => patchRules({ closeAt: value })}',
);
replaceOnce(
  'apps/web/src/technik/use-technika-config.ts',
  '    return partial as BotConfigDraftPartial;',
  '    return partial;',
);

console.log('All known preview Next/ESLint fixes applied.');
