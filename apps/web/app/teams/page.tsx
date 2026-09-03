'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { useSession } from '../../src/components/SessionProvider';
import { buildDiscordLoginUrl } from '../../src/lib/env';
import { createTeam, listTeams, type TeamRecordDto } from '../../src/lib/player-workspace-api';
import { AppShell, Icon } from '../app-shell';

export default function TeamsListPage() {
  const { status } = useSession();
  const [teams, setTeams] = useState<readonly TeamRecordDto[]>([]);
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') {
      setLoading(status === 'loading');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const items = await listTeams();
        if (!cancelled) setTeams(items);
      } catch {
        if (!cancelled) setError('Nie udało się załadować listy zespołów.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = teamName.trim();
    if (name.length === 0) return;

    setCreating(true);
    setError('');
    try {
      const detail = await createTeam(name);
      setTeams((current) => [...current, detail.team]);
      setTeamName('');
    } catch {
      setError('Nie udało się utworzyć zespołu.');
    } finally {
      setCreating(false);
    }
  };

  if (status === 'anonymous') {
    return (
      <AppShell activeSection="teams" viewerName="Gość">
        <main className="membership-page panel" id="main-content">
          <h1>Zespoły</h1>
          <p>Zaloguj się, aby zarządzać zespołami.</p>
          <a className="primary-button" href={buildDiscordLoginUrl('/teams')}>
            Zaloguj przez Discord
          </a>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell activeSection="teams" viewerName="Gracz">
      <main className="membership-page" id="main-content">
        <header className="membership-hero">
          <div>
            <span className="eyebrow">Prywatne zespoły</span>
            <h1>Twoje zespoły</h1>
            <p>Wybierz zespół lub utwórz nową wspólną przestrzeń postaci.</p>
          </div>
        </header>

        {loading ? (
          <section className="panel">
            <p>Ładowanie zespołów…</p>
          </section>
        ) : (
          <>
            {error && <p className="form-error">{error}</p>}
            <section className="panel membership-members-panel">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Dostępne zespoły</span>
                  <h2>Lista</h2>
                </div>
                <span className="count-badge">{teams.length}</span>
              </header>
              <div className="membership-member-list">
                {teams.length === 0 ? (
                  <p>Nie należysz jeszcze do żadnego zespołu.</p>
                ) : (
                  teams.map((team) => (
                    <article className="membership-member" key={team.id}>
                      <span className="member-avatar is-online">
                        {team.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <strong>{team.name}</strong>
                        <small>rev. {team.revision}</small>
                      </div>
                      <a className="secondary-button" href={`/teams/${team.id}`}>
                        Otwórz
                      </a>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="panel invite-panel">
              <header className="panel-header">
                <div>
                  <span className="section-kicker">Nowy zespół</span>
                  <h2>Utwórz przestrzeń</h2>
                </div>
                <Icon name="plus" size={18} />
              </header>
              <form
                className="invite-flow"
                onSubmit={(event) => {
                  void handleCreate(event);
                }}
              >
                <label htmlFor="team-name">Nazwa zespołu</label>
                <input
                  id="team-name"
                  maxLength={80}
                  onChange={(event) => setTeamName(event.target.value)}
                  placeholder="np. Asteria"
                  value={teamName}
                />
                <button disabled={creating || teamName.trim().length === 0} type="submit">
                  {creating ? 'Tworzenie…' : 'Utwórz zespół'}
                </button>
              </form>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
