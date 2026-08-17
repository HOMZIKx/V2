import { useCallback, useState } from 'react';

import { Badge, Button, FormField, Panel, Select, Toggle } from '@v2/design-system';

import {
  createField,
  deleteField,
  listFields,
  updateField,
  type FieldDefDto,
} from '../api/activity-admin.js';
import {
  Flash,
  LoadGate,
  PageHeader,
  confirmDestructive,
  errorFromUnknown,
} from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

const emptyForm = {
  key: '',
  label: '',
  fieldType: 'text',
  requiredDefault: false,
  active: true,
};

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Tekst' },
  { value: 'number', label: 'Liczba' },
  { value: 'select', label: 'Lista wyboru' },
  { value: 'boolean', label: 'Tak / nie' },
];

function fieldTypeLabel(fieldType: string): string {
  return FIELD_TYPE_OPTIONS.find((option) => option.value === fieldType)?.label ?? fieldType;
}

export function FieldsPage() {
  const loader = useCallback((guildId: string) => listFields(guildId), []);
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

  function startEdit(item: FieldDefDto) {
    setCreating(false);
    setEditingId(item.id);
    setForm({
      key: item.key,
      label: item.label,
      fieldType: item.fieldType,
      requiredDefault: item.requiredDefault,
      active: item.active,
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
      errors['label'] = 'Podaj nazwę pola.';
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
        await createField(guildId, {
          key: form.key.trim(),
          label: form.label.trim(),
          fieldType: form.fieldType,
          requiredDefault: form.requiredDefault,
          active: form.active,
        });
        setFlash('Pole dodane.');
      } else {
        await updateField(guildId, editingId, {
          label: form.label.trim(),
          fieldType: form.fieldType,
          requiredDefault: form.requiredDefault,
          active: form.active,
        });
        setFlash('Pole zaktualizowane.');
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

  async function onDelete(item: FieldDefDto) {
    if (guildId === null) {
      return;
    }
    if (!confirmDestructive(`Usunąć pole „${item.label}”?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteField(guildId, item.id);
      setFlash('Pole usunięte.');
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
        title="Formularz uczestnika"
        description="Pola, które uczestnik wypełnia przy zapisie."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? (
        <Flash tone="error" detail={errorDetail}>
          {error}
        </Flash>
      ) : null}

      <LoadGate<FieldDefDto[]> state={state} emptyMessage="Brak pól. Dodaj pierwsze.">
        {(items) => (
          <div className="stack">
            {items.map((item) => (
              <Panel key={item.id}>
                <div className="row">
                  <strong>{item.label}</strong>
                  <Badge tone={item.requiredDefault ? 'warn' : 'info'}>
                    {item.requiredDefault ? 'Wymagane' : 'Opcjonalne'}
                  </Badge>
                  <span className="muted">{fieldTypeLabel(item.fieldType)}</span>
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
          Dodaj pole
        </Button>
      </div>

      {editorOpen ? (
        <Panel title={editingId === null ? 'Nowe pole' : 'Edycja pola'} className="form-grid">
          <FormField label="Nazwa" htmlFor="field-label" error={fieldErrors['label']}>
            <input
              id="field-label"
              className="v2-input"
              value={form.label}
              disabled={busy}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, label: event.target.value }));
              }}
            />
          </FormField>
          <FormField label="Rodzaj" htmlFor="field-type">
            <Select
              id="field-type"
              value={form.fieldType}
              disabled={busy}
              options={FIELD_TYPE_OPTIONS}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, fieldType: event.target.value }));
              }}
            />
          </FormField>
          <Toggle
            id="field-required"
            label={form.requiredDefault ? 'Wymagane' : 'Opcjonalne'}
            checked={form.requiredDefault}
            disabled={busy}
            onChange={(checked) => {
              setForm((prev) => ({ ...prev, requiredDefault: checked }));
            }}
          />
          <Toggle
            id="field-active"
            label={form.active ? 'Aktywne' : 'Wyłączone'}
            checked={form.active}
            disabled={busy}
            onChange={(checked) => {
              setForm((prev) => ({ ...prev, active: checked }));
            }}
          />
          {showAdvanced || creating ? (
            <FormField
              label="Klucz techniczny"
              htmlFor="field-key"
              hint="Zaawansowane — wymagane przy tworzeniu."
              error={fieldErrors['key']}
            >
              <input
                id="field-key"
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
