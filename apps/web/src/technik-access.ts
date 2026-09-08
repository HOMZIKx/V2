'use client';

import { useEffect, useState } from 'react';

export type TechnikAccessState = 'checking' | 'allowed' | 'denied' | 'unavailable';

type TechnikAccessPayload = {
  readonly allowed?: unknown;
};

export async function fetchTechnikAccess(signal?: AbortSignal): Promise<TechnikAccessState> {
  try {
    const init: RequestInit = {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    };
    const response = await fetch('/api/technik/access', init);

    if (response.status === 401 || response.status === 403) return 'denied';
    if (!response.ok) return 'unavailable';

    const payload = (await response.json().catch(() => null)) as TechnikAccessPayload | null;
    return payload?.allowed === true ? 'allowed' : 'denied';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'checking';
    return 'unavailable';
  }
}

export function useTechnikAccess(): TechnikAccessState {
  const [access, setAccess] = useState<TechnikAccessState>('checking');

  useEffect(() => {
    const controller = new AbortController();
    void fetchTechnikAccess(controller.signal).then((result) => {
      if (!controller.signal.aborted) setAccess(result);
    });
    return () => controller.abort();
  }, []);

  return access;
}
