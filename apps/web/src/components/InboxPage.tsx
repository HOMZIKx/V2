'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge, Button } from '@v2/design-system';

import { listInbox, markInboxRead } from '../lib/api';
import { formatPolishDateTime } from '../lib/datetime';
import { inboxKindLabel } from '../lib/labels';
import { mapApiError, type LoadState } from '../lib/load-state';
import { isAbortError } from '../lib/member-copy';
import { createRequestIdentity } from '../lib/request-identity';
import type { InboxItemDto } from '../lib/types';
import {
  ConflictState,
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
  UnauthorizedState,
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
  const requests = useRef(createRequestIdentity());

  const load = useCallback(async () => {
    const request = requests.current.next();
    setState({ kind: 'loading' });
    try {
      const result = await listInbox(request.signal);
      if (!request.isCurrent()) {
        return;
      }
      const sorted = [...result.items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setItems(sorted);
      setState(sorted.length === 0 ? { kind: 'empty' } : { kind: 'ready' });
    } catch (err) {
      if (isAbortError(err) || !request.isCurrent()) {
        return;
      }
      setState(mapApiError(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const identity = requests.current;
    return () => {
      identity.invalidate();
    };
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
        <p>Zmiany terminu, lista rezerwowa, awanse i anulowania.</p>
      </header>

      {state.kind === 'loading' ? <LoadingState /> : null}
      {state.kind === 'unauthorized' ? <UnauthorizedState /> : null}
      {state.kind === 'forbidden' ? <ForbiddenState /> : null}
      {state.kind === 'unavailable' ? <UnavailableState>{state.message}</UnavailableState> : null}
      {state.kind === 'conflict' ? <ConflictState /> : null}
      {state.kind === 'error' ? <ErrorState>{state.message}</ErrorState> : null}
      {state.kind === 'empty' ? (
        <EmptyState title="Brak powiadomień">
          Tu pojawią się alerty o Twoich aktywnościach.
        </EmptyState>
      ) : null}

      {state.kind === 'ready' ? (
        <ul className="inbox-list">
          {items.map((item) => {
            const unread = item.readAt === null;
            const activityId = activityIdFromPayload(item.payload);
            return (
              <li key={item.id} className="inbox-item" data-unread={unread ? 'true' : 'false'}>
                <div className="chip-row">
                  <Badge tone={unread ? 'warn' : 'info'}>{inboxKindLabel(item.kind)}</Badge>
                  <span className="meta">{unread ? 'Nieprzeczytane' : 'Przeczytane'}</span>
                </div>
                <p>{summaryFromPayload(item.payload)}</p>
                <p className="meta">{formatPolishDateTime(item.createdAt)}</p>
                <div className="btn-row">
                  {activityId !== null ? (
                    <Link className="v2-btn" href={`/aktywnosci/${activityId}`}>
                      Otwórz
                    </Link>
                  ) : null}
                  {unread ? (
                    <Button
                      variant="secondary"
                      disabled={busyId === item.id}
                      aria-busy={busyId === item.id}
                      onClick={() => void onMarkRead(item.id)}
                    >
                      Oznacz jako przeczytane
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
