import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { listAdminGuilds } from '../api/activity-admin.js';
import { ApiClientError } from '../api/http.js';
import { ApiNetworkError } from '../api/network-error.js';
import { readAdminSession, type AdminGuildOption } from '../auth/session.js';
import { errorFromUnknown } from '../components/ui.js';
import { decideGuildInventory, initialDevGuilds, type GuildLoadState } from './guild-inventory.js';

interface GuildContextValue {
  readonly guildId: string | null;
  readonly guilds: readonly AdminGuildOption[];
  readonly setGuildId: (id: string) => void;
  readonly loadingGuilds: boolean;
  readonly guildLoadState: GuildLoadState;
  readonly devFallbackActive: boolean;
  readonly reloadGuilds: () => void;
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
  const fallbackGuilds = useMemo(() => [...initialDevGuilds(session)], [session]);
  const [guilds, setGuilds] = useState<AdminGuildOption[]>(() => [...fallbackGuilds]);
  const [guildLoadState, setGuildLoadState] = useState<GuildLoadState>({ kind: 'loading' });
  const [devFallbackActive, setDevFallbackActive] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [guildId, setGuildIdState] = useState<string | null>(() => {
    const stored = readStoredGuildId();
    if (stored !== null && fallbackGuilds.some((guild) => guild.id === stored)) {
      return stored;
    }
    return fallbackGuilds[0]?.id ?? null;
  });
  const guildIdRef = useRef(guildId);
  guildIdRef.current = guildId;

  const reloadGuilds = useCallback(() => {
    setGuildLoadState({ kind: 'loading' });
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setGuildLoadState({ kind: 'loading' });
      try {
        const remote = await listAdminGuilds();
        if (cancelled) {
          return;
        }
        const decision = decideGuildInventory({
          mode: session.mode,
          sessionGuilds: fallbackGuilds,
          currentGuildId: guildIdRef.current,
          remote: { kind: 'ok', guilds: remote },
        });
        setGuilds([...decision.guilds]);
        setGuildIdState(decision.selectedGuildId);
        setGuildLoadState(decision.loadState);
        setDevFallbackActive(decision.devFallbackActive);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const parsed = errorFromUnknown(error);
        const decision = decideGuildInventory({
          mode: session.mode,
          sessionGuilds: fallbackGuilds,
          currentGuildId: guildIdRef.current,
          remote: {
            kind: 'error',
            message: parsed.message,
            detail: parsed.detail,
            ...(error instanceof ApiClientError
              ? { code: error.code }
              : error instanceof ApiNetworkError
                ? { code: error.kind }
                : {}),
          },
        });
        setGuilds([...decision.guilds]);
        setGuildIdState(decision.selectedGuildId);
        setGuildLoadState(decision.loadState);
        setDevFallbackActive(decision.devFallbackActive);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.mode, fallbackGuilds, reloadToken]);

  const setGuildId = (id: string) => {
    setGuildIdState(id);
    writeStoredGuildId(id);
  };

  const value: GuildContextValue = {
    guildId,
    guilds,
    setGuildId,
    loadingGuilds: guildLoadState.kind === 'loading',
    guildLoadState,
    devFallbackActive,
    reloadGuilds,
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
