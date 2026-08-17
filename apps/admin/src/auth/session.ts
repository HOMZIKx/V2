export interface AdminGuildOption {
  readonly id: string;
  readonly name: string;
}

export interface AdminSession {
  readonly mode: 'dev-actor' | 'identity-cookie';
  readonly actorDiscordUserId: string | null;
  readonly guilds: readonly AdminGuildOption[];
  readonly orgId: string | null;
}

function parseDevGuilds(raw: string | undefined): AdminGuildOption[] {
  if (raw === undefined || raw.trim() === '') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const guilds: AdminGuildOption[] = [];
    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        'name' in item &&
        typeof (item as { id: unknown }).id === 'string' &&
        typeof (item as { name: unknown }).name === 'string'
      ) {
        guilds.push({
          id: (item as { id: string }).id,
          name: (item as { name: string }).name,
        });
      }
    }
    return guilds;
  } catch {
    return [];
  }
}

/**
 * Local/dev session for P4.3 Admin.
 *
 * Production: Identity session cookie via API gateway — browser sends
 * `credentials: 'include'` on fetch; do not invent password login here.
 */
export function readAdminSession(): AdminSession {
  const actorDiscordUserId = import.meta.env.VITE_ADMIN_DEV_ACTOR_DISCORD_ID?.trim() || null;
  const orgId = import.meta.env.VITE_ADMIN_DEV_ORG_ID?.trim() || null;

  if (actorDiscordUserId !== null) {
    return {
      mode: 'dev-actor',
      actorDiscordUserId,
      guilds: parseDevGuilds(import.meta.env.VITE_ADMIN_DEV_GUILDS),
      orgId,
    };
  }

  return {
    mode: 'identity-cookie',
    actorDiscordUserId: null,
    guilds: [],
    orgId,
  };
}

export function isDevActorMode(session: AdminSession): boolean {
  return session.mode === 'dev-actor';
}
