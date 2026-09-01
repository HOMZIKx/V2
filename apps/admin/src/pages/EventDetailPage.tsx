import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

import { Badge, FormField, Panel, Select } from '@v2/design-system';

import {
  cancelEvent,
  closeEventEnrollment,
  getEvent,
  listDiscordChannels,
  openEventEnrollment,
  rescheduleEvent,
  resolveMemberDisplays,
  updateEvent,
  type ActivityEventDetailDto,
  type DiscordChannelOption,
} from '../api/activity-admin.js';
import {
  DestructiveAction,
  FormActions,
  type SaveState,
} from '../components/config/FormActions.js';
import {
  Flash,
  LoadGate,
  PageHeader,
  confirmDestructive,
  errorFromUnknown,
} from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';
import { useUnsavedChangesBlocker } from '../hooks/useUnsavedChangesBlocker.js';

function toIsoLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalInput(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    published: 'Opublikowane',
    registrations_open: 'Zapisy otwarte',
    registrations_closed: 'Zapisy zamknięte',
    in_progress: 'W trakcie',
    completed: 'Zakończone',
    cancelled: 'Anulowane',
    draft: 'Szkic',
  };
  return map[status] ?? status;
}

export function EventDetailPage() {
  const params = useParams();
  const eventId = params['id'] ?? '';
  const loader = useCallback((guildId: string) => getEvent(guildId, eventId), [eventId]);
  const { guildId, state, reload } = useGuildResource(loader);
  const [channels, setChannels] = useState<readonly DiscordChannelOption[]>([]);
  const [organizerName, setOrganizerName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startAtLocal, setStartAtLocal] = useState('');
  const [participantLimit, setParticipantLimit] = useState('');
  const [publicationChannelId, setPublicationChannelId] = useState('');
  const [locationText, setLocationText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  useUnsavedChangesBlocker(dirty);

  useEffect(() => {
    if (state.kind !== 'ready' || guildId === null) {
      return;
    }
    const detail = state.data;
    setName(detail.name);
    setDescription(detail.description ?? '');
    setStartAtLocal(toIsoLocalInput(detail.startAt));
    setParticipantLimit(
      detail.participantLimit !== undefined && detail.participantLimit !== null
        ? String(detail.participantLimit)
        : '',
    );
    setPublicationChannelId(detail.publicationChannelId ?? '');
    setLocationText(detail.locationText ?? '');
    setDirty(false);
    void listDiscordChannels(guildId)
      .then(setChannels)
      .catch(() => setChannels([]));
    if (detail.organizerDiscordUserId) {
      void resolveMemberDisplays(guildId, [detail.organizerDiscordUserId])
        .then((rows) => setOrganizerName(rows[0]?.displayName ?? null))
        .catch(() => setOrganizerName(null));
    }
  }, [guildId, state]);

  const channelOptions = useMemo(
    () => [
      { value: '', label: 'Bez kanału / domyślny', disabled: false },
      ...channels.map((channel) => ({
        value: channel.id,
        label: `#${channel.name}`,
        disabled: !channel.usable,
      })),
    ],
    [channels],
  );

  async function onSave(detail: ActivityEventDetailDto) {
    const errors: Record<string, string> = {};
    if (name.trim() === '') {
      errors.name = 'Podaj nazwę wydarzenia.';
    }
    const startAt = parseLocalInput(startAtLocal);
    if (startAt === null) {
      errors.startAt = 'Podaj poprawną datę i godzinę.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSaveState('saving');
    setError(null);
    try {
      const limitRaw = participantLimit.trim();
      let limit: number | null = null;
      if (limitRaw !== '') {
        const parsed = Number.parseInt(limitRaw, 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
          setFieldErrors({ participantLimit: 'Limit musi być liczbą większą od zera.' });
          setSaveState('idle');
          return;
        }
        limit = parsed;
      }
      await updateEvent(detail.id, {
        name: name.trim(),
        description: description.trim() === '' ? '' : description.trim(),
        participantLimit: limit,
        locationText: locationText.trim() === '' ? null : locationText.trim(),
        publicationChannelId: publicationChannelId === '' ? null : publicationChannelId,
      });
      if (startAt !== detail.startAt) {
        await rescheduleEvent(detail.id, { startAt: startAt as string });
      }
      setDirty(false);
      setSaveState('saved');
      setFlash('Zmiany zapisane.');
      reload();
    } catch (err) {
      setError(errorFromUnknown(err).message);
      setSaveState('idle');
    }
  }

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
    try {
      await cancelEvent(guildId, eventId, reason.trim());
      setFlash('Wydarzenie anulowane.');
      reload();
    } catch (err) {
      setError(errorFromUnknown(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnrollment(detail: ActivityEventDetailDto, open: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (open) {
        await openEventEnrollment(detail.id);
        setFlash('Zapisy otwarte.');
      } else {
        await closeEventEnrollment(detail.id);
        setFlash('Zapisy zamknięte.');
      }
      reload();
    } catch (err) {
      setError(errorFromUnknown(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (eventId === '') {
    return <p className="state-error">Brak identyfikatora wydarzenia.</p>;
  }

  return (
    <section className="stack form-page">
      <PageHeader title="Edycja wydarzenia" />
      <p>
        <Link to="/activities/events">← Wróć do wydarzeń</Link>
      </p>
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate<ActivityEventDetailDto> state={state}>
        {(detail) => (
          <div className="stack">
            <Panel title="Status">
              <div className="row">
                <Badge tone={detail.status === 'cancelled' ? 'error' : 'ok'}>
                  {statusLabel(detail.status)}
                </Badge>
                <span className="muted">Uczestnicy: {detail.participantCount ?? '—'}</span>
                <span className="muted">Organizator: {organizerName ?? 'Organizator'}</span>
              </div>
            </Panel>

            <Panel title="Ustawienia wydarzenia">
              <div className="form-page-grid">
                <FormField label="Nazwa" htmlFor="edit-name" error={fieldErrors.name}>
                  <input
                    id="edit-name"
                    className="v2-input"
                    value={name}
                    disabled={detail.status === 'cancelled' || busy}
                    onChange={(event) => {
                      setDirty(true);
                      setSaveState('idle');
                      setName(event.target.value);
                    }}
                  />
                </FormField>
                <FormField label="Termin" htmlFor="edit-start" error={fieldErrors.startAt}>
                  <input
                    id="edit-start"
                    className="v2-input"
                    type="datetime-local"
                    value={startAtLocal}
                    disabled={detail.status === 'cancelled' || busy}
                    onChange={(event) => {
                      setDirty(true);
                      setSaveState('idle');
                      setStartAtLocal(event.target.value);
                    }}
                  />
                </FormField>
                <FormField label="Kanał publikacji" htmlFor="edit-channel">
                  <Select
                    id="edit-channel"
                    value={publicationChannelId}
                    disabled={detail.status === 'cancelled' || busy}
                    options={channelOptions}
                    onChange={(event) => {
                      setDirty(true);
                      setSaveState('idle');
                      setPublicationChannelId(event.target.value);
                    }}
                  />
                </FormField>
                <FormField label="Limit uczestników" htmlFor="edit-limit">
                  <input
                    id="edit-limit"
                    className="v2-input"
                    value={participantLimit}
                    disabled={detail.status === 'cancelled' || busy}
                    onChange={(event) => {
                      setDirty(true);
                      setSaveState('idle');
                      setParticipantLimit(event.target.value);
                    }}
                  />
                </FormField>
                <FormField label="Miejsce (opcjonalnie)" htmlFor="edit-location">
                  <input
                    id="edit-location"
                    className="v2-input"
                    value={locationText}
                    disabled={detail.status === 'cancelled' || busy}
                    onChange={(event) => {
                      setDirty(true);
                      setSaveState('idle');
                      setLocationText(event.target.value);
                    }}
                  />
                </FormField>
                <FormField label="Opis" htmlFor="edit-description">
                  <textarea
                    id="edit-description"
                    className="v2-textarea"
                    value={description}
                    disabled={detail.status === 'cancelled' || busy}
                    onChange={(event) => {
                      setDirty(true);
                      setSaveState('idle');
                      setDescription(event.target.value);
                    }}
                  />
                </FormField>
              </div>
              <FormActions
                dirty={dirty}
                saveState={saveState}
                disabled={detail.status === 'cancelled' || busy}
                onSave={() => void onSave(detail)}
                onCancel={() => {
                  setName(detail.name);
                  setDescription(detail.description ?? '');
                  setStartAtLocal(toIsoLocalInput(detail.startAt));
                  setParticipantLimit(
                    detail.participantLimit != null ? String(detail.participantLimit) : '',
                  );
                  setPublicationChannelId(detail.publicationChannelId ?? '');
                  setLocationText(detail.locationText ?? '');
                  setDirty(false);
                  setSaveState('idle');
                }}
              />
            </Panel>

            <Panel title="Zapisy">
              <div className="row">
                <Badge tone={detail.enrollmentOpen === true ? 'ok' : 'warn'}>
                  {detail.enrollmentOpen === true ? 'Otwarte' : 'Zamknięte'}
                </Badge>
                <button
                  type="button"
                  className="v2-btn v2-btn-secondary"
                  disabled={busy || detail.status === 'cancelled'}
                  onClick={() => void toggleEnrollment(detail, detail.enrollmentOpen !== true)}
                >
                  {detail.enrollmentOpen === true ? 'Zamknij zapisy' : 'Otwórz zapisy'}
                </button>
              </div>
            </Panel>

            <DestructiveAction
              label="Anuluj wydarzenie"
              disabled={busy || detail.status === 'cancelled'}
              onClick={() => void onCancel(detail)}
            />

            <details className="details-toggle">
              <summary>Szczegóły techniczne</summary>
              <p className="muted">ID: {detail.id}</p>
            </details>
          </div>
        )}
      </LoadGate>
    </section>
  );
}
