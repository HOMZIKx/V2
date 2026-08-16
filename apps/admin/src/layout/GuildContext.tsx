import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { listAdminGuilds } from '../api/activity-admin.js';
import { readAdminSession, type AdminGuildOption } from '../auth/session.js';

interface GuildContextValue {
  readonly guildId: string | null;
  readonly guilds: readonly AdminGuildOption[];
  readonly setGuildId: (id: string) => void;
  readonly loadingGuilds: boolean;
}

const GuildContext = createContext<GuildContextValue | null>(null);

const STORAGE_KEY = 'v2.admin.selectedGuildId';

function readStoredGuildId(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStoredGuildId(id: string): void {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, id);
  } catch {
    // ignore (SSR / restricted storage)
  }
}

export function GuildProvider(props: { children: ReactNode }) {
  const session = useMemo(() => readAdminSession(), []);
  const [guilds, setGuilds] = useState<AdminGuildOption[]>([...session.guilds]);
  const [loadingGuilds, setLoadingGuilds] = useState(session.guilds.length === 0);
  const [guildId, setGuildIdState] = useState<string | null>(() => {
    const stored = readStoredGuildId();
    if (stored !== null && session.guilds.some((g) => g.id === stored)) {
      return stored;
    }
    return session.guilds[0]?.id ?? null;
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const remote = await listAdminGuilds();
        if (cancelled) {
          return;
        }
        if (remote.length > 0) {
          setGuilds(remote);
          setGuildIdState((current) => {
            if (current !== null && remote.some((g) => g.id === current)) {
              return current;
            }
            return remote[0]?.id ?? null;
          });
        } else if (session.guilds.length > 0) {
          setGuilds([...session.guilds]);
          setGuildIdState((current) => current ?? session.guilds[0]?.id ?? null);
        }
      } finally {
        if (!cancelled) {
          setLoadingGuilds(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.guilds]);

  const setGuildId = (id: string) => {
    setGuildIdState(id);
    writeStoredGuildId(id);
  };

  const value: GuildContextValue = {
    guildId,
    guilds,
    setGuildId,
    loadingGuilds,
  };

  return <GuildContext.Provider value={value}>{props.children}</GuildContext.Provider>;
}

export function useGuildContext(): GuildContextValue {
  const ctx = useContext(GuildContext);
  if (ctx === null) {
    throw new Error('useGuildContext must be used within GuildProvider');
  }
  return ctx;
}

export function useRequiredGuildId(): string | null {
  return useGuildContext().guildId;
}
