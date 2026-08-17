import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, MultiSelect, Panel } from '@v2/design-system';

import { getPings, listDiscordRoles, updatePings } from '../api/activity-admin.js';
import { FieldError, Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

export function PingsPage() {
  const loader = useCallback(async (guildId: string) => {
    const [pings, roles] = await Promise.all([
      getPings(guildId),
      listDiscordRoles(guildId).catch(() => []),
    ]);
    return { pings, roles };
  }, []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.kind === 'ready' && !dirty) {
      setSelected(state.data.pings.roleIds);
    }
  }, [state, dirty]);

  const options = useMemo(() => {
    const roles = state.kind === 'ready' ? state.data.roles : [];
    return roles.map((role) => ({
      value: role.id,
      label: role.everyone ? '@everyone' : role.name,
      disabled: role.everyone || role.name.toLowerCase() === 'here',
      hint: role.everyone ? 'niedostępne jako zwykły ping' : undefined,
    }));
  }, [state]);

  async function onSave() {
    if (guildId === null) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await updatePings(guildId, selected);
      setFlash('Role do pingowania zapisane.');
      setDirty(false);
      reload();
    } catch (err) {
      const parsed = errorFromUnknown(err);
      setError(parsed.message);
      if (Object.keys(parsed.fields).length > 0) {
        setFieldErrors(parsed.fields);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader
        title="Role i pingi"
        description="Wybierz role, które organizator może oznaczyć. @everyone i @here nie są zwykłymi rolami."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate state={state} emptyMessage="Brak ról do wyświetlenia.">
        {() => (
          <Panel title="Role dostępne do pingowania">
            <div className="form-grid">
              <MultiSelect
                legend="Role"
                options={options}
                selected={selected}
                disabled={busy}
                error={fieldErrors['roleIds']}
                onChange={(next) => {
                  setSelected(next);
                  setDirty(true);
                }}
              />
              <FieldError message={fieldErrors['roleIds']} />
              <Button variant="primary" disabled={busy} onClick={() => void onSave()}>
                {busy ? 'Zapisywanie…' : 'Zapisz'}
              </Button>
            </div>
          </Panel>
        )}
      </LoadGate>
    </section>
  );
}
