'use client';

import { useMemo, useState } from 'react';

import {
  filterActivities,
  getActivityCenterSummary,
  getConfirmedParticipantCount,
  getViewerRsvp,
  updateViewerRsvp,
  type ActivityCenterSnapshot,
  type ActivityScope,
  type GuildActivity,
} from '../../src/activity-center';
import { AppShell, Icon } from '../app-shell';

const scopes: ReadonlyArray<{ id: ActivityScope; label: string }> = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'mine', label: 'Moje aktywności' },
  { id: 'joined', label: 'Zapisane' },
  { id: 'organized', label: 'Utworzone' },
];

function participationLabel(activity: GuildActivity) {
  const confirmedCount = getConfirmedParticipantCount(activity);
  return activity.capacity ? `${confirmedCount}/${activity.capacity} potwierdzonych` : `${confirmedCount} potwierdzonych`;
}

export function ActivityCenter({ initialSnapshot }: { initialSnapshot: ActivityCenterSnapshot }) {
  const [activities, setActivities] = useState<readonly GuildActivity[]>(initialSnapshot.activities);
  const [scope, setScope] = useState<ActivityScope>('all');
  const [selectedActivityId, setSelectedActivityId] = useState(initialSnapshot.activities[0]?.id ?? '');
  const [notice, setNotice] = useState('');
  const snapshot = useMemo(() => ({ ...initialSnapshot, activities }), [activities, initialSnapshot]);
  const summary = useMemo(() => getActivityCenterSummary(snapshot), [snapshot]);
  const visibleActivities = filterActivities(activities, scope);
  const selectedActivity = activities.find((activity) => activity.id === selectedActivityId) ?? visibleActivities[0];

  const updateRsvp = (activityId: string, status: 'confirmed' | 'tentative' | 'declined') => {
    setActivities((current) =>
      current.map((activity) =>
        activity.id === activityId ? updateViewerRsvp(activity, status, initialSnapshot.viewerName) : activity,
      ),
    );
    setNotice('Status uczestnictwa został zmieniony w tym widoku demonstracyjnym.');
  };

  return (
    <AppShell activeSection="activity" viewerName={initialSnapshot.viewerName}>
      <main className="activity-center-page" id="main-content">
        <header className="activity-center-hero">
          <div>
            <span className="eyebrow">Centrum Aktywności</span>
            <h1>Wydarzenia i zapisy</h1>
            <p>
              Ten sam model danych ma obsługiwać WWW i Discord. Tutaj przeglądasz wydarzenia,
              zmieniasz RSVP i czytasz powiadomienia; tworzenie pozostaje w panelu Discorda.
            </p>
          </div>
          <div className="activity-discord-note">
            <Icon name="activity" size={21} />
            <span>Utwórz aktywność w Discordzie</span>
          </div>
        </header>

        <section aria-label="Podsumowanie aktywności" className="activity-metrics">
          <article><strong>{summary.upcomingCount}</strong><span>nadchodzące aktywności</span></article>
          <article><strong>{summary.joinedCount}</strong><span>Twoje zapisy</span></article>
          <article><strong>{summary.organizedCount}</strong><span>organizowane przez Ciebie</span></article>
          <article><strong>{summary.unreadNotificationCount}</strong><span>nowe powiadomienia</span></article>
        </section>

        <div className="activity-center-grid">
          <section className="panel activity-list-panel">
            <header className="activity-list-header">
              <div>
                <span className="section-kicker">Przegląd</span>
                <h2>Aktywności</h2>
              </div>
              <div className="activity-scopes" role="group" aria-label="Zakres aktywności">
                {scopes.map((item) => (
                  <button
                    aria-pressed={scope === item.id}
                    className={scope === item.id ? 'is-active' : ''}
                    key={item.id}
                    onClick={() => setScope(item.id)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </header>
            <div className="activity-list">
              {visibleActivities.map((activity) => {
                const currentRsvp = getViewerRsvp(activity);
                return (
                  <button
                    aria-pressed={selectedActivity?.id === activity.id}
                    className={`activity-list-row${selectedActivity?.id === activity.id ? ' is-selected' : ''}`}
                    key={activity.id}
                    onClick={() => setSelectedActivityId(activity.id)}
                    type="button"
                  >
                    <span className="activity-list-icon"><Icon name="activity" size={17} /></span>
                    <span className="activity-list-copy">
                      <small>{activity.typeName} · {activity.serverName}</small>
                      <strong>{activity.title}</strong>
                      <em>{activity.startsLabel} · {participationLabel(activity)}</em>
                    </span>
                    <span className={`activity-rsvp-mark is-${currentRsvp ?? 'none'}`}>
                      {currentRsvp ? initialSnapshot.statuses.find((status) => status.id === currentRsvp)?.label : 'Brak RSVP'}
                    </span>
                    <Icon name="chevron" size={15} />
                  </button>
                );
              })}
              {visibleActivities.length === 0 && <div className="activity-empty">Brak aktywności w tym zakresie.</div>}
            </div>
          </section>

          {selectedActivity && (
            <aside className="panel activity-detail-panel">
              <header>
                <span className="section-kicker">Szczegóły wydarzenia</span>
                <h2>{selectedActivity.title}</h2>
                <p>{selectedActivity.description}</p>
              </header>
              <dl className="activity-detail-meta">
                <div><dt>Rodzaj</dt><dd>{selectedActivity.typeName}</dd></div>
                <div><dt>Termin</dt><dd>{selectedActivity.startsLabel}{selectedActivity.durationLabel ? ` · ${selectedActivity.durationLabel}` : ''}</dd></div>
                <div><dt>Publikacja</dt><dd>{selectedActivity.channelName}</dd></div>
                <div><dt>Organizator</dt><dd>{selectedActivity.organizer}{selectedActivity.coOrganizer ? ` · współorganizator: ${selectedActivity.coOrganizer}` : ''}</dd></div>
              </dl>
              {selectedActivity.requiresReconfirmation && (
                <div className="activity-reconfirmation">
                  <Icon name="clock" size={15} />
                  Termin został zmieniony — potwierdź udział ponownie przed {selectedActivity.signupClosesLabel}.
                </div>
              )}
              <div className="activity-rsvp-actions" aria-label="Twój status uczestnictwa">
                <span>Twój RSVP</span>
                <div>
                  {initialSnapshot.statuses.map((status) => (
                    <button
                      aria-pressed={getViewerRsvp(selectedActivity) === status.id}
                      className={`is-${status.id}${getViewerRsvp(selectedActivity) === status.id ? ' is-active' : ''}`}
                      key={status.id}
                      onClick={() => updateRsvp(selectedActivity.id, status.id)}
                      type="button"
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="activity-participants">
                <div><span>Uczestnicy</span><strong>{participationLabel(selectedActivity)}</strong></div>
                {selectedActivity.participants.map((participant) => (
                  <p key={participant.id}>
                    <span className={`activity-person-dot is-${participant.status}`} />
                    {participant.displayName}
                    <small>{initialSnapshot.statuses.find((status) => status.id === participant.status)?.label}</small>
                  </p>
                ))}
                {selectedActivity.waitlistCount > 0 && <p className="activity-waitlist">Lista rezerwowa: {selectedActivity.waitlistCount}</p>}
              </div>
            </aside>
          )}

          <aside className="panel activity-notifications-panel">
            <header className="panel-header"><div><span className="section-kicker">Skrzynka panelu</span><h2>Powiadomienia</h2></div><Icon name="bell" size={17} /></header>
            <div className="activity-notification-list">
              {initialSnapshot.notifications.map((notification) => (
                <article key={notification.id}>
                  <span><Icon name="bell" size={15} /></span>
                  <div><strong>{notification.title}</strong><p>{notification.detail}</p><small>{notification.timeLabel}</small></div>
                  {notification.unread && <i aria-label="Nieprzeczytane" />}
                </article>
              ))}
            </div>
          </aside>
        </div>
        <p aria-live="polite" className="sr-only">{notice}</p>
        <p className="mock-notice">
          RSVP działa lokalnie w demonstracji. Trwały zapis, limity, lista rezerwowa i powiadomienia Discord wymagają wspólnego API oraz audytu zmian.
        </p>
      </main>
    </AppShell>
  );
}
