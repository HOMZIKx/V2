import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { TeamInvitationSync } from '../src/team-invitation-sync';
import { TeamMembershipGuard } from '../src/team-membership-guard';
import { PlayerStoreProvider } from '../src/player-store-react';
import { AuthGate } from './auth-gate';
import './globals.css';
import './generaly-metki-theme.css';

export const metadata: Metadata = {
  title: 'DESTILED — centrum gracza i zespołów',
  description: 'Prywatna przestrzeń graczy, zespołów i administracji gildii DESTILED.',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="pl">
      <body>
        <PlayerStoreProvider>
          <TeamInvitationSync />
          <TeamMembershipGuard />
          <AuthGate>{children}</AuthGate>
        </PlayerStoreProvider>
      </body>
    </html>
  );
}
