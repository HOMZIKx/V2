import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { FormField, Panel, Select } from '@v2/design-system';

import { resolveAdminOrgId } from '../admin-org.js';
import {
  createActivityDraft,
  getChannels,
  listDiscordChannels,
  listTypes,
  publishActivityDraft,
  type ActivityTypeDto,
  type DiscordChannelOption,
} from '../api/activity-admin.js';
import { FormActions, type SaveState } from '../components/config/FormActions.js';
import { Flash, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useUnsavedChangesBlocker } from '../hooks/useUnsavedChangesBlocker.js';
import { useRequiredGuildId } from '../layout/GuildContext.js';

function toIsoLocalInput(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function parseLocalInput(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export function EventCreatePage() {
  const guildId = useRequiredGuildId();
  const navigate = useNavigate();
  const orgId = resolveAdminOrgId();
  const [types, setTypes] = useState<readonly ActivityTypeDto[]>([]);
  const [channels, setChannels] = useState<readonly DiscordChannelOption[]>([]);
  const [allowedChannelIds, setAllowedChannelIds] = useState<readonly string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startAtLocal, setStartAtLocal] = useState(
    toIsoLocalInput(new Date(Date.now() + 3_600_000)),
  );
  const [typeId, setTypeId] = useState('');
  const [publicationChannelId, setPublicationChannelId] = useState('');
  const [participantLimit, setParticipantLimit] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  useUnsavedChangesBlocker(dirty);

  const loadMeta = useCallback(async () => {
    if (guildId === null) {
      return;
    }
    const [listedTypes, channelConfig, discordChannels] = await Promise.all([
      listTypes(guildId),
      getChannels(guildId),
      listDiscordChannels(guildId).catch(() => [] as DiscordChannelOption[]),
    ]);
    setTypes(listedTypes.filter((entry) => entry.enabled));
    setAllowedChannelIds(channelConfig.channelIds);
    setChannels(discordChannels);
    if (listedTypes[0] !== undefined && typeId === '') {
      setTypeId(listedTypes[0].id);
    }
    if (channelConfig.channelIds[0] !== undefined && publicationChannelId === '') {
      setPublicationChannelId(channelConfig.channelIds[0]);
    }
  }, [guildId, publicationChannelId, typeId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const channelOptions = useMemo(() => {
    const allowed = new Set(allowedChannelIds);
    return [
      { value: '', label: 'Wybierz kanał publikacji', disabled: true },
      ...channels
        .filter((channel) => allowed.has(channel.id))
        .map((channel) => ({
          value: channel.id,
          label: `#${channel.name}`,
          disabled: !channel.usable,
        })),
    ];
  }, [allowedChannelIds, channels]);

  async function onSave() {
    if (guildId === null) {
      return;
    }
    if (orgId === null) {
      setError(
        'Nie udało się ustalić konfiguracji tego serwera. Sprawdź diagnostykę V2 lub skontaktuj się z administratorem platformy.',
      );
      return;
    }
    const errors: Record<string, string> = {};
    if (name.trim() === '') {
      errors.name = 'Podaj nazwę wydarzenia.';
    }
    const startAt = parseLocalInput(startAtLocal);
    if (startAt === null) {
      errors.startAt = 'Podaj poprawną datę i godzinę.';
    }
    if (publicationChannelId.trim() === '') {
      errors.publicationChannelId = 'Wybierz kanał, na którym ma zostać opublikowane wydarzenie.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSaveState('saving');
    setError(null);
    try {
      const draft = await createActivityDraft(guildId);
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
      const published = await publishActivityDraft(draft.id, {
        organizationId: orgId,
        name: name.trim(),
        startAt: startAt as string,
        publicationChannelId,
        typeId: typeId === '' ? null : typeId,
        participantLimit: limit,
        ...(description.trim() === '' ? {} : { description: description.trim() }),
      });
      const publishedId =
        typeof published === 'object' && published !== null && 'id' in published
          ? published.id
          : undefined;
      const activityId = typeof publishedId === 'string' ? publishedId : draft.id;
      setDirty(false);
      setSaveState('saved');
      void navigate(`/activities/events/${activityId}`);
    } catch (err) {
      const parsed = errorFromUnknown(err);
      setError(parsed.message);
      setSaveState('idle');
    }
  }

  return (
    <section className="stack form-page">
      <PageHeader
        title="Utwórz wydarzenie"
        description="Uzupełnij szczegóły i opublikuj wydarzenie na wybranym kanale Discord."
      />
      <p>
        <Link to="/activities/events">← Wróć do listy</Link>
      </p>
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <Panel title="Podstawowe">
        <div className="form-page-grid">
          <FormField label="Nazwa" htmlFor="event-name" error={fieldErrors.name}>
            <input
              id="event-name"
              className="v2-input"
              value={name}
              onChange={(event) => {
                setDirty(true);
                setName(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Typ aktywności" htmlFor="event-type">
            <Select
              id="event-type"
              value={typeId}
              options={types.map((entry) => ({ value: entry.id, label: entry.label }))}
              onChange={(event) => {
                setDirty(true);
                setTypeId(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Termin" htmlFor="event-start" error={fieldErrors.startAt}>
            <input
              id="event-start"
              className="v2-input"
              type="datetime-local"
              value={startAtLocal}
              onChange={(event) => {
                setDirty(true);
                setStartAtLocal(event.target.value);
              }}
            />
          </FormField>
          <FormField
            label="Kanał publikacji"
            htmlFor="event-channel"
            error={fieldErrors.publicationChannelId}
          >
            <Select
              id="event-channel"
              value={publicationChannelId}
              options={channelOptions}
              onChange={(event) => {
                setDirty(true);
                setPublicationChannelId(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Limit uczestników (opcjonalnie)" htmlFor="event-limit">
            <input
              id="event-limit"
              className="v2-input"
              inputMode="numeric"
              value={participantLimit}
              onChange={(event) => {
                setDirty(true);
                setParticipantLimit(event.target.value);
              }}
            />
          </FormField>
          <FormField label="Opis (opcjonalnie)" htmlFor="event-description">
            <textarea
              id="event-description"
              className="v2-textarea"
              value={description}
              onChange={(event) => {
                setDirty(true);
                setDescription(event.target.value);
              }}
            />
          </FormField>
        </div>
      </Panel>

      <FormActions
        dirty={dirty}
        saveState={saveState}
        saveLabel="Utwórz i opublikuj"
        onSave={() => void onSave()}
        onCancel={() => {
          void navigate('/activities/events');
        }}
      />
    </section>
  );
}
