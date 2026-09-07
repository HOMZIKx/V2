/**
 * Optional guild roles for Technika pickers.
 * Guild-scoped roles via web proxy. Named pickers use this when ok.
 */

export type GuildRole = {
  readonly id: string;
  readonly name: string;
  readonly color?: number;
};

export type GuildRolesResult =
  | { readonly ok: true; readonly roles: readonly GuildRole[]; readonly via: string }
  | {
      readonly ok: false;
      readonly error: string;
      readonly status: number;
      readonly unavailable?: boolean;
    };

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: 'invalid_json', detail: raw.slice(0, 200) };
  }
}

function mapRoles(parsed: Record<string, unknown>): GuildRole[] {
  const raw = Array.isArray(parsed.roles)
    ? parsed.roles
    : Array.isArray(parsed.items)
      ? parsed.items
      : [];
  return raw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .map((r) => ({
      id: typeof r.id === 'string' ? r.id : '',
      name: typeof r.name === 'string' && r.name.trim() ? r.name : 'Rola',
      ...(typeof r.color === 'number' ? { color: r.color } : {}),
    }))
    .filter((r) => /^\d{17,20}$/.test(r.id) && r.name !== '@everyone');
}

/** GET /api/technik/guilds/{guildId}/roles — proxy forwards Technika secret; 404/501 = unavailable. */
export async function fetchGuildRoles(guildId: string): Promise<GuildRolesResult> {
  try {
    const res = await fetch('/api/technik/guilds/' + encodeURIComponent(guildId) + '/roles', {
      cache: 'no-store',
    });
    const parsed = await parseJson(res);
    if (res.status === 404 || res.status === 501) {
      return { ok: false, error: 'roles_unavailable', status: res.status, unavailable: true };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: typeof parsed.error === 'string' ? parsed.error : 'http_' + String(res.status),
        status: res.status,
      };
    }
    return { ok: true, roles: mapRoles(parsed), via: 'guild' };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'network_error',
      status: 0,
    };
  }
}

export function roleLabel(id: string, roles: readonly GuildRole[]): string {
  const hit = roles.find((r) => r.id === id);
  return hit ? hit.name : 'Rola · …' + id.slice(-4);
}
