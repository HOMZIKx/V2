import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SessionProvider } from '../src/components/SessionProvider';

import './globals.css';

export const metadata: Metadata = {
  title: 'DESTILED — centrum zespołu',
  description: 'Prywatna przestrzeń graczy i administracji gildii DESTILED.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
