import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, FormField, MultiSelect, Panel, Select } from '@v2/design-system';

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
import { channelPickerOptions } from './channels-picker.js';

type DiscordChannelsMeta =
  | { readonly kind: 'ready'; readonly channels: readonly DiscordChannelOption[] }
  | { readonly kind: 'error' };

export function ChannelsPage({ embedded = false }: { embedded?: boolean }) {
  const loader = useCallback(async (guildId: string) => {
    const [channels, hub] = await Promise.all([getChannels(guildId), getHub(guildId)]);
    let discord: DiscordChannelsMeta;
    try {
      discord = { kind: 'ready', channels: await listDiscordChannels(guildId) };
    } catch {
      discord = { kind: 'error' };
    }
    return { channels, hub, discord };
  }, []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [selectedChannelIds, setSelectedChannelIds] = useState<readonly string[]>([]);
  const [hubChannelId, setHubChannelId] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.kind === 'ready' && !dirty) {
      setSelectedChannelIds(state.data.channels.channelIds);
      setHubChannelId(state.data.hub.channelId ?? '');
    }
  }, [state, dirty]);

  const discordChannels: readonly DiscordChannelOption[] =
    state.kind === 'ready' && state.data.discord.kind === 'ready'
      ? state.data.discord.channels
      : [];

  const publishOptions = useMemo(
    () => channelPickerOptions(discordChannels, selectedChannelIds),
    [discordChannels, selectedChannelIds],
  );

  const hubOptions = useMemo(() => {
    return [
      { value: '', label: 'Wybierz kanał', disabled: true },
      ...discordChannels.map((channel) => ({
        value: channel.id,
        label: `#${channel.name}`,
        disabled: !channel.usable,
      })),
    ];
  }, [discordChannels]);

  async function onSaveChannels() {
    if (guildId === null) {
      return;
    }
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    setFlash(null);
    setFieldErrors({});
    try {
      await updateChannels(guildId, selectedChannelIds);
      setFlash('Kanały publikacji zapisane.');
      setDirty(false);
      reload();
    } catch (err) {
      const parsed = errorFromUnknown(err);
      setError(parsed.message);
      setErrorDetail(parsed.detail);
      if (Object.keys(parsed.fields).length > 0) {
        setFieldErrors(parsed.fields);
      }
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
      setFlash('Kanał panelu zapisany i zsynchronizowany z Discordem.');
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
    <section className={embedded ? 'stack embedded-section' : undefined}>
      {embedded ? null : (
        <PageHeader
          title="Kanały i panel"
          description="Wybierz kanały Discord po nazwie. Panel Centrum publikujesz stąd — bez slash command."
        />
      )}
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? (
        <Flash tone="error" detail={errorDetail}>
          {error}
        </Flash>
      ) : null}

      <LoadGate state={state} emptyMessage="Brak konfiguracji kanałów.">
        {(data) => (
          <div className="stack">
            <Panel title="Kanały publikacji">
              <div className="form-grid">
                {data.discord.kind === 'error' ? (
                  <>
                    <Flash tone="error">Nie udało się pobrać kanałów z Discorda.</Flash>
                    <Button disabled={busy} onClick={() => reload()}>
                      Spróbuj ponownie
                    </Button>
                    <MultiSelect
                      legend="Kanały publikacji"
                      options={[]}
                      selected={selectedChannelIds}
                      disabled
                      onChange={() => undefined}
                    />
                  </>
                ) : (
                  <MultiSelect
                    legend="Kanały publikacji"
                    options={publishOptions}
                    selected={selectedChannelIds}
                    disabled={busy}
                    error={fieldErrors['channelIds']}
                    onChange={(next) => {
                      setSelectedChannelIds(next);
                      setDirty(true);
                    }}
                  />
                )}
                <FieldError message={fieldErrors['channelIds']} />
                <Button
                  variant="primary"
                  disabled={busy || data.discord.kind === 'error'}
                  onClick={() => void onSaveChannels()}
                >
                  {busy ? 'Zapisywanie…' : 'Zapisz kanały publikacji'}
                </Button>
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
                {data.discord.kind === 'error' ? (
                  <Select
                    id="hub-channel"
                    value={hubChannelId}
                    disabled
                    options={[{ value: '', label: 'Lista kanałów niedostępna' }]}
                    onChange={() => undefined}
                  />
                ) : (
                  <FormField label="Kanał panelu" htmlFor="hub-channel">
                    <Select
                      id="hub-channel"
                      value={hubChannelId}
                      disabled={busy}
                      options={hubOptions}
                      onChange={(event) => {
                        setHubChannelId(event.target.value);
                        setDirty(true);
                      }}
                    />
                    <FieldError message={fieldErrors['hubChannelId']} />
                  </FormField>
                )}
                <div className="row">
                  <Button
                    disabled={busy || data.discord.kind === 'error'}
                    onClick={() => void onSaveHub()}
                  >
                    Zapisz kanał
                  </Button>
                  <Button
                    variant="primary"
                    disabled={busy || data.discord.kind === 'error'}
                    onClick={() => void onPublish(false)}
                  >
                    Opublikuj / odśwież
                  </Button>
                  <Button
                    disabled={busy || data.discord.kind === 'error'}
                    onClick={() => void onPublish(true)}
                  >
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
