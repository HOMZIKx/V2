import fs from 'node:fs';

const equipmentPath = 'apps/web/app/teams/[teamId]/characters/[characterId]/character-equipment.tsx';
const storePath = 'apps/web/src/player-store.ts';
const storeSpecPath = 'apps/web/src/player-store.spec.ts';
const notifyPath = 'apps/web/src/character-timer-discord-notify.ts';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) {
    if (source.includes(after)) return source;
    throw new Error(`Patch target not found: ${label}`);
  }
  const second = source.indexOf(before, first + before.length);
  if (second >= 0) throw new Error(`Patch target is ambiguous: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let equipment = read(equipmentPath);

equipment = replaceOnce(
  equipment,
  `  isNotifyPrefEnabled,\n  listTeamNotifyDiscordRecipients,\n`,
  ``,
  'remove prefs-gated timer imports',
);

equipment = replaceOnce(
  equipment,
  `import {\n  notifyCharacterProgressTimer,\n  scheduleCharacterTimerReminder,\n} from '../../../../../src/character-timer-discord-notify';`,
  `import { notifyCharacterProgressTimer } from '../../../../../src/character-timer-discord-notify';`,
  'remove browser timer scheduler import',
);

equipment = replaceOnce(
  equipment,
  `              const iconPath = timerIconPath(timer);\n              const running = timer.status !== 'ready';\n              const progress = timerProgressPercent(timer, new Date(timerClock));\n              return (\n                <article\n                  className={\`eq-char-timer\${running ? ' is-running' : ' is-ready'}\`}\n                  key={timer.id}\n                >\n                  <div className="eq-char-timer-row">\n                    <span>\n                      {iconPath ? <img alt="" src={iconPath} /> : <Icon name="clock" size={18} />}\n                    </span>\n                    <div>\n                      <strong>{timer.label}</strong>\n                      <span>\n                        {running ? 'Odliczanie' : 'Gotowe'}\n                        {timer.remainingLabel ? \` · \${timer.remainingLabel}\` : ''}\n                      </span>\n                    </div>\n                    <button\n                      disabled={!writesEnabled || running}\n                      onClick={() => {\n                        if (running) return;\n                        onCompleteTimer(timer.id, timer.label, entry.name);\n                      }}\n                      title={\n                        running ? 'Timer w toku — edycja zablokowana' : 'Jeden klik uruchamia cykl'\n                      }\n                      type="button"\n                    >\n                      {running ? 'Zablokowany' : 'Start'}\n                    </button>`,
  `              const iconPath = timerIconPath(timer);\n              const running = timer.status !== 'ready';\n              const readyAtMs = timer.readyAtIso ? Date.parse(timer.readyAtIso) : Number.NaN;\n              const lockedDue =\n                timer.status === 'running' &&\n                ((Number.isFinite(readyAtMs) && readyAtMs <= timerClock) ||\n                  (timer.progressPercent >= 100 &&\n                    timer.remainingLabel === 'gotowe · zablokowane'));\n              const blocked = running && !lockedDue;\n              const progress = timerProgressPercent(timer, new Date(timerClock));\n              return (\n                <article\n                  className={\`eq-char-timer\${blocked ? ' is-running' : ' is-ready'}\`}\n                  key={timer.id}\n                >\n                  <div className="eq-char-timer-row">\n                    <span>\n                      {iconPath ? <img alt="" src={iconPath} /> : <Icon name="clock" size={18} />}\n                    </span>\n                    <div>\n                      <strong>{timer.label}</strong>\n                      <span>\n                        {lockedDue ? 'Gotowe · zablokowane' : running ? 'Odliczanie' : 'Gotowe'}\n                        {!lockedDue && timer.remainingLabel ? \` · \${timer.remainingLabel}\` : ''}\n                      </span>\n                    </div>\n                    <button\n                      disabled={!writesEnabled || blocked}\n                      onClick={() => {\n                        if (blocked) return;\n                        onCompleteTimer(timer.id, timer.label, entry.name);\n                      }}\n                      title={\n                        lockedDue\n                          ? 'Timer zakończony — odświeżenie uruchomi kolejny cykl'\n                          : blocked\n                            ? 'Timer w toku — edycja zablokowana'\n                            : 'Jeden klik uruchamia cykl'\n                      }\n                      type="button"\n                    >\n                      {lockedDue ? 'Odśwież' : blocked ? 'Zablokowany' : 'Start'}\n                    </button>`,
  'locked due timer UI action',
);

const notifyBlockStart = equipment.indexOf(
  '        // Discord PW for character ProgressTimers (not map/metin). Additive; EQ UI unchanged.',
);
const notifyBlockEndMarker = '      }}\n      onRemoveTimer=';
const notifyBlockEnd =
  notifyBlockStart >= 0 ? equipment.indexOf(notifyBlockEndMarker, notifyBlockStart) : -1;
if (notifyBlockStart >= 0 && notifyBlockEnd >= 0) {
  const replacement = `        // Discord is the team coordination layer: every resolvable workspace member\n        // receives the same full timer card. Browser-local scheduling is deliberately absent.\n        if (timer && workspace) {\n          const after = {\n            ...timer,\n            status: 'running' as const,\n            operationId,\n          };\n          void notifyCharacterProgressTimer({\n            workspace,\n            timer: after,\n            viewer: state.viewer,\n            actorName: state.viewer?.displayName ?? 'Gracz',\n            kind: 'reset',\n          }).then((result) => {\n            if (result.sent > 0) {\n              setAnnouncement((prev) => \`\${prev} Wysłano PW Discord do zespołu (\${result.sent}).\`);\n              return;\n            }\n            const err = result.results.find((row) => !row.ok);\n            if (err && !err.ok) {\n              setAnnouncement((prev) => \`\${prev} Discord PW: \${err.error}.\`);\n              return;\n            }\n            setAnnouncement((prev) => \`\${prev} (Brak członków zespołu z podpiętym Discordem.)\`);\n          });\n        }\n`;
  equipment =
    equipment.slice(0, notifyBlockStart) + replacement + equipment.slice(notifyBlockEnd);
} else if (!equipment.includes('Discord is the team coordination layer')) {
  throw new Error('Patch target not found: web team timer notify block');
}

write(equipmentPath, equipment);

let store = read(storePath);
store = replaceOnce(
  store,
  `    const existing = workspace.timers.find((timer) => timer.id === timerId);\n    if (!existing) return workspace;\n    if (existing.status !== 'ready') return workspace;\n    const kind = existing.kind ?? inferProgressionKind(existing.label);`,
  `    const existing = workspace.timers.find((timer) => timer.id === timerId);\n    if (!existing) return workspace;\n    const readyAtMs = existing.readyAtIso ? Date.parse(existing.readyAtIso) : Number.NaN;\n    const dueByClock =\n      existing.status === 'running' &&\n      Number.isFinite(readyAtMs) &&\n      readyAtMs <= Date.now();\n    const lockedDueMarker =\n      existing.status === 'running' &&\n      existing.progressPercent >= 100 &&\n      existing.remainingLabel === 'gotowe · zablokowane';\n    if (existing.status !== 'ready' && !dueByClock && !lockedDueMarker) return workspace;\n    const kind = existing.kind ?? inferProgressionKind(existing.label);`,
  'allow explicit refresh only after timer is due',
);
write(storePath, store);

let storeSpec = read(storeSpecPath);
const existingTimerTest = `  it('resets Project Hard timers with kind-specific cooldowns', () => {\n    let state = seedDemoData(completeDiscordAuth(createInitialPlayerStore(), 'authenticated'));\n    const timerId = 'horse-aalpsik';\n    state = markTimerDone(state, 'asteria', timerId, 'op-1');\n    const first = state.workspaces[0]!.timers.find((timer) => timer.id === timerId)!;\n    expect(first.remainingLabel).toContain('23 h');\n    state = markTimerDone(state, 'asteria', timerId, 'op-1');\n    const second = state.workspaces[0]!.timers.find((timer) => timer.id === timerId)!;\n    expect(second.operationId).toBe('op-1');\n  });`;
const timerTests = `${existingTimerTest}\n\n  it('refreshes a locked due timer but never an early running timer', () => {\n    const timerId = 'horse-aalpsik';\n    let dueState = seedDemoData(\n      completeDiscordAuth(createInitialPlayerStore(), 'authenticated'),\n    );\n    dueState = {\n      ...dueState,\n      workspaces: dueState.workspaces.map((workspace) =>\n        workspace.id === 'asteria'\n          ? {\n              ...workspace,\n              timers: workspace.timers.map((timer) =>\n                timer.id === timerId\n                  ? {\n                      ...timer,\n                      status: 'running' as const,\n                      readyAtIso: new Date(Date.now() - 60_000).toISOString(),\n                      remainingLabel: 'gotowe · zablokowane',\n                      progressPercent: 100,\n                    }\n                  : timer,\n              ),\n            }\n          : workspace,\n      ),\n    };\n\n    dueState = markTimerDone(dueState, 'asteria', timerId, 'op-due');\n    const restarted = dueState.workspaces[0]!.timers.find((timer) => timer.id === timerId)!;\n    expect(restarted.operationId).toBe('op-due');\n    expect(restarted.progressPercent).toBe(4);\n    expect(Date.parse(restarted.readyAtIso!)).toBeGreaterThan(Date.now());\n\n    let earlyState = seedDemoData(\n      completeDiscordAuth(createInitialPlayerStore(), 'authenticated'),\n    );\n    const earlyReadyAt = new Date(Date.now() + 60 * 60_000).toISOString();\n    earlyState = {\n      ...earlyState,\n      workspaces: earlyState.workspaces.map((workspace) =>\n        workspace.id === 'asteria'\n          ? {\n              ...workspace,\n              timers: workspace.timers.map((timer) =>\n                timer.id === timerId\n                  ? {\n                      ...timer,\n                      status: 'running' as const,\n                      readyAtIso: earlyReadyAt,\n                      remainingLabel: '59 min',\n                      progressPercent: 50,\n                      operationId: 'old-cycle',\n                    }\n                  : timer,\n              ),\n            }\n          : workspace,\n      ),\n    };\n\n    const rejected = markTimerDone(earlyState, 'asteria', timerId, 'must-not-start');\n    const stillRunning = rejected.workspaces[0]!.timers.find((timer) => timer.id === timerId)!;\n    expect(stillRunning.operationId).toBe('old-cycle');\n    expect(stillRunning.readyAtIso).toBe(earlyReadyAt);\n  });`;
storeSpec = replaceOnce(
  storeSpec,
  existingTimerTest,
  timerTests,
  'locked due player-store tests',
);
write(storeSpecPath, storeSpec);

let notify = read(notifyPath);
notify = replaceOnce(
  notify,
  `  const actorDiscord =\n    ctx.viewer?.discordAccountId?.trim() &&\n    /^\\d{17,20}$/.test(ctx.viewer.discordAccountId.trim())\n      ? ctx.viewer.discordAccountId.trim()\n      : null;`,
  `  const actorMember = ctx.workspace.members.find((member) => member.id === ctx.viewer?.id) ?? null;\n  const actorDiscord = actorMember\n    ? resolveMemberDiscordAccountId(actorMember, ctx.viewer)\n    : ctx.viewer?.discordAccountId?.trim() && /^\\d{17,20}$/.test(ctx.viewer.discordAccountId.trim())\n      ? ctx.viewer.discordAccountId.trim()\n      : null;`,
  'resolve actor from workspace roster',
);
notify = replaceOnce(
  notify,
  `  const directRecipients =\n    ctx.kind === 'reset'\n      ? recipients.filter((id) => id === actorDiscord)\n      : recipients;`,
  `  const directRecipients =\n    ctx.kind === 'reset'\n      ? actorDiscord\n        ? recipients.filter((id) => id === actorDiscord)\n        : recipients\n      : recipients;`,
  'fallback reset fanout when actor Discord id is indirect',
);
write(notifyPath, notify);

console.log('Focused team timer web patch applied.');
