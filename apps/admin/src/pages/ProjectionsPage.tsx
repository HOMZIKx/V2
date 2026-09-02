import { useCallback, useState } from 'react';

import {
  listProjectionProblems,
  repairProjection,
  type ProjectionProblemDto,
} from '../api/activity-admin.js';
import {
  Flash,
  LoadGate,
  PageHeader,
  confirmDestructive,
  errorFromUnknown,
} from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

export function ProjectionsPage() {
  const loader = useCallback((guildId: string) => listProjectionProblems(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRepair(item: ProjectionProblemDto) {
    if (guildId === null) {
      return;
    }
    if (!confirmDestructive(`Naprawić publikację Discord dla tej aktywności?`)) {
      return;
    }
    setBusyId(item.activityId);
    setError(null);
    setFlash(null);
    try {
      await repairProjection(guildId, item.activityId);
      setFlash('Zlecono naprawę publikacji na Discordzie.');
      reload();
    } catch (err) {
      setError(errorFromUnknown(err).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <PageHeader
        title="Projekcje Discord"
        description="Zaawansowane: problemy synchronizacji wiadomości bota z aktywnościami."
      />
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate<ProjectionProblemDto[]>
        state={state}
        emptyMessage="Brak problemów z publikacją na Discordzie."
      >
        {(items) =>
          items.length === 0 ? (
            <p className="state-empty">Brak problemów z publikacją na Discordzie.</p>
          ) : (
            <div className="panel">
              <table className="data">
                <thead>
                  <tr>
                    <th>Aktywność</th>
                    <th>Status</th>
                    <th>Błąd</th>
                    <th>Ponowienia</th>
                    <th>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.activityId}>
                      <td>
                        <code>{item.activityId}</code>
                      </td>
                      <td>{item.status}</td>
                      <td>{item.lastError ?? '—'}</td>
                      <td>{item.retryCount ?? 0}</td>
                      <td>
                        <button
                          type="button"
                          className="primary"
                          disabled={busyId !== null}
                          onClick={() => void onRepair(item)}
                        >
                          {busyId === item.activityId ? 'Naprawianie…' : 'Napraw'}
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
