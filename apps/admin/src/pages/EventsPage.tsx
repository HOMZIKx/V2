import { useCallback, useState } from 'react';
import { Link } from 'react-router';

import { cancelEvent, listEvents, type ActivityEventDto } from '../api/activity-admin.js';
import {
  Flash,
  LoadGate,
  PageHeader,
  confirmDestructive,
  errorFromUnknown,
} from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

export function EventsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const loader = useCallback(
    (guildId: string) =>
      listEvents(guildId, statusFilter.trim() === '' ? undefined : { status: statusFilter.trim() }),
    [statusFilter],
  );
  const { guildId, state, reload } = useGuildResource(loader);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onCancel(item: ActivityEventDto) {
    if (guildId === null) {
      return;
    }
    const reason = window.prompt('Cancel reason (required):');
    if (reason === null) {
      return;
    }
    if (reason.trim() === '') {
      setError('Cancel reason is required.');
      return;
    }
    if (!confirmDestructive(`Cancel event "${item.name}"?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await cancelEvent(guildId, item.id, reason.trim());
      setFlash('Event cancelled.');
      reload();
    } catch (err) {
      setError(errorFromUnknown(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader title="Events" description="List activities with status filter and cancel." />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <div className="panel row">
        <label>
          Status filter
          <input
            value={statusFilter}
            disabled={busy}
            placeholder="e.g. published"
            onChange={(event) => {
              setStatusFilter(event.target.value);
            }}
          />
        </label>
        <button type="button" disabled={busy} onClick={reload}>
          Apply
        </button>
      </div>

      <LoadGate<ActivityEventDto[]> state={state} emptyMessage="No events.">
        {(items) => (
          <div className="panel">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>Participants</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/activity/events/${item.id}`}>{item.name}</Link>
                    </td>
                    <td>
                      <code>{item.status}</code>
                    </td>
                    <td>{item.startAt}</td>
                    <td>{item.participantCount ?? '—'}</td>
                    <td className="row">
                      <Link to={`/activity/events/${item.id}`}>Detail</Link>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy || item.status === 'cancelled'}
                        onClick={() => void onCancel(item)}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LoadGate>
    </section>
  );
}
