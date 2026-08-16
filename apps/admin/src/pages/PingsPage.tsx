import { useCallback, useEffect, useState } from 'react';

import { getPings, updatePings } from '../api/activity-admin.js';
import {
  FieldError,
  Flash,
  LoadGate,
  PageHeader,
  errorFromUnknown,
  parseIdList,
} from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

export function PingsPage() {
  const loader = useCallback((guildId: string) => getPings(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [raw, setRaw] = useState('');
  const [maxNote, setMaxNote] = useState(2);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.kind === 'ready' && !dirty) {
      setRaw(state.data.roleIds.join('\n'));
      setMaxNote(state.data.maxOrganizerRoles ?? 2);
    }
  }, [state, dirty]);

  function onCancel() {
    if (state.kind === 'ready') {
      setRaw(state.data.roleIds.join('\n'));
      setMaxNote(state.data.maxOrganizerRoles ?? 2);
    }
    setDirty(false);
    setFieldErrors({});
  }

  async function onSave() {
    if (guildId === null) {
      return;
    }
    const roleIds = parseIdList(raw);
    const errors: Record<string, string> = {};
    const invalid = roleIds.filter((id) => !/^\d{5,32}$/.test(id));
    if (invalid.length > 0) {
      errors['roleIds'] = `Invalid role ID(s): ${invalid.join(', ')}`;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await updatePings(guildId, roleIds);
      setFlash('Ping roles saved.');
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
        title="Allowed pings"
        description={`Role IDs organizers may ping (product max ≤ ${String(maxNote)}).`}
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate state={state} emptyMessage="No ping config.">
        {() => (
          <div className="panel form-grid">
            <p className="muted">
              Note: organizers may select at most <strong>{maxNote}</strong> ping role(s) when
              creating an activity.
            </p>
            <label>
              Role IDs (one per line)
              <textarea
                value={raw}
                disabled={busy}
                onChange={(event) => {
                  setRaw(event.target.value);
                  setDirty(true);
                }}
              />
              <FieldError message={fieldErrors['roleIds']} />
            </label>
            <div className="row">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void onSave()}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" disabled={busy} onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </LoadGate>
    </section>
  );
}
