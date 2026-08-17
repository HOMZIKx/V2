import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, MultiSelect, Panel } from '@v2/design-system';

import {
  getPings,
  listDiscordRoles,
  updatePings,
  type DiscordRoleOption,
} from '../api/activity-admin.js';
import { FieldError, Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

type DiscordRolesMeta =
  | { readonly kind: 'ready'; readonly roles: readonly DiscordRoleOption[] }
  | { readonly kind: 'error' };

export function PingsPage() {
  const loader = useCallback(async (guildId: string) => {
    const pings = await getPings(guildId);
    let discord: DiscordRolesMeta;
    try {
      discord = { kind: 'ready', roles: await listDiscordRoles(guildId) };
    } catch {
      discord = { kind: 'error' };
    }
    return { pings, discord };
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
    const roles =
      state.kind === 'ready' && state.data.discord.kind === 'ready' ? state.data.discord.roles : [];
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
        {(data) => (
          <Panel title="Role dostępne do pingowania">
            <div className="form-grid">
              {data.discord.kind === 'error' ? (
                <>
                  <Flash tone="error">Nie udało się pobrać ról z Discorda.</Flash>
                  <Button disabled={busy} onClick={() => reload()}>
                    Spróbuj ponownie
                  </Button>
                  <MultiSelect
                    legend="Role"
                    options={[]}
                    selected={selected}
                    disabled
                    onChange={() => undefined}
                  />
                </>
              ) : (
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
              )}
              <FieldError message={fieldErrors['roleIds']} />
              <Button
                variant="primary"
                disabled={busy || data.discord.kind === 'error'}
                onClick={() => void onSave()}
              >
                {busy ? 'Zapisywanie…' : 'Zapisz'}
              </Button>
            </div>
          </Panel>
        )}
      </LoadGate>
    </section>
  );
}
