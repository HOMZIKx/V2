'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { listInbox, markInboxRead } from '../lib/api';
import { formatPolishDateTime } from '../lib/datetime';
import { inboxKindLabel } from '../lib/labels';
import { mapApiError, type LoadState } from '../lib/load-state';
import type { InboxItemDto } from '../lib/types';
import {
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
  UnavailableState,
} from './StateViews';

function activityIdFromPayload(payload: Readonly<Record<string, unknown>>): string | null {
  const candidates = [payload.activityId, payload.activity_id, payload.id];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return null;
}

function summaryFromPayload(payload: Readonly<Record<string, unknown>>): string {
  if (typeof payload.message === 'string' && payload.message.trim() !== '') {
    return payload.message;
  }
  if (typeof payload.summary === 'string' && payload.summary.trim() !== '') {
    return payload.summary;
  }
  if (typeof payload.activityName === 'string' && payload.activityName.trim() !== '') {
    return payload.activityName;
  }
  return 'Szczegóły w aktywności';
}

export function InboxPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [items, setItems] = useState<InboxItemDto[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const result = await listInbox();
      const sorted = [...result.items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setItems(sorted);
      setState(sorted.length === 0 ? { kind: 'empty' } : { kind: 'ready' });
    } catch (err) {
      setState(mapApiError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onMarkRead(id: string): Promise<void> {
    setBusyId(id);
    try {
      await markInboxRead(id);
      await load();
    } catch {
      // keep list; user can retry
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="page-hero">
        <h1>Powiadomienia</h1>
        <p>Wspólna skrzynka z Discordem — lista rezerwowa, potwierdzenia, anulowania.</p>
      </header>

      {state.kind === 'loading' ? <LoadingState /> : null}
      {state.kind === 'forbidden' ? <ForbiddenState /> : null}
      {state.kind === 'unavailable' ? <UnavailableState>{state.message}</UnavailableState> : null}
      {state.kind === 'error' ? <ErrorState>{state.message}</ErrorState> : null}
      {state.kind === 'empty' ? (
        <EmptyState title="Brak powiadomień">
          Tu pojawią się alerty o Twoich aktywnościach.
        </EmptyState>
      ) : null}

      {state.kind === 'ready' ? (
        <div className="activity-list">
          {items.map((item) => {
            const unread = item.readAt === null;
            const activityId = activityIdFromPayload(item.payload);
            return (
              <article key={item.id} className="inbox-item" data-unread={unread ? 'true' : 'false'}>
                <div className="chip-row">
                  <span className="chip" data-tone={unread ? 'accent' : undefined}>
                    {inboxKindLabel(item.kind)}
                  </span>
                  <span className="chip">{unread ? 'Nieprzeczytane' : 'Przeczytane'}</span>
                </div>
                <div>{summaryFromPayload(item.payload)}</div>
                <div className="meta">{formatPolishDateTime(item.createdAt)}</div>
                <div className="btn-row">
                  {activityId !== null ? (
                    <Link className="btn btn-secondary" href={`/aktywnosci/${activityId}`}>
                      Otwórz aktywność
                    </Link>
                  ) : null}
                  {unread ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busyId === item.id}
                      onClick={() => void onMarkRead(item.id)}
                    >
                      Oznacz jako przeczytane
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
