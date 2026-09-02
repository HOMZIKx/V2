'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@v2/design-system';

import { getSelfStats, listMyActivities } from '../lib/api';
import { formatEventCapacity, organizerDisplayName } from '../lib/capacity';
import { formatActivityWhen } from '../lib/datetime';
import { lifecycleLabel } from '../lib/labels';
import { mapApiError, type LoadState } from '../lib/load-state';
import {
  bucketMyActivity,
  GUILD_UNAVAILABLE_COPY,
  isAbortError,
  MY_ACTIVITY_BUCKET_LABELS,
  type MyActivityBucket,
} from '../lib/member-copy';
import { createRequestIdentity } from '../lib/request-identity';
import type { ActivityDto } from '../lib/types';
import { useGuild } from './GuildProvider';
import { useSession } from './SessionProvider';
import {
  ConflictState,
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
  UnauthorizedState,
  UnavailableState,
} from './StateViews';

const BUCKET_ORDER: readonly MyActivityBucket[] = ['needs_attention', 'upcoming', 'completed'];

export function MyActivitiesPage() {
  const { guildId, unavailable } = useGuild();
  const { session, status } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [buckets, setBuckets] = useState<Record<MyActivityBucket, ActivityDto[]>>({
    upcoming: [],
    needs_attention: [],
    completed: [],
  });
  const [stats, setStats] = useState<{ present: number; absent: number; total: number } | null>(
    null,
  );
  const requests = useRef(createRequestIdentity());

  const load = useCallback(async () => {
    const request = requests.current.next();
    if (status === 'loading') {
      setState({ kind: 'loading' });
      return;
    }
    if (status === 'anonymous' || session === null) {
      setState({ kind: 'unauthorized' });
      return;
    }
    if (unavailable) {
      setState({ kind: 'unavailable', message: GUILD_UNAVAILABLE_COPY });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const activities = await listMyActivities(guildId ?? undefined, request.signal);
      if (!request.isCurrent()) {
        return;
      }
      const next: Record<MyActivityBucket, ActivityDto[]> = {
        upcoming: [],
        needs_attention: [],
        completed: [],
      };
      for (const activity of activities) {
        next[bucketMyActivity(activity)].push(activity);
      }
      for (const key of BUCKET_ORDER) {
        next[key].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      }
      setBuckets(next);
      if (guildId !== null && guildId !== undefined && guildId.trim() !== '') {
        try {
          const selfStats = await getSelfStats(guildId, request.signal);
          if (request.isCurrent()) {
            setStats(selfStats);
          }
        } catch {
          if (request.isCurrent()) {
            setStats(null);
          }
        }
      } else if (request.isCurrent()) {
        setStats(null);
      }
      const total = next.upcoming.length + next.needs_attention.length + next.completed.length;
      setState(total === 0 ? { kind: 'empty' } : { kind: 'ready' });
    } catch (err) {
      if (isAbortError(err) || !request.isCurrent()) {
        return;
      }
      setState(mapApiError(err));
    }
  }, [guildId, unavailable, session, status]);

  useEffect(() => {
    void load();
    const identity = requests.current;
    return () => {
      identity.invalidate();
    };
  }, [load]);

  if (unavailable) {
    return (
      <>
        <header className="page-hero">
          <h1>Moje aktywności</h1>
        </header>
        <UnavailableState title="Brak przypisanego serwera">
          {GUILD_UNAVAILABLE_COPY}
        </UnavailableState>
      </>
    );
  }

  return (
    <>
      <header className="page-hero">
        <h1>Moje aktywności</h1>
        <p>Nadchodzące wydarzenia, rzeczy wymagające reakcji i historia.</p>
      </header>

      {stats !== null ? (
        <p className="muted">
          Frekwencja (oznaczona): obecny {stats.present} · nieobecny {stats.absent} · łącznie{' '}
          {stats.total}
        </p>
      ) : null}

      {state.kind === 'loading' ? <LoadingState /> : null}
      {state.kind === 'unauthorized' ? <UnauthorizedState /> : null}
      {state.kind === 'forbidden' ? <ForbiddenState /> : null}
      {state.kind === 'unavailable' ? <UnavailableState>{state.message}</UnavailableState> : null}
      {state.kind === 'conflict' ? <ConflictState /> : null}
      {state.kind === 'error' ? <ErrorState>{state.message}</ErrorState> : null}
      {state.kind === 'empty' ? (
        <EmptyState title="Brak Twoich aktywności">
          Na razie nie masz nic na liście. Zapisy są na liście aktywności.
        </EmptyState>
      ) : null}

      {state.kind === 'ready'
        ? BUCKET_ORDER.map((key) => {
            const list = buckets[key];
            if (list.length === 0) {
              return null;
            }
            return (
              <section
                key={key}
                className={key === 'needs_attention' ? 'needs-attention' : undefined}
              >
                <h2 className="section-title">{MY_ACTIVITY_BUCKET_LABELS[key]}</h2>
                <div className="activity-list">
                  {list.map((activity) => (
                    <article key={activity.id} className="activity-card">
                      <div>
                        <h3 className="activity-title">
                          <Link href={`/aktywnosci/${activity.id}`}>{activity.name}</Link>
                        </h3>
                        <p className="meta">
                          {formatActivityWhen(activity.startAt, activity.timezone)}
                        </p>
                        <p className="meta">Prowadzi: {organizerDisplayName(activity)}</p>
                        <p className="meta">
                          {formatEventCapacity(activity.occupiedSlots, activity.participantLimit)}
                        </p>
                        {activity.myParticipationStatus?.confirmationState ===
                        'requires_reconfirmation' ? (
                          <Badge tone="warn">Wymaga potwierdzenia</Badge>
                        ) : (
                          <Badge tone="info">{lifecycleLabel(activity.status)}</Badge>
                        )}
                      </div>
                      <Link className="v2-btn" href={`/aktywnosci/${activity.id}`}>
                        Szczegóły
                      </Link>
                    </article>
                  ))}
                </div>
              </section>
            );
          })
        : null}
    </>
  );
}
