'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useGuild } from '../components/GuildProvider';
import { useSession } from '../components/SessionProvider';
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
  UnavailableState,
} from '../components/StateViews';
import { listActivities, listMyActivities, listParticipants } from '../lib/api';
import { formatPolishDateTime } from '../lib/datetime';
import { lifecycleLabel } from '../lib/labels';
import { mapApiError, type LoadState } from '../lib/load-state';
import type { ActivityDto, ParticipationDto } from '../lib/types';

function countOccupied(participants: readonly ParticipationDto[]): number {
  return participants.filter(
    (p) =>
      p.occupiesSlot &&
      p.resignedAt === null &&
      p.removedAt === null &&
      p.waitlistPosition === null,
  ).length;
}

export function ActivitiesPage() {
  const { guildId, unavailable } = useGuild();
  const { session } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [items, setItems] = useState<ActivityDto[]>([]);
  const [myStatusById, setMyStatusById] = useState<Record<string, string>>({});
  const [slotsById, setSlotsById] = useState<
    Record<string, { occupied: number; limit: number | null }>
  >({});
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(async () => {
    if (unavailable || guildId === null) {
      setState({ kind: 'unavailable', message: 'Brak skonfigurowanego serwera.' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const [activities, mine] = await Promise.all([
        listActivities(guildId),
        listMyActivities(guildId).catch(() => [] as ActivityDto[]),
      ]);
      const sorted = [...activities].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      );
      setItems(sorted);

      const mineIds = new Set(mine.map((a) => a.id));
      const statusMap: Record<string, string> = {};
      const slotsMap: Record<string, { occupied: number; limit: number | null }> = {};

      await Promise.all(
        sorted.slice(0, 40).map(async (activity) => {
          try {
            const participants = await listParticipants(activity.id);
            slotsMap[activity.id] = {
              occupied: countOccupied(participants),
              limit: activity.participantLimit,
            };
            if (mineIds.has(activity.id) && session !== null) {
              const mineP = participants.find(
                (p) =>
                  (p.discordUserId !== null && p.discordUserId === session.discordUserId) ||
                  (p.v2UserId !== null && p.v2UserId === session.v2UserId),
              );
              if (mineP !== undefined && mineP.resignedAt === null && mineP.removedAt === null) {
                statusMap[activity.id] =
                  mineP.confirmationState === 'requires_reconfirmation'
                    ? 'Wymaga potwierdzenia'
                    : mineP.waitlistPosition !== null
                      ? `Lista rezerwowa #${mineP.waitlistPosition}`
                      : 'Zapisany';
              }
            }
          } catch {
            // slots/status optional on list
          }
        }),
      );
      setMyStatusById(statusMap);
      setSlotsById(slotsMap);
      setState(sorted.length === 0 ? { kind: 'empty' } : { kind: 'ready' });
    } catch (err) {
      setState(mapApiError(err));
    }
  }, [guildId, unavailable, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') {
      return items;
    }
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  const statusOptions = useMemo(() => {
    const set = new Set(items.map((item) => item.status));
    return [...set].sort();
  }, [items]);

  if (unavailable) {
    return (
      <>
        <header className="page-hero">
          <h1>Aktywności</h1>
          <p>Najbliższe wydarzenia na Twoim serwerze.</p>
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
        <h1>Aktywności</h1>
        <p>Najbliższe wydarzenia — zapis i statusy przez ten sam backend co Discord.</p>
      </header>

      <div className="toolbar">
        <div className="field">
          <label htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
            }}
          >
            <option value="all">Wszystkie</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {lifecycleLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          Odśwież
        </button>
      </div>

      {state.kind === 'loading' ? <LoadingState /> : null}
      {state.kind === 'forbidden' ? <ForbiddenState /> : null}
      {state.kind === 'unavailable' ? (
        <UnavailableState>{'message' in state ? state.message : undefined}</UnavailableState>
      ) : null}
      {state.kind === 'error' ? <ErrorState>{state.message}</ErrorState> : null}
      {state.kind === 'empty' ? (
        <EmptyState title="Brak aktywności">
          Na tym serwerze nie ma jeszcze opublikowanych aktywności.
        </EmptyState>
      ) : null}

      {state.kind === 'ready' || (state.kind === 'empty' && filtered.length > 0) ? (
        filtered.length === 0 ? (
          <EmptyState title="Brak wyników filtra">Zmień filtr statusu.</EmptyState>
        ) : (
          <div className="activity-list">
            {filtered.map((activity) => {
              const slots = slotsById[activity.id];
              const myStatus = myStatusById[activity.id];
              return (
                <article key={activity.id} className="activity-row">
                  <div>
                    <Link className="title" href={`/aktywnosci/${activity.id}`}>
                      {activity.name}
                    </Link>
                    <div className="meta">
                      {formatPolishDateTime(activity.startAt, activity.timezone || undefined)}
                      {activity.organizerDiscordUserId !== null
                        ? ` · Organizator ${activity.organizerDiscordUserId}`
                        : null}
                    </div>
                    <div className="chip-row" style={{ marginTop: '0.45rem' }}>
                      <span className="chip" data-tone="accent">
                        {lifecycleLabel(activity.status)}
                      </span>
                      {slots !== undefined ? (
                        <span className="chip">
                          Miejsca{' '}
                          {slots.limit === null
                            ? String(slots.occupied)
                            : `${slots.occupied}/${slots.limit}`}
                        </span>
                      ) : null}
                      {myStatus !== undefined ? (
                        <span className="chip" data-tone="ok">
                          {myStatus}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Link className="btn btn-secondary" href={`/aktywnosci/${activity.id}`}>
                    Szczegóły
                  </Link>
                </article>
              );
            })}
            <p className="muted" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
              Brak dalszych
            </p>
          </div>
        )
      ) : null}
    </>
  );
}
