import { useCallback, useEffect, useState } from 'react';

import { listAudit, type AuditEntryDto } from '../api/activity-admin.js';
import { Flash, LoadGate, PageHeader, errorFromUnknown, type LoadState } from '../components/ui.js';
import { useRequiredGuildId } from '../layout/GuildContext.js';

export function AuditPage() {
  const guildId = useRequiredGuildId();
  const [state, setState] = useState<LoadState<AuditEntryDto[]>>({ kind: 'loading' });
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (pageCursor: string | null, append: boolean) => {
      if (guildId === null) {
        setState({ kind: 'empty' });
        return;
      }
      if (!append) {
        setState({ kind: 'loading' });
      }
      setError(null);
      try {
        const result = await listAudit(guildId, {
          ...(pageCursor !== null ? { cursor: pageCursor } : {}),
          limit: 50,
        });
        setNextCursor(result.nextCursor);
        setState((prev) => {
          if (append && prev.kind === 'ready') {
            return { kind: 'ready', data: [...prev.data, ...result.items] };
          }
          if (result.items.length === 0) {
            return { kind: 'empty' };
          }
          return { kind: 'ready', data: result.items };
        });
      } catch (err) {
        const parsed = errorFromUnknown(err);
        setState({
          kind: 'error',
          message: parsed.message,
          ...(parsed.forbidden ? { forbidden: true } : {}),
        });
      }
    },
    [guildId],
  );

  useEffect(() => {
    setCursor(null);
    void load(null, false);
  }, [guildId, load]);

  return (
    <section>
      <PageHeader title="Audyt" description="Historia zmian konfiguracji i działań." />
      {error !== null ? <Flash tone="error">{error}</Flash> : null}

      <LoadGate<AuditEntryDto[]> state={state} emptyMessage="No audit entries.">
        {(items) => (
          <div className="stack">
            <div className="panel">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.createdAt}</td>
                      <td>{item.action ?? '—'}</td>
                      <td>
                        <code>{item.actorDiscordUserId ?? '—'}</code>
                      </td>
                      <td>
                        {item.entityType ?? '—'}{' '}
                        {item.entityId !== undefined ? <code>{item.entityId}</code> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row">
              <button
                type="button"
                disabled={nextCursor === null}
                onClick={() => {
                  const next = nextCursor;
                  setCursor(next);
                  void load(next, true);
                }}
              >
                Load more
              </button>
              {cursor !== null ? <span className="muted">Cursor: {cursor}</span> : null}
            </div>
          </div>
        )}
      </LoadGate>
    </section>
  );
}
