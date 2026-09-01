import { useCallback, useState } from 'react';
import { Link } from 'react-router';

import { Button, DataTable, Panel, Select } from '@v2/design-system';

import {
  cancelEvent,
  listEvents,
  listTypes,
  resolveMemberDisplays,
  type ActivityEventDto,
} from '../api/activity-admin.js';
import {
  Flash,
  LoadGate,
  PageHeader,
  confirmDestructive,
  errorFromUnknown,
} from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';
import { EVENT_STATUS_FILTER_OPTIONS, eventStatusLabel } from '../lib/event-status.js';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function EventsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const loader = useCallback(
    async (guildId: string) => {
      const items = await listEvents(
        guildId,
        statusFilter.trim() === '' ? undefined : { status: statusFilter.trim() },
      );
      const types = await listTypes(guildId).catch(() => []);
      const typeLabels = new Map(types.map((type) => [type.id, type.label]));
      const organizerIds = [
        ...new Set(
          items
            .map((item) => item.organizerDiscordUserId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ];
      const members =
        organizerIds.length === 0
          ? []
          : await resolveMemberDisplays(guildId, organizerIds).catch(() => []);
      const names = new Map(members.map((member) => [member.id, member.displayName]));
      return { items, names, typeLabels };
    },
    [statusFilter],
  );
  const { guildId, state, reload } = useGuildResource(loader);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  async function onCancel(item: ActivityEventDto) {
    if (guildId === null) {
      return;
    }
    const reason = window.prompt('Powód anulowania (wymagany):');
    if (reason === null) {
      return;
    }
    if (reason.trim() === '') {
      setError('Podaj powód anulowania.');
      return;
    }
    if (!confirmDestructive(`Anulować wydarzenie „${item.name}”?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    setFlash(null);
    try {
      await cancelEvent(guildId, item.id, reason.trim());
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

  return (
    <section>
      <PageHeader
        title="Wydarzenia"
        description="Lista aktywności serwera — kliknij wydarzenie, aby edytować."
      />
      <div className="row">
        <Link to="/activities/events/new" className="v2-btn v2-btn-primary">
          Utwórz wydarzenie
        </Link>
      </div>
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? (
        <Flash tone="error" detail={errorDetail}>
          {error}
        </Flash>
      ) : null}

      <Panel>
        <div className="row">
          <label htmlFor="event-status-filter">
            Status
            <Select
              id="event-status-filter"
              value={statusFilter}
              disabled={busy}
              options={EVENT_STATUS_FILTER_OPTIONS}
              onChange={(event) => {
                setStatusFilter(event.target.value);
              }}
            />
          </label>
          <Button disabled={busy} onClick={reload}>
            Filtruj
          </Button>
        </div>
      </Panel>

      <LoadGate<{
        items: ActivityEventDto[];
        names: Map<string, string>;
        typeLabels: Map<string, string>;
      }>
        state={state}
        emptyMessage="Nie masz jeszcze żadnych wydarzeń."
      >
        {(data) => (
          <Panel>
            <DataTable>
              <thead>
                <tr>
                  <th>Nazwa</th>
                  <th>Typ</th>
                  <th>Termin</th>
                  <th>Organizator</th>
                  <th>Status</th>
                  <th>Uczestnicy</th>
                  <th>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/activities/events/${item.id}`}>{item.name}</Link>
                    </td>
                    <td>
                      {item.typeId !== undefined && item.typeId !== null
                        ? (data.typeLabels.get(item.typeId) ?? '—')
                        : (item.typeLabel ?? '—')}
                    </td>
                    <td>{formatWhen(item.startAt)}</td>
                    <td>
                      {item.organizerDiscordUserId
                        ? (data.names.get(item.organizerDiscordUserId) ?? 'Organizator')
                        : '—'}
                    </td>
                    <td>{eventStatusLabel(item.status)}</td>
                    <td>{item.participantCount ?? '—'}</td>
                    <td className="row">
                      <Link to={`/activities/events/${item.id}`}>Edytuj</Link>
                      <Button
                        variant="danger"
                        disabled={busy || item.status === 'cancelled'}
                        onClick={() => void onCancel(item)}
                      >
                        Anuluj
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Panel>
        )}
      </LoadGate>
    </section>
  );
}
