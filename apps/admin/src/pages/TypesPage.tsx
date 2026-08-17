import { useCallback, useState } from 'react';

import { Badge, Button, FormField, Panel, Toggle } from '@v2/design-system';

import { deriveActivityTypeKey } from '../activity-type-key.js';
import { createType, listTypes, updateType, type ActivityTypeDto } from '../api/activity-admin.js';
import { Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
import {
  resolveActivityTypeKeyForCreate,
  validateActivityTypeCreateForm,
  validateActivityTypeEditForm,
} from '../form-validation.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

const emptyForm = { key: '', label: '', enabled: true, isOther: false };

export function TypesPage() {
  const loader = useCallback((guildId: string) => listTypes(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(item: ActivityTypeDto) {
    setCreating(false);
    setEditingId(item.id);
    setForm({
      key: item.key,
      label: item.label,
      enabled: item.enabled,
      isOther: item.isOther,
    });
    setShowAdvanced(false);
    setFieldErrors({});
  }

  function startCreate() {
    setEditingId(null);
    setCreating(true);
    setForm(emptyForm);
    setShowAdvanced(false);
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
    const errors =
      editingId === null
        ? validateActivityTypeCreateForm({ label: form.label, key: form.key })
        : validateActivityTypeEditForm({ label: form.label });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      if (editingId === null) {
        const key = resolveActivityTypeKeyForCreate({ label: form.label, key: form.key });
        await createType(guildId, {
          key,
          label: form.label.trim(),
          enabled: form.enabled,
          isOther: form.isOther,
        });
        setFlash('Typ dodany.');
      } else {
        await updateType(guildId, editingId, {
          label: form.label.trim(),
          enabled: form.enabled,
          isOther: form.isOther,
        });
        setFlash('Typ zaktualizowany.');
      }
      cancelEdit();
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

  const editorOpen = creating || editingId !== null;
  const previewKey =
    creating && form.label.trim() !== '' ? deriveActivityTypeKey(form.label) : form.key.trim();

  return (
    <section>
      <PageHeader
        title="Typy aktywności"
        description="Nazwy widoczne dla właściciela i członków."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate<ActivityTypeDto[]> state={state} emptyMessage="Brak typów. Dodaj pierwszy.">
        {(items) => (
          <div className="stack">
            {[...items]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item) => (
                <Panel key={item.id}>
                  <div className="row">
                    <strong>{item.label}</strong>
                    <Badge tone={item.enabled ? 'ok' : 'info'}>
                      {item.enabled ? 'Aktywny' : 'Wyłączony'}
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
          Dodaj typ
        </Button>
      </div>

      {editorOpen ? (
        <Panel title={editingId === null ? 'Nowy typ' : 'Edycja typu'} className="form-grid">
          <FormField label="Nazwa" htmlFor="type-label" error={fieldErrors['label']}>
            <input
              id="type-label"
              className="v2-input"
              value={form.label}
              disabled={busy}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, label: event.target.value }));
              }}
            />
          </FormField>
          <Toggle
            id="type-enabled"
            label={form.enabled ? 'Aktywny' : 'Wyłączony'}
            checked={form.enabled}
            disabled={busy}
            onChange={(checked) => {
              setForm((prev) => ({ ...prev, enabled: checked }));
            }}
          />
          {editingId !== null && showAdvanced ? (
            <FormField
              label="Klucz techniczny"
              htmlFor="type-key"
              hint="Nie zmienia się po zapisaniu typu."
            >
              <input id="type-key" className="v2-input" value={form.key} disabled readOnly />
            </FormField>
          ) : null}
          {creating && showAdvanced ? (
            <FormField
              label="Klucz techniczny (opcjonalnie)"
              htmlFor="type-key"
              hint={
                previewKey !== ''
                  ? `Domyślnie: ${previewKey}`
                  : 'System wygeneruje klucz automatycznie z nazwy.'
              }
              error={fieldErrors['key']}
            >
              <input
                id="type-key"
                className="v2-input"
                value={form.key}
                disabled={busy}
                placeholder={previewKey !== '' ? previewKey : 'lodowa_wiedzma'}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, key: event.target.value }));
                }}
              />
            </FormField>
          ) : null}
          {!showAdvanced ? (
            <Button
              variant="ghost"
              onClick={() => {
                setShowAdvanced(true);
              }}
            >
              Pokaż zaawansowane
            </Button>
          ) : null}
          <div className="row">
            <Button variant="primary" disabled={busy} onClick={() => void onSave()}>
              {busy ? 'Zapisywanie…' : 'Zapisz'}
            </Button>
            <Button disabled={busy} onClick={cancelEdit}>
              Anuluj
            </Button>
          </div>
        </Panel>
      ) : null}
    </section>
  );
}
