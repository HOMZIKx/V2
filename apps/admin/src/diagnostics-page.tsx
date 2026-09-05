import { StatusBadge } from '@v2/design-system';
import { useCallback, useEffect, useState } from 'react';

import {
  type DiscordHealth,
  type HealthFetchResult,
  type LiveHealth,
  type ReadyHealth,
  fetchDiscordHealth,
  fetchLiveHealth,
  fetchReadyHealth,
  resolveDiscordGatewayBaseUrl,
} from './discord-gateway-health.js';
import { HealthErrorPanel } from './health-error-panel.js';

type DiagnosticsState = {
  readonly live: HealthFetchResult<LiveHealth> | null;
  readonly ready: HealthFetchResult<ReadyHealth> | null;
  readonly discord: HealthFetchResult<DiscordHealth> | null;
};

function badgeFor(state: DiagnosticsState): { label: string; tone: 'ok' | 'warn' | 'error' } {
  const { live, ready, discord } = state;
  if (!live || !ready || !discord) {
    return { label: 'Pobieranie health…', tone: 'warn' };
  }
  const anyNetworkFail = [live, ready, discord].some((r) => !r.ok && r.kind === 'network');
  if (anyNetworkFail) {
    return { label: 'Diagnostyka niedostępna (sieć/CORS)', tone: 'error' };
  }
  if (discord.ok && discord.data.enabled && discord.data.state === 'ready' && discord.data.isolationOk) {
    return { label: 'Discord ready', tone: 'ok' };
  }
  if (!live.ok || !ready.ok || !discord.ok) {
    return { label: 'Częściowy błąd health', tone: 'warn' };
  }
  if (discord.ok) {
    return { label: `Stan: ${discord.data.state}`, tone: 'warn' };
  }
  return { label: 'Diagnostyka', tone: 'warn' };
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function RawJsonPanel({
  title,
  result,
}: {
  readonly title: string;
  readonly result: HealthFetchResult<unknown> | null;
}) {
  return (
    <section className="admin-panel">
      <h2>{title}</h2>
      {result === null ? (
        <p className="admin-muted">Ładowanie…</p>
      ) : result.ok ? (
        <code className="admin-code">{prettyJson(result.data)}</code>
      ) : (
        <>
          <p className="admin-muted">{result.error}</p>
          {result.body !== undefined ? (
            <code className="admin-code">{prettyJson(result.body)}</code>
          ) : null}
          <code className="admin-code">{result.curlTip}</code>
        </>
      )}
    </section>
  );
}

export function DiagnosticsPage() {
  const [state, setState] = useState<DiagnosticsState>({
    live: null,
    ready: null,
    discord: null,
  });
  const baseUrl = resolveDiscordGatewayBaseUrl();

  const refresh = useCallback(async () => {
    setState({ live: null, ready: null, discord: null });
    const [live, ready, discord] = await Promise.all([
      fetchLiveHealth(),
      fetchReadyHealth(),
      fetchDiscordHealth(),
    ]);
    setState({ live, ready, discord });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const badge = badgeFor(state);
  const firstFail = [state.live, state.ready, state.discord].find(
    (r): r is NonNullable<typeof r> & { ok: false } => r !== null && !r.ok,
  );

  return (
    <>
      <h1>Diagnostyka</h1>
      <p className="admin-lead">
        Surowy JSON zdrowia New Bot (<code>{baseUrl}</code>):{' '}
        <code>/health/live</code>, <code>/health/ready</code>, <code>/health/discord</code>. Brak
        Activity REST — bez wymyślania wartości.
      </p>

      <div className="admin-row">
        <StatusBadge label={badge.label} tone={badge.tone} />
        <button type="button" onClick={() => void refresh()}>
          Odśwież
        </button>
      </div>

      {firstFail ? <HealthErrorPanel error={firstFail} /> : null}

      <div className="admin-panel-grid" style={{ marginTop: '1rem' }}>
        <RawJsonPanel title="GET /health/live" result={state.live} />
        <RawJsonPanel title="GET /health/ready" result={state.ready} />
        <RawJsonPanel title="GET /health/discord" result={state.discord} />
      </div>
    </>
  );
}
