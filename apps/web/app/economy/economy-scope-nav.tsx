import styles from './economy.module.css';

export function EconomyScopeNav({ active }: { readonly active: 'private' | 'team' | 'home' }) {
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
        href="/economy/team"
      >
        Zespołowa
      </a>
    </nav>
  );
}
