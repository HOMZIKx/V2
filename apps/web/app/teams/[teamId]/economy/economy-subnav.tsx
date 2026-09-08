'use client';

import { useParams, usePathname } from 'next/navigation';

import styles from './economy-tools.module.css';

export function EconomySubnav() {
  const { teamId } = useParams<{ teamId: string }>();
  const pathname = usePathname();
  const manage = pathname.includes('/economy/manage');
  const analysis = pathname.includes('/economy/analysis');
  const images = pathname.includes('/economy/images');
  const overview = !manage && !analysis && !images;

  return (
    <nav aria-label="Narzędzia ekonomii" className={styles.quickNav}>
      <a data-active={overview} href={`/teams/${teamId}/economy`}>
        Panel ekonomii
      </a>
      <a data-active={manage} href={`/teams/${teamId}/economy/manage`}>
        Magazyn · Baza · Ceny
      </a>
      <a data-active={analysis} href={`/teams/${teamId}/economy/analysis`}>
        Rentowność
      </a>
      <a data-active={images} href={`/teams/${teamId}/economy/images`}>
        Ilustracje
      </a>
    </nav>
  );
}
