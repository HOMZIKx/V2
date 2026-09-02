import { Manrope, Sora } from 'next/font/google';
import type { ReactNode } from 'react';

import '@v2/design-system/primitives.css';
import '@v2/design-system/tokens.css';
import { SessionProvider } from '../src/components/SessionProvider';
import './web.css';

const sora = Sora({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sora',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata = {
  title: 'V2 — Aktywności',
  description: 'Portal członka V2 — aktywności, zapisy i powiadomienia',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl" className={`${sora.variable} ${manrope.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
