'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';

import { usePlayerStore } from '../../../../src/player-store-react';
import {
  getTeamDailyTimerPanelConfig,
  setTeamDailyTimerPanelTime,
} from '../../../../src/team-daily-timer-panel-api';
import { AppShell } from '../../../app-shell';
import { DiscordEntryScreen } from '../../../discord-entry';
import { WorkspaceSectionNav } from '../workspace-section-nav';

export function TeamTimerNotificationSettings() {
  const params = useParams<{ teamId: string }>();
  const { state, hydrated } = usePlayerStore();
  const workspace = state.workspaces.find((entry) => entry.id === params.teamId) ?? null;
  const [dailyTime, setDailyTime] = useState('08:00');
  const [savedTime, setSavedTime] = useState('08:00');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isOwner = useMemo(() => {
    if (!workspace || !state.viewer) return false;
    const viewerDiscordId = state.viewer.discordAccountId?.trim() ?? '';
    return workspace.members.some(
      (member) =>
        member.role === 'owner' &&
        (member.id === state.viewer?.id ||
          (!!viewerDiscordId && member.discordAccountId === viewerDiscordId)),
    );
  }, [workspace, state.viewer]);

  useEffect(() => {
    if (!workspace || !hydrated || state.authStatus !== 'authenticated') return;
    let active = true;
    setLoading(true);
    void getTeamDailyTimerPanelConfig(workspace.id)
      .then((config) => {
        if (!active) return;
        const value = config?.dailyTime ?? '08:00';
        setDailyTime(value);
        setSavedTime(value);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(
          error instanceof Error
            ? error.message
            : 'Nie udało się pobrać ustawienia panelu PW.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hydrated, state.authStatus, workspace?.id]);

  if (!hydrated) return <main className="discord-entry"><p className="entry-status">Ładowanie…</p></main>;
  if (state.authStatus !== 'authenticated' || !state.viewer) return <DiscordEntryScreen />;
  if (!workspace || workspace.archived) {
    return (
      <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
        <main className="membership-page"><h1>Nie znaleziono zespołu</h1></main>
      </AppShell>
    );
  }

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOwner || saving) return;
    setSaving(true);
    setMessage(null);
    void setTeamDailyTimerPanelTime(workspace.id, dailyTime)
      .then((config) => {
        setSavedTime(config.dailyTime);
        setDailyTime(config.dailyTime);
        setMessage(`Zapisano. Zespół otrzyma panel timerów codziennie o ${config.dailyTime}.`);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'Nie udało się zapisać ustawienia panelu PW.');
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <AppShell activeSection="teams" viewerName={state.viewer.displayName}>
      <main className="membership-page" id="main-content">
        <WorkspaceSectionNav active="notifications" workspaceId={workspace.id} />
        <header className="membership-hero">
          <div>
            <span className="eyebrow">Discord PW</span>
            <h1>Timery i Wojna</h1>
            <p>Jedna dzienna wiadomość z timerami. Bez osobnych PW przy każdym kliknięciu.</p>
          </div>
        </header>

        {message ? <p className="entry-status" role="status">{message}</p> : null}

        <section className="panel team-notify-prefs-panel">
          <header><h2>Dzienny panel timerów</h2></header>
          <p className="empty-copy">
            O tej godzinie wszyscy członkowie zespołu z włączonymi PW timerów dostają własny panel.
            Panel żyje przez cały dzień i aktualizuje się po zmianach na stronie oraz po kliknięciach w Discordzie.
          </p>
          <form className="team-rename-form" onSubmit={(event) => { save(event); }}>
            <label className="field">
              <span>Godzina wysyłki · Europe/Warsaw</span>
              <input
                disabled={!isOwner || loading || saving}
                onChange={(event) => setDailyTime(event.target.value)}
                step={60}
                type="time"
                value={dailyTime}
              />
            </label>
            <button className="secondary-button" disabled={!isOwner || saving || dailyTime === savedTime} type="submit">
              {saving ? 'Zapisywanie…' : 'Zapisz godzinę'}
            </button>
          </form>
          {!isOwner ? <p className="empty-copy">Godzinę może zmienić właściciel zespołu.</p> : null}
        </section>

        <section className="panel team-notify-prefs-panel">
          <header><h2>Wojna Królestw</h2></header>
          <p className="empty-copy">
            Panel wojny pojawia się 30 minut przed startem. Z listy wybierasz postacie, które prowadzisz,
            a wybory są na żywo widoczne w panelach PW pozostałych członków zespołu.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
