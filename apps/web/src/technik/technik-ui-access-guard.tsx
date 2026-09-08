'use client';

import { useEffect } from 'react';

const ACCESS_CHECK_URL = '/api/technik/config/preview';

/**
 * Technik navigation is hidden by default and revealed only after the existing
 * protected Technik proxy confirms that the current Discord session may use an
 * admin-only endpoint. This keeps navigation visibility aligned with the same
 * server-side access rule that protects Technik mutations.
 */
export function TechnikUiAccessGuard() {
  useEffect(() => {
    let cancelled = false;

    const root = document.documentElement;
    root.dataset.technikAccess = 'checking';

    void fetch(ACCESS_CHECK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    })
      .then((response) => {
        if (cancelled) return;
        root.dataset.technikAccess = response.ok ? 'allowed' : 'denied';
      })
      .catch(() => {
        if (cancelled) return;
        root.dataset.technikAccess = 'denied';
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <style>{`
      html:not([data-technik-access='allowed']) a[href='/technik'] {
        display: none !important;
      }
    `}</style>
  );
}
