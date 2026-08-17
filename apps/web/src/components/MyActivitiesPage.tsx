'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { listMyActivities, listParticipants } from '../lib/api';
import { formatPolishDateTime } from '../lib/datetime';
import { isHistoricalLifecycle, lifecycleLabel } from '../lib/labels';
import { mapApiError, type LoadState } from '../lib/load-state';
import type { ActivityDto, ParticipationDto } from '../lib/types';
import { useGuild } from './GuildProvider';
import { useSession } from './SessionProvider';
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
  UnauthorizedState,
  UnavailableState,
} from './StateViews';

type BucketKey = 'organizing' | 'joined' | 'needs_action' | 'historical';

const BUCKET_LABELS: Record<BucketKey, string> = {
  organizing: 'Organizuję',
  joined: 'Jestem zapisany',
  needs_action: 'Wymagają reakcji',
  historical: 'Historyczne',
};

function isOrganizer(activity: ActivityDto, discordUserId: string, v2UserId: string): boolean {
  return (
    activity.organizerDiscordUserId === discordUserId ||
    activity.coOrganizerDiscordUserId === discordUserId ||
    activity.organizerV2UserId === v2UserId ||
    activity.coOrganizerV2UserId === v2UserId
  );
}

function findMine(
  participants: readonly ParticipationDto[],
  discordUserId: string,
  v2UserId: string,
): ParticipationDto | undefined {
  return participants.find(
    (p) =>
      ((p.discordUserId !== null && p.discordUserId === discordUserId) ||
        (p.v2UserId !== null && p.v2UserId === v2UserId)) &&
      p.resignedAt === null &&
      p.removedAt === null,
  );
}

export function MyActivitiesPage() {
  const { guildId, unavailable } = useGuild();
  const { session, status } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [buckets, setBuckets] = useState<Record<BucketKey, ActivityDto[]>>({
    organizing: [],
    joined: [],
    needs_action: [],
    historical: [],
  });

  const load = useCallback(async () => {
    if (status === 'loading') {
      setState({ kind: 'loading' });
      return;
    }
    if (status === 'anonymous' || session === null) {
      setState({ kind: 'unauthorized' });
      return;
    }
    if (unavailable) {
      setState({ kind: 'unavailable', message: 'Brak skonfigurowanego serwera.' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const activities = await listMyActivities(guildId ?? undefined);
      const next: Record<BucketKey, ActivityDto[]> = {
        organizing: [],
        joined: [],
        needs_action: [],
        historical: [],
      };

      await Promise.all(
        activities.map(async (activity) => {
          if (isHistoricalLifecycle(activity.status)) {
            next.historical.push(activity);
            return;
          }
          let participation: ParticipationDto | undefined;
          try {
            const parts = await listParticipants(activity.id);
            participation = findMine(parts, session.discordUserId, session.v2UserId);
          } catch {
            participation = undefined;
          }

          if (participation?.confirmationState === 'requires_reconfirmation') {
            next.needs_action.push(activity);
            return;
          }
          if (isOrganizer(activity, session.discordUserId, session.v2UserId)) {
            next.organizing.push(activity);
            return;
          }
          if (participation !== undefined) {
            next.joined.push(activity);
          }
        }),
      );

      for (const key of Object.keys(next) as BucketKey[]) {
        next[key].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      }
      setBuckets(next);
      const total =
        next.organizing.length +
        next.joined.length +
        next.needs_action.length +
        next.historical.length;
      setState(total === 0 ? { kind: 'empty' } : { kind: 'ready' });
    } catch (err) {
      setState(mapApiError(err));
    }
  }, [guildId, unavailable, session, status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (unavailable) {
    return (
      <>
        <header className="page-hero">
          <h1>Moje aktywności</h1>
        </header>
        <UnavailableState title="Brak serwera">
          Ustaw <code>NEXT_PUBLIC_WEB_GUILDS</code> lub{' '}
          <code>NEXT_PUBLIC_DISCORD_TEST_GUILD_ID</code>.
        </UnavailableState>
      </>
    );
  }

  return (
    <>
      <header className="page-hero">
        <h1>Moje aktywności</h1>
        <p>Organizuję, zapisane, wymagające reakcji oraz historyczne.</p>
      </header>

      {state.kind === 'loading' ? <LoadingState /> : null}
      {state.kind === 'unauthorized' ? <UnauthorizedState /> : null}
      {state.kind === 'forbidden' ? <ForbiddenState /> : null}
      {state.kind === 'unavailable' ? <UnavailableState>{state.message}</UnavailableState> : null}
      {state.kind === 'error' ? <ErrorState>{state.message}</ErrorState> : null}
      {state.kind === 'empty' ? (
        <EmptyState title="Brak Twoich aktywności">
          Zapisz się na aktywność z listy albo utwórz ją na Discordzie.
        </EmptyState>
      ) : null}

      {state.kind === 'ready'
        ? (Object.keys(BUCKET_LABELS) as BucketKey[]).map((key) => {
            const list = buckets[key];
            if (list.length === 0) {
              return null;
            }
            return (
              <section key={key}>
                <h2 className="section-title">{BUCKET_LABELS[key]}</h2>
                <div className="activity-list">
                  {list.map((activity) => (
                    <article key={activity.id} className="activity-row">
                      <div>
                        <Link className="title" href={`/aktywnosci/${activity.id}`}>
                          {activity.name}
                        </Link>
                        <div className="meta">
                          {formatPolishDateTime(activity.startAt, activity.timezone || undefined)} ·{' '}
                          {lifecycleLabel(activity.status)}
                        </div>
                      </div>
                      <Link className="btn btn-secondary" href={`/aktywnosci/${activity.id}`}>
                        Otwórz
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
