import { useCallback, useState } from 'react';

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

export function StatusesPage() {
  const loader = useCallback((guildId: string) => listStatuses(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(item: StatusDefDto) {
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

  function cancelEdit() {
    setEditingId(null);
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
    setFlash(null);
    try {
      if (editingId === null) {
        await createStatus(guildId, form);
        setFlash('Status created.');
      } else {
        await updateStatus(guildId, editingId, form);
        setFlash('Status updated.');
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

  async function onDelete(item: StatusDefDto) {
    if (guildId === null) {
      return;
    }
    if (!confirmDestructive(`Delete status "${item.label}"? This fails if referenced.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteStatus(guildId, item.id);
      setFlash('Status deleted.');
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
        title="Participation statuses"
        description="Behavior + occupiesSlot. Delete is blocked when referenced."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <div className="panel form-grid">
        <h2>{editingId === null ? 'Create status' : 'Edit status'}</h2>
        <label>
          Label
          <input
            value={form.label}
            disabled={busy}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, label: event.target.value }));
            }}
          />
          <FieldError message={fieldErrors['label']} />
        </label>
        <label>
          Behavior
          <select
            value={form.behavior}
            disabled={busy}
            onChange={(event) => {
              setForm((prev) => ({
                ...prev,
                behavior: event.target.value as StatusDefDto['behavior'],
              }));
            }}
          >
            <option value="confirmed">confirmed</option>
            <option value="tentative">tentative</option>
            <option value="declined">declined</option>
            <option value="custom">custom</option>
          </select>
        </label>
        <label>
          Sort order
          <input
            type="number"
            value={form.sortOrder}
            disabled={busy}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, sortOrder: Number(event.target.value) }));
            }}
          />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={form.occupiesSlot}
            disabled={busy}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, occupiesSlot: event.target.checked }));
            }}
          />
          Occupies slot
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={form.selectableByMember}
            disabled={busy}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, selectableByMember: event.target.checked }));
            }}
          />
          Selectable by member
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={form.active}
            disabled={busy}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, active: event.target.checked }));
            }}
          />
          Active
        </label>
        <div className="row">
          <button type="button" className="primary" disabled={busy} onClick={() => void onSave()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" disabled={busy} onClick={cancelEdit}>
            Cancel
          </button>
        </div>
      </div>

      <LoadGate<StatusDefDto[]> state={state} emptyMessage="No statuses yet.">
        {(items) => (
          <div className="panel">
            <table className="data">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Behavior</th>
                  <th>Slot</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.label}</td>
                    <td>
                      <code>{item.behavior}</code>
                    </td>
                    <td>{item.occupiesSlot ? 'yes' : 'no'}</td>
                    <td>{item.active ? 'yes' : 'no'}</td>
                    <td className="row">
                      <button type="button" disabled={busy} onClick={() => startEdit(item)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => void onDelete(item)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LoadGate>
    </section>
  );
}
