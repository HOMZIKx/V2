import { useCallback, useMemo, useState } from 'react';

import {
  ensureGuildDefaults,
  getReadiness,
  type ReadinessResponse,
} from '../api/activity-admin.js';
import { readAdminSession } from '../auth/session.js';
import { Flash, LoadGate, PageHeader, errorFromUnknown } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

export function OverviewPage() {
  const session = readAdminSession();
  const loader = useCallback((guildId: string) => getReadiness(guildId), []);
  const { guildId, state, reload } = useGuildResource(loader);
  const [orgId, setOrgId] = useState(session.orgId ?? '');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    if (state.kind !== 'ready') {
      return null;
    }
    return state.data.counts ?? null;
  }, [state]);

  async function onEnsureDefaults() {
    if (guildId === null) {
      return;
    }
    if (orgId.trim() === '') {
      setError('Organization ID is required to ensure defaults.');
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await ensureGuildDefaults(guildId, orgId.trim());
      setFlash('Defaults ensured.');
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
        title="Centrum Aktywności — Overview"
        description="Guild readiness and configuration health."
      />
      {guildId === null ? <p className="state-empty">Select a guild to continue.</p> : null}
      {flash !== null ? <Flash tone="success">{flash}</Flash> : null}
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate<ReadinessResponse> state={state} emptyMessage="No readiness data.">
        {(data) => (
          <div className="stack">
            <div className="panel row">
              <span className={`badge ${data.state === 'READY' ? 'badge-ok' : 'badge-warn'}`}>
                {data.state}
              </span>
              <button type="button" onClick={reload} disabled={busy}>
                Refresh
              </button>
            </div>

            {counts !== null ? (
              <div className="panel">
                <h2>Counts</h2>
                <ul>
                  {Object.entries(counts).map(([key, value]) => (
                    <li key={key}>
                      <code>{key}</code>: {value}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="panel">
              <h2>Issues</h2>
              {data.issues.length === 0 ? (
                <p className="muted">No issues reported.</p>
              ) : (
                <ul>
                  {data.issues.map((issue) => (
                    <li key={`${issue.code}-${issue.message}`}>
                      <strong>{issue.code}</strong>: {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {data.state === 'CONFIGURATION_REQUIRED' ? (
              <div className="panel stack">
                <h2>Ensure defaults</h2>
                <p className="muted">
                  Calls <code>POST /activity/v1/guilds/:id/ensure-defaults</code>.
                </p>
                <label>
                  Organization ID
                  <input
                    value={orgId}
                    onChange={(event) => {
                      setOrgId(event.target.value);
                    }}
                    disabled={busy}
                  />
                </label>
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => {
                      void onEnsureDefaults();
                    }}
                  >
                    {busy ? 'Working…' : 'Ensure defaults'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </LoadGate>
    </section>
  );
}
