'use client';

import { AppShell } from '../app-shell';
import { DiscordEntryScreen } from '../discord-entry';
import { usePlayerStore } from '../../src/player-store-react';
import styles from './economy.module.css';
import { EconomyScopeNav } from './economy-scope-nav';

export default function EconomyPage() {
  const { state, hydrated } = usePlayerStore();

  if (!hydrated) {
    return <main className="discord-entry"><p className="entry-status">Ładowanie…</p></main>;
  }
  if (state.authStatus !== 'authenticated' || !state.viewer) return <DiscordEntryScreen />;

  return (
    <AppShell activeSection="economy" viewerName={state.viewer.displayName}>
      <main className={styles.page} id="main-content">
        <EconomyScopeNav active="home" />
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Ekonomia</span>
            <h1>Oddzielone dane prywatne i zespołowe</h1>
            <p>Wybierz zakres. Prywatne wpisy należą tylko do Twojego konta; zespołowe pozostają współdzielone w wybranym zespole.</p>
          </div>
        </section>
        <section className={styles.scopeGrid}>
          <a className={styles.scopeCard} href="/economy/private">
            <span className={styles.eyebrow}>Tylko Ty</span>
            <h2>Prywatna</h2>
            <p>Własne dropy, koszty, historia i podsumowania. Dane są izolowane po stronie serwera dla zalogowanego użytkownika.</p>
          </a>
          <a className={styles.scopeCard} href="/economy/team">
            <span className={styles.eyebrow}>Wspólny zakres</span>
            <h2>Zespołowa</h2>
            <p>Dotychczasowa ekonomia zespołu, jego uczestnicy, wspólne dropy i koszty.</p>
          </a>
        </section>
      </main>
    </AppShell>
  );
}
