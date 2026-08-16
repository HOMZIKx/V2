import { useCallback, useState } from 'react';

import {
  createType,
  listTypes,
  reorderTypes,
  updateType,
  type ActivityTypeDto,
} from '../api/activity-admin.js';
import { FieldError, Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';
import { validateActivityTypeForm } from './validation.js';

const emptyForm = { key: '', label: '', enabled: true, isOther: false };

export function TypesPage() {
  const loader = useCallback((guildId: string) => listTypes(guildId), []);
  const { guildId, state, reload, setState } = useGuildResource(loader);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(item: ActivityTypeDto) {
    setEditingId(item.id);
    setForm({
      key: item.key,
      label: item.label,
      enabled: item.enabled,
      isOther: item.isOther,
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
    const errors = validateActivityTypeForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      if (editingId === null) {
        await createType(guildId, {
          key: form.key.trim(),
          label: form.label.trim(),
          enabled: form.enabled,
          isOther: form.isOther,
        });
        setFlash('Type created.');
      } else {
        await updateType(guildId, editingId, {
          label: form.label.trim(),
          enabled: form.enabled,
          isOther: form.isOther,
        });
        setFlash('Type updated.');
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

  async function toggleEnabled(item: ActivityTypeDto) {
    if (guildId === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateType(guildId, item.id, { enabled: !item.enabled });
      reload();
    } catch (err) {
      setError(errorFromUnknown(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(item: ActivityTypeDto, direction: -1 | 1) {
    if (guildId === null || state.kind !== 'ready') {
      return;
    }
    const items = [...state.data].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = items.findIndex((row) => row.id === item.id);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= items.length) {
      return;
    }
    const reordered = [...items];
    const current = reordered[index];
    const other = reordered[swapWith];
    if (current === undefined || other === undefined) {
      return;
    }
    reordered[index] = other;
    reordered[swapWith] = current;
    setBusy(true);
    setError(null);
    try {
      const next = await reorderTypes(
        guildId,
        reordered.map((row) => row.id),
      );
      setState({ kind: 'ready', data: next.length > 0 ? next : reordered });
      setFlash('Order updated.');
    } catch (err) {
      setError(errorFromUnknown(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader title="Activity types" description="Create, edit label, enable, reorder." />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <div className="panel form-grid">
        <h2>{editingId === null ? 'Create type' : 'Edit type'}</h2>
        <label>
          Key
          <input
            value={form.key}
            disabled={busy || editingId !== null}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, key: event.target.value }));
            }}
          />
          <FieldError message={fieldErrors['key']} />
        </label>
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
        <label className="inline-check">
          <input
            type="checkbox"
            checked={form.enabled}
            disabled={busy}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, enabled: event.target.checked }));
            }}
          />
          Enabled
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={form.isOther}
            disabled={busy}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, isOther: event.target.checked }));
            }}
          />
          Other activity
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

      <LoadGate<ActivityTypeDto[]> state={state} emptyMessage="No types yet.">
        {(items) => (
          <div className="panel">
            <table className="data">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Key</th>
                  <th>Label</th>
                  <th>Enabled</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...items]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((item) => (
                    <tr key={item.id}>
                      <td>{item.sortOrder}</td>
                      <td>
                        <code>{item.key}</code>
                      </td>
                      <td>{item.label}</td>
                      <td>{item.enabled ? 'yes' : 'no'}</td>
                      <td className="row">
                        <button type="button" disabled={busy} onClick={() => startEdit(item)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void toggleEnabled(item)}
                        >
                          {item.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button" disabled={busy} onClick={() => void move(item, -1)}>
                          Up
                        </button>
                        <button type="button" disabled={busy} onClick={() => void move(item, 1)}>
                          Down
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
