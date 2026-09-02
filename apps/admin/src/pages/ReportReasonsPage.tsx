import { useCallback, useState } from 'react';

import { Badge, Button, FormField, Panel, Toggle } from '@v2/design-system';

import {
  createReportReason,
  deleteReportReason,
  listReportReasons,
  updateReportReason,
  type ReportReasonDto,
} from '../api/activity-admin.js';
import {
  Flash,
  LoadGate,
  PageHeader,
  confirmDestructive,
  errorFromUnknown,
} from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

const emptyForm = { key: '', label: '', active: true, sortOrder: 0 };

export function ReportReasonsPage() {
  const loader = useCallback((guildId: string) => listReportReasons(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  function startEdit(item: ReportReasonDto) {
    setCreating(false);
    setEditingId(item.id);
    setForm({
      key: item.key,
      label: item.label,
      active: item.active,
      sortOrder: item.sortOrder,
    });
    setShowAdvanced(false);
    setFieldErrors({});
  }

  function startCreate() {
    setEditingId(null);
    setCreating(true);
    setForm(emptyForm);
    setShowAdvanced(true);
    setFieldErrors({});
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
    setForm(emptyForm);
    setFieldErrors({});
  }

  async function onSave() {
    if (guildId === null) {
      return;
    }
    const errors: Record<string, string> = {};
    if (form.key.trim() === '') {
      errors['key'] = 'Podaj klucz techniczny.';
    }
    if (form.label.trim() === '') {
      errors['label'] = 'Podaj nazwę powodu.';
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
      if (editingId === null) {
        await createReportReason(guildId, {
          key: form.key.trim(),
          label: form.label.trim(),
          active: form.active,
          sortOrder: form.sortOrder,
        });
        setFlash('Powód dodany.');
      } else {
        await updateReportReason(guildId, editingId, {
          label: form.label.trim(),
          active: form.active,
          sortOrder: form.sortOrder,
        });
        setFlash('Powód zaktualizowany.');
      }
      cancelEdit();
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

  async function onDelete(item: ReportReasonDto) {
    if (guildId === null) {
      return;
    }
    if (!confirmDestructive(`Usunąć powód „${item.label}”?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteReportReason(guildId, item.id);
      setFlash('Powód usunięty.');
      reload();
    } catch (err) {
      const parsed = errorFromUnknown(err);
      setError(parsed.message);
      setErrorDetail(parsed.detail);
    } finally {
      setBusy(false);
    }
  }

  const editorOpen = creating || editingId !== null;

  return (
    <section>
      <PageHeader
        title="Powody zgłoszeń"
        description="Kategorie zgłoszeń widoczne przy zgłaszaniu aktywności."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? (
        <Flash tone="error" detail={errorDetail}>
          {error}
        </Flash>
      ) : null}

      <LoadGate<ReportReasonDto[]> state={state} emptyMessage="Brak powodów. Dodaj pierwszy.">
        {(items) => (
          <div className="stack">
            {[...items]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item) => (
                <Panel key={item.id}>
                  <div className="row">
                    <strong>{item.label}</strong>
                    <Badge tone={item.active ? 'ok' : 'info'}>
                      {item.active ? 'Aktywny' : 'Wyłączony'}
                    </Badge>
                    <Button disabled={busy} onClick={() => startEdit(item)}>
                      Edytuj
                    </Button>
                  </div>
                </Panel>
              ))}
          </div>
        )}
      </LoadGate>

      <div className="row" style={{ marginTop: '1rem' }}>
        <Button variant="primary" disabled={busy} onClick={startCreate}>
          Dodaj
        </Button>
      </div>

      {editorOpen ? (
        <Panel title={editingId === null ? 'Nowy powód' : 'Edycja powodu'} className="form-grid">
          <FormField label="Nazwa" htmlFor="reason-label" error={fieldErrors['label']}>
            <input
              id="reason-label"
              className="v2-input"
              value={form.label}
              disabled={busy}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, label: event.target.value }));
              }}
            />
          </FormField>
          <Toggle
            id="reason-active"
            label={form.active ? 'Aktywny' : 'Wyłączony'}
            checked={form.active}
            disabled={busy}
            onChange={(checked) => {
              setForm((prev) => ({ ...prev, active: checked }));
            }}
          />
          {showAdvanced || creating ? (
            <FormField
              label="Klucz techniczny"
              htmlFor="reason-key"
              hint="Zaawansowane — wymagane przy tworzeniu."
              error={fieldErrors['key']}
            >
              <input
                id="reason-key"
                className="v2-input"
                value={form.key}
                disabled={busy || editingId !== null}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, key: event.target.value }));
                }}
              />
            </FormField>
          ) : (
            <Button
              variant="ghost"
              onClick={() => {
                setShowAdvanced(true);
              }}
            >
              Pokaż zaawansowane
            </Button>
          )}
          <div className="row">
            <Button variant="primary" disabled={busy} onClick={() => void onSave()}>
              {busy ? 'Zapisywanie…' : 'Zapisz'}
            </Button>
            <Button disabled={busy} onClick={cancelEdit}>
              Anuluj
            </Button>
            {editingId !== null ? (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  const current =
                    state.kind === 'ready'
                      ? state.data.find((item) => item.id === editingId)
                      : undefined;
                  if (current !== undefined) {
                    void onDelete(current);
                  }
                }}
              >
                Usuń
              </Button>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </section>
  );
}
