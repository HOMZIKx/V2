import { useCallback, useEffect, useState } from 'react';

import { getNotifications, updateNotifications } from '../api/activity-admin.js';
import { FieldError, Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';
import { validateRemindersJson } from './validation.js';

export function NotificationsPage() {
  const loader = useCallback((guildId: string) => getNotifications(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [dmEnabled, setDmEnabled] = useState(false);
  const [remindersRaw, setRemindersRaw] = useState('[]');
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.kind === 'ready' && !dirty) {
      setDmEnabled(state.data.dmEnabled);
      setRemindersRaw(JSON.stringify(state.data.reminders ?? [], null, 2));
    }
  }, [state, dirty]);

  function onCancel() {
    if (state.kind === 'ready') {
      setDmEnabled(state.data.dmEnabled);
      setRemindersRaw(JSON.stringify(state.data.reminders ?? [], null, 2));
    }
    setDirty(false);
    setFieldErrors({});
  }

  async function onSave() {
    if (guildId === null) {
      return;
    }
    const parsedReminders = validateRemindersJson(remindersRaw);
    setFieldErrors(parsedReminders.errors);
    if (Object.keys(parsedReminders.errors).length > 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await updateNotifications(guildId, {
        dmEnabled,
        reminders: parsedReminders.value,
      });
      setFlash('Notifications saved.');
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
      <PageHeader title="Notifications" description="DM toggle and default reminders JSON." />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate state={state} emptyMessage="No notification config.">
        {() => (
          <div className="panel form-grid">
            <label className="inline-check">
              <input
                type="checkbox"
                checked={dmEnabled}
                disabled={busy}
                onChange={(event) => {
                  setDmEnabled(event.target.checked);
                  setDirty(true);
                }}
              />
              DM enabled
            </label>
            <label>
              Reminders (JSON)
              <textarea
                value={remindersRaw}
                disabled={busy}
                onChange={(event) => {
                  setRemindersRaw(event.target.value);
                  setDirty(true);
                }}
              />
              <FieldError message={fieldErrors['reminders']} />
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
