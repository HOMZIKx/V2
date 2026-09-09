'use client';

import { useEffect, useState } from 'react';

import { usePlayerStore } from '../../src/player-store-react';
import { AppShell } from '../app-shell';
import { DiscordEntryScreen } from '../discord-entry';
import { EconomyScopeNav } from './economy-scope-nav';
import styles from './economy.module.css';

export default function EconomyPage() {
  const { state, hydrated } = usePlayerStore();
  const [teamQuery, setTeamQuery] = useState('');

  useEffect(() => {
    setTeamQuery(window.location.search.replace(/^\?/, ''));
  }, []);

  if (!hydrated) {
    return <main className="discord-entry"><p className="entry-status">Ładowanie…</p></main>;
  }
  if (state.authStatus !== 'authenticated' || !state.viewer) return <DiscordEntryScreen />;

  const teamHref = teamQuery ? `/economy/team?${teamQuery}` : '/economy/team';
  const fromParty = new URLSearchParams(teamQuery).get('scope') === 'team';

  return (
    <AppShell activeSection="economy" viewerName={state.viewer.displayName}>
      <main className={styles.page} id="main-content">
        <EconomyScopeNav active="home" teamQuery={teamQuery} />
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Ekonomia</span>
            <h1>Oddzielone dane prywatne i zespołowe</h1>
            <p>
              {fromParty
                ? 'Przechodzisz z sesji Party. Wybierz Zespołową, a znany kontekst sesji zostanie przeniesiony do formularza dropu.'
                : 'Wybierz zakres. Prywatne wpisy należą tylko do Twojego konta; zespołowe pozostają współdzielone w wybranym zespole.'}
            </p>
          </div>
        </section>
        <section className={styles.scopeGrid}>
          <a className={styles.scopeCard} href="/economy/private">
            <span className={styles.eyebrow}>Tylko Ty</span>
            <h2>Prywatna</h2>
            <p>Własne dropy, koszty, historia i podsumowania. Dane są izolowane po stronie serwera dla zalogowanego użytkownika.</p>
          </a>
          <a className={styles.scopeCard} href={teamHref}>
            <span className={styles.eyebrow}>{fromParty ? 'Sesja Party' : 'Wspólny zakres'}</span>
            <h2>Zespołowa</h2>
            <p>{fromParty ? 'Wybierz zespół. Źródło, mapa, CH i uczestnicy sesji zostaną zachowani.' : 'Dotychczasowa ekonomia zespołu, jego uczestnicy, wspólne dropy i koszty.'}</p>
          </a>
        </section>
      </main>
    </AppShell>
  );
}
