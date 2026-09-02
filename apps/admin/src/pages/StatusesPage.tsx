import { useCallback, useState } from 'react';

import { Badge, Button, FormField, Panel, Select, Toggle } from '@v2/design-system';

import {
  createStatus,
  deleteStatus,
  listStatuses,
  updateStatus,
  type StatusDefDto,
} from '../api/activity-admin.js';
import {
  FieldError,
  Flash,
  LoadGate,
  PageHeader,
  confirmDestructive,
  errorFromUnknown,
} from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';
import { validateStatusForm } from './validation.js';

const emptyForm = {
  label: '',
  occupiesSlot: true,
  behavior: 'confirmed' as StatusDefDto['behavior'],
  selectableByMember: true,
  active: true,
  sortOrder: 0,
};

const BEHAVIOR_OPTIONS = [
  { value: 'confirmed', label: 'Potwierdzenie — uczestnik jest na liście' },
  { value: 'tentative', label: 'Niepewny — osobne od zajmowania miejsca' },
  { value: 'declined', label: 'Odrzucenie — RSVP „nie biorę udziału”' },
  { value: 'custom', label: 'Własny status' },
] as const;

function behaviorLabel(behavior: StatusDefDto['behavior']): string {
  return BEHAVIOR_OPTIONS.find((option) => option.value === behavior)?.label ?? behavior;
}

export function StatusesPage() {
  const loader = useCallback((guildId: string) => listStatuses(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  function startEdit(item: StatusDefDto) {
    setCreating(false);
    setEditingId(item.id);
    setForm({
      label: item.label,
      occupiesSlot: item.occupiesSlot,
      behavior: item.behavior,
      selectableByMember: item.selectableByMember,
      active: item.active,
      sortOrder: item.sortOrder,
    });
    setFieldErrors({});
  }

  function startCreate() {
    setEditingId(null);
    setCreating(true);
    setForm(emptyForm);
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
    const errors = validateStatusForm(form);
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
        await createStatus(guildId, form);
        setFlash('Status dodany.');
      } else {
        await updateStatus(guildId, editingId, form);
        setFlash('Status zaktualizowany.');
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

  async function onDelete(item: StatusDefDto) {
    if (guildId === null) {
      return;
    }
    if (
      !confirmDestructive(
        `Usunąć status „${item.label}”? Operacja nie powiedzie się, jeśli jest używany.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteStatus(guildId, item.id);
      setFlash('Status usunięty.');
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
        title="Statusy zapisów"
        description="Nazwa, znaczenie, czy zajmuje miejsce i czy uczestnik może go wybrać."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? (
        <Flash tone="error" detail={errorDetail}>
          {error}
        </Flash>
      ) : null}

      <LoadGate<StatusDefDto[]> state={state} emptyMessage="Brak statusów. Dodaj pierwszy.">
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
                    <span className="muted">
                      {item.occupiesSlot ? 'Zajmuje miejsce' : 'Nie zajmuje miejsca'}
                    </span>
                    <Button disabled={busy} onClick={() => startEdit(item)}>
                      Edytuj
                    </Button>
                  </div>
                  <p className="muted">{behaviorLabel(item.behavior)}</p>
                </Panel>
              ))}
          </div>
        )}
      </LoadGate>

      <div className="row" style={{ marginTop: '1rem' }}>
        <Button variant="primary" disabled={busy} onClick={startCreate}>
          Dodaj status
        </Button>
      </div>

      {editorOpen ? (
        <Panel title={editingId === null ? 'Nowy status' : 'Edycja statusu'} className="form-grid">
          <FormField label="Nazwa" htmlFor="status-label" error={fieldErrors['label']}>
            <input
              id="status-label"
              className="v2-input"
              value={form.label}
              disabled={busy}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, label: event.target.value }));
              }}
            />
          </FormField>
          <FormField label="Znaczenie" htmlFor="status-behavior">
            <Select
              id="status-behavior"
              value={form.behavior}
              disabled={busy}
              options={[...BEHAVIOR_OPTIONS]}
              onChange={(event) => {
                setForm((prev) => ({
                  ...prev,
                  behavior: event.target.value as StatusDefDto['behavior'],
                }));
              }}
            />
          </FormField>
          {form.behavior === 'declined' && form.occupiesSlot ? (
            <p className="muted" role="status">
              Behavior i zajmowanie miejsca są osobnymi polami. Seed „Nie będę” nie zajmuje miejsca
              — zostaw włączone tylko świadomie.
            </p>
          ) : null}
          <Toggle
            id="status-slot"
            label={form.occupiesSlot ? 'Zajmuje miejsce' : 'Nie zajmuje miejsca'}
            checked={form.occupiesSlot}
            disabled={busy}
            onChange={(checked) => {
              setForm((prev) => ({ ...prev, occupiesSlot: checked }));
            }}
          />
          <Toggle
            id="status-selectable"
            label={form.selectableByMember ? 'Uczestnik może wybrać' : 'Tylko organizator'}
            checked={form.selectableByMember}
            disabled={busy}
            onChange={(checked) => {
              setForm((prev) => ({ ...prev, selectableByMember: checked }));
            }}
          />
          <Toggle
            id="status-active"
            label={form.active ? 'Aktywny' : 'Wyłączony'}
            checked={form.active}
            disabled={busy}
            onChange={(checked) => {
              setForm((prev) => ({ ...prev, active: checked }));
            }}
          />
          <FieldError message={fieldErrors['label']} />
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
