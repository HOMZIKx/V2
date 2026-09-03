'use client';

import { useEffect, useState } from 'react';

import { useSession } from '../src/components/SessionProvider';
import { buildDiscordLoginUrl } from '../src/lib/env';
import { getTeamDetail, listCharacterBoards, listTeams } from '../src/lib/player-workspace-api';
import {
  mapBoardsToDashboardCharacters,
  mapTeamDetailToDashboard,
} from '../src/lib/player-workspace-mappers';
import type { MemberDashboardSnapshot } from '../src/member-dashboard';

import { MemberDashboard } from './member-dashboard';

export function HomePageClient() {
  const { status, session, error } = useSession();
  const [snapshot, setSnapshot] = useState<MemberDashboardSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'authenticated') {
      setLoading(status === 'loading');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const teams = await listTeams();
        const viewerName = session?.displayName?.trim() || 'Gracz';
        if (teams.length === 0) {
          if (!cancelled) {
            setSnapshot({
              viewerName,
              teamName: 'Brak zespołu',
              teamMembers: [],
              quickActions: [],
              equipmentSets: [],
              characters: [],
              history: [],
            });
          }
          return;
        }

        const firstTeam = teams[0]!;
        const detail = await getTeamDetail(firstTeam.id);
        const boards = await listCharacterBoards(firstTeam.id);
        const base = mapTeamDetailToDashboard(viewerName, detail.team, detail.members);
        if (!cancelled) {
          setSnapshot({
            ...base,
            characters: mapBoardsToDashboardCharacters(boards),
          });
        }
      } catch {
        if (!cancelled) {
          setLoadError('Nie udało się załadować danych zespołu.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [session?.displayName, status]);

  if (status === 'loading' || loading) {
    return (
      <main className="dashboard panel" id="main-content">
        <p>Ładowanie pulpitu…</p>
      </main>
    );
  }

  if (status === 'anonymous') {
    return (
      <main className="dashboard panel" id="main-content">
        <h1>Pulpit członka</h1>
        <p>Zaloguj się przez Discord, aby zobaczyć swoje zespoły.</p>
        <a className="primary-button" href={buildDiscordLoginUrl('/')}>
          Zaloguj przez Discord
        </a>
      </main>
    );
  }

  if (status === 'error' || loadError !== null) {
    return (
      <main className="dashboard panel" id="main-content">
        <h1>Pulpit członka</h1>
        <p>{loadError ?? error ?? 'Błąd sesji.'}</p>
      </main>
    );
  }

  if (snapshot === null) {
    return (
      <main className="dashboard panel" id="main-content">
        <p>Brak danych pulpitu.</p>
      </main>
    );
  }

  return <MemberDashboard initialSnapshot={snapshot} />;
}
