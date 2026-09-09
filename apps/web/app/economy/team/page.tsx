'use client';

import { AppShell } from '../../app-shell';
import { DiscordEntryScreen } from '../../discord-entry';
import { usePlayerStore } from '../../../src/player-store-react';
import { EconomyScopeNav } from '../economy-scope-nav';
import styles from '../economy.module.css';

export default function TeamEconomyEntryPage() {
  const { state, hydrated } = usePlayerStore();

  if (!hydrated) {
    return <main className="discord-entry"><p className="entry-status">Ładowanie…</p></main>;
  }
  if (state.authStatus !== 'authenticated' || !state.viewer) return <DiscordEntryScreen />;

  const teams = state.workspaces.filter((workspace) => !workspace.archived);

  return (
    <AppShell activeSection="economy" viewerName={state.viewer.displayName}>
      <main className={styles.page} id="main-content">
        <EconomyScopeNav active="team" />
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Ekonomia · Zespołowa</span>
            <h1>Wybierz zespół</h1>
            <p>Każdy zespół zachowuje własne dropy, koszty, ceny i podsumowania. Dane prywatne nie są do nich doliczane.</p>
          </div>
        </section>
        <section className={styles.scopeGrid}>
          {teams.map((team) => (
            <a className={styles.scopeCard} href={`/teams/${encodeURIComponent(team.id)}/economy`} key={team.id}>
              <span className={styles.eyebrow}>Zespół</span>
              <h2>{team.name}</h2>
              <p>Otwórz wspólną ekonomię tego zespołu.</p>
            </a>
          ))}
          {teams.length === 0 ? (
            <section className={styles.panel}>
              <h2>Brak dostępnego zespołu</h2>
              <p className={styles.muted}>Po uzyskaniu dostępu do zespołu jego ekonomia pojawi się tutaj.</p>
            </section>
          ) : null}
        </section>
      </main>
    </AppShell>
  );
}
