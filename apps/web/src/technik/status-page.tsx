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

const AUTO_REFRESH_MS = 15_000;

type StatusState = {
  readonly live: HealthFetchResult<LiveHealth> | null;
  readonly ready: HealthFetchResult<ReadyHealth> | null;
  readonly discord: HealthFetchResult<DiscordHealth> | null;
};

function toneFromResults(state: StatusState): { label: string; tone: 'ok' | 'warn' | 'error' } {
  const { live, ready, discord } = state;
  if (!live || !ready || !discord) {
    return { label: 'Sprawdzam bota…', tone: 'warn' };
  }
  if (!live.ok) {
    return { label: 'Bot ma problem', tone: 'error' };
  }
  if (!ready.ok && !discord.ok) {
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
  if (ready.ok && ready.data.status === 'ok') {
    return { label: 'Bot działa', tone: 'ok' };
  }
  if (discord.ok) {
    return { label: 'Bot ma problem', tone: 'warn' };
  }
  if (!ready.ok) {
    return { label: 'Bot ma problem', tone: 'warn' };
  }
  return { label: 'Bot ma problem', tone: 'warn' };
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
  if (value === null) return 'brak';
  if (value === undefined) return '—';
  if (value === true) return 'tak';
  if (value === false) return 'nie';
  return String(value);
}

function formatLocalTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
  } catch {
    return iso;
  }
}

function humanDiscordState(state: string | null | undefined): string {
  if (!state) return '—';
  if (state === 'ready') return 'połączony i gotowy';
  if (state === 'connecting') return 'łączy się…';
  if (state === 'disconnected') return 'rozłączony';
  return state;
}

export function TechnikStatusPage() {
  const [state, setState] = useState<StatusState>({ live: null, ready: null, discord: null });
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
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
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void refresh();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh]);

  const badge = toneFromResults(state);
  const error = firstError(state);

  return (
    <>
      <h1>Status bota</h1>
      <p className="technik-lead">
        Szybki podgląd: czy bot Discord żyje i jest gotowy do pracy dla gildii.
      </p>

      <div className="technik-row">
        <StatusBadge label={badge.label} tone={badge.tone} />
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Odświeżam…' : 'Odśwież'}
        </button>
        <label className="technik-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Odświeżaj automatycznie co ~15 s
        </label>
        <span className="technik-muted">
          Ostatnie sprawdzenie: {formatLocalTime(lastFetchedAt)}
          {autoRefresh ? ' · następne za ~15 s' : ''}
        </span>
      </div>

      <p className="technik-meta">
        Adres bramki: <code>{baseUrl}</code>
      </p>

      {error ? <HealthErrorPanel error={error} /> : null}

      <div className="technik-panel-grid technik-panel-grid--status">
        <section className="technik-panel">
          <div className="technik-panel-head">
            <h2>Czy bot żyje?</h2>
            <span className="technik-pill technik-pill--live">na żywo</span>
          </div>
          <p className="technik-help">Prosty sygnał: proces bota odpowiada.</p>
          {state.live === null ? (
            <p>Ładowanie…</p>
          ) : state.live.ok ? (
            <dl className="technik-kv">
              <dt>Stan</dt>
              <dd>{state.live.data.status === 'ok' ? 'żyje' : state.live.data.status}</dd>
            </dl>
          ) : (
            <p className="technik-muted">Nie udało się sprawdzić.</p>
          )}
        </section>

        <section className="technik-panel">
          <div className="technik-panel-head">
            <h2>Czy bot jest gotowy?</h2>
            <span className="technik-pill technik-pill--live">na żywo</span>
          </div>
          <p className="technik-help">Czy bot może już obsługiwać gildię na Discordzie.</p>
          {state.ready === null ? (
            <p>Ładowanie…</p>
          ) : state.ready.ok ? (
            <dl className="technik-kv">
              <dt>Gotowość</dt>
              <dd>{state.ready.data.status === 'ok' ? 'gotowy' : state.ready.data.status}</dd>
              <dt>Discord włączony</dt>
              <dd>{formatDiscordField(state.ready.data.discordEnabled)}</dd>
              <dt>Stan Discord</dt>
              <dd>{humanDiscordState(state.ready.data.discordState)}</dd>
              <dt>Izolacja OK</dt>
              <dd>{formatDiscordField(state.ready.data.isolationOk)}</dd>
            </dl>
          ) : state.ready.body !== undefined ? (
            <code className="technik-code">{JSON.stringify(state.ready.body, null, 2)}</code>
          ) : (
            <p className="technik-muted">Nie udało się sprawdzić gotowości.</p>
          )}
        </section>

        <section className="technik-panel">
          <div className="technik-panel-head">
            <h2>Połączenie z Discord</h2>
            <span className="technik-pill technik-pill--live">na żywo</span>
          </div>
          <p className="technik-help">Szczegóły łącza bota z serwerem Discord.</p>
          {state.discord === null ? (
            <p>Ładowanie…</p>
          ) : state.discord.ok ? (
            <dl className="technik-kv">
              <dt>Włączony</dt>
              <dd>{formatDiscordField(state.discord.data.enabled)}</dd>
              <dt>Stan</dt>
              <dd>{humanDiscordState(state.discord.data.state)}</dd>
              <dt>ID gildii</dt>
              <dd>{formatDiscordField(state.discord.data.guildId)}</dd>
              <dt>Ping (ms)</dt>
              <dd>{formatDiscordField(state.discord.data.pingMs)}</dd>
              <dt>Czas działania (s)</dt>
              <dd>{formatDiscordField(state.discord.data.uptimeSeconds)}</dd>
              <dt>Komendy zarejestrowane</dt>
              <dd>{formatDiscordField(state.discord.data.commandsRegistered)}</dd>
              <dt>Izolacja OK</dt>
              <dd>{formatDiscordField(state.discord.data.isolationOk)}</dd>
              <dt>Ostatni błąd</dt>
              <dd>{formatDiscordField(state.discord.data.lastError)}</dd>
              <dt>Wersja (SHA)</dt>
              <dd>{formatDiscordField(state.discord.data.gitCommitSha)}</dd>
              <dt>Renderer panelu</dt>
              <dd>{formatDiscordField(state.discord.data.panelRenderer)}</dd>
            </dl>
          ) : (
            <p className="technik-muted">Nie udało się sprawdzić Discorda.</p>
          )}
        </section>
      </div>
    </>
  );
}
