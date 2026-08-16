import { useCallback, useEffect, useState } from 'react';

import { getLimits, updateLimits, type LimitsConfigDto } from '../api/activity-admin.js';
import { FieldError, Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

const defaults: LimitsConfigDto = {
  maxActivePerCreator: 4,
  horizonDays: 14,
  otherActivityEnabled: true,
  retentionHours: 24,
};

export function LimitsPage() {
  const loader = useCallback((guildId: string) => getLimits(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [form, setForm] = useState<LimitsConfigDto>(defaults);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.kind === 'ready' && !dirty) {
      setForm(state.data);
    }
  }, [state, dirty]);

  function onCancel() {
    if (state.kind === 'ready') {
      setForm(state.data);
    }
    setDirty(false);
    setFieldErrors({});
  }

  async function onSave() {
    if (guildId === null) {
      return;
    }
    const errors: Record<string, string> = {};
    if (form.maxActivePerCreator < 1) {
      errors['maxActivePerCreator'] = 'Must be ≥ 1.';
    }
    if (form.horizonDays < 1) {
      errors['horizonDays'] = 'Must be ≥ 1.';
    }
    if (form.retentionHours < 1) {
      errors['retentionHours'] = 'Must be ≥ 1.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await updateLimits(guildId, form);
      setFlash('Limits saved.');
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
        title="Limits"
        description="Max active, create horizon, other-activity toggle, retention."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate state={state} emptyMessage="No limits config.">
        {() => (
          <div className="panel form-grid">
            <label>
              Max active per creator
              <input
                type="number"
                value={form.maxActivePerCreator}
                disabled={busy}
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    maxActivePerCreator: Number(event.target.value),
                  }));
                  setDirty(true);
                }}
              />
              <FieldError message={fieldErrors['maxActivePerCreator']} />
            </label>
            <label>
              Horizon (days)
              <input
                type="number"
                value={form.horizonDays}
                disabled={busy}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, horizonDays: Number(event.target.value) }));
                  setDirty(true);
                }}
              />
              <FieldError message={fieldErrors['horizonDays']} />
            </label>
            <label>
              Retention (hours)
              <input
                type="number"
                value={form.retentionHours}
                disabled={busy}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, retentionHours: Number(event.target.value) }));
                  setDirty(true);
                }}
              />
              <FieldError message={fieldErrors['retentionHours']} />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={form.otherActivityEnabled}
                disabled={busy}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, otherActivityEnabled: event.target.checked }));
                  setDirty(true);
                }}
              />
              Other activity enabled
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
