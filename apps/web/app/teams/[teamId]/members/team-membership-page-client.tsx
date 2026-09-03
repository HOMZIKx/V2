'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { HttpTeamMembershipAdapter } from '../../../../src/adapters/http-team-membership-adapter';
import type { TeamMembershipSnapshot } from '../../../../src/team-membership';
import { TeamMembershipManagement } from './team-membership-management';

const adapter = new HttpTeamMembershipAdapter();

export default function TeamMembershipPageClient() {
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;
  const [snapshot, setSnapshot] = useState<TeamMembershipSnapshot | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError('');
      try {
        const data = await adapter.getTeamMembership(teamId);
        if (!cancelled) setSnapshot(data);
      } catch {
        if (!cancelled) setError('Nie udało się załadować członkostwa zespołu.');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (error) {
    return (
      <main className="membership-page panel" id="main-content">
        <p>{error}</p>
      </main>
    );
  }

  if (snapshot === null) {
    return (
      <main className="membership-page panel" id="main-content">
        <p>Ładowanie członków…</p>
      </main>
    );
  }

  return <TeamMembershipManagement adapter={adapter} initialSnapshot={snapshot} />;
}
