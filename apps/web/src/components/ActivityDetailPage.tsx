'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getActivity, getGuildConfig, listParticipants, reconfirm, resign, rsvp } from '../lib/api';
import { formatPolishDateTime } from '../lib/datetime';
import { lifecycleLabel } from '../lib/labels';
import { mapApiError, type LoadState } from '../lib/load-state';
import type { ActivityDto, ParticipationDto, StatusDefDto } from '../lib/types';
import { useSession } from './SessionProvider';
import {
  ErrorState,
  ForbiddenState,
  LoadingState,
  UnauthorizedState,
  UnavailableState,
} from './StateViews';

function findMine(
  participants: readonly ParticipationDto[],
  discordUserId: string,
  v2UserId: string,
): ParticipationDto | undefined {
  return participants.find(
    (p) =>
      (p.discordUserId !== null && p.discordUserId === discordUserId) ||
      (p.v2UserId !== null && p.v2UserId === v2UserId),
  );
}

function occupiedCount(participants: readonly ParticipationDto[]): number {
  return participants.filter(
    (p) =>
      p.occupiesSlot &&
      p.resignedAt === null &&
      p.removedAt === null &&
      p.waitlistPosition === null,
  ).length;
}

export function ActivityDetailPage({ activityId }: { activityId: string }) {
  const { session } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [activity, setActivity] = useState<ActivityDto | null>(null);
  const [participants, setParticipants] = useState<ParticipationDto[]>([]);
  const [statuses, setStatuses] = useState<StatusDefDto[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    setActionError(null);
    try {
      const act = await getActivity(activityId);
      const [parts, config] = await Promise.all([
        listParticipants(activityId),
        getGuildConfig(act.guildId).catch(() => ({ settings: {}, statuses: [] as StatusDefDto[] })),
      ]);
      setActivity(act);
      setParticipants(parts);
      setStatuses([...config.statuses].sort((a, b) => a.sortOrder - b.sortOrder));
      setState({ kind: 'ready' });
    } catch (err) {
      setState(mapApiError(err));
    }
  }, [activityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = useMemo(() => {
    if (session === null) {
      return undefined;
    }
    return findMine(participants, session.discordUserId, session.v2UserId);
  }, [participants, session]);

  const selectable = useMemo(
    () => statuses.filter((s) => s.active && s.selectableByMember),
    [statuses],
  );

  const canAct =
    activity !== null &&
    activity.status !== 'cancelled' &&
    activity.status !== 'completed' &&
    activity.status !== 'deleted' &&
    activity.enrollmentOpen;

  async function runAction(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      const mapped = mapApiError(err);
      setActionError(
        mapped.kind === 'error' || mapped.kind === 'unavailable'
          ? mapped.message
          : mapped.kind === 'forbidden'
            ? 'Brak uprawnień do tej akcji.'
            : 'Akcja nie powiodła się.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === 'loading') {
    return <LoadingState />;
  }
  if (state.kind === 'unauthorized') {
    return <UnauthorizedState />;
  }
  if (state.kind === 'forbidden') {
    return <ForbiddenState />;
  }
  if (state.kind === 'unavailable') {
    return <UnavailableState>{state.message}</UnavailableState>;
  }
  if (state.kind === 'error' || activity === null) {
    return (
      <ErrorState>
        {state.kind === 'error' ? state.message : 'Nie znaleziono aktywności.'}
      </ErrorState>
    );
  }

  const occupied = occupiedCount(participants);
  const statusTone =
    activity.status === 'cancelled' ? 'danger' : activity.status === 'completed' ? 'ok' : 'accent';

  return (
    <>
      <p className="muted">
        <Link href="/aktywnosci">← Aktywności</Link>
      </p>
      <header className="page-hero">
        <h1>{activity.name}</h1>
        <p>{activity.description || 'Brak opisu.'}</p>
      </header>

      <div className="chip-row" style={{ marginBottom: '1rem' }}>
        <span className="chip" data-tone={statusTone}>
          {lifecycleLabel(activity.status)}
        </span>
        {activity.status === 'cancelled' && activity.cancelReason ? (
          <span className="chip" data-tone="danger">
            Powód: {activity.cancelReason}
          </span>
        ) : null}
      </div>

      <section className="panel detail-grid">
        <div>
          <dt>Start</dt>
          <dd>{formatPolishDateTime(activity.startAt, activity.timezone || undefined)}</dd>
        </div>
        {activity.endAt !== null ? (
          <div>
            <dt>Koniec</dt>
            <dd>{formatPolishDateTime(activity.endAt, activity.timezone || undefined)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Organizator</dt>
          <dd>{activity.organizerDiscordUserId ?? '—'}</dd>
        </div>
        {activity.coOrganizerDiscordUserId !== null ? (
          <div>
            <dt>Współorganizator</dt>
            <dd>{activity.coOrganizerDiscordUserId}</dd>
          </div>
        ) : null}
        <div>
          <dt>Miejsca</dt>
          <dd>
            {activity.participantLimit === null
              ? occupied
              : `${occupied} / ${activity.participantLimit}`}
          </dd>
        </div>
        {activity.locationText !== null && activity.locationText !== '' ? (
          <div>
            <dt>Miejsce</dt>
            <dd>{activity.locationText}</dd>
          </div>
        ) : null}
        <div>
          <dt>Zapisy</dt>
          <dd>{activity.enrollmentOpen ? 'Otwarte' : 'Zamknięte'}</dd>
        </div>
        {mine !== undefined && mine.resignedAt === null && mine.removedAt === null ? (
          <>
            <div>
              <dt>Twój status</dt>
              <dd>
                {mine.confirmationState === 'requires_reconfirmation'
                  ? 'Wymaga ponownego potwierdzenia'
                  : (statuses.find((s) => s.id === mine.statusDefId)?.label ?? 'Zapisany')}
              </dd>
            </div>
            {mine.waitlistPosition !== null ? (
              <div>
                <dt>Lista rezerwowa</dt>
                <dd>Pozycja {mine.waitlistPosition}</dd>
              </div>
            ) : null}
            {mine.reconfirmDeadline !== null ? (
              <div>
                <dt>Termin potwierdzenia</dt>
                <dd>
                  {formatPolishDateTime(mine.reconfirmDeadline, activity.timezone || undefined)}
                </dd>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {actionError !== null ? (
        <p className="chip" data-tone="danger" style={{ marginTop: '0.85rem' }}>
          {actionError}
        </p>
      ) : null}

      <h2 className="section-title">Akcje</h2>
      {mine?.confirmationState === 'requires_reconfirmation' ? (
        <div className="btn-row" style={{ marginBottom: '0.75rem' }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void runAction(() => reconfirm(activity.id))}
          >
            Potwierdź udział
          </button>
        </div>
      ) : null}

      {canAct ? (
        <div className="btn-row">
          {selectable.map((status) => (
            <button
              key={status.id}
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void runAction(() => rsvp(activity.id, status.id))}
            >
              {status.label}
            </button>
          ))}
          {mine !== undefined && mine.resignedAt === null && mine.removedAt === null ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Na pewno chcesz zrezygnować z tej aktywności?')) {
                  void runAction(() => resign(activity.id));
                }
              }}
            >
              Zrezygnuj
            </button>
          ) : null}
        </div>
      ) : (
        <p className="muted">
          {activity.status === 'cancelled'
            ? 'Aktywność została anulowana — zapis niedostępny.'
            : activity.status === 'completed'
              ? 'Aktywność zakończona.'
              : 'Zapisy są obecnie zamknięte.'}
        </p>
      )}

      <h2 className="section-title">
        Uczestnicy (
        {participants.filter((p) => p.resignedAt === null && p.removedAt === null).length})
      </h2>
      <div className="activity-list">
        {participants.filter((p) => p.resignedAt === null && p.removedAt === null).length === 0 ? (
          <EmptyParticipants />
        ) : (
          participants
            .filter((p) => p.resignedAt === null && p.removedAt === null)
            .map((p) => (
              <div key={p.id} className="panel" style={{ padding: '0.7rem 0.9rem' }}>
                <strong>{p.discordUserId ?? p.v2UserId ?? '—'}</strong>
                <div className="meta">
                  {statuses.find((s) => s.id === p.statusDefId)?.label ?? p.statusDefId}
                  {p.waitlistPosition !== null ? ` · lista rezerwowa #${p.waitlistPosition}` : ''}
                  {p.confirmationState === 'requires_reconfirmation'
                    ? ' · wymaga potwierdzenia'
                    : ''}
                </div>
              </div>
            ))
        )}
      </div>
    </>
  );
}

function EmptyParticipants() {
  return <p className="muted">Nikt jeszcze się nie zapisał.</p>;
}
