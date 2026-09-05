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
import { adminStatusMessage } from './status.js';

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
  if (discord.ok && discord.data.enabled && discord.data.state === 'ready' && discord.data.isolationOk) {
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

function formatDiscordField(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return '—';
  }
  return String(value);
}

export function AdminStatusPage() {
  const [state, setState] = useState<StatusState>({
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

  const badge = toneFromResults(state);
  const error = firstError(state);

  return (
    <>
      <h1>{adminStatusMessage()}</h1>
      <p className="admin-lead">
        Most Discord jest własnością New Bot (discord-gateway). Status pochodzi z{' '}
        <code>{baseUrl}</code> — bez wymyślania wartości przy błędzie sieci/CORS.
      </p>

      <div className="admin-row">
        <StatusBadge label={badge.label} tone={badge.tone} />
        <button type="button" onClick={() => void refresh()}>
          Odśwież
        </button>
      </div>

      {error ? <HealthErrorPanel error={error} /> : null}

      <div className="admin-panel-grid" style={{ marginTop: '1rem' }}>
        <section className="admin-panel">
          <h2>GET /health/live</h2>
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
          <h2>GET /health/ready</h2>
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
          <h2>GET /health/discord</h2>
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
