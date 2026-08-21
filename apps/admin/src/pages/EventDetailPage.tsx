import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';

import { Badge, Button, Panel } from '@v2/design-system';

import { cancelEvent, getEvent, type ActivityEventDetailDto } from '../api/activity-admin.js';
import {
  Flash,
  LoadGate,
  PageHeader,
  confirmDestructive,
  errorFromUnknown,
} from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

export function EventDetailPage() {
  const params = useParams();
  const eventId = params['id'] ?? '';
  const loader = useCallback((guildId: string) => getEvent(guildId, eventId), [eventId]);
  const { guildId, state, reload } = useGuildResource(loader);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  async function onCancel(detail: ActivityEventDetailDto) {
    if (guildId === null) {
      return;
    }
    const reason = window.prompt('Powód anulowania (wymagany):');
    if (reason === null || reason.trim() === '') {
      return;
    }
    if (!confirmDestructive(`Anulować wydarzenie „${detail.name}”?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    try {
      await cancelEvent(guildId, eventId, reason.trim());
      setFlash('Wydarzenie anulowane.');
      reload();
    } catch (err) {
      const parsed = errorFromUnknown(err);
      setError(parsed.message);
      setErrorDetail(parsed.detail);
    } finally {
      setBusy(false);
    }
  }

  if (eventId === '') {
    return <p className="state-error">Brak identyfikatora wydarzenia.</p>;
  }

  return (
    <section>
      <PageHeader title="Szczegóły wydarzenia" />
      <p>
        <Link to="/activity/events">← Wróć do wydarzeń</Link>
      </p>
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? (
        <Flash tone="error" detail={errorDetail}>
          {error}
        </Flash>
      ) : null}

      <LoadGate<ActivityEventDetailDto> state={state}>
        {(detail) => (
          <div className="stack">
            <Panel>
              <div className="row">
                <Badge tone={detail.status === 'cancelled' ? 'error' : 'ok'}>{detail.status}</Badge>
                <span className="muted">Uczestnicy: {detail.participantCount ?? '—'}</span>
                <Button
                  variant="danger"
                  disabled={busy || detail.status === 'cancelled'}
                  onClick={() => void onCancel(detail)}
                >
                  Anuluj z powodem
                </Button>
              </div>
            </Panel>
            <Panel title={detail.name}>
              <p>Termin: {detail.startAt}</p>
              {detail.description !== undefined && detail.description !== '' ? (
                <p>{detail.description}</p>
              ) : null}
              <p>
                Tryb uczestników:{' '}
                {detail.participantMode === 'separate'
                  ? 'SEPARATE (pula per Discord)'
                  : 'SHARED (jedna pula)'}
              </p>
              <p>Widoczność: {detail.visibility === 'private' ? 'prywatna' : 'publiczna'}</p>
              {detail.seriesId !== undefined && detail.seriesId !== null ? (
                <p className="muted">
                  Seria: {detail.seriesId}
                  {detail.seriesOccurrenceIndex != null
                    ? ` (wystąpienie #${detail.seriesOccurrenceIndex + 1})`
                    : ''}
                </p>
              ) : null}
              {detail.participantLimit !== undefined ? (
                <p className="muted">Limit: {detail.participantLimit ?? 'bez limitu'}</p>
              ) : null}
              {detail.publicationTargets !== undefined && detail.publicationTargets.length > 0 ? (
                <div>
                  <p>Cele publikacji (Discord):</p>
                  <ul>
                    {detail.publicationTargets.map((target) => (
                      <li key={`${target.guildId}:${target.channelId}`}>
                        guild {target.guildId} → channel {target.channelId}
                        {target.participantLimit != null
                          ? ` (limit ${target.participantLimit})`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : detail.publicationChannelId !== undefined &&
                detail.publicationChannelId !== null ? (
                <p className="muted">Kanał publikacji: {detail.publicationChannelId}</p>
              ) : null}
            </Panel>
            <details className="details-toggle">
              <summary>Szczegóły techniczne</summary>
              <p className="muted">ID: {detail.id}</p>
              {detail.organizerDiscordUserId !== undefined &&
              detail.organizerDiscordUserId !== null ? (
                <p className="muted">Organizator ID: {detail.organizerDiscordUserId}</p>
              ) : null}
            </details>
          </div>
        )}
      </LoadGate>
    </section>
  );
}
