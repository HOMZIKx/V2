import { useCallback, useState } from 'react';

import {
  createReportReason,
  deleteReportReason,
  listReportReasons,
  updateReportReason,
  type ReportReasonDto,
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

const emptyForm = { key: '', label: '', active: true, sortOrder: 0 };

export function ReportReasonsPage() {
  const loader = useCallback((guildId: string) => listReportReasons(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startEdit(item: ReportReasonDto) {
    setEditingId(item.id);
    setForm({
      key: item.key,
      label: item.label,
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
    const errors: Record<string, string> = {};
    if (form.key.trim() === '') {
      errors['key'] = 'Key is required.';
    }
    if (form.label.trim() === '') {
      errors['label'] = 'Label is required.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      if (editingId === null) {
        await createReportReason(guildId, {
          key: form.key.trim(),
          label: form.label.trim(),
          active: form.active,
          sortOrder: form.sortOrder,
        });
        setFlash('Reason created.');
      } else {
        await updateReportReason(guildId, editingId, {
          label: form.label.trim(),
          active: form.active,
          sortOrder: form.sortOrder,
        });
        setFlash('Reason updated.');
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

  async function onDelete(item: ReportReasonDto) {
    if (guildId === null) {
      return;
    }
    if (!confirmDestructive(`Delete reason "${item.label}"?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteReportReason(guildId, item.id);
      setFlash('Reason deleted.');
      reload();
    } catch (err) {
      setError(errorFromUnknown(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader title="Report reasons" description="CRUD for moderation report categories." />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <div className="panel form-grid">
        <h2>{editingId === null ? 'Create reason' : 'Edit reason'}</h2>
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

      <LoadGate<ReportReasonDto[]> state={state} emptyMessage="No report reasons yet.">
        {(items) => (
          <div className="panel">
            <table className="data">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Label</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <code>{item.key}</code>
                    </td>
                    <td>{item.label}</td>
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
