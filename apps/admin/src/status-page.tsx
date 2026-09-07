import { StatusBadge } from '@v2/design-system';
import { useCallback, useEffect, useRef, useState } from 'react';

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
import { adminStatusMessage } from './status.js';

const AUTO_REFRESH_MS = 15_000;

type StatusState = {
  readonly live: HealthFetchResult<LiveHealth> | null;
  readonly ready: HealthFetchResult<ReadyHealth> | null;
  readonly discord: HealthFetchResult<DiscordHealth> | null;
};

function toneFromResults(state: StatusState): { label: string; tone: 'ok' | 'warn' | 'error' } {
  const { live, ready, discord } = state;
  if (!live || !ready || !discord) {
    return { label: 'Sprawdzanie New Bot…', tone: 'warn' };
  }
  if (!live.ok) {
    return { label: 'Live niedostępne', tone: 'error' };
  }
  if (!ready.ok && !discord.ok) {
    return { label: 'Ready / Discord niedostępne', tone: 'error' };
  }
  if (
    discord.ok &&
    discord.data.enabled &&
    discord.data.state === 'ready' &&
    discord.data.isolationOk
  ) {
    return { label: 'New Bot live + Discord ready', tone: 'ok' };
  }
  if (ready.ok && ready.data.status === 'ok') {
    return { label: 'New Bot live + ready', tone: 'ok' };
  }
  if (discord.ok) {
    return { label: `Discord: ${discord.data.state}`, tone: 'warn' };
  }
  if (!ready.ok) {
    return { label: 'Ready niedostępne / niegotowe', tone: 'warn' };
  }
  return { label: `Ready: ${ready.data.status}`, tone: 'warn' };
}

function firstError(state: StatusState) {
  for (const result of [state.live, state.ready, state.discord]) {
    if (result && !result.ok) {
      return result;
    }
  }
  return null;
}

function formatDiscordField(value: string | number | boolean | null | undefined): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return '—';
  }
  return String(value);
}

function formatLocalTime(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
  } catch {
    return iso;
  }
}

export function AdminStatusPage() {
  const [state, setState] = useState<StatusState>({
    live: null,
    ready: null,
    discord: null,
  });
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const baseUrl = resolveDiscordGatewayBaseUrl();
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      const [live, ready, discord] = await Promise.all([
        fetchLiveHealth(),
        fetchReadyHealth(),
        fetchDiscordHealth(),
      ]);
      setState({ live, ready, discord });
      setLastFetchedAt(new Date().toISOString());
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const id = window.setInterval(() => {
      void refresh();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh]);

  const badge = toneFromResults(state);
  const error = firstError(state);

  return (
    <>
      <h1>{adminStatusMessage()}</h1>
      <p className="admin-lead">
        Status New Bot (discord-gateway). Karty live / ready / discord pochodzą wyłącznie z{' '}
        <code>{baseUrl}</code> (zmienna <code>VITE_DISCORD_GATEWAY_BASE_URL</code>). Bez wymyślania
        wartości przy błędzie sieci lub CORS.
      </p>

      <div className="admin-row">
        <StatusBadge label={badge.label} tone={badge.tone} />
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Odświeżanie…' : 'Odśwież'}
        </button>
        <label className="admin-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-odświeżanie (~15 s)
        </label>
        <span className="admin-muted">
          Ostatnie pobranie: {formatLocalTime(lastFetchedAt)}
          {autoRefresh ? ' · następne ~15 s' : ''}
        </span>
      </div>

      <p className="admin-meta">
        Gateway: <code>{baseUrl}</code>
      </p>

      {error ? <HealthErrorPanel error={error} /> : null}

      <div className="admin-panel-grid admin-panel-grid--status">
        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>GET /health/live</h2>
            <span className="admin-pill admin-pill--live">live</span>
          </div>
          {state.live === null ? (
            <p>Ładowanie…</p>
          ) : state.live.ok ? (
            <dl className="admin-kv">
              <dt>status</dt>
              <dd>{state.live.data.status}</dd>
            </dl>
          ) : (
            <p className="admin-muted">Brak danych live.</p>
          )}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>GET /health/ready</h2>
            <span className="admin-pill admin-pill--live">live</span>
          </div>
          {state.ready === null ? (
            <p>Ładowanie…</p>
          ) : state.ready.ok ? (
            <dl className="admin-kv">
              <dt>status</dt>
              <dd>{state.ready.data.status}</dd>
              <dt>discordEnabled</dt>
              <dd>{formatDiscordField(state.ready.data.discordEnabled)}</dd>
              <dt>discordState</dt>
              <dd>{formatDiscordField(state.ready.data.discordState)}</dd>
              <dt>isolationOk</dt>
              <dd>{formatDiscordField(state.ready.data.isolationOk)}</dd>
            </dl>
          ) : state.ready.body !== undefined ? (
            <code className="admin-code">{JSON.stringify(state.ready.body, null, 2)}</code>
          ) : (
            <p className="admin-muted">Brak danych ready.</p>
          )}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>GET /health/discord</h2>
            <span className="admin-pill admin-pill--live">live</span>
          </div>
          {state.discord === null ? (
            <p>Ładowanie…</p>
          ) : state.discord.ok ? (
            <dl className="admin-kv">
              <dt>enabled</dt>
              <dd>{formatDiscordField(state.discord.data.enabled)}</dd>
              <dt>state</dt>
              <dd>{formatDiscordField(state.discord.data.state)}</dd>
              <dt>guildId</dt>
              <dd>{formatDiscordField(state.discord.data.guildId)}</dd>
              <dt>pingMs</dt>
              <dd>{formatDiscordField(state.discord.data.pingMs)}</dd>
              <dt>uptimeSeconds</dt>
              <dd>{formatDiscordField(state.discord.data.uptimeSeconds)}</dd>
              <dt>commandsRegistered</dt>
              <dd>{formatDiscordField(state.discord.data.commandsRegistered)}</dd>
              <dt>isolationOk</dt>
              <dd>{formatDiscordField(state.discord.data.isolationOk)}</dd>
              <dt>lastError</dt>
              <dd>{formatDiscordField(state.discord.data.lastError)}</dd>
              <dt>gitCommitSha</dt>
              <dd>{formatDiscordField(state.discord.data.gitCommitSha)}</dd>
              <dt>panelRenderer</dt>
              <dd>{formatDiscordField(state.discord.data.panelRenderer)}</dd>
            </dl>
          ) : (
            <p className="admin-muted">Brak danych discord.</p>
          )}
        </section>
      </div>
    </>
  );
}
