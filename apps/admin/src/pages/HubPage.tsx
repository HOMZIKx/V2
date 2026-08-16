import { useCallback, useEffect, useState } from 'react';

import { getHub, updateHub } from '../api/activity-admin.js';
import { FieldError, Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

export function HubPage() {
  const loader = useCallback((guildId: string) => getHub(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [channelId, setChannelId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.kind === 'ready' && !dirty) {
      setChannelId(state.data.channelId ?? '');
    }
  }, [state, dirty]);

  function onCancel() {
    if (state.kind === 'ready') {
      setChannelId(state.data.channelId ?? '');
    }
    setDirty(false);
    setFieldErrors({});
  }

  async function onSave() {
    if (guildId === null) {
      return;
    }
    const errors: Record<string, string> = {};
    if (channelId.trim() === '') {
      errors['channelId'] = 'Hub channel ID is required.';
    } else if (!/^\d{5,32}$/.test(channelId.trim())) {
      errors['channelId'] = 'Channel ID must be a Discord snowflake.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await updateHub(guildId, { channelId: channelId.trim() });
      setFlash('Hub channel saved.');
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
      <PageHeader title="Hub panel" description="Configure the Centrum hub channel." />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <div className="panel">
        <Flash tone="info">
          After setting the hub channel, publish or refresh the Discord panel with the operator
          command <code>/centrum-panel</code> on the guild.
        </Flash>
      </div>

      <LoadGate state={state} emptyMessage="No hub config.">
        {(data) => (
          <div className="panel form-grid">
            {data.status !== undefined && data.status !== null ? (
              <p>
                Panel status: <code>{data.status}</code>
              </p>
            ) : null}
            {data.messageId !== undefined && data.messageId !== null ? (
              <p className="muted">
                Message ID: <code>{data.messageId}</code>
              </p>
            ) : null}
            <label>
              Hub channel ID
              <input
                value={channelId}
                disabled={busy}
                onChange={(event) => {
                  setChannelId(event.target.value);
                  setDirty(true);
                }}
              />
              <FieldError message={fieldErrors['channelId']} />
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
