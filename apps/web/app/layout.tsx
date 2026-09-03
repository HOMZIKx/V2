import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PlayerStoreProvider } from '../src/player-store-react';
import './globals.css';

export const metadata: Metadata = {
  title: 'DESTILED — centrum gracza i zespołów',
  description: 'Prywatna przestrzeń graczy, zespołów i administracji gildii DESTILED.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <body>
        <PlayerStoreProvider>{children}</PlayerStoreProvider>
      </body>
    </html>
  );
}
