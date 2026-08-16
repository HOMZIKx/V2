import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';

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

  async function onCancel(detail: ActivityEventDetailDto) {
    if (guildId === null) {
      return;
    }
    const reason = window.prompt('Cancel reason (required):');
    if (reason === null || reason.trim() === '') {
      return;
    }
    if (!confirmDestructive(`Cancel event "${detail.name}"?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cancelEvent(guildId, eventId, reason.trim());
      setFlash('Event cancelled.');
      reload();
    } catch (err) {
      setError(errorFromUnknown(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (eventId === '') {
    return <p className="state-error">Missing event id.</p>;
  }

  return (
    <section>
      <PageHeader title="Event detail" description={`ID ${eventId}`} />
      <p>
        <Link to="/activity/events">← Back to events</Link>
      </p>
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate<ActivityEventDetailDto> state={state}>
        {(detail) => (
          <div className="stack">
            <div className="panel row">
              <span className="badge">{detail.status}</span>
              <span className="muted">Participants: {detail.participantCount ?? '—'}</span>
              <button
                type="button"
                className="danger"
                disabled={busy || detail.status === 'cancelled'}
                onClick={() => void onCancel(detail)}
              >
                Cancel with reason
              </button>
            </div>
            <div className="panel">
              <h2>{detail.name}</h2>
              <div className="pre-block">{JSON.stringify(detail, null, 2)}</div>
            </div>
          </div>
        )}
      </LoadGate>
    </section>
  );
}
