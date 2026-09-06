/**
 * Browser client for Technika bot config (D-060).
 * Calls same-origin /api/technik/* — server holds DISCORD_TECHNIKA_SHARED_SECRET.
 * Never expose the secret via NEXT_PUBLIC_*.
 *
 * Live: guilds, characterTimers, kingdomWar, test-dm, capabilities, D-060 draft flow.
 * Prefer characterTimers over timersNotify alias.
 */

export type TimersNotifyConfig = {
  readonly enabled: boolean;
  readonly messageTemplate: string;
  readonly reminderMinutesBefore: number;
  readonly resetNotifyEnabled: boolean;
};

/** Alias for Timery postaci (character progress — not map metins). */
export type CharacterTimersConfig = TimersNotifyConfig;

export type KingdomWarConfig = {
  readonly enabled: boolean;
  readonly warAt: string;
  readonly notifyMinutesBefore: number;
  readonly maxClaimsPerUser: number;
  readonly messageTemplate: string;
};

export type BotConfigValues = {
  readonly 'panel-test-enabled': boolean;
  readonly 'notify-timer-enabled': boolean;
  readonly timersNotify: TimersNotifyConfig;
  readonly kingdomWar: KingdomWarConfig;
  /** Upcoming OpenAPI module — present when gateway exposes it. */
  readonly characterTimers?: CharacterTimersConfig;
};

export type ConfigSnapshot = {
  readonly revision: number;
  readonly status: 'active' | 'draft';
  readonly config: BotConfigValues;
  readonly updatedAt: string;
  readonly hasDraft: boolean;
  readonly canRollback: boolean;
  readonly strictGuildIsolation?: boolean;
};

export type CapabilityField = {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly valueType: 'boolean' | 'number' | 'string';
  readonly default: boolean | number | string;
};

export type BotCapability = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly valueType: 'boolean' | 'number' | 'string' | 'object';
  readonly default: unknown;
  readonly readOnly?: boolean;
  readonly currentDisplayValue?: unknown;
  readonly fields?: readonly CapabilityField[];
};

export type ValidationIssue = {
  readonly path: string;
  readonly message: string;
};

export type TechnikaApiResult<T> =
  | { readonly ok: true; readonly data: T; readonly status: number }
  | {
      readonly ok: false;
      readonly error: string;
      readonly status: number;
      readonly detail?: string;
      readonly issues?: readonly ValidationIssue[];
      readonly body?: unknown;
    };

export type TechnikaMeta = {
  readonly mutationsEnabled: boolean;
  readonly gateway: string;
};

export const DEFAULT_TIMERS_NOTIFY: TimersNotifyConfig = {
  enabled: false,
  messageTemplate:
    '**DESTILED · Timer**\n{{title}}\n\n{{body}}\n\nInne timery: {{otherTimersSummary}}',
  reminderMinutesBefore: 60,
  resetNotifyEnabled: true,
};

export const DEFAULT_CHARACTER_TIMERS: CharacterTimersConfig = {
  enabled: false,
  messageTemplate:
    '**DESTILED · Timer postaci**\nHej! **{{title}}** zaraz się kończy — nie przegap resetu!\n\n{{body}}\n\nInne Twoje timery: {{otherTimersSummary}}\n{{deepLinkUrl}}',
  reminderMinutesBefore: 60,
  resetNotifyEnabled: true,
};

export const DEFAULT_KINGDOM_WAR: KingdomWarConfig = {
  enabled: false,
  warAt: '18:00',
  notifyMinutesBefore: 30,
  maxClaimsPerUser: 3,
  messageTemplate:
    '**DESTILED · Wojna Królestw**\nZa {{notifyMinutesBefore}} min start wojny ({{warAt}} Europe/Warsaw).\nZajmij postać — nie zostawiaj slotu pustego!',
};

/**
 * Prefer upcoming characterTimers module; fall back to timersNotify (same shape).
 * UI always labels this as Timery postaci (not map metins).
 */
export function pickCharacterTimers(
  config: BotConfigValues | null | undefined,
): { values: CharacterTimersConfig; apiKey: 'characterTimers' | 'timersNotify' } {
  if (config?.characterTimers && typeof config.characterTimers === 'object') {
    return {
      values: { ...DEFAULT_CHARACTER_TIMERS, ...config.characterTimers },
      apiKey: 'characterTimers',
    };
  }
  if (config?.timersNotify && typeof config.timersNotify === 'object') {
    return {
      values: { ...DEFAULT_TIMERS_NOTIFY, ...config.timersNotify },
      apiKey: 'timersNotify',
    };
  }
  return { values: { ...DEFAULT_CHARACTER_TIMERS }, apiKey: 'timersNotify' };
}

async function parseJson(
  res: Response,
): Promise<{ readonly parsed: Record<string, unknown>; readonly raw: string }> {
  const raw = await res.text();
  if (!raw.trim()) {
    return { parsed: {}, raw };
  }
  try {
    return { parsed: JSON.parse(raw) as Record<string, unknown>, raw };
  } catch {
    return { parsed: { error: 'invalid_json', detail: raw.slice(0, 200) }, raw };
  }
}

function failFrom(
  res: Response,
  parsed: Record<string, unknown>,
  fallback: string,
): TechnikaApiResult<never> {
  const issues = Array.isArray(parsed.issues)
    ? (parsed.issues as ValidationIssue[])
    : undefined;
  const err =
    typeof parsed.error === 'string'
      ? parsed.error
      : typeof parsed.message === 'string'
        ? parsed.message
        : fallback;
  const detail =
    typeof parsed.detail === 'string'
      ? parsed.detail
      : typeof parsed.hint === 'string'
        ? parsed.hint
        : undefined;
  return {
    ok: false,
    error: err,
    status: res.status,
    ...(detail ? { detail } : {}),
    ...(issues ? { issues } : {}),
    body: parsed,
  };
}

export async function fetchTechnikaMeta(): Promise<TechnikaApiResult<TechnikaMeta>> {
  try {
    const res = await fetch('/api/technik/meta', { cache: 'no-store' });
    const { parsed } = await parseJson(res);
    if (!res.ok) {
      return failFrom(res, parsed, `http_${res.status}`);
    }
    return {
      ok: true,
      status: res.status,
      data: {
        mutationsEnabled: Boolean(parsed.mutationsEnabled),
        gateway: typeof parsed.gateway === 'string' ? parsed.gateway : '',
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function fetchCapabilities(): Promise<
  TechnikaApiResult<{ capabilities: readonly BotCapability[] }>
> {
  try {
    const res = await fetch('/api/technik/capabilities', { cache: 'no-store' });
    const { parsed } = await parseJson(res);
    if (!res.ok) {
      return failFrom(res, parsed, `http_${res.status}`);
    }
    const list = Array.isArray(parsed.capabilities)
      ? (parsed.capabilities as BotCapability[])
      : [];
    return { ok: true, status: res.status, data: { capabilities: list } };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function fetchActiveConfig(): Promise<TechnikaApiResult<ConfigSnapshot>> {
  try {
    const res = await fetch('/api/technik/config', { cache: 'no-store' });
    const { parsed } = await parseJson(res);
    if (!res.ok) {
      return failFrom(res, parsed, `http_${res.status}`);
    }
    return { ok: true, status: res.status, data: parsed as unknown as ConfigSnapshot };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export type BotConfigDraftPartial = {
  readonly timersNotify?: Partial<TimersNotifyConfig>;
  readonly characterTimers?: Partial<CharacterTimersConfig>;
  readonly kingdomWar?: Partial<KingdomWarConfig>;
  readonly 'panel-test-enabled'?: boolean;
  readonly 'notify-timer-enabled'?: boolean;
} & Record<string, unknown>;

export async function putConfigDraft(
  partial: BotConfigDraftPartial,
): Promise<TechnikaApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch('/api/technik/config/draft', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config: partial }),
      cache: 'no-store',
    });
    const { parsed } = await parseJson(res);
    if (!res.ok) {
      return failFrom(res, parsed, `http_${res.status}`);
    }
    return { ok: true, status: res.status, data: parsed };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function postConfigValidate(
  config?: unknown,
): Promise<TechnikaApiResult<{ ok: boolean; issues: ValidationIssue[]; config?: unknown }>> {
  try {
    const res = await fetch('/api/technik/config/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config !== undefined ? { config } : {}),
      cache: 'no-store',
    });
    const { parsed } = await parseJson(res);
    if (!res.ok) {
      return failFrom(res, parsed, `http_${res.status}`);
    }
    return {
      ok: true,
      status: res.status,
      data: {
        ok: Boolean(parsed.ok),
        issues: Array.isArray(parsed.issues) ? (parsed.issues as ValidationIssue[]) : [],
        config: parsed.config,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function postConfigPreview(): Promise<TechnikaApiResult<Record<string, unknown>>> {
  try {
    const res = await fetch('/api/technik/config/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    const { parsed } = await parseJson(res);
    if (!res.ok) {
      return failFrom(res, parsed, `http_${res.status}`);
    }
    return { ok: true, status: res.status, data: parsed };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function postConfigApply(): Promise<TechnikaApiResult<ConfigSnapshot & { ok: true }>> {
  try {
    const res = await fetch('/api/technik/config/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    const { parsed } = await parseJson(res);
    if (!res.ok) {
      return failFrom(res, parsed, `http_${res.status}`);
    }
    return {
      ok: true,
      status: res.status,
      data: parsed as unknown as ConfigSnapshot & { ok: true },
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function postConfigRollback(): Promise<
  TechnikaApiResult<ConfigSnapshot & { ok: true }>
> {
  try {
    const res = await fetch('/api/technik/config/rollback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    const { parsed } = await parseJson(res);
    if (!res.ok) {
      return failFrom(res, parsed, `http_${res.status}`);
    }
    return {
      ok: true,
      status: res.status,
      data: parsed as unknown as ConfigSnapshot & { ok: true },
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}



/** OpenAPI GuildModules — live keys + optional panels/channels (persist even if runtime later). */
export type GuildModules = {
  readonly characterTimers: boolean;
  readonly kingdomWar: boolean;
  readonly panels?: boolean;
  readonly channels?: boolean;
};

/** OpenAPI GuildConfig.rights enum — do not invent beyond these. */
export const GUILD_RIGHTS = [
  'technika.config',
  'technika.apply',
  'technika.rollback',
  'discord.notify',
  'discord.panels',
  'discord.commands',
] as const;

export type GuildRight = (typeof GUILD_RIGHTS)[number];

export const GUILD_MODULE_KEYS = [
  'characterTimers',
  'kingdomWar',
  'panels',
  'channels',
] as const;

export type GuildModuleKey = (typeof GUILD_MODULE_KEYS)[number];

export type TechnikaGuildDto = {
  readonly id: string;
  readonly name?: string;
  readonly enabled: boolean;
  readonly modules: GuildModules;
  readonly rights: readonly string[];
  readonly source?: 'configured' | 'discovered' | 'both';
  readonly notes?: string;
};

export type GuildsListResponse = {
  readonly guilds: readonly TechnikaGuildDto[];
  readonly revision: number;
  readonly botReady?: boolean;
  readonly hasDraft?: boolean;
};

export type PutGuildBody = {
  readonly enabled: boolean;
  readonly name?: string;
  readonly modules: GuildModules;
  readonly rights: readonly string[];
  readonly notes?: string;
};

export type PutGuildResponse = {
  readonly ok: true;
  readonly guild: TechnikaGuildDto;
  readonly revision: number;
  readonly status: 'draft';
  readonly hasDraft: true;
  readonly updatedAt: string;
};

export const DEFAULT_GUILD_MODULES: GuildModules = {
  characterTimers: true,
  kingdomWar: false,
  panels: true,
  channels: false,
};

export const DEFAULT_GUILD_RIGHTS: readonly GuildRight[] = [
  'technika.config',
  'discord.notify',
  'discord.panels',
];

/** Known TEST Discord (Mateusz) — always primary/first when present in GET /guilds. */
/** Known TEST Discord — only this guild may be enabled / receive bot traffic from Technik. */
export const TECHNIK_TEST_GUILD_ID = '1534228693017432124';

/** Human names when Discord discovery has not filled `name` yet (HARD STOP prod still disabled). */
export const KNOWN_GUILD_NAMES: Readonly<Record<string, string>> = {
  '1534228693017432124': 'Testowy',
  '1543972927719080016': 'Destiled',
  '1531318787058696424': 'Projekt Sojusz',
};


/** Known production Discord IDs — list if API returns them, but never enable from Technik. */
export const TECHNIK_LOCKED_GUILD_IDS = [
  '1543972927719080016',
  '1531318787058696424',
] as const;

/** Mateusz hard-stop: only Testowy may be enabled / modules on. */
export function isTechnikGuildEditable(guildId: string): boolean {
  return guildId === TECHNIK_TEST_GUILD_ID;
}

/** Prefer TEST first; then known locked IDs; then name hints; never invent IDs. */
export function sortGuildsForTechnik(
  guilds: readonly TechnikaGuildDto[],
): TechnikaGuildDto[] {
  const knownOrder = [
    TECHNIK_TEST_GUILD_ID,
    ...TECHNIK_LOCKED_GUILD_IDS,
  ] as readonly string[];
  const rank = (g: TechnikaGuildDto): number => {
    const knownIdx = knownOrder.indexOf(g.id);
    if (knownIdx >= 0) return knownIdx;
    const blob = ((g.name ?? '') + ' ' + (g.notes ?? '')).toLowerCase();
    if (/\btest\b|lab\b|_test|test-guild|guild.?test|destiled.?lab|testowy/.test(blob)) return 10;
    if (/\bmain\b|prod\b|produk|głowny|glowny|primary/.test(blob)) return 30;
    return 20;
  };
  return [...guilds].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    const an = (a.name ?? a.id).localeCompare(b.name ?? b.id, 'pl');
    if (an !== 0) return an;
    return a.id.localeCompare(b.id);
  });
}

export function guildDisplayLabel(g: TechnikaGuildDto): string {
  const apiName = (g.name ?? '').trim();
  const known = KNOWN_GUILD_NAMES[g.id] ?? '';
  const name = apiName || known;
  const blob = (name + ' ' + (g.notes ?? '') + ' ' + known).toLowerCase();
  let tag = '';
  if (
    g.id === TECHNIK_TEST_GUILD_ID ||
    /\btest\b|lab\b|_test|test-guild|guild.?test|destiled.?lab|testowy/.test(blob)
  ) {
    tag = 'testowy';
  } else if (!isTechnikGuildEditable(g.id)) {
    tag = 'zablokowany';
  }
  if (tag && name) return tag + ' · ' + name;
  if (tag) return tag + ' · ' + (known || g.id);
  if (name) return name;
  return known || g.id;
}

/** Default selection: known TEST guild when present, else first after sort. */
export function pickDefaultGuildId(
  guilds: readonly TechnikaGuildDto[],
  preferId?: string | null,
): string | null {
  const sorted = sortGuildsForTechnik(guilds);
  if (preferId && sorted.some((g) => g.id === preferId)) return preferId;
  if (sorted.some((g) => g.id === TECHNIK_TEST_GUILD_ID)) return TECHNIK_TEST_GUILD_ID;
  return sorted[0]?.id ?? null;
}

export async function fetchGuilds(): Promise<TechnikaApiResult<GuildsListResponse>> {
  try {
    const res = await fetch('/api/technik/guilds', { cache: 'no-store' });
    const { parsed } = await parseJson(res);
    if (!res.ok) {
      return failFrom(res, parsed, `http_${res.status}`);
    }
    const list = Array.isArray(parsed.guilds)
      ? (parsed.guilds as TechnikaGuildDto[])
      : [];
    return {
      ok: true,
      status: res.status,
      data: {
        guilds: list,
        revision: typeof parsed.revision === 'number' ? parsed.revision : 0,
        ...(typeof parsed.botReady === 'boolean' ? { botReady: parsed.botReady } : {}),
        ...(typeof parsed.hasDraft === 'boolean' ? { hasDraft: parsed.hasDraft } : {}),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function putGuild(
  guildId: string,
  body: PutGuildBody,
): Promise<TechnikaApiResult<PutGuildResponse>> {
  try {
    const res = await fetch(`/api/technik/guilds/${encodeURIComponent(guildId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const { parsed } = await parseJson(res);
    if (!res.ok) {
      return failFrom(res, parsed, `http_${res.status}`);
    }
    return {
      ok: true,
      status: res.status,
      data: parsed as unknown as PutGuildResponse,
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export type TestDmModule = 'timersNotify' | 'characterTimers' | 'kingdomWar';

export type TestDmRequest = {
  readonly module: TestDmModule;
  readonly discordUserId?: string;
  readonly messageTemplate?: string;
  readonly reminderMinutesBefore?: number;
  readonly warAt?: string;
  readonly notifyMinutesBefore?: number;
};

export type TestDmResponse = {
  readonly ok: true;
  readonly delivery: 'dm';
  readonly messageId: string;
  readonly module: TestDmModule;
  readonly discordUserId: string;
};

export async function postConfigTestDm(
  body: TestDmRequest,
): Promise<TechnikaApiResult<TestDmResponse>> {
  try {
    const res = await fetch('/api/technik/config/test-dm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const { parsed } = await parseJson(res);
    if (!res.ok) {
      return failFrom(res, parsed, `http_${res.status}`);
    }
    return {
      ok: true,
      status: res.status,
      data: parsed as unknown as TestDmResponse,
    };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

const WAR_AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function computeNotifyAt(warAt: string, notifyMinutesBefore: number): string | null {
  if (!WAR_AT_RE.test(warAt) || !Number.isFinite(notifyMinutesBefore) || notifyMinutesBefore < 0) {
    return null;
  }
  const parts = warAt.split(':').map(Number);
  const h = parts[0];
  const m = parts[1];
  if (h === undefined || m === undefined) {
    return null;
  }
  const total = h * 60 + m - Math.floor(notifyMinutesBefore);
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
  const mm = String(normalized % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
