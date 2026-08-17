import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, FormField, Panel, Select } from '@v2/design-system';

import {
  getChannels,
  getHub,
  listDiscordChannels,
  publishHubPanel,
  reconcileHubPanel,
  updateChannels,
  updateHub,
  type DiscordChannelOption,
} from '../api/activity-admin.js';
import { FieldError, Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

function channelLabel(channel: DiscordChannelOption): string {
  const prefix = channel.usable ? '#' : '#';
  return `${prefix}${channel.name}`;
}

export function ChannelsPage() {
  const loader = useCallback(async (guildId: string) => {
    const [channels, hub, discordChannels] = await Promise.all([
      getChannels(guildId),
      getHub(guildId),
      listDiscordChannels(guildId).catch(() => [] as DiscordChannelOption[]),
    ]);
    return { channels, hub, discordChannels };
  }, []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [publishChannelId, setPublishChannelId] = useState('');
  const [extraChannelId, setExtraChannelId] = useState('');
  const [hubChannelId, setHubChannelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.kind === 'ready' && !dirty) {
      setPublishChannelId(state.data.channels.channelIds[0] ?? '');
      setExtraChannelId(state.data.channels.channelIds[1] ?? '');
      setHubChannelId(state.data.hub.channelId ?? '');
    }
  }, [state, dirty]);

  const options = useMemo(() => {
    const list = state.kind === 'ready' ? state.data.discordChannels : [];
    return [
      { value: '', label: 'Wybierz kanał', disabled: true },
      ...list.map((channel) => ({
        value: channel.id,
        label: channelLabel(channel),
        disabled: !channel.usable,
      })),
    ];
  }, [state]);

  async function onSaveChannels() {
    if (guildId === null) {
      return;
    }
    if (publishChannelId.trim() === '') {
      setFieldErrors({ channelIds: 'Wybierz kanał publikacji.' });
      return;
    }
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    setFlash(null);
    try {
      await updateChannels(
        guildId,
        extraChannelId.trim() === '' || extraChannelId === publishChannelId
          ? [publishChannelId]
          : [publishChannelId, extraChannelId],
      );
      setFlash('Kanał publikacji zapisany.');
      setDirty(false);
      reload();
    } catch (err) {
      const parsed = errorFromUnknown(err);
      setError(parsed.message);
      setErrorDetail(parsed.detail);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveHub() {
    if (guildId === null) {
      return;
    }
    if (hubChannelId.trim() === '') {
      setFieldErrors({ hubChannelId: 'Wybierz kanał panelu.' });
      return;
    }
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    setFlash(null);
    try {
      await updateHub(guildId, { channelId: hubChannelId });
      setFlash('Kanał panelu zapisany.');
      setDirty(false);
      reload();
    } catch (err) {
      const parsed = errorFromUnknown(err);
      setError(parsed.message);
      setErrorDetail(parsed.detail);
    } finally {
      setBusy(false);
    }
  }

  async function onPublish(reconcile: boolean) {
    if (guildId === null) {
      return;
    }
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    setFlash(null);
    try {
      if (hubChannelId.trim() !== '') {
        await updateHub(guildId, { channelId: hubChannelId });
      }
      const result = reconcile ? await reconcileHubPanel(guildId) : await publishHubPanel(guildId);
      setFlash(
        reconcile ? `Panel uzgodniony (${result.mode}).` : `Panel opublikowany (${result.mode}).`,
      );
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
        title="Kanały i panel"
        description="Wybierz kanały Discord po nazwie. Panel Centrum publikujesz stąd — bez slash command."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? (
        <Flash tone="error" detail={errorDetail}>
          {error}
        </Flash>
      ) : null}

      <LoadGate state={state} emptyMessage="Brak konfiguracji kanałów.">
        {(data) => (
          <div className="stack">
            <Panel title="Kanał publikacji">
              <div className="form-grid">
                <FormField label="Kanał publikacji" htmlFor="publish-channel">
                  <Select
                    id="publish-channel"
                    value={publishChannelId}
                    disabled={busy}
                    options={options}
                    onChange={(event) => {
                      setPublishChannelId(event.target.value);
                      setDirty(true);
                    }}
                  />
                  <FieldError message={fieldErrors['channelIds']} />
                </FormField>
                <Button variant="primary" disabled={busy} onClick={() => void onSaveChannels()}>
                  {busy ? 'Zapisywanie…' : 'Zapisz kanał publikacji'}
                </Button>
                <FormField label="Kanał dodatkowy (opcjonalnie)" htmlFor="extra-channel">
                  <Select
                    id="extra-channel"
                    value={extraChannelId}
                    disabled={busy}
                    options={[
                      { value: '', label: 'Brak' },
                      ...options.filter((option) => option.value !== ''),
                    ]}
                    onChange={(event) => {
                      setExtraChannelId(event.target.value);
                      setDirty(true);
                    }}
                  />
                </FormField>
              </div>
            </Panel>

            <Panel title="Panel Centrum">
              <div className="form-grid">
                <p>
                  Status:{' '}
                  <strong>
                    {data.hub.status === 'active'
                      ? 'Opublikowany'
                      : data.hub.channelId
                        ? 'Kanał ustawiony'
                        : 'Brak'}
                  </strong>
                </p>
                <p className="muted">
                  Ostatnia synchronizacja:{' '}
                  {data.hub.lastSyncedAt !== undefined &&
                  data.hub.lastSyncedAt !== null &&
                  data.hub.lastSyncedAt !== ''
                    ? data.hub.lastSyncedAt
                    : '—'}
                </p>
                <FormField label="Kanał panelu" htmlFor="hub-channel">
                  <Select
                    id="hub-channel"
                    value={hubChannelId}
                    disabled={busy}
                    options={options}
                    onChange={(event) => {
                      setHubChannelId(event.target.value);
                      setDirty(true);
                    }}
                  />
                  <FieldError message={fieldErrors['hubChannelId']} />
                </FormField>
                <div className="row">
                  <Button disabled={busy} onClick={() => void onSaveHub()}>
                    Zapisz kanał
                  </Button>
                  <Button variant="primary" disabled={busy} onClick={() => void onPublish(false)}>
                    Opublikuj / odśwież
                  </Button>
                  <Button disabled={busy} onClick={() => void onPublish(true)}>
                    Uzgodnij panel
                  </Button>
                </div>
              </div>
            </Panel>
          </div>
        )}
      </LoadGate>
    </section>
  );
}
