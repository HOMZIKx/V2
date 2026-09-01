import { useCallback, useEffect, useState } from 'react';

import { Button, FormField, Panel, Select } from '@v2/design-system';

import {
  listHubLegacyChannels,
  listHubModules,
  updateHubModules,
  upsertHubLegacyChannel,
  type HubLegacyChannelDto,
  type HubModuleDto,
} from '../api/activity-admin.js';
import { Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

export function HubModulesPage({ embedded = false }: { embedded?: boolean }) {
  const loader = useCallback(async (guildId: string) => {
    const [modules, channels] = await Promise.all([
      listHubModules(guildId),
      listHubLegacyChannels(guildId),
    ]);
    return { modules, channels };
  }, []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [legacyDraft, setLegacyDraft] = useState({
    channelId: '',
    label: '',
    status: 'LEGACY_ACTIVE' as HubLegacyChannelDto['status'],
  });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.kind === 'ready') {
      setOverrides({ ...state.data.modules.overrides });
    }
  }, [state]);

  async function onSaveModules() {
    if (guildId === null) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await updateHubModules(guildId, overrides);
      setFlash('Konfiguracja modułów Huba zapisana.');
      reload();
    } catch (err) {
      const parsed = errorFromUnknown(err);
      setError(parsed.message);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveLegacy() {
    if (guildId === null) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await upsertHubLegacyChannel(guildId, {
        channelId: legacyDraft.channelId.trim(),
        label: legacyDraft.label.trim(),
        status: legacyDraft.status,
      });
      setFlash('Status kanału legacy zapisany (bez usuwania na Discord).');
      setLegacyDraft({ channelId: '', label: '', status: 'LEGACY_ACTIVE' });
      reload();
    } catch (err) {
      const parsed = errorFromUnknown(err);
      setError(parsed.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={embedded ? 'stack embedded-section' : undefined}>
      {embedded ? null : (
        <PageHeader
          title="Moduły V2 Hub"
          description="Rejestr modułów Centrum oraz model emerytury kanałów strukturalnych. Usuwanie kanałów Discord pozostaje decyzją Ownera."
        />
      )}
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}
      <LoadGate state={state} emptyMessage="Brak danych Huba.">
        {(data) => (
          <>
            <Panel title="Rejestr modułów">
              <div className="form-grid">
                {data.modules.modules.map((module: HubModuleDto) => (
                  <label key={module.key} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={
                        overrides[module.key] === undefined
                          ? module.enabled
                          : overrides[module.key] === true
                      }
                      onChange={(event) => {
                        setOverrides((current) => ({
                          ...current,
                          [module.key]: event.target.checked,
                        }));
                      }}
                    />
                    <span>
                      <strong>
                        [{module.group}] {module.label}
                      </strong>{' '}
                      — {module.availability}
                      <br />
                      <span className="muted">{module.description}</span>
                    </span>
                  </label>
                ))}
                <Button disabled={busy || guildId === null} onClick={() => void onSaveModules()}>
                  Zapisz moduły
                </Button>
              </div>
            </Panel>

            <Panel title="Kanały legacy (emerytura)">
              <p className="muted">
                Statusy: LEGACY_ACTIVE → V2_READY → OWNER_CAN_RETIRE. Hub Core nigdy nie usuwa
                kanałów automatycznie.
              </p>
              <ul>
                {data.channels.map((channel) => (
                  <li key={channel.id}>
                    #{channel.label} ({channel.channelId}) — <code>{channel.status}</code>
                  </li>
                ))}
              </ul>
              <div className="form-grid">
                <FormField label="Channel ID">
                  <input
                    value={legacyDraft.channelId}
                    onChange={(event) =>
                      setLegacyDraft((current) => ({
                        ...current,
                        channelId: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="Etykieta">
                  <input
                    value={legacyDraft.label}
                    onChange={(event) =>
                      setLegacyDraft((current) => ({ ...current, label: event.target.value }))
                    }
                  />
                </FormField>
                <FormField label="Status">
                  <Select
                    value={legacyDraft.status}
                    options={[
                      { value: 'LEGACY_ACTIVE', label: 'LEGACY_ACTIVE' },
                      { value: 'V2_READY', label: 'V2_READY' },
                      { value: 'OWNER_CAN_RETIRE', label: 'OWNER_CAN_RETIRE' },
                    ]}
                    onChange={(event) =>
                      setLegacyDraft((current) => ({
                        ...current,
                        status: event.target.value as HubLegacyChannelDto['status'],
                      }))
                    }
                  />
                </FormField>
                <Button
                  disabled={
                    busy ||
                    guildId === null ||
                    legacyDraft.channelId.trim() === '' ||
                    legacyDraft.label.trim() === ''
                  }
                  onClick={() => void onSaveLegacy()}
                >
                  Zapisz status kanału
                </Button>
              </div>
            </Panel>
          </>
        )}
      </LoadGate>
    </section>
  );
}
