'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge, Button, Select } from '@v2/design-system';

import { useGuild } from '../components/GuildProvider';
import {
  ConflictState,
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
  UnauthorizedState,
  UnavailableState,
} from '../components/StateViews';
import { listActivities } from '../lib/api';
import { formatEventCapacity, organizerDisplayName } from '../lib/capacity';
import { formatActivityWhen } from '../lib/datetime';
import { lifecycleLabel } from '../lib/labels';
import { mapApiError, type LoadState } from '../lib/load-state';
import { GUILD_UNAVAILABLE_COPY, isAbortError } from '../lib/member-copy';
import { createRequestIdentity } from '../lib/request-identity';
import type { ActivityDto } from '../lib/types';

function myStatusLabel(activity: ActivityDto): string | null {
  const mine = activity.myParticipationStatus;
  if (mine === undefined || mine === null) {
    return null;
  }
  if (mine.confirmationState === 'requires_reconfirmation') {
    return 'Wymaga potwierdzenia';
  }
  if (mine.waitlistPosition !== null) {
    return `Lista rezerwowa #${mine.waitlistPosition}`;
  }
  return mine.statusLabel;
}

export function ActivitiesPage() {
  const { guildId, unavailable } = useGuild();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [items, setItems] = useState<ActivityDto[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const requests = useRef(createRequestIdentity());

  const load = useCallback(async () => {
    const request = requests.current.next();
    if (unavailable || guildId === null) {
      setState({ kind: 'unavailable', message: GUILD_UNAVAILABLE_COPY });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const activities = await listActivities(guildId, request.signal);
      if (!request.isCurrent()) {
        return;
      }
      const sorted = [...activities].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      );
      setItems(sorted);
      setState(sorted.length === 0 ? { kind: 'empty' } : { kind: 'ready' });
    } catch (err) {
      if (isAbortError(err) || !request.isCurrent()) {
        return;
      }
      setState(mapApiError(err));
    }
  }, [guildId, unavailable]);

  useEffect(() => {
    void load();
    const identity = requests.current;
    return () => {
      identity.invalidate();
    };
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
        </header>
        <UnavailableState title="Nie udało się ustalić serwera">
          {GUILD_UNAVAILABLE_COPY}
        </UnavailableState>
      </>
    );
  }

  return (
    <>
      <header className="page-hero">
        <h1>Aktywności</h1>
        <p>Najbliższe wydarzenia na Twoim serwerze.</p>
      </header>

      <div className="toolbar">
        <Select
          id="status-filter"
          aria-label="Status aktywności"
          value={statusFilter}
          options={[
            { value: 'all', label: 'Wszystkie' },
            ...statusOptions.map((status) => ({
              value: status,
              label: lifecycleLabel(status),
            })),
          ]}
          onChange={(event) => {
            setStatusFilter(event.target.value);
          }}
        />
        <Button variant="secondary" onClick={() => void load()}>
          Odśwież
        </Button>
      </div>

      {state.kind === 'loading' ? <LoadingState /> : null}
      {state.kind === 'unauthorized' ? <UnauthorizedState /> : null}
      {state.kind === 'forbidden' ? <ForbiddenState /> : null}
      {state.kind === 'unavailable' ? (
        <UnavailableState>{'message' in state ? state.message : undefined}</UnavailableState>
      ) : null}
      {state.kind === 'conflict' ? <ConflictState /> : null}
      {state.kind === 'error' ? <ErrorState>{state.message}</ErrorState> : null}
      {state.kind === 'empty' ? (
        <EmptyState title="Brak aktywności">Na razie nie ma nic zaplanowanego.</EmptyState>
      ) : null}

      {state.kind === 'ready' ? (
        filtered.length === 0 ? (
          <EmptyState title="Brak wyników">Zmień filtr statusu.</EmptyState>
        ) : (
          <div className="activity-list">
            {filtered.map((activity) => {
              const mine = myStatusLabel(activity);
              return (
                <article key={activity.id} className="activity-card">
                  <div>
                    <h2 className="activity-title">
                      <Link href={`/aktywnosci/${activity.id}`}>{activity.name}</Link>
                    </h2>
                    <p className="meta">
                      {formatActivityWhen(activity.startAt, activity.timezone)}
                    </p>
                    <dl className="activity-facts">
                      {activity.typeLabel !== undefined &&
                      activity.typeLabel !== null &&
                      activity.typeLabel !== '' ? (
                        <>
                          <dt>Typ</dt>
                          <dd>{activity.typeLabel}</dd>
                        </>
                      ) : null}
                      <dt>Prowadzi</dt>
                      <dd>{organizerDisplayName(activity)}</dd>
                      <dt>Miejsca</dt>
                      <dd>
                        {formatEventCapacity(activity.occupiedSlots, activity.participantLimit)}
                      </dd>
                      <dt>Twój status</dt>
                      <dd>{mine ?? 'Brak zapisu'}</dd>
                      <dt>Status</dt>
                      <dd>
                        <Badge
                          tone={
                            activity.status === 'cancelled'
                              ? 'error'
                              : activity.status === 'completed'
                                ? 'ok'
                                : 'info'
                          }
                        >
                          {lifecycleLabel(activity.status)}
                        </Badge>
                      </dd>
                    </dl>
                  </div>
                  <Link className="v2-btn" href={`/aktywnosci/${activity.id}`}>
                    Szczegóły
                  </Link>
                </article>
              );
            })}
          </div>
        )
      ) : null}
    </>
  );
}
