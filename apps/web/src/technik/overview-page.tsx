'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { D060Controls } from './d060-controls';
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
import { HonestGap, PageJobNote, PlayerSeesNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

const AUTO_REFRESH_MS = 15_000;

function toneFrom(
  live: HealthFetchResult<LiveHealth> | null,
  discord: HealthFetchResult<DiscordHealth> | null,
) {
  if (!live || !discord) return { label: 'Sprawdzam bota…', tone: 'warn' as const };
  if (!live.ok) return { label: 'Bot ma problem', tone: 'error' as const };
  if (
    discord.ok &&
    discord.data.enabled &&
    discord.data.state === 'ready' &&
    discord.data.isolationOk
  ) {
    return { label: 'Bot działa', tone: 'ok' as const };
  }
  return { label: 'Bot ma problem', tone: 'warn' as const };
}

function formatLocalTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
  } catch {
    return iso;
  }
}

export function TechnikOverviewPage() {
  const cfg = useTechnikaConfig();
  const [live, setLive] = useState<HealthFetchResult<LiveHealth> | null>(null);
  const [ready, setReady] = useState<HealthFetchResult<ReadyHealth> | null>(null);
  const [discord, setDiscord] = useState<HealthFetchResult<DiscordHealth> | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const inFlight = useRef(false);
  const baseUrl = resolveDiscordGatewayBaseUrl();

  const refreshHealth = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoadingHealth(true);
    try {
      const [l, r, d] = await Promise.all([
        fetchLiveHealth(),
        fetchReadyHealth(),
        fetchDiscordHealth(),
      ]);
      setLive(l);
      setReady(r);
      setDiscord(d);
      setLastFetchedAt(new Date().toISOString());
    } finally {
      inFlight.current = false;
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void refreshHealth(), AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, refreshHealth]);

  const badge = toneFrom(live, discord);
  const healthErr =
    (live && !live.ok ? live : null) ||
    (ready && !ready.ok ? ready : null) ||
    (discord && !discord.ok ? discord : null);

  return (
    <>
      <h1>Przegląd / rewizja</h1>
      <p className="technik-lead">
        Tu zaczynasz: czy bot żyje, która wersja konfiguracji jest aktywna, i cykl D-060 (szkic →
        sprawdź → podgląd → Ty klikasz Apply).
      </p>

      <PageJobNote>
        <p>
          Widzisz stan bota, aktywną rewizję konfiguracji i skrót cyklu: szkic → sprawdź → podgląd →
          zapisz i włącz → cofnij.
        </p>
      </PageJobNote>
      <PlayerSeesNote>
        <p>
          Gracz na Discordzie nie widzi tego panelu. Widzi skutki: PW o timerach postaci, PW o
          wojnie, ewentualnie panel lab na guildii testowej — dopiero po Twoim Apply.
        </p>
      </PlayerSeesNote>

      <div className="technik-row" style={{ marginTop: '1rem' }}>
        <StatusBadge label={badge.label} tone={badge.tone} />
        <button type="button" onClick={() => void refreshHealth()} disabled={loadingHealth}>
          {loadingHealth ? 'Odświeżam…' : 'Odśwież status'}
        </button>
        <label className="technik-toggle">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto ~15 s
        </label>
        <span className="technik-muted">Ostatnio: {formatLocalTime(lastFetchedAt)}</span>
      </div>
      <p className="technik-meta">
        Health: <code>{baseUrl}</code>
      </p>
      {healthErr ? <HealthErrorPanel error={healthErr} /> : null}

      <div
        className="technik-panel-grid technik-panel-grid--status"
        style={{ marginTop: '0.75rem' }}
      >
        <section className="technik-panel">
          <h2>Życie procesu</h2>
          <p className="technik-help">GET /health/live</p>
          {live?.ok ? (
            <p>{live.data.status === 'ok' ? 'żyje' : live.data.status}</p>
          ) : (
            <p className="technik-muted">brak danych</p>
          )}
        </section>
        <section className="technik-panel">
          <h2>Gotowość Discord</h2>
          <p className="technik-help">GET /health/discord</p>
          {discord?.ok ? (
            <dl className="technik-kv">
              <dt>Stan</dt>
              <dd>{discord.data.state}</dd>
              <dt>Ping</dt>
              <dd>{discord.data.pingMs ?? '—'} ms</dd>
              <dt>Izolacja</dt>
              <dd>{discord.data.isolationOk ? 'OK' : 'problem'}</dd>
            </dl>
          ) : (
            <p className="technik-muted">brak danych</p>
          )}
        </section>
        <section className="technik-panel">
          <h2>Aktywna konfiguracja</h2>
          <p className="technik-help">GET /discord/v1/config</p>
          {cfg.snapshot ? (
            <dl className="technik-kv">
              <dt>Rewizja</dt>
              <dd>{cfg.snapshot.revision}</dd>
              <dt>Status</dt>
              <dd>{cfg.snapshot.status}</dd>
              <dt>Szkic</dt>
              <dd>{cfg.snapshot.hasDraft ? 'tak' : 'nie'}</dd>
              <dt>Rollback</dt>
              <dd>{cfg.snapshot.canRollback ? 'dostępny' : 'brak'}</dd>
              <dt>Zaktualizowano</dt>
              <dd>{formatLocalTime(cfg.snapshot.updatedAt)}</dd>
            </dl>
          ) : (
            <p className="technik-muted">{cfg.actionError ?? 'Ładowanie…'}</p>
          )}
        </section>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <D060Controls
          step={cfg.step}
          onStep={cfg.setStep}
          snapshot={cfg.snapshot}
          canWrite={cfg.canWrite}
          metaLoaded={cfg.metaLoaded}
          writeBlockReason={cfg.writeBlockReason}
          busy={cfg.busy}
          lastAction={cfg.lastAction}
          gatewayLabel={cfg.gatewayLabel}
          onValidate={() => void cfg.runValidate()}
          onPreview={() => void cfg.runPreview()}
          onApply={() => void cfg.runApply()}
          onRollback={() => void cfg.runRollback()}
          onRefresh={() => void cfg.load()}
          help="Tu widać całą rewizję. Szczegóły timerów / wojny / guildii ustawiasz w osobnych zakładkach, a Apply zawsze tutaj albo w Audycie."
        />
      </div>

      {cfg.step === 'Validate' ? (
        <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>Wynik sprawdzania</h2>
          <ul className="technik-message-list">
            {cfg.validationMessages.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {cfg.step === 'Preview' ? (
        <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>Co się zmieni</h2>
          {cfg.previewText ? (
            <code className="technik-code technik-code--tall">{cfg.previewText}</code>
          ) : (
            <p className="technik-muted">Kliknij „Zobacz co się zmieni”.</p>
          )}
        </section>
      ) : null}
      {cfg.actionError ? (
        <p className="technik-error" role="alert" style={{ marginTop: '0.75rem' }}>
          {cfg.actionError}
        </p>
      ) : null}

      <section className="technik-panel technik-panel--path" style={{ marginTop: '1rem' }}>
        <h2>Szybka ścieżka</h2>
        <ol className="technik-message-list">
          <li>
            <a href="/technik/discordy">Discordy</a> — włącz tylko Testowy, moduły i prawa
          </li>
          <li>
            <a href="/technik/kanaly">Kanały</a> — powiąż hub / lab / cykliczne
          </li>
          <li>
            <a href="/technik/wyglad">Wygląd</a> — tytuł, banner, własne przyciski (Centrum) lub
            szablony PW
          </li>
          <li>
            <a href="/technik/centrum">Centrum</a> — włącz akcje hubu → Opublikuj
          </li>
          <li>
            <a href="/technik/timery">Timery</a> / <a href="/technik/wojna">Wojna</a> — treść PW +
            Test DM
          </li>
          <li>Tu: Sprawdź → Zobacz → Ty klikasz Zapisz i włącz (Apply)</li>
        </ol>
      </section>

      {cfg.isolationDisplay !== undefined ? (
        <p className="technik-muted" style={{ marginTop: '0.75rem' }}>
          Izolacja guildii (tylko podgląd):{' '}
          <strong>{cfg.isolationDisplay ? 'włączona' : 'wyłączona'}</strong>
        </p>
      ) : null}
      <HonestGap>
        <p>
          <strong>WWW player Activity Center</strong> (katalogi wydarzeń / activity-service) —
          odroczone. <strong>Discord Centrum</strong> jest w zakresie: panel +{' '}
          <a href="/technik/kanaly">Kanały</a> + <a href="/technik/wyglad">Wygląd</a> — publikacja w{' '}
          <a href="/technik/centrum">Centrum</a>.
        </p>
      </HonestGap>
    </>
  );
}
