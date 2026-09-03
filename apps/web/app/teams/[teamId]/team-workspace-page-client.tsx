'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useSession } from '../../../src/components/SessionProvider';
import { getTeamDetail, listCharacterBoards } from '../../../src/lib/player-workspace-api';
import { mapTeamDetailToWorkspace } from '../../../src/lib/player-workspace-mappers';
import type { TeamWorkspaceSnapshot } from '../../../src/team-workspace';

import { TeamWorkspace } from './team-workspace';

export default function TeamWorkspacePageClient() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const { session } = useSession();
  const [snapshot, setSnapshot] = useState<TeamWorkspaceSnapshot | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError('');
      try {
        const detail = await getTeamDetail(teamId);
        const boards = await listCharacterBoards(teamId);
        const viewerName = session?.displayName?.trim() || 'Gracz';
        if (!cancelled) {
          setSnapshot(mapTeamDetailToWorkspace(viewerName, detail, boards));
        }
      } catch {
        if (!cancelled) setError('Nie udało się załadować przestrzeni zespołu.');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session?.displayName, teamId]);

  if (error) {
    return (
      <main className="team-workspace panel" id="main-content">
        <p>{error}</p>
      </main>
    );
  }

  if (snapshot === null) {
    return (
      <main className="team-workspace panel" id="main-content">
        <p>Ładowanie zespołu…</p>
      </main>
    );
  }

  return <TeamWorkspace initialSnapshot={snapshot} teamId={teamId} />;
}
