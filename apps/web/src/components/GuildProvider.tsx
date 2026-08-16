'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  readConfiguredGuilds,
  resolveInitialGuildId,
  writeStoredGuildId,
  type WebGuildOption,
} from '../lib/guilds';

interface GuildContextValue {
  readonly guilds: readonly WebGuildOption[];
  readonly guildId: string | null;
  readonly setGuildId: (id: string) => void;
  readonly unavailable: boolean;
}

const GuildContext = createContext<GuildContextValue | null>(null);

export function GuildProvider({ children }: { children: ReactNode }) {
  const guilds = useMemo(() => readConfiguredGuilds(), []);
  const [guildId, setGuildIdState] = useState<string | null>(null);

  useEffect(() => {
    setGuildIdState(resolveInitialGuildId(guilds));
  }, [guilds]);

  const setGuildId = useCallback((id: string) => {
    setGuildIdState(id);
    writeStoredGuildId(id);
  }, []);

  const value = useMemo(
    () => ({
      guilds,
      guildId,
      setGuildId,
      unavailable: guilds.length === 0,
    }),
    [guilds, guildId, setGuildId],
  );

  return <GuildContext.Provider value={value}>{children}</GuildContext.Provider>;
}

export function useGuild(): GuildContextValue {
  const ctx = useContext(GuildContext);
  if (ctx === null) {
    throw new Error('useGuild must be used within GuildProvider');
  }
  return ctx;
}
