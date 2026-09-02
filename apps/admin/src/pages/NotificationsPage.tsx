import { useCallback, useEffect, useState } from 'react';

import { Button, FormField, Panel, Toggle } from '@v2/design-system';

import { getNotifications, updateNotifications } from '../api/activity-admin.js';
import { Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

function parseReminders(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const minutes: number[] = [];
  for (const entry of raw) {
    if (typeof entry === 'number' && entry > 0) {
      minutes.push(entry);
      continue;
    }
    if (typeof entry === 'object' && entry !== null) {
      const rec = entry as Record<string, unknown>;
      const value = rec['offsetMinutes'] ?? rec['minutesBefore'] ?? rec['offset_minutes'];
      if (typeof value === 'number' && value > 0) {
        minutes.push(value);
      }
    }
  }
  return minutes;
}

function formatReminder(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 godzinę przed' : `${String(hours)} godziny przed`;
  }
  return minutes === 1 ? '1 minutę przed' : `${String(minutes)} minut przed`;
}

export function NotificationsPage() {
  const loader = useCallback((guildId: string) => getNotifications(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [dmEnabled, setDmEnabled] = useState(false);
  const [reminders, setReminders] = useState<number[]>([]);
  const [newMinutes, setNewMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (state.kind === 'ready' && !dirty) {
      setDmEnabled(state.data.dmEnabled);
      setReminders(parseReminders(state.data.reminders));
    }
  }, [state, dirty]);

  async function onSave() {
    if (guildId === null) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await updateNotifications(guildId, {
        dmEnabled,
        reminders: reminders.map((offsetMinutes) => ({ offsetMinutes })),
      });
      setFlash('Powiadomienia zapisane.');
      setDirty(false);
      reload();
    } catch (err) {
      setError(errorFromUnknown(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader
        title="Powiadomienia"
        description="Wiadomości prywatne i przypomnienia przed startem."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate state={state} emptyMessage="Brak konfiguracji powiadomień.">
        {() => (
          <Panel>
            <div className="form-grid">
              <Toggle
                id="dm-enabled"
                label="Wiadomości prywatne (DM)"
                checked={dmEnabled}
                disabled={busy}
                onChange={(checked) => {
                  setDmEnabled(checked);
                  setDirty(true);
                }}
              />
              <div>
                <h2 className="v2-panel-title">Przypomnienia</h2>
                {reminders.length === 0 ? <p className="muted">Brak przypomnień.</p> : null}
                <ul className="checklist">
                  {reminders.map((minutes, index) => (
                    <li key={`${String(minutes)}-${String(index)}`}>
                      <span>{formatReminder(minutes)}</span>
                      <Button
                        disabled={busy}
                        onClick={() => {
                          setReminders((current) => current.filter((_, i) => i !== index));
                          setDirty(true);
                        }}
                      >
                        Usuń
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="row">
                  <FormField label="Nowe przypomnienie (minuty przed)" htmlFor="new-reminder">
                    <input
                      id="new-reminder"
                      className="v2-input"
                      type="number"
                      min={1}
                      value={newMinutes}
                      disabled={busy}
                      onChange={(event) => {
                        setNewMinutes(Number(event.target.value));
                      }}
                    />
                  </FormField>
                  <Button
                    disabled={busy || newMinutes < 1}
                    onClick={() => {
                      setReminders((current) => [...current, newMinutes]);
                      setDirty(true);
                    }}
                  >
                    Dodaj przypomnienie
                  </Button>
                </div>
              </div>
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
