'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

const ACCESS_CHECK_URL = '/api/technik/config/preview';

export function TechnikRouteAccessGuard({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetch(ACCESS_CHECK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          document.documentElement.dataset.technikAccess = 'allowed';
          setAllowed(true);
          return;
        }
        document.documentElement.dataset.technikAccess = 'denied';
        router.replace('/');
      })
      .catch(() => {
        if (cancelled) return;
        document.documentElement.dataset.technikAccess = 'denied';
        router.replace('/');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!allowed) {
    return (
      <main className="discord-entry" id="main-content">
        <p className="entry-status">Sprawdzanie dostępu do panelu Technik…</p>
      </main>
    );
  }

  return children;
}
