import { useCallback, useEffect, useState } from 'react';

import { getChannels, updateChannels } from '../api/activity-admin.js';
import {
  FieldError,
  Flash,
  LoadGate,
  PageHeader,
  errorFromUnknown,
  parseIdList,
} from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';
import { validateChannelList } from './validation.js';

export function ChannelsPage() {
  const loader = useCallback((guildId: string) => getChannels(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [raw, setRaw] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.kind === 'ready' && !dirty) {
      setRaw(state.data.channelIds.join('\n'));
    }
  }, [state, dirty]);

  function onCancel() {
    if (state.kind === 'ready') {
      setRaw(state.data.channelIds.join('\n'));
    }
    setDirty(false);
    setFieldErrors({});
    setError(null);
  }

  async function onSave() {
    if (guildId === null) {
      return;
    }
    const errors = validateChannelList(raw);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await updateChannels(guildId, parseIdList(raw));
      setFlash('Channels saved.');
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
        title="Publish channels"
        description="Allowed Discord channel IDs for activity publication."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate state={state} emptyMessage="No channel config.">
        {() => (
          <div className="panel form-grid">
            <label>
              Channel IDs (one per line or comma-separated)
              <textarea
                value={raw}
                disabled={busy}
                onChange={(event) => {
                  setRaw(event.target.value);
                  setDirty(true);
                }}
              />
              <FieldError message={fieldErrors['channelIds']} />
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
