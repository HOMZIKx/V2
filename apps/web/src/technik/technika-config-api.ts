/**
 * Browser client for Technika bot config (D-060).
 * Calls same-origin /api/technik/* — server holds DISCORD_TECHNIKA_SHARED_SECRET.
 * Never expose the secret via NEXT_PUBLIC_*.
 */

export type TimersNotifyConfig = {
  readonly enabled: boolean;
  readonly messageTemplate: string;
  readonly reminderMinutesBefore: number;
  readonly resetNotifyEnabled: boolean;
};

export type KingdomWarConfig = {
  readonly enabled: boolean;
  readonly warAt: string;
  readonly notifyMinutesBefore: number;
  readonly messageTemplate: string;
};

export type BotConfigValues = {
  readonly 'panel-test-enabled': boolean;
  readonly 'notify-timer-enabled': boolean;
  readonly timersNotify: TimersNotifyConfig;
  readonly kingdomWar: KingdomWarConfig;
  readonly 'notify-timer-dm-action-buttons': boolean;
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

export const DEFAULT_KINGDOM_WAR: KingdomWarConfig = {
  enabled: false,
  warAt: '18:00',
  notifyMinutesBefore: 30,
  messageTemplate:
    '**DESTILED · Wojna Królestw**\nZa {{notifyMinutesBefore}} min ({{warAt}}).',
};

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
  return {
    ok: false,
    error: err,
    status: res.status,
    detail: typeof parsed.detail === 'string' ? parsed.detail : typeof parsed.hint === 'string' ? parsed.hint : undefined,
    issues,
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

export async function putConfigDraft(
  partial: { readonly timersNotify?: Partial<TimersNotifyConfig>; readonly kingdomWar?: Partial<KingdomWarConfig> } & Record<string, unknown>,
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
    return { ok: true, status: res.status, data: parsed as unknown as ConfigSnapshot & { ok: true } };
  } catch (error) {
    return {
      ok: false,
      error: 'network_error',
      status: 0,
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}

export async function postConfigRollback(): Promise<TechnikaApiResult<ConfigSnapshot & { ok: true }>> {
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
    return { ok: true, status: res.status, data: parsed as unknown as ConfigSnapshot & { ok: true } };
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
