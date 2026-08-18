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

type AdminViteEnv = {
  readonly DEV: boolean;
  readonly VITE_ADMIN_DEV_ACTOR_DISCORD_ID?: string;
  readonly VITE_ADMIN_DEV_GUILDS?: string;
  readonly VITE_ADMIN_DEV_ORG_ID?: string;
};

/**
 * Local/dev session for P4.3 Admin.
 *
 * Production builds (import.meta.env.DEV === false) always use Identity
 * cookie mode, even if VITE_ADMIN_DEV_* were accidentally present at build.
 */
export function readAdminSession(env: AdminViteEnv = import.meta.env): AdminSession {
  if (!env.DEV) {
    return {
      mode: 'identity-cookie',
      actorDiscordUserId: null,
      guilds: [],
      orgId: null,
    };
  }

  const actorDiscordUserId = env.VITE_ADMIN_DEV_ACTOR_DISCORD_ID?.trim() || null;
  const orgId = env.VITE_ADMIN_DEV_ORG_ID?.trim() || null;

  if (actorDiscordUserId !== null) {
    return {
      mode: 'dev-actor',
      actorDiscordUserId,
      guilds: parseDevGuilds(env.VITE_ADMIN_DEV_GUILDS),
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
