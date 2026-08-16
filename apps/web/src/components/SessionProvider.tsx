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

import { ApiClientError, getSessionMe, logoutIdentity } from '../lib/api';
import type { SessionMeDto } from '../lib/types';

type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

interface SessionContextValue {
  readonly status: SessionStatus;
  readonly session: SessionMeDto | null;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [session, setSession] = useState<SessionMeDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const me = await getSessionMe();
      setSession(me);
      setStatus('authenticated');
    } catch (err) {
      setSession(null);
      if (err instanceof ApiClientError && err.isUnauthorized) {
        setStatus('anonymous');
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Session probe failed');
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutIdentity();
    } catch {
      // still clear local session view
    }
    setSession(null);
    setStatus('anonymous');
    window.location.assign('/logowanie');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, session, error, refresh, logout }),
    [status, session, error, refresh, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return ctx;
}
