'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  HttpTeamMembershipAdapter,
  loadPendingInvitationById,
} from '../../../src/adapters/http-team-membership-adapter';
import { useSession } from '../../../src/components/SessionProvider';
import type { TeamInvitation } from '../../../src/team-membership';

import { InvitationResponse } from './invitation-response';

const adapter = new HttpTeamMembershipAdapter();

export default function InvitationPageClient() {
  const params = useParams<{ invitationId: string }>();
  const searchParams = useSearchParams();
  const { session, status } = useSession();
  const [invitation, setInvitation] = useState<TeamInvitation | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;
    const load = async () => {
      setError('');
      try {
        const pending = await loadPendingInvitationById(params.invitationId);
        if (pending !== null) {
          if (!cancelled) setInvitation(pending);
          return;
        }

        const revisionParam = searchParams.get('revision');
        if (revisionParam !== null && session !== null) {
          if (!cancelled) {
            setInvitation({
              id: params.invitationId,
              teamId: searchParams.get('teamId') ?? '',
              teamName: searchParams.get('teamName') ?? 'Zespół',
              inviterName: searchParams.get('inviterName') ?? 'Zespół',
              recipient: {
                discordUserId: session.discordUserId,
                displayName: session.displayName ?? 'Ty',
                username: session.displayName?.toLowerCase().replace(/\s+/g, '_') ?? 'ty',
                initials: (session.displayName ?? 'Ty').slice(0, 2).toUpperCase(),
                v2UserId: session.v2UserId,
              },
              status: 'pending',
              createdLabel: 'teraz',
              expiresLabel: 'za 7 dni',
              revision: Number(revisionParam),
              operationId: searchParams.get('operationId') ?? crypto.randomUUID(),
            });
          }
          return;
        }

        if (!cancelled) setError('Nie znaleziono zaproszenia lub wygasło.');
      } catch {
        if (!cancelled) setError('Nie udało się załadować zaproszenia.');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.invitationId, searchParams, session, status]);

  if (status === 'loading') {
    return (
      <main className="invitation-page panel" id="main-content">
        <p>Ładowanie…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="invitation-page panel" id="main-content">
        <p>{error}</p>
      </main>
    );
  }

  if (invitation === null) {
    return (
      <main className="invitation-page panel" id="main-content">
        <p>Ładowanie zaproszenia…</p>
      </main>
    );
  }

  return (
    <InvitationResponse
      adapter={adapter}
      initialInvitation={invitation}
      onConflict={() => setError('Konflikt wersji — odśwież stronę.')}
    />
  );
}
