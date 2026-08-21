'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge, Button } from '@v2/design-system';

import { getActivity, getGuildConfig, listParticipants, reconfirm, resign, rsvp } from '../lib/api';
import { formatEventCapacity, organizerDisplayName, participantDisplayName } from '../lib/capacity';
import { formatActivityWhen, formatPolishDateTime } from '../lib/datetime';
import { lifecycleLabel } from '../lib/labels';
import { mapApiError, type LoadState } from '../lib/load-state';
import { isAbortError, rsvpFeedbackCopy } from '../lib/member-copy';
import { createRequestIdentity } from '../lib/request-identity';
import type { ActivityDto, ParticipationDto, StatusDefDto } from '../lib/types';
import { useSession } from './SessionProvider';
import {
  ConflictState,
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
  NotFoundState,
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

export function ActivityDetailPage({ activityId }: { activityId: string }) {
  const { session } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [activity, setActivity] = useState<ActivityDto | null>(null);
  const [participants, setParticipants] = useState<ParticipationDto[]>([]);
  const [statuses, setStatuses] = useState<StatusDefDto[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requests = useRef(createRequestIdentity());

  const load = useCallback(async () => {
    const request = requests.current.next();
    setState({ kind: 'loading' });
    setActionError(null);
    try {
      const act = await getActivity(activityId, request.signal);
      if (!request.isCurrent()) {
        return;
      }
      const [parts, config] = await Promise.all([
        listParticipants(activityId, request.signal),
        getGuildConfig(act.guildId, request.signal).catch(() => ({
          settings: {},
          statuses: [] as StatusDefDto[],
        })),
      ]);
      if (!request.isCurrent()) {
        return;
      }
      setActivity(act);
      setParticipants(parts);
      setStatuses([...config.statuses].sort((a, b) => a.sortOrder - b.sortOrder));
      setState({ kind: 'ready' });
    } catch (err) {
      if (isAbortError(err) || !request.isCurrent()) {
        return;
      }
      setState(mapApiError(err));
    }
  }, [activityId]);

  useEffect(() => {
    void load();
    const identity = requests.current;
    return () => {
      identity.invalidate();
    };
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

  async function runAction(fn: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      await fn();
      setActionOk(success);
      await load();
    } catch (err) {
      setActionError(rsvpFeedbackCopy(err));
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
  if (state.kind === 'not_found') {
    return <NotFoundState />;
  }
  if (state.kind === 'conflict') {
    return <ConflictState />;
  }
  if (state.kind === 'unavailable') {
    return <UnavailableState>{state.message}</UnavailableState>;
  }
  if (state.kind === 'error' || activity === null) {
    return (
      <ErrorState>
        {state.kind === 'error' ? state.message : 'Ta aktywność już nie istnieje.'}
      </ErrorState>
    );
  }

  const occupied = activity.occupiedSlots;
  const openParticipants = participants.filter(
    (p) => p.resignedAt === null && p.removedAt === null,
  );
  const mineLabel =
    mine !== undefined && mine.resignedAt === null && mine.removedAt === null
      ? mine.confirmationState === 'requires_reconfirmation'
        ? 'Wymaga ponownego potwierdzenia'
        : (statuses.find((s) => s.id === mine.statusDefId)?.label ??
          activity.myParticipationStatus?.statusLabel ??
          'Zapisany')
      : null;

  return (
    <>
      <p className="muted">
        <Link href="/aktywnosci">← Aktywności</Link>
      </p>
      <header className="page-hero">
        <h1>{activity.name}</h1>
        <p className="meta">{formatActivityWhen(activity.startAt, activity.timezone)}</p>
      </header>

      <div className="chip-row">
        {activity.typeLabel !== undefined &&
        activity.typeLabel !== null &&
        activity.typeLabel !== '' ? (
          <Badge tone="info">{activity.typeLabel}</Badge>
        ) : null}
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
      </div>

      <dl className="detail-facts">
        <dt>Miejsca</dt>
        <dd>{formatEventCapacity(occupied, activity.participantLimit)}</dd>
        <dt>Widoczność</dt>
        <dd>{activity.visibility === 'private' ? 'Prywatna' : 'Publiczna'}</dd>
        {activity.seriesId !== undefined && activity.seriesId !== null ? (
          <>
            <dt>Seria</dt>
            <dd>
              wystąpienie{' '}
              {activity.seriesOccurrenceIndex != null
                ? `#${activity.seriesOccurrenceIndex + 1}`
                : '—'}
            </dd>
          </>
        ) : null}
        <dt>Prowadzi</dt>
        <dd>{organizerDisplayName(activity)}</dd>
        {activity.coOrganizerDisplay !== undefined && activity.coOrganizerDisplay !== null ? (
          <>
            <dt>Razem z</dt>
            <dd>{activity.coOrganizerDisplay}</dd>
          </>
        ) : null}
      </dl>

      {activity.description.trim() !== '' ? (
        <section className="v2-panel">
          <h2 className="v2-panel-title">Opis</h2>
          <p>{activity.description}</p>
        </section>
      ) : null}

      {actionError !== null ? (
        <p className="v2-alert v2-alert-error" role="alert">
          {actionError}
        </p>
      ) : null}
      {actionOk !== null ? (
        <p className="v2-alert v2-alert-success" role="status">
          {actionOk}
        </p>
      ) : null}

      <section className="rsvp-block">
        <h2>Twój status</h2>
        {mineLabel !== null ? <p>{mineLabel}</p> : <p className="muted">Nie jesteś zapisany.</p>}
        {mine?.waitlistPosition !== null && mine !== undefined ? (
          <p>Lista rezerwowa, pozycja {mine.waitlistPosition}.</p>
        ) : null}
        {mine?.confirmationState === 'requires_reconfirmation' ? (
          <div className="reconfirm-banner" role="status">
            <p>
              Wymagane ponowne potwierdzenie
              {mine.reconfirmDeadline !== null
                ? ` do ${formatPolishDateTime(mine.reconfirmDeadline, activity.timezone)}`
                : ''}
              .
            </p>
            <Button
              variant="primary"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void runAction(() => reconfirm(activity.id), 'Udział potwierdzony.')}
            >
              Potwierdź udział
            </Button>
          </div>
        ) : null}

        {canAct ? (
          <div className="btn-row">
            {selectable.map((status) => (
              <Button
                key={status.id}
                variant={mine?.statusDefId === status.id ? 'primary' : 'secondary'}
                disabled={busy}
                aria-busy={busy}
                onClick={() =>
                  void runAction(() => rsvp(activity.id, status.id), 'Status zapisany.')
                }
              >
                {status.label}
              </Button>
            ))}
            {mine !== undefined && mine.resignedAt === null && mine.removedAt === null ? (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Na pewno chcesz zrezygnować z tej aktywności?')) {
                    void runAction(() => resign(activity.id), 'Zrezygnowano.');
                  }
                }}
              >
                Zrezygnuj
              </Button>
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
      </section>

      <section>
        <h2 className="section-title">Uczestnicy ({openParticipants.length})</h2>
        {openParticipants.length === 0 ? (
          <EmptyState title="Brak uczestników">Nikt jeszcze się nie zapisał.</EmptyState>
        ) : (
          <ul className="participant-list">
            {openParticipants.map((p) => (
              <li key={p.id}>
                <strong>{participantDisplayName(p)}</strong>
                <span className="meta">
                  {statuses.find((s) => s.id === p.statusDefId)?.label ?? 'Status'}
                  {p.waitlistPosition !== null ? ` · rezerwa #${p.waitlistPosition}` : ''}
                  {p.confirmationState === 'requires_reconfirmation'
                    ? ' · wymaga potwierdzenia'
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
