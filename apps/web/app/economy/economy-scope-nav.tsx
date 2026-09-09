import styles from './economy.module.css';

export function EconomyScopeNav({
  active,
  teamQuery = '',
}: {
  readonly active: 'private' | 'team' | 'home';
  readonly teamQuery?: string;
}) {
  const teamHref = teamQuery ? `/economy/team?${teamQuery}` : '/economy/team';

  return (
    <nav aria-label="Zakres ekonomii" className={styles.scopeNav}>
      <a
        aria-current={active === 'private' ? 'page' : undefined}
        className={active === 'private' ? styles.scopeLinkActive : styles.scopeLink}
        href="/economy/private"
      >
        Prywatna
      </a>
      <a
        aria-current={active === 'team' ? 'page' : undefined}
        className={active === 'team' ? styles.scopeLinkActive : styles.scopeLink}
        href={teamHref}
      >
        Zespołowa
      </a>
    </nav>
  );
}
