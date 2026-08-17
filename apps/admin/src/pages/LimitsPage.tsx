import { useCallback, useEffect, useState } from 'react';

import { Button, FormField, Panel, Toggle } from '@v2/design-system';

import { getLimits, updateLimits, type LimitsConfigDto } from '../api/activity-admin.js';
import { Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
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
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
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
      errors['maxActivePerCreator'] = 'Wartość musi być co najmniej 1.';
    }
    if (form.horizonDays < 1) {
      errors['horizonDays'] = 'Wartość musi być co najmniej 1.';
    }
    if (form.retentionHours < 1) {
      errors['retentionHours'] = 'Wartość musi być co najmniej 1.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    setFlash(null);
    try {
      await updateLimits(guildId, form);
      setFlash('Limity zapisane.');
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

  return (
    <section>
      <PageHeader
        title="Limity"
        description="Ograniczenia, które naprawdę istnieją w konfiguracji serwera."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? (
        <Flash tone="error" detail={errorDetail}>
          {error}
        </Flash>
      ) : null}

      <LoadGate state={state} emptyMessage="Brak konfiguracji limitów.">
        {() => (
          <Panel>
            <div className="form-grid">
              <FormField
                label="Maksymalna liczba aktywności użytkownika"
                htmlFor="limit-max-active"
                error={fieldErrors['maxActivePerCreator']}
              >
                <input
                  id="limit-max-active"
                  className="v2-input"
                  type="number"
                  min={1}
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
              </FormField>
              <FormField
                label="Horyzont planowania (dni)"
                htmlFor="limit-horizon"
                hint="Ile dni naprzód można zaplanować aktywność."
                error={fieldErrors['horizonDays']}
              >
                <input
                  id="limit-horizon"
                  className="v2-input"
                  type="number"
                  min={1}
                  value={form.horizonDays}
                  disabled={busy}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, horizonDays: Number(event.target.value) }));
                    setDirty(true);
                  }}
                />
              </FormField>
              <FormField
                label="Czas przechowywania posta (godziny)"
                htmlFor="limit-retention"
                error={fieldErrors['retentionHours']}
              >
                <input
                  id="limit-retention"
                  className="v2-input"
                  type="number"
                  min={1}
                  value={form.retentionHours}
                  disabled={busy}
                  onChange={(event) => {
                    setForm((prev) => ({ ...prev, retentionHours: Number(event.target.value) }));
                    setDirty(true);
                  }}
                />
              </FormField>
              <Toggle
                id="limit-other"
                label="Inna aktywność dostępna"
                checked={form.otherActivityEnabled}
                disabled={busy}
                onChange={(checked) => {
                  setForm((prev) => ({ ...prev, otherActivityEnabled: checked }));
                  setDirty(true);
                }}
              />
              <div className="row">
                <Button variant="primary" disabled={busy} onClick={() => void onSave()}>
                  {busy ? 'Zapisywanie…' : 'Zapisz'}
                </Button>
                <Button disabled={busy} onClick={onCancel}>
                  Anuluj
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </LoadGate>
    </section>
  );
}
