'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { AppShell } from './AppShell';
import { GuildProvider } from './GuildProvider';
import { useSession } from './SessionProvider';
import { ErrorState, LoadingState } from './StateViews';

export function ProtectedApp({ children }: { children: ReactNode }) {
  const { status, error } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') {
      const next = pathname && pathname !== '/logowanie' ? pathname : '/aktywnosci';
      router.replace(`/logowanie?next=${encodeURIComponent(next)}`);
    }
  }, [status, router, pathname]);

  if (status === 'loading' || status === 'anonymous') {
    return (
      <div className="web-main">
        <LoadingState label="Sprawdzanie sesji…" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="web-main">
        <ErrorState title="Nie udało się sprawdzić sesji">
          {error ?? 'Spróbuj odświeżyć stronę.'}
        </ErrorState>
      </div>
    );
  }

  return (
    <GuildProvider>
      <AppShell>{children}</AppShell>
    </GuildProvider>
  );
}
