import { useCallback, useState } from 'react';

import { listReports, resolveReport, type ReportDto } from '../api/activity-admin.js';
import {
  Flash,
  LoadGate,
  PageHeader,
  confirmDestructive,
  errorFromUnknown,
} from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

export function ReportsPage() {
  const loader = useCallback((guildId: string) => listReports(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onResolve(item: ReportDto) {
    if (guildId === null) {
      return;
    }
    if (!confirmDestructive(`Oznaczyć zgłoszenie jako rozwiązane?`)) {
      return;
    }
    setBusyId(item.id);
    setError(null);
    setFlash(null);
    try {
      await resolveReport(guildId, item.id);
      setFlash('Zgłoszenie oznaczone jako rozwiązane.');
      reload();
    } catch (err) {
      setError(errorFromUnknown(err).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <PageHeader title="Zgłoszenia" description="Zgłoszenia wymagające decyzji moderatora." />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate<ReportDto[]> state={state} emptyMessage="Brak zgłoszeń do rozpatrzenia.">
        {(items) =>
          items.length === 0 ? (
            <p className="state-empty">Brak zgłoszeń do rozpatrzenia.</p>
          ) : (
            <div className="panel">
              <table className="data">
                <thead>
                  <tr>
                    <th>Utworzono</th>
                    <th>Wydarzenie</th>
                    <th>Powód</th>
                    <th>Status</th>
                    <th>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.createdAt}</td>
                      <td>
                        <code>{item.activityId}</code>
                      </td>
                      <td>
                        {item.reasonCategory}
                        {item.details !== null && item.details !== undefined && item.details !== ''
                          ? ` — ${item.details}`
                          : ''}
                      </td>
                      <td>{item.status}</td>
                      <td>
                        <button
                          type="button"
                          className="primary"
                          disabled={busyId !== null}
                          onClick={() => void onResolve(item)}
                        >
                          {busyId === item.id ? 'Zapisywanie…' : 'Rozwiąż'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </LoadGate>
    </section>
  );
}
