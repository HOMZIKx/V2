/**
 * Technik access for Aktywność członków — web-owned draft fields.
 * Real Discord membership gate is Identity/OAuth (out of gateway scope here).
 */

export const MATEUSZ_OPERATOR_DISCORD_ID = '808066932753563668';

export const MATEUSZ_OPERATOR_ENTRY: TechnikOperatorEntry = {
  discordUserId: MATEUSZ_OPERATOR_DISCORD_ID,
  displayName: 'Mateusz',
};

export type TechnikOperatorEntry = {
  readonly discordUserId: string;
  readonly displayName?: string;
};

export type TechnikAccessConfig = {
  /** Discord role IDs that unlock Aktywność in Technik for holders. */
  readonly adminRoleIds: readonly string[];
  /** Extra Discord user snowflakes with auto access to Aktywność. */
  readonly operators: readonly TechnikOperatorEntry[];
};

export const DEFAULT_TECHNIK_ACCESS: TechnikAccessConfig = {
  adminRoleIds: [],
  operators: [{ ...MATEUSZ_OPERATOR_ENTRY }],
};

const SNOWFLAKE = /^\d{17,20}$/;

/** Mateusz is permanent Technik operator — always present, never dropped. */
export function ensureMateuszOperator(
  operators: readonly TechnikOperatorEntry[],
): TechnikOperatorEntry[] {
  const rest = operators.filter((o) => o.discordUserId !== MATEUSZ_OPERATOR_DISCORD_ID);
  return [{ ...MATEUSZ_OPERATOR_ENTRY }, ...rest];
}

export function isPermanentTechnikOperator(discordUserId: string): boolean {
  return discordUserId === MATEUSZ_OPERATOR_DISCORD_ID;
}

/**
 * Resolve Discord snowflake from viewer: discordAccountId, or id if snowflake.
 */
export function resolveViewerDiscordId(viewer: unknown): string {
  if (!viewer || typeof viewer !== 'object') return '';
  const v = viewer as Record<string, unknown>;
  const fromAccount =
    typeof v.discordAccountId === 'string' ? v.discordAccountId.trim() : '';
  if (SNOWFLAKE.test(fromAccount)) return fromAccount;
  const fromId = typeof v.id === 'string' ? v.id.trim() : '';
  if (SNOWFLAKE.test(fromId)) return fromId;
  return '';
}

/** Demo/local seeded owner — id is 'mateusz' without discordAccountId. */
function viewerLooksLikeMateuszOwner(viewer: unknown): boolean {
  if (!viewer || typeof viewer !== 'object') return false;
  const v = viewer as Record<string, unknown>;
  const id = typeof v.id === 'string' ? v.id.trim().toLowerCase() : '';
  if (id === 'mateusz') return true;
  const name =
    typeof v.displayName === 'string'
      ? v.displayName.trim().toLowerCase()
      : typeof v.discordDisplayName === 'string'
        ? v.discordDisplayName.trim().toLowerCase()
        : '';
  // Only when Discord id missing — avoid false positives on other Mateuszes with real ids.
  const hasDiscord =
    (typeof v.discordAccountId === 'string' && SNOWFLAKE.test(v.discordAccountId.trim())) ||
    SNOWFLAKE.test(id);
  if (!hasDiscord && name === 'mateusz' && id === 'mateusz') return true;
  return false;
}

export function readTechnikAccessFromConfig(
  cfg: Record<string, unknown> | null | undefined,
): TechnikAccessConfig {
  const raw =
    cfg && typeof cfg.technikAccess === 'object' && cfg.technikAccess
      ? (cfg.technikAccess as Record<string, unknown>)
      : null;
  // Fallback: legacy nested under memberActivity
  const nested =
    !raw &&
    cfg &&
    typeof cfg.memberActivity === 'object' &&
    cfg.memberActivity
      ? (cfg.memberActivity as Record<string, unknown>)
      : null;
  const src = raw ?? nested;
  if (!src) {
    return {
      adminRoleIds: [...DEFAULT_TECHNIK_ACCESS.adminRoleIds],
      operators: ensureMateuszOperator(DEFAULT_TECHNIK_ACCESS.operators),
    };
  }

  const adminRoleIds = Array.isArray(src.adminRoleIds)
    ? src.adminRoleIds.map(String).filter((id) => SNOWFLAKE.test(id))
    : [];

  const operators: TechnikOperatorEntry[] = [];
  const opRaw = src.operators ?? src.operatorDiscordIds;
  if (Array.isArray(opRaw)) {
    for (const item of opRaw) {
      if (typeof item === 'string' && SNOWFLAKE.test(item)) {
        operators.push({ discordUserId: item });
      } else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const id = String(o.discordUserId ?? o.id ?? '');
        if (!SNOWFLAKE.test(id)) continue;
        const displayName =
          typeof o.displayName === 'string' && o.displayName.trim()
            ? o.displayName.trim()
            : undefined;
        operators.push(displayName ? { discordUserId: id, displayName } : { discordUserId: id });
      }
    }
  }

  return { adminRoleIds, operators: ensureMateuszOperator(operators) };
}

function readViewerRoleIds(viewer: unknown): string[] {
  if (!viewer || typeof viewer !== 'object') return [];
  const v = viewer as Record<string, unknown>;
  for (const key of ['discordRoleIds', 'roleIds', 'roles'] as const) {
    const c = v[key];
    if (!Array.isArray(c)) continue;
    const ids: string[] = [];
    for (const item of c) {
      if (typeof item === 'string' && SNOWFLAKE.test(item)) ids.push(item);
      else if (item && typeof item === 'object') {
        const id = (item as Record<string, unknown>).id;
        if (typeof id === 'string' && SNOWFLAKE.test(id)) ids.push(id);
      }
    }
    if (ids.length) return [...new Set(ids)];
  }
  return [];
}

/**
 * Client-side gate for /technik/aktywnosc.
 * Mateusz operator id always allowed; demo owner id 'mateusz' allowed;
 * then operator list; then best-effort admin roles.
 */
export function canAccessMemberActivityTechnik(opts: {
  readonly viewerDiscordId: string | null | undefined;
  readonly viewer?: unknown;
  readonly access: TechnikAccessConfig;
}): boolean {
  const fromArg = (opts.viewerDiscordId ?? '').trim();
  const fromViewer = resolveViewerDiscordId(opts.viewer);
  const uid = SNOWFLAKE.test(fromArg) ? fromArg : fromViewer;

  if (uid === MATEUSZ_OPERATOR_DISCORD_ID) return true;
  if (viewerLooksLikeMateuszOwner(opts.viewer)) return true;

  if (uid && opts.access.operators.some((o) => o.discordUserId === uid)) return true;
  if (opts.access.adminRoleIds.length > 0) {
    const roles = readViewerRoleIds(opts.viewer);
    if (roles.some((r) => opts.access.adminRoleIds.includes(r))) return true;
  }
  return false;
}
