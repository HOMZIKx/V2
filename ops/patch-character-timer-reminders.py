from pathlib import Path


def text(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, value: str) -> None:
    Path(path).write_text(value, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    value = text(path)
    count = value.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, got {count}: {old[:90]!r}')
    write(path, value.replace(old, new, 1))


# Web progression policy: midnight families remind 60m before; every other timer 30m.
path = 'apps/web/src/project-hard-progression.ts'
replace_once(
    path,
    "      if (level === null) return cycle.kind === 'horse';",
    "      if (level === null) return cycle.kind === 'horse' || cycle.kind === 'biologist';",
)
replace_once(
    path,
    "export function isMidnightProgressionKind(kind: ProgressionKind | null): boolean {\n  if (!kind) return false;\n  return progressionCycleByKind(kind).reset === 'midnight';\n}\n",
    "export function isMidnightProgressionKind(kind: ProgressionKind | null): boolean {\n  if (!kind) return false;\n  return progressionCycleByKind(kind).reset === 'midnight';\n}\n\n/** Product reminder policy: midnight reset = 60 min before; every other timer = 30 min. */\nexport function progressionReminderMinutesBefore(kind: ProgressionKind | null): number {\n  return kind && isMidnightProgressionKind(kind) ? 60 : 30;\n}\n",
)

# Existing cards: add only missing Biolog automatically; leave every other PH timer opt-in.
path = 'apps/web/src/player-store.ts'
replace_once(
    path,
    "  progressionTimerLabels,\n  projectHardHorseRules,",
    "  progressionTimerLabels,\n  projectHardBiologistUnlockLevel,\n  projectHardHorseRules,",
)
replace_once(
    path,
    "  // Timers are opt-in per character — never auto-seed missing PH cycles.\n  if (!iconBackfill) return state;\n\n  return updateWorkspace(state, workspaceId, (current, viewer) => ({\n    ...current,\n    revision: current.revision + 1,\n    timers: withIcons,\n    history: [\n      historyEntry(current.id, viewer, {\n        characterId,\n        characterName: character.name,\n        resource: 'timer',\n        title: 'Odświeżono ilustracje cykli PH',\n        detail: 'Księgi / Kamienie / Dowodzenie / Polimorfia / Górnictwo / Jazda / Biolog',\n        revision: current.revision + 1,\n      }),\n      ...current.history,\n    ],\n  }));",
    "  // Existing cards may predate the Biolog row. Backfill only Biolog; every other\n  // PH cycle stays opt-in. Unknown level is treated as potentially eligible so the\n  // row is never silently missing from an incomplete profile.\n  const shouldHaveBiologist =\n    character.level === null || character.level >= projectHardBiologistUnlockLevel;\n  const hasBiologist = withIcons.some(\n    (timer) =>\n      timer.characterId === characterId &&\n      (timer.kind ?? inferProgressionKind(timer.label)) === 'biologist',\n  );\n  const addedBiologist = shouldHaveBiologist && !hasBiologist;\n  const nextTimers = addedBiologist\n    ? [buildProgressionTimer(characterId, 'biologist', character.level), ...withIcons]\n    : withIcons;\n\n  if (!iconBackfill && !addedBiologist) return state;\n\n  return updateWorkspace(state, workspaceId, (current, viewer) => ({\n    ...current,\n    revision: current.revision + 1,\n    timers: nextTimers,\n    history: [\n      historyEntry(current.id, viewer, {\n        characterId,\n        characterName: character.name,\n        resource: 'timer',\n        title: addedBiologist ? 'Dodano brakujący timer: Biolog' : 'Odświeżono ilustracje cykli PH',\n        detail: addedBiologist\n          ? 'Biolog · reset o północy'\n          : 'Księgi / Kamienie / Dowodzenie / Polimorfia / Górnictwo / Jazda / Biolog',\n        revision: current.revision + 1,\n      }),\n      ...current.history,\n    ],\n  }));",
)

# Web sends the computed lead time with every real character timer reset.
path = 'apps/web/src/discord-notify-api.ts'
replace_once(path, "  readonly endsAt?: string;\n  /** @deprecated map-hunt legacy */", "  readonly endsAt?: string;\n  readonly reminderMinutesBefore?: number;\n  /** @deprecated map-hunt legacy */")
replace_once(path, "  readonly endsAt?: string;\n  readonly mapKey?: string;", "  readonly endsAt?: string;\n  readonly reminderMinutesBefore?: number;\n  readonly mapKey?: string;")

path = 'apps/web/src/character-timer-discord-notify.ts'
replace_once(
    path,
    "import { inferProgressionKind, restartAfterDone } from './project-hard-progression';",
    "import {\n  inferProgressionKind,\n  progressionReminderMinutesBefore,\n  restartAfterDone,\n} from './project-hard-progression';",
)
replace_once(
    path,
    "  const copy = buildCharacterTimerNotifyCopy({",
    "  const progressionKind = timerForNotify.kind ?? inferProgressionKind(timerForNotify.label);\n  const reminderMinutesBefore = progressionReminderMinutesBefore(progressionKind);\n\n  const copy = buildCharacterTimerNotifyCopy({",
)
# Insert field after each actual endsAt payload line in this file (team reset + actor notify).
value = text(path)
needle = "      endsAt: timerForNotify.readyAtIso ?? undefined,\n"
if value.count(needle) != 2:
    raise SystemExit(f'{path}: expected two notify endsAt payloads, got {value.count(needle)}')
value = value.replace(needle, needle + "      reminderMinutesBefore,\n")
write(path, value)

# Gateway payload schema carries the explicit product lead time.
path = 'apps/discord-gateway/src/application/notify/notify-payload.ts'
replace_once(path, "  endsAt: z.string().datetime().optional(),\n  idempotencyKey:", "  endsAt: z.string().datetime().optional(),\n  reminderMinutesBefore: z.coerce.number().int().min(1).max(1440).optional(),\n  idempotencyKey:")
replace_once(path, "  endsAt: z.string().datetime().optional(),\n  roomSummary:", "  endsAt: z.string().datetime().optional(),\n  reminderMinutesBefore: z.coerce.number().int().min(1).max(1440).optional(),\n  roomSummary:")

# Template variable reflects the real 60/30/15 minute job, not a global Technik default.
path = 'apps/discord-gateway/src/application/notify/character-timer-template.ts'
replace_once(
    path,
    "  const content = applyNotifyTemplate(config.messageTemplate, {",
    "  const reminderMinutesBefore =\n    payload.reminderMinutesBefore ?? config.reminderMinutesBefore;\n  const content = applyNotifyTemplate(config.messageTemplate, {",
)
replace_once(path, "    minutes: config.reminderMinutesBefore,\n    reminderMinutesBefore: config.reminderMinutesBefore,", "    minutes: reminderMinutesBefore,\n    reminderMinutesBefore,")

# Shared-card read exposes the persisted timer kind to the Discord interaction router.
path = 'apps/discord-gateway/src/infrastructure/player-team/read-character-timer-card.ts'
replace_once(path, "  readonly timerLabel: string;\n  readonly liveTimers:", "  readonly timerLabel: string;\n  readonly timerKind: string | null;\n  readonly liveTimers:")
replace_once(path, "    timerLabel: typeof focus.label === 'string' ? focus.label : timerId,\n    liveTimers,", "    timerLabel: typeof focus.label === 'string' ? focus.label : timerId,\n    timerKind: typeof focus.kind === 'string' ? focus.kind : null,\n    liveTimers,")

# Dedicated gateway policy used when a Discord button starts another cycle.
Path('apps/discord-gateway/src/application/notify/character-timer-reminder-policy.ts').write_text("""const MIDNIGHT_KINDS = new Set([\n  'skill_book',\n  'leadership',\n  'polymorph',\n  'mining',\n  'biologist',\n]);\n\n/** Character-card reminder lead: midnight resets 60m, every other timer 30m. */\nexport function characterTimerReminderMinutesBefore(kind: string | null | undefined): number {\n  return kind && MIDNIGHT_KINDS.has(kind) ? 60 : 30;\n}\n\nexport function characterTimerReminderSchedule(input: {\n  readonly endsAtMs: number;\n  readonly nowMs: number;\n  readonly reminderMinutesBefore: number;\n}): { readonly dueDelayMs: number; readonly preReminderDelayMs: number | null } {\n  const dueDelayMs = input.endsAtMs - input.nowMs;\n  const preReminderDelayMs =\n    input.endsAtMs - input.reminderMinutesBefore * 60_000 - input.nowMs;\n  return {\n    dueDelayMs,\n    preReminderDelayMs: preReminderDelayMs > 5_000 ? preReminderDelayMs : null,\n  };\n}\n""", encoding='utf-8')

# Replace the durable queue with typed, backward-compatible job kinds and stable keys.
Path('apps/discord-gateway/src/application/notify/character-timer-reminders.ts').write_text("""/** File-backed character timer reminder queue — survives discord-gateway restart. */\n\nimport { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';\nimport { join } from 'node:path';\n\nexport type CharacterTimerReminderJobKind = 'due' | 'pre_reminder' | 'snooze';\n\nexport type CharacterTimerReminderJob = {\n  readonly key: string;\n  readonly kind: CharacterTimerReminderJobKind;\n  readonly discordUserId: string;\n  readonly timerId: string;\n  readonly label: string;\n  readonly characterName: string | null;\n  readonly characterId: string | null;\n  readonly workspaceId: string | null;\n  readonly deepLinkUrl: string | null;\n  readonly fireAtMs: number;\n  readonly endsAtMs: number | null;\n  readonly reminderMinutesBefore: number | null;\n};\n\nexport type CharacterTimerReminderDeps = {\n  readonly send: (job: CharacterTimerReminderJob) => Promise<void>;\n  readonly logger: {\n    info(message: string, meta?: Record<string, unknown>): void;\n    warn(message: string, meta?: Record<string, unknown>): void;\n  };\n};\n\ntype PersistShape = { readonly jobs: CharacterTimerReminderJob[] };\n\nconst pending = new Map<string, ReturnType<typeof setTimeout>>();\nconst metaByKey = new Map<string, CharacterTimerReminderJob>();\nlet sendDeps: CharacterTimerReminderDeps | null = null;\nlet loaded = false;\n\nfunction dataDir(): string {\n  const gatewayDataDir = (process.env.DISCORD_GATEWAY_DATA_DIR ?? '').trim();\n  if (gatewayDataDir) return join(gatewayDataDir, 'character-timer-reminders');\n  const legacyDataDir = (process.env.DESTILED_DATA_DIR ?? '').trim();\n  if (legacyDataDir) return join(legacyDataDir, 'character-timer-reminders');\n  const candidates = [\n    join(process.cwd(), '.data', 'character-timer-reminders'),\n    join(process.cwd(), '..', '..', '.data', 'character-timer-reminders'),\n    join(process.cwd(), '..', '.data', 'character-timer-reminders'),\n  ];\n  for (const dir of candidates) {\n    const parent = join(dir, '..');\n    if (existsSync(parent) || existsSync(join(parent, 'generaly-metki'))) return dir;\n  }\n  return candidates[0]!;\n}\n\nfunction persistPath(): string {\n  const dir = dataDir();\n  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });\n  return join(dir, 'queue.json');\n}\n\nfunction saveToDisk(): void {\n  try {\n    const payload: PersistShape = { jobs: [...metaByKey.values()] };\n    const target = persistPath();\n    const tmp = `${target}.${process.pid}.tmp`;\n    writeFileSync(tmp, JSON.stringify(payload), 'utf8');\n    renameSync(tmp, target);\n  } catch {\n    /* memory still works */\n  }\n}\n\nfunction asJobKind(value: unknown): CharacterTimerReminderJobKind {\n  return value === 'pre_reminder' || value === 'snooze' || value === 'due' ? value : 'due';\n}\n\nfunction loadFromDisk(): void {\n  if (loaded) return;\n  loaded = true;\n  try {\n    const raw = readFileSync(persistPath(), 'utf8');\n    const parsed = JSON.parse(raw) as { readonly jobs?: unknown[] };\n    if (!parsed || !Array.isArray(parsed.jobs)) return;\n    const now = Date.now();\n    for (const rawJob of parsed.jobs) {\n      if (!rawJob || typeof rawJob !== 'object') continue;\n      const job = rawJob as Record<string, unknown>;\n      if (typeof job.key !== 'string' || typeof job.fireAtMs !== 'number') continue;\n      if (typeof job.discordUserId !== 'string' || typeof job.timerId !== 'string') continue;\n      if (job.fireAtMs < now - 48 * 3_600_000) continue;\n      const kind = asJobKind(job.kind);\n      const canonicalKey = `${job.discordUserId}:${job.timerId}:${kind}`;\n      metaByKey.set(canonicalKey, {\n        key: canonicalKey,\n        kind,\n        discordUserId: job.discordUserId,\n        timerId: job.timerId,\n        label: typeof job.label === 'string' ? job.label : job.timerId,\n        characterName: typeof job.characterName === 'string' ? job.characterName : null,\n        characterId: typeof job.characterId === 'string' ? job.characterId : null,\n        workspaceId: typeof job.workspaceId === 'string' ? job.workspaceId : null,\n        deepLinkUrl: typeof job.deepLinkUrl === 'string' ? job.deepLinkUrl : null,\n        fireAtMs: job.fireAtMs,\n        endsAtMs: typeof job.endsAtMs === 'number' ? job.endsAtMs : job.fireAtMs,\n        reminderMinutesBefore:\n          typeof job.reminderMinutesBefore === 'number' ? job.reminderMinutesBefore : null,\n      });\n    }\n  } catch {\n    /* fresh */\n  }\n}\n\nfunction armTimeout(job: CharacterTimerReminderJob): void {\n  const existing = pending.get(job.key);\n  if (existing) clearTimeout(existing);\n  const delayMs = Math.max(0, job.fireAtMs - Date.now());\n  const handle = setTimeout(() => {\n    pending.delete(job.key);\n    metaByKey.delete(job.key);\n    saveToDisk();\n    const deps = sendDeps;\n    if (!deps) return;\n    void deps.send(job).catch((error: unknown) => {\n      deps.logger.warn('Character timer reminder DM failed', {\n        timerId: job.timerId,\n        kind: job.kind,\n        error: error instanceof Error ? error.message : 'unknown',\n      });\n    });\n  }, delayMs);\n  if (typeof handle === 'object' && handle && 'unref' in handle) handle.unref();\n  pending.set(job.key, handle);\n}\n\nexport function startCharacterTimerReminderWorker(deps: CharacterTimerReminderDeps): { readonly reloaded: number } {\n  sendDeps = deps;\n  loadFromDisk();\n  let reloaded = 0;\n  for (const job of metaByKey.values()) { armTimeout(job); reloaded += 1; }\n  deps.logger.info('Character timer reminder worker ready', { reloaded, path: persistPath() });\n  return { reloaded };\n}\n\nexport function scheduleCharacterTimerReminder(\n  input: {\n    readonly kind: CharacterTimerReminderJobKind;\n    readonly discordUserId: string;\n    readonly timerId: string;\n    readonly label: string;\n    readonly characterName?: string | null;\n    readonly characterId?: string | null;\n    readonly workspaceId?: string | null;\n    readonly deepLinkUrl?: string | null;\n    readonly delayMs: number;\n    readonly endsAtMs?: number | null;\n    readonly reminderMinutesBefore?: number | null;\n  },\n  deps: CharacterTimerReminderDeps,\n): { readonly ok: true; readonly fireAtMs: number } | { readonly ok: false; readonly reason: string } {\n  if (sendDeps === null) sendDeps = deps;\n  loadFromDisk();\n  if (!Number.isFinite(input.delayMs) || input.delayMs <= 0) return { ok: false, reason: 'invalid_delay' };\n  const delayMs = Math.max(5_000, Math.min(24 * 3_600_000, Math.round(input.delayMs)));\n  const fireAtMs = Date.now() + delayMs;\n  const key = `${input.discordUserId}:${input.timerId}:${input.kind}`;\n  const job: CharacterTimerReminderJob = {\n    key, kind: input.kind, discordUserId: input.discordUserId, timerId: input.timerId,\n    label: input.label, characterName: input.characterName ?? null,\n    characterId: input.characterId ?? null, workspaceId: input.workspaceId ?? null,\n    deepLinkUrl: input.deepLinkUrl ?? null, fireAtMs,\n    endsAtMs: input.endsAtMs ?? null, reminderMinutesBefore: input.reminderMinutesBefore ?? null,\n  };\n  metaByKey.set(key, job);\n  saveToDisk();\n  armTimeout(job);\n  deps.logger.info('Character timer reminder scheduled', {\n    timerId: job.timerId, kind: job.kind, delayMs, fireAtMs, durable: true,\n  });\n  return { ok: true, fireAtMs };\n}\n\n/** Cancel every outstanding due/pre-reminder/snooze job for this user+timer after a refresh. */\nexport function cancelCharacterTimerReminder(discordUserId: string, timerId: string): void {\n  loadFromDisk();\n  const legacyKey = `${discordUserId}:${timerId}`;\n  const prefix = `${legacyKey}:`;\n  const matches = (key: string) => key === legacyKey || key.startsWith(prefix);\n  for (const [key, handle] of pending) {\n    if (!matches(key)) continue;\n    clearTimeout(handle); pending.delete(key);\n  }\n  for (const key of [...metaByKey.keys()]) if (matches(key)) metaByKey.delete(key);\n  saveToDisk();\n}\n\n/** Test helper */\nexport function resetCharacterTimerRemindersForTests(): void {\n  for (const handle of pending.values()) clearTimeout(handle);\n  pending.clear(); metaByKey.clear(); loaded = false; sendDeps = null;\n  try { writeFileSync(persistPath(), JSON.stringify({ jobs: [] }), 'utf8'); } catch { /* ignore */ }\n}\n""", encoding='utf-8')

# Notify controller: schedule pre-reminder separately from due and never mark ready early.
path = 'apps/discord-gateway/src/interface/http/notify.controller.ts'
replace_once(
    path,
    "  scheduleCharacterTimerReminder,\n  type CharacterTimerReminderDeps,\n} from '../../application/notify/character-timer-reminders.js';",
    "  cancelCharacterTimerReminder,\n  scheduleCharacterTimerReminder,\n  type CharacterTimerReminderDeps,\n} from '../../application/notify/character-timer-reminders.js';\nimport { characterTimerReminderSchedule } from '../../application/notify/character-timer-reminder-policy.js';",
)
replace_once(
    path,
    "        if (job.workspaceId) {\n          const stateUpdated = await markCharacterTimerReadyInWorkspace({",
    "        if (job.kind === 'due' && job.workspaceId) {\n          const stateUpdated = await markCharacterTimerReadyInWorkspace({",
)
replace_once(
    path,
    "          body: 'Timer jest gotowy, ale pozostaje zablokowany do jawnego odświeżenia przez zespół.',",
    "          body:\n            job.kind === 'due'\n              ? 'Timer jest gotowy, ale pozostaje zablokowany do jawnego odświeżenia przez zespół.'\n              : job.kind === 'pre_reminder'\n                ? `Do końca timera zostało ${job.reminderMinutesBefore ?? 30} min.`\n                : 'Przypomnienie. Poniżej aktualny stan timera.',",
)
replace_once(
    path,
    "          endsAt: new Date(job.fireAtMs).toISOString(),\n          kind: 'reminder',",
    "          endsAt: new Date(job.endsAtMs ?? job.fireAtMs).toISOString(),\n          ...(job.reminderMinutesBefore\n            ? { reminderMinutesBefore: job.reminderMinutesBefore }\n            : {}),\n          kind: 'reminder',",
)
old_schedule = """    const delayMs = endsAtMs - Date.now();
    if (delayMs <= 0 || delayMs > 24 * 3_600_000) return;

    scheduleCharacterTimerReminder(
      {
        discordUserId: payload.discordUserId,
        timerId: payload.timerId,
        label: payload.timerLabel ?? payload.title,
        characterName: payload.characterName ?? null,
        characterId: payload.characterId ?? null,
        workspaceId: payload.workspaceId ?? null,
        deepLinkUrl: payload.deepLinkUrl,
        delayMs,
      },
      this.reminderDeps(gateway),
    );"""
new_schedule = """    const nowMs = Date.now();
    const reminderMinutesBefore = payload.reminderMinutesBefore ?? 30;
    const schedule = characterTimerReminderSchedule({ endsAtMs, nowMs, reminderMinutesBefore });
    if (schedule.dueDelayMs <= 0 || schedule.dueDelayMs > 24 * 3_600_000) return;

    cancelCharacterTimerReminder(payload.discordUserId, payload.timerId);
    const base = {
      discordUserId: payload.discordUserId,
      timerId: payload.timerId,
      label: payload.timerLabel ?? payload.title,
      characterName: payload.characterName ?? null,
      characterId: payload.characterId ?? null,
      workspaceId: payload.workspaceId ?? null,
      deepLinkUrl: payload.deepLinkUrl,
      endsAtMs,
      reminderMinutesBefore,
    } as const;
    scheduleCharacterTimerReminder(
      { ...base, kind: 'due', delayMs: schedule.dueDelayMs },
      this.reminderDeps(gateway),
    );
    if (schedule.preReminderDelayMs !== null) {
      scheduleCharacterTimerReminder(
        { ...base, kind: 'pre_reminder', delayMs: schedule.preReminderDelayMs },
        this.reminderDeps(gateway),
      );
    }"""
replace_once(path, old_schedule, new_schedule)
replace_once(path, "        endsAt: payload.endsAt,\n        kind: 'reset',", "        endsAt: payload.endsAt,\n        reminderMinutesBefore: payload.reminderMinutesBefore,\n        kind: 'reset',")

# Canonical bootstrap worker marks ready only for due; pre/snooze are message-only.
path = 'apps/discord-gateway/src/interface/discord/discord-bootstrap.service.ts'
replace_once(path, "        if (job.workspaceId) {\n          await markCharacterTimerReadyInWorkspace({", "        if (job.kind === 'due' && job.workspaceId) {\n          await markCharacterTimerReadyInWorkspace({")
replace_once(
    path,
    "        const body = {\n          discordUserId: job.discordUserId,",
    "        const focus = card?.liveTimers.find((timer) => timer.id === job.timerId);\n        const body = {\n          discordUserId: job.discordUserId,",
)
replace_once(
    path,
    "          body: 'Timer jest gotowy, ale pozostaje zablokowany do jawnego odświeżenia przez zespół.',",
    "          body:\n            job.kind === 'due'\n              ? 'Timer jest gotowy, ale pozostaje zablokowany do jawnego odświeżenia przez zespół.'\n              : job.kind === 'pre_reminder'\n                ? `Do końca timera zostało ${job.reminderMinutesBefore ?? 30} min.`\n                : 'Przypomnienie. Poniżej aktualny stan wszystkich timerów tej postaci.',",
)
replace_once(
    path,
    "          endsAt: new Date(job.fireAtMs).toISOString(),\n          kind: 'reminder' as const,",
    "          endsAt:\n            focus?.readyAtIso ?? new Date(job.endsAtMs ?? job.fireAtMs).toISOString(),\n          ...(job.reminderMinutesBefore\n            ? { reminderMinutesBefore: job.reminderMinutesBefore }\n            : {}),\n          kind: 'reminder' as const,",
)
replace_once(path, "          idempotencyKey: `char-timer-ready:${job.timerId}:${job.discordUserId}:${job.fireAtMs}`", "          idempotencyKey: `char-timer-${job.kind}:${job.timerId}:${job.discordUserId}:${job.fireAtMs}`")

# Discord interaction refresh gets the same 60/30 policy; snooze is always +15m.
path = 'apps/discord-gateway/src/interface/discord/team-sync-interaction-router.ts'
replace_once(
    path,
    "} from '../../application/notify/character-timer-reminders.js';\nimport {",
    "} from '../../application/notify/character-timer-reminders.js';\nimport {\n  characterTimerReminderMinutesBefore,\n  characterTimerReminderSchedule,\n} from '../../application/notify/character-timer-reminder-policy.js';\nimport {",
)
old_refresh_schedule = """    const readyAtMs = Date.parse(result.readyAtIso);
    const delayMs = Number.isFinite(readyAtMs)
      ? Math.max(5_000, readyAtMs - Date.now())
      : 60 * 60_000;
    for (const discordUserId of recipients) {
      scheduleCharacterTimerReminder(
        {
          discordUserId,
          timerId,
          label: result.label,
          characterName,
          characterId,
          workspaceId,
          deepLinkUrl,
          delayMs,
        },
        {
          logger: this.deps.logger,
          send: (job) => this.sendDueTimerCard(job),
        },
      );
    }"""
new_refresh_schedule = """    const readyAtMs = Date.parse(result.readyAtIso);
    const reminderMinutesBefore = characterTimerReminderMinutesBefore(located.timerKind);
    const reminderSchedule = Number.isFinite(readyAtMs)
      ? characterTimerReminderSchedule({
          endsAtMs: readyAtMs,
          nowMs: Date.now(),
          reminderMinutesBefore,
        })
      : null;
    for (const discordUserId of recipients) {
      const deps = {
        logger: this.deps.logger,
        send: (job: CharacterTimerReminderJob) =>
          job.kind === 'due' ? this.sendDueTimerCard(job) : this.sendSnoozedTimerCard(job),
      };
      const base = {
        discordUserId,
        timerId,
        label: result.label,
        characterName,
        characterId,
        workspaceId,
        deepLinkUrl,
        endsAtMs: Number.isFinite(readyAtMs) ? readyAtMs : null,
        reminderMinutesBefore,
      } as const;
      if (reminderSchedule && reminderSchedule.dueDelayMs > 0) {
        scheduleCharacterTimerReminder(
          { ...base, kind: 'due', delayMs: reminderSchedule.dueDelayMs },
          deps,
        );
      }
      if (reminderSchedule?.preReminderDelayMs !== null && reminderSchedule?.preReminderDelayMs !== undefined) {
        scheduleCharacterTimerReminder(
          { ...base, kind: 'pre_reminder', delayMs: reminderSchedule.preReminderDelayMs },
          deps,
        );
      }
    }"""
replace_once(path, old_refresh_schedule, new_refresh_schedule)
replace_once(
    path,
    "    const live = this.deps.getBotConfig?.() ?? defaultBotConfigValues();\n    const characterCfg = live.characterTimers ?? live.timersNotify;\n    const minutes = Math.max(\n      1,\n      Math.min(1440, Math.round(characterCfg.reminderMinutesBefore || 60)),\n    );",
    "    const minutes = 15;",
)
replace_once(path, "        discordUserId: interaction.user.id,\n        timerId,", "        kind: 'snooze',\n        discordUserId: interaction.user.id,\n        timerId,")
replace_once(path, "        deepLinkUrl,\n        delayMs,", "        deepLinkUrl,\n        delayMs,\n        endsAtMs: located.liveTimers.find((timer) => timer.id === timerId)?.readyAtIso\n          ? Date.parse(located.liveTimers.find((timer) => timer.id === timerId)!.readyAtIso!)\n          : null,\n        reminderMinutesBefore: minutes,")

# Character button text only; leave the legacy map/metin branch untouched.
path = 'apps/discord-gateway/src/presentation/discord/timer-notify-renderer.ts'
replace_once(path, ".setLabel('Przypomnij później')\n          .setStyle(ButtonStyle.Secondary),", ".setLabel('Przypomnij mi')\n          .setStyle(ButtonStyle.Secondary),")

# Tests for the product policy, Biolog visibility, schedule math and renderer wording.
Path('apps/web/src/project-hard-progression.spec.ts').write_text("""import { describe, expect, it } from 'vitest';\n\nimport {\n  progressionKindsForLevel,\n  progressionReminderMinutesBefore,\n} from './project-hard-progression.js';\n\ndescribe('Project Hard character timer reminders', () => {\n  it('keeps Biolog visible when the character level is not filled in yet', () => {\n    expect(progressionKindsForLevel(null)).toContain('biologist');\n  });\n\n  it('uses 60 minutes for midnight resets and 30 minutes for every other timer', () => {\n    expect(progressionReminderMinutesBefore('biologist')).toBe(60);\n    expect(progressionReminderMinutesBefore('skill_book')).toBe(60);\n    expect(progressionReminderMinutesBefore('leadership')).toBe(60);\n    expect(progressionReminderMinutesBefore('polymorph')).toBe(60);\n    expect(progressionReminderMinutesBefore('mining')).toBe(60);\n    expect(progressionReminderMinutesBefore('soul_stone')).toBe(30);\n    expect(progressionReminderMinutesBefore('horse')).toBe(30);\n    expect(progressionReminderMinutesBefore(null)).toBe(30);\n  });\n});\n""", encoding='utf-8')

Path('apps/discord-gateway/src/application/notify/character-timer-reminder-policy.spec.ts').write_text("""import { describe, expect, it } from 'vitest';\n\nimport {\n  characterTimerReminderMinutesBefore,\n  characterTimerReminderSchedule,\n} from './character-timer-reminder-policy.js';\n\ndescribe('character timer reminder policy', () => {\n  it('uses 60 minutes for midnight families and 30 for other timers', () => {\n    expect(characterTimerReminderMinutesBefore('biologist')).toBe(60);\n    expect(characterTimerReminderMinutesBefore('skill_book')).toBe(60);\n    expect(characterTimerReminderMinutesBefore('soul_stone')).toBe(30);\n    expect(characterTimerReminderMinutesBefore('horse')).toBe(30);\n    expect(characterTimerReminderMinutesBefore(null)).toBe(30);\n  });\n\n  it('keeps pre-reminder separate from the actual due time', () => {\n    const nowMs = Date.UTC(2026, 8, 8, 20, 0, 0);\n    const endsAtMs = Date.UTC(2026, 8, 8, 22, 0, 0);\n    expect(characterTimerReminderSchedule({ endsAtMs, nowMs, reminderMinutesBefore: 60 })).toEqual({\n      dueDelayMs: 120 * 60_000,\n      preReminderDelayMs: 60 * 60_000,\n    });\n  });\n});\n""", encoding='utf-8')

# Extend existing notify regression: midnight Księga must carry the 60m lead.
path = 'apps/web/src/character-timer-discord-notify.spec.ts'
replace_once(
    path,
    "        kind: 'reset',\n      }),\n    );\n    const actorPayload",
    "        kind: 'reset',\n        reminderMinutesBefore: 60,\n      }),\n    );\n    const actorPayload",
)
replace_once(
    path,
    "      expect.objectContaining({\n        recipientDiscordUserIds: ['223456789012345678'],\n      }),",
    "      expect.objectContaining({\n        recipientDiscordUserIds: ['223456789012345678'],\n        reminderMinutesBefore: 60,\n      }),",
)

# Append mandatory fix log entry; keep status PARTIAL until CI/deploy/live Discord proof.
path = 'docs/ai/FIX_LOG.md'
value = text(path)
marker = '# Wpisy\n'
entry = """\n## 2026-09-08 — Timery postaci: Biolog + automatyczne pre-remindery 60/30 min + snooze 15 min\n\n- **Status:** `PARTIAL` — implementacja na gałęzi zadania; przed `DONE` wymagane CI, deployment dokładnego SHA i realny Discord E2E.\n- **Obszar:** karty postaci, Player Team, Discord Gateway reminder queue. Bez zmian w module Generałów/Metinów.\n- **Problem:** istniejące karty mogły nie mieć Biologa; reminder queue miała wyłącznie job odpalany na `endsAt`, więc wcześniejsze przypomnienie oznaczałoby timer jako gotowy. Przycisk `Przypomnij później` używał wartości z Technik zamiast stałych 15 min.\n- **Poprawka:** brakujący Biolog jest backfillowany na istniejącej karcie (dla poziomu nieznanego lub >=30); wszystkie timery resetujące się o północy dostają automatyczne PW 60 min przed końcem, pozostałe 30 min. Durable queue rozdziela `pre_reminder`, `due` i `snooze`; tylko `due` może oznaczyć timer jako ready. `Przypomnij mi` zapisuje trwałe ponowienie za 15 min i może być użyty ponownie. Stare joby bez rodzaju migrują jako `due`.\n- **Walidacja:** oczekuje na CI / deployment / runtime E2E.\n\n"""
if entry.strip() not in value:
    if marker not in value:
        raise SystemExit('FIX_LOG marker missing')
    write(path, value.replace(marker, marker + entry, 1))

print('character timer patch applied')
