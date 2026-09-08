'use client';

import { useParams, usePathname } from 'next/navigation';

import styles from './economy-tools.module.css';

export function EconomySubnav() {
  const { teamId } = useParams<{ teamId: string }>();
  const pathname = usePathname();
  const manage = pathname.includes('/economy/manage');

  return (
    <nav aria-label="Narzędzia ekonomii" className={styles.quickNav}>
      <a data-active={!manage} href={`/teams/${teamId}/economy`}>
        Panel ekonomii
      </a>
      <a data-active={manage} href={`/teams/${teamId}/economy/manage`}>
        Magazyn · Baza · Ceny
      </a>
    </nav>
  );
}
