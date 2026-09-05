'use client';

import { useState } from 'react';

import { usePlayerStore } from '../../src/player-store-react';
import { AppShell, Icon, type IconName } from '../app-shell';
import { DiscordEntryScreen } from '../discord-entry';

/**
 * Centrum Aktywności — consumer UI shell (P4 WWW first slice).
 *
 * TODO(New Bot / activity-service): wire real data via OpenAPI client generated
 * from the New Bot activity-service contract (events, RSVP, notifications,
 * reports). Do not invent a parallel Activity API here — Discord bridge is
 * in progress. Same backend, statuses, limits, and P3 permissions as Discord.
 */

type ActivityTabId =
  | 'create'
  | 'looking'
  | 'mine'
  | 'notifications'
  | 'report';

const ACTIVITY_TABS: ReadonlyArray<{
  id: ActivityTabId;
  label: string;
  icon: IconName;
}> = [
  { id: 'create', label: 'Utwórz aktywność', icon: 'plus' },
  { id: 'looking', label: 'Szukam ekipy', icon: 'search' },
  { id: 'mine', label: 'Moje aktywności', icon: 'activity' },
  { id: 'notifications', label: 'Powiadomienia', icon: 'bell' },
  { id: 'report', label: 'Zgłoś', icon: 'note' },
];

/** RSVP behavior labels only — real statuses come from activity-service later. */
const RSVP_LABELS = ['Będę', 'Może będę', 'Nie będę'] as const;

const EMPTY_COPY: Record<
  ActivityTabId,
  { title: string; body: string; hint: string }
> = {
  create: {
    title: 'Tworzenie aktywności',
    body: 'W pierwszym etapie WWW tworzenie pozostaje na Discordzie. Dane wydarzeń będą pochodzić z activity-service — most Discord w toku (New Bot).',
    hint: 'Po mostku ten panel otworzy ten sam flow tworzenia (jednorazowe wydarzenia) zgodnie z uprawnieniami P3.',
  },
  looking: {
    title: 'Szukam ekipy',
    body: 'Szybka ścieżka tworzenia tej samej aktywności. Lista i zapisy pojawią się, gdy bot/activity-service dostarczy dane — most Discord w toku (New Bot).',
    hint: 'Brak listy wydarzeń z API — nie pokazujemy wymyślonych eventów jako prawdziwych.',
  },
  mine: {
    title: 'Moje aktywności',
    body: 'Tu pojawią się utworzone, zapisane, zakończone i anulowane wydarzenia. Dane z bota/activity-service — most Discord w toku (New Bot).',
    hint: 'Podgląd i zmiana RSVP (Będę / Może będę / Nie będę) po podłączeniu OpenAPI.',
  },
  notifications: {
    title: 'Powiadomienia',
    body: 'Skrzynka panelu (wspólna z Discord DM). Powiadomienia o zmianie terminu, anulowaniu i awansie z listy rezerwowej — dane z activity-service, most w toku (New Bot).',
    hint: 'Pusta skrzynka, dopóki serwis nie prześle wpisów.',
  },
  report: {
    title: 'Zgłoś',
    body: 'Zgłoszenia wydarzeń (katalog powodów + „Inny powód”) trafią do moderatorów przez activity-service. Most Discord w toku (New Bot).',
    hint: 'Formularz zgłoszenia będzie dostępny po kontrakcie OpenAPI.',
  },
};

export function ActivityCenter() {
  const { state, hydrated } = usePlayerStore();
  const [activeTab, setActiveTab] = useState<ActivityTabId>('mine');
  const empty = EMPTY_COPY[activeTab];
  const activeIcon =
    ACTIVITY_TABS.find((tab) => tab.id === activeTab)?.icon ?? 'activity';

  if (!hydrated) {
    return (
      <main className="discord-entry" id="main-content">
        <p className="entry-status">Ładowanie…</p>
      </main>
    );
  }

  if (state.authStatus !== 'authenticated' || !state.viewer) {
    return <DiscordEntryScreen />;
  }

  return (
    <AppShell activeSection="activity" viewerName={state.viewer.displayName}>
      <main className="activity-center-page" id="main-content">
        <header className="activity-center-hero">
          <div>
            <span className="eyebrow">Centrum Aktywności</span>
            <h1>Aktywność</h1>
            <p>
              Przeglądanie, RSVP i powiadomienia panelowe — te same dane i reguły co Discord.
              Tworzenie w pierwszym etapie WWW pozostaje na Discordzie. Dane z bota/activity-service
              — most Discord w toku (New Bot).
            </p>
          </div>
          <div className="activity-discord-note">
            <Icon name="activity" size={21} />
            <span>Shell UI · bez Activity API · most New Bot w toku</span>
          </div>
        </header>

        <nav aria-label="Centrum Aktywności" className="activity-shell-tabs" role="tablist">
          {ACTIVITY_TABS.map((tab) => (
            <button
              aria-controls={`activity-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={`activity-shell-tab${activeTab === tab.id ? ' is-active' : ''}`}
              id={`activity-tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              <Icon name={tab.icon} size={15} />
              {tab.label}
            </button>
          ))}
        </nav>

        <section
          aria-labelledby={`activity-tab-${activeTab}`}
          className="panel activity-shell-panel"
          id={`activity-panel-${activeTab}`}
          role="tabpanel"
        >
          <div className="activity-shell-empty">
            <span className="activity-shell-empty-icon" aria-hidden="true">
              <Icon name={activeIcon} size={22} />
            </span>
            <h2>{empty.title}</h2>
            <p>{empty.body}</p>
            <p className="activity-shell-hint">{empty.hint}</p>
          </div>

          <div className="activity-shell-rsvp-legend" aria-label="Etykiety RSVP (przygotowanie UI)">
            <span className="section-kicker">RSVP (etykiety)</span>
            <div className="activity-shell-rsvp-row">
              {RSVP_LABELS.map((label) => (
                <span className="activity-shell-rsvp-chip" key={label}>
                  {label}
                </span>
              ))}
            </div>
            <p className="activity-shell-hint">
              Zachowania RSVP: Będę / Może będę / Nie będę — tylko etykiety w shellu; statusy i
              occupiesSlot przyjdą z konfiguracji serwera przez activity-service.
            </p>
          </div>
        </section>

        <aside className="panel activity-shell-example" aria-label="Przykład UI">
          <header className="activity-shell-example-header">
            <span className="activity-shell-example-badge">przykład UI</span>
            <strong>Wzorcowa karta wydarzenia</strong>
          </header>
          <p className="activity-shell-example-note">
            To nie jest prawdziwe wydarzenie ani dane z API — wyłącznie makieta layoutu.
          </p>
          <article className="activity-shell-example-card">
            <small>Event gildyjny · przykładowy serwer</small>
            <strong>Nazwa aktywności (przykład UI)</strong>
            <em>Termin · 0/8 potwierdzonych</em>
            <div className="activity-shell-rsvp-row" aria-hidden="true">
              {RSVP_LABELS.map((label) => (
                <span className="activity-shell-rsvp-chip is-muted" key={label}>
                  {label}
                </span>
              ))}
            </div>
          </article>
        </aside>

        <p className="mock-notice">
          Shell Centrum Aktywności: brak połączenia z activity-service. Po kontrakcie OpenAPI z New
          Bot lista, RSVP i powiadomienia zastąpią stany puste — bez osobnego mock API w apps/web.
        </p>
      </main>
    </AppShell>
  );
}