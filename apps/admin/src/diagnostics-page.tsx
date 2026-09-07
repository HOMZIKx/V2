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
  if (
    discord.ok &&
    discord.data.enabled &&
    discord.data.state === 'ready' &&
    discord.data.isolationOk
  ) {
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

function payloadForCopy(result: HealthFetchResult<unknown>): string {
  if (result.ok) {
    return prettyJson(result.data);
  }
  return prettyJson({
    error: result.error,
    kind: result.kind,
    httpStatus: result.httpStatus,
    body: result.body,
    curlTip: result.curlTip,
  });
}

function CopyButton({
  text,
  label = 'Kopiuj JSON',
}: {
  readonly text: string;
  readonly label?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="admin-btn-ghost"
      disabled={!text}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      {copied ? 'Skopiowano' : label}
    </button>
  );
}

function RawJsonPanel({
  title,
  result,
}: {
  readonly title: string;
  readonly result: HealthFetchResult<unknown> | null;
}) {
  const text = result ? payloadForCopy(result) : '';

  return (
    <section className="admin-panel admin-panel--wide">
      <div className="admin-panel-head">
        <h2>{title}</h2>
        <div className="admin-panel-actions">
          <span className="admin-pill admin-pill--live">live</span>
          <CopyButton text={text} />
        </div>
      </div>
      {result === null ? (
        <p className="admin-muted">Ładowanie…</p>
      ) : result.ok ? (
        <code className="admin-code admin-code--tall">{prettyJson(result.data)}</code>
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
  const [loading, setLoading] = useState(false);
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
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const badge = badgeFor(state);
  const firstFail = [state.live, state.ready, state.discord].find(
    (r): r is NonNullable<typeof r> & { ok: false } => r !== null && !r.ok,
  );

  const allJson =
    state.live && state.ready && state.discord
      ? prettyJson({
          baseUrl,
          live: state.live.ok ? state.live.data : { error: state.live.error },
          ready: state.ready.ok ? state.ready.data : { error: state.ready.error },
          discord: state.discord.ok ? state.discord.data : { error: state.discord.error },
        })
      : '';

  return (
    <>
      <h1>Diagnostyka</h1>
      <p className="admin-lead">
        Surowy JSON zdrowia New Bot (<code>{baseUrl}</code>): <code>/health/live</code>,{' '}
        <code>/health/ready</code>, <code>/health/discord</code>. Bez Activity REST i bez wymyślania
        wartości.
      </p>

      <div className="admin-row">
        <StatusBadge label={badge.label} tone={badge.tone} />
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Odświeżanie…' : 'Odśwież'}
        </button>
        <CopyButton text={allJson} label="Kopiuj wszystko" />
      </div>

      <p className="admin-meta">
        Gateway: <code>{baseUrl}</code>
      </p>

      {firstFail ? <HealthErrorPanel error={firstFail} /> : null}

      <div className="admin-stack" style={{ marginTop: '1rem' }}>
        <RawJsonPanel title="GET /health/live" result={state.live} />
        <RawJsonPanel title="GET /health/ready" result={state.ready} />
        <RawJsonPanel title="GET /health/discord" result={state.discord} />
      </div>
    </>
  );
}
