'use client';

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
} from './discord-gateway-health';
import { HealthErrorPanel } from './health-error-panel';
import { StatusBadge } from './status-badge';
import { PageJobNote, PlayerSeesNote } from './ui-notes';

type DiagnosticsState = {
  readonly live: HealthFetchResult<LiveHealth> | null;
  readonly ready: HealthFetchResult<ReadyHealth> | null;
  readonly discord: HealthFetchResult<DiscordHealth> | null;
};

function badgeFor(state: DiagnosticsState): { label: string; tone: 'ok' | 'warn' | 'error' } {
  const { live, ready, discord } = state;
  if (!live || !ready || !discord) {
    return { label: 'Sprawdzam bota…', tone: 'warn' };
  }
  const anyNetworkFail = [live, ready, discord].some((r) => !r.ok && r.kind === 'network');
  if (anyNetworkFail) {
    return { label: 'Bot ma problem', tone: 'error' };
  }
  if (
    discord.ok &&
    discord.data.enabled &&
    discord.data.state === 'ready' &&
    discord.data.isolationOk
  ) {
    return { label: 'Bot działa', tone: 'ok' };
  }
  if (!live.ok || !ready.ok || !discord.ok) {
    return { label: 'Bot ma problem', tone: 'warn' };
  }
  if (discord.ok) {
    return { label: 'Bot ma problem', tone: 'warn' };
  }
  return { label: 'Bot ma problem', tone: 'warn' };
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
      className="technik-btn-ghost"
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
  hint,
  result,
}: {
  readonly title: string;
  readonly hint: string;
  readonly result: HealthFetchResult<unknown> | null;
}) {
  const text = result ? payloadForCopy(result) : '';
  return (
    <section className="technik-panel technik-panel--wide technik-panel--diag">
      <div className="technik-panel-head">
        <h2>{title}</h2>
        <div className="technik-panel-actions">
          <span className="technik-pill technik-pill--live">na żywo</span>
          <CopyButton text={text} />
        </div>
      </div>
      <p className="technik-help">{hint}</p>
      {result === null ? (
        <p className="technik-muted">Ładowanie…</p>
      ) : result.ok ? (
        <code className="technik-code technik-code--tall">{prettyJson(result.data)}</code>
      ) : (
        <>
          <p className="technik-muted">{result.error}</p>
          {result.body !== undefined ? (
            <code className="technik-code">{prettyJson(result.body)}</code>
          ) : null}
          <code className="technik-code">{result.curlTip}</code>
        </>
      )}
    </section>
  );
}

export function TechnikDiagnosticsPage() {
  const [state, setState] = useState<DiagnosticsState>({ live: null, ready: null, discord: null });
  const [loading, setLoading] = useState(false);
  const baseUrl = resolveDiscordGatewayBaseUrl();
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
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
      <p className="technik-lead">
        Surowy podgląd dla ciekawskich. Na co dzień wystarczy zakładka Status — tu masz pełne
        JSON-y.
      </p>

      <PageJobNote>
        <p>
          Sprawdzasz zdrowie bota i zależności (live / ready / Discord). Tu nie zmieniasz treści
          postów — tylko diagnozujesz.
        </p>
      </PageJobNote>
      <PlayerSeesNote>
        <p>Z tej strony gracz nic nie dostaje — to tylko podgląd zdrowia bota dla Technika.</p>
      </PlayerSeesNote>
      <div className="technik-row">
        <StatusBadge label={badge.label} tone={badge.tone} />
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Odświeżam…' : 'Odśwież'}
        </button>
        <CopyButton text={allJson} label="Kopiuj wszystko" />
      </div>

      <p className="technik-meta">
        Adres bramki: <code>{baseUrl}</code>
      </p>

      {firstFail ? <HealthErrorPanel error={firstFail} /> : null}

      <div className="technik-stack" style={{ marginTop: '1rem' }}>
        <RawJsonPanel
          title="Czy bot żyje"
          hint="Odpowiedź z /health/live — prosty sygnał życia procesu."
          result={state.live}
        />
        <RawJsonPanel
          title="Czy bot jest gotowy"
          hint="Odpowiedź z /health/ready — czy bot może obsługiwać gildię."
          result={state.ready}
        />
        <RawJsonPanel
          title="Połączenie z Discord"
          hint="Odpowiedź z /health/discord — szczegóły łącza z Discordem."
          result={state.discord}
        />
      </div>
    </>
  );
}
