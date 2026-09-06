/**
 * Technician bot configurator (D-060).
 * Draft → Validate → Preview → Apply → Audit → Rollback.
 * Apply / rollback disabled until New Bot ships Discord config OpenAPI.
 * First-class live-config (no secrets): Timers Discord notify + Kingdom war PW.
 * Optional activity-admin READ when VITE_ACTIVITY_ADMIN_* is set.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  EXPECTED_ACTIVITY_ADMIN_READ_PATHS,
  EXPECTED_DISCORD_CONFIG_PATHS,
  type GuildConfigBundle,
  fetchGuildConfigBundle,
  isActivityAdminReadConfigured,
  resolveActivityAdminEnv,
} from './activity-admin-config.js';
import { resolveDiscordGatewayBaseUrl } from './discord-gateway-health.js';

type AreaAvailability = 'live-config' | 'live-read' | 'api-pending';

type CapabilityArea = {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly availability: AreaAvailability;
  readonly bundleKey?: keyof GuildConfigBundle;
};

/** Timers → Discord notify (safe runtime config, no shared secrets). */
export type TimersDiscordNotifyDraft = {
  readonly enabled: boolean;
  readonly messageTemplate: string;
  readonly reminderMinutesBefore: number;
};

/** Kingdom war PW reminder (Europe/Warsaw clock). */
export type KingdomWarPwDraft = {
  readonly enabled: boolean;
  readonly warAt: string;
  readonly notifyMinutesBefore: number;
  readonly messageTemplate: string;
};

export const DEFAULT_TIMERS_DISCORD_NOTIFY: TimersDiscordNotifyDraft = {
  enabled: false,
  messageTemplate:
    'Przypomnienie DESTILED: timer „{{title}}” za {{minutes}} min. Otwórz: {{deepLink}}',
  reminderMinutesBefore: 15,
};

export const DEFAULT_KINGDOM_WAR_PW: KingdomWarPwDraft = {
  enabled: false,
  warAt: '18:00',
  notifyMinutesBefore: 30,
  messageTemplate:
    'Wojna królestw (PW) o {{warAt}} (Warszawa). Powiadomienie {{minutes}} min wcześniej.',
};

const CAPABILITY_AREAS: readonly CapabilityArea[] = [
  {
    id: 'timers-discord-notify',
    title: 'Powiadomienia Discord z Timerów',
    detail:
      'Włączanie powiadomień timerów na Discordzie: szablon wiadomości i ile minut przed terminem (bez sekretów ani tokenów).',
    availability: 'live-config',
  },
  {
    id: 'kingdom-war-pw',
    title: 'Wojna królestw (PW)',
    detail:
      'Harmonogram PW: godzina wojny (domyślnie 18:00 Warszawa), wyprzedzenie powiadomienia (domyślnie 30 min → 17:30) i szablon.',
    availability: 'live-config',
  },
  {
    id: 'activity-types',
    title: 'Rodzaje aktywności',
    detail: 'Katalog typów aktywności publikowanych przez bota.',
    availability: 'live-read',
    bundleKey: 'types',
  },
  {
    id: 'rsvp-statuses',
    title: 'Statusy uczestnictwa',
    detail: 'Statusy RSVP oraz flaga „zajmuje miejsce”.',
    availability: 'live-read',
    bundleKey: 'statuses',
  },
  {
    id: 'participant-fields',
    title: 'Pola uczestnika',
    detail: 'Katalog pól formularza uczestnika (bez sekretów).',
    availability: 'live-read',
    bundleKey: 'participantFields',
  },
  {
    id: 'publish-channels',
    title: 'Kanały publikacji',
    detail: 'Dozwolone kanały publikacji per Discord (ID kanałów, nie tokeny).',
    availability: 'live-read',
    bundleKey: 'channels',
  },
  {
    id: 'pings',
    title: 'Pingi',
    detail: 'Dozwolone pingi / role do powiadomień.',
    availability: 'live-read',
    bundleKey: 'pingRoles',
  },
  {
    id: 'limits',
    title: 'Limity',
    detail: 'Limity miejsc i reguły zajętości (z guild config).',
    availability: 'live-read',
    bundleKey: 'config',
  },
  {
    id: 'other-activity',
    title: 'Inna aktywność',
    detail: 'Dostępność „Innej aktywności” per serwer (z guild config).',
    availability: 'live-read',
    bundleKey: 'config',
  },
  {
    id: 'reminders',
    title: 'Przypomnienia domyślne',
    detail: 'Domyślne przypomnienia przed startem aktywności (z guild config).',
    availability: 'live-read',
    bundleKey: 'config',
  },
  {
    id: 'post-retention',
    title: 'Retencja posta Discord',
    detail: 'Czas przechowywania posta aktywności na Discordzie (z guild config).',
    availability: 'live-read',
    bundleKey: 'config',
  },
  {
    id: 'report-reasons',
    title: 'Powody zgłoszeń',
    detail: 'Katalog powodów zgłoszeń (+ Inny powód).',
    availability: 'live-read',
    bundleKey: 'reportReasons',
  },
  {
    id: 'discord-panels',
    title: 'Panele Discord',
    detail: 'Konfiguracja paneli / komponentów — wymaga New Bot capabilities + apply.',
    availability: 'api-pending',
  },
] as const;

const STEPPER_STEPS = [
  'Draft',
  'Validate',
  'Preview',
  'Apply',
  'Audit',
  'Rollback',
] as const;

type StepId = (typeof STEPPER_STEPS)[number];

type DraftNotes = Record<string, string>;

const WAR_AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function computeNotifyAt(warAt: string, notifyMinutesBefore: number): string | null {
  if (!WAR_AT_RE.test(warAt) || !Number.isFinite(notifyMinutesBefore) || notifyMinutesBefore < 0) {
    return null;
  }
  const parts = warAt.split(':').map(Number);
  const h = parts[0];
  const m = parts[1];
  if (h === undefined || m === undefined) {
    return null;
  }
  const total = h * 60 + m - Math.floor(notifyMinutesBefore);
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
  const mm = String(normalized % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function areaStatusLabel(area: CapabilityArea, readConfigured: boolean): string {
  if (area.availability === 'live-config') {
    return 'live-config · draft (apply later)';
  }
  if (area.availability === 'api-pending') {
    return 'API pending — New Bot';
  }
  if (!readConfigured) {
    return 'READ gotowy po VITE_ACTIVITY_ADMIN_*';
  }
  return 'live READ (activity-admin)';
}

function looksLikeSecret(value: string): boolean {
  return /token|secret|password|api[_-]?key|Bearer\s|mongodb(\+srv)?:\/\//i.test(value);
}

export function BotConfigPage() {
  const gatewayBase = resolveDiscordGatewayBaseUrl();
  const activityEnv = useMemo(() => resolveActivityAdminEnv(), []);
  const readConfigured = isActivityAdminReadConfigured(activityEnv);

  const [step, setStep] = useState<StepId>('Draft');
  const [draftNotes, setDraftNotes] = useState<DraftNotes>({});
  const [timersDraft, setTimersDraft] = useState<TimersDiscordNotifyDraft>(DEFAULT_TIMERS_DISCORD_NOTIFY);
  const [warDraft, setWarDraft] = useState<KingdomWarPwDraft>(DEFAULT_KINGDOM_WAR_PW);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [previewText, setPreviewText] = useState<string>('');
  const [bundle, setBundle] = useState<GuildConfigBundle | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [loadingRead, setLoadingRead] = useState(false);

  const warNotifyAt = useMemo(
    () => computeNotifyAt(warDraft.warAt, warDraft.notifyMinutesBefore),
    [warDraft.warAt, warDraft.notifyMinutesBefore],
  );

  const refreshReads = useCallback(async () => {
    if (!readConfigured) {
      setBundle(null);
      setBundleError(null);
      return;
    }
    setLoadingRead(true);
    setBundleError(null);
    try {
      const next = await fetchGuildConfigBundle(activityEnv);
      setBundle(next);
    } catch (err) {
      setBundle(null);
      setBundleError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingRead(false);
    }
  }, [activityEnv, readConfigured]);

  useEffect(() => {
    void refreshReads();
  }, [refreshReads]);

  const draftSummary = useMemo(() => {
    const entries = Object.entries(draftNotes).filter(([, v]) => v.trim().length > 0);
    return entries.map(([id, note]) => {
      const area = CAPABILITY_AREAS.find((a) => a.id === id);
      return { id, title: area?.title ?? id, note: note.trim() };
    });
  }, [draftNotes]);

  const liveConfigDraft = useMemo(
    () => ({
      timersDiscordNotify: timersDraft,
      kingdomWarPw: {
        ...warDraft,
        notifyAtWarsaw: warNotifyAt,
        timezone: 'Europe/Warsaw',
      },
    }),
    [timersDraft, warDraft, warNotifyAt],
  );

  const runValidate = () => {
    const messages: string[] = [];

    if (
      !Number.isInteger(timersDraft.reminderMinutesBefore) ||
      timersDraft.reminderMinutesBefore < 0 ||
      timersDraft.reminderMinutesBefore > 24 * 60
    ) {
      messages.push(
        'Powiadomienia Timerów: „Minuty przed terminem” muszą być liczbą całkowitą 0–1440.',
      );
    }
    if (timersDraft.enabled && timersDraft.messageTemplate.trim().length < 3) {
      messages.push('Powiadomienia Timerów: przy włączeniu wymagany jest szablon wiadomości.');
    }
    if (looksLikeSecret(timersDraft.messageTemplate)) {
      messages.push(
        'Powiadomienia Timerów: szablon wygląda na zawierający sekret — usuń tokeny/hasła/URL bazy.',
      );
    }

    if (!WAR_AT_RE.test(warDraft.warAt)) {
      messages.push('Wojna królestw (PW): „Godzina wojny” musi być w formacie HH:MM (24h, Warszawa).');
    }
    if (
      !Number.isInteger(warDraft.notifyMinutesBefore) ||
      warDraft.notifyMinutesBefore < 0 ||
      warDraft.notifyMinutesBefore > 24 * 60
    ) {
      messages.push('Wojna królestw (PW): „Minuty przed PW” muszą być liczbą całkowitą 0–1440.');
    }
    if (warDraft.enabled && warDraft.messageTemplate.trim().length < 3) {
      messages.push('Wojna królestw (PW): przy włączeniu wymagany jest szablon wiadomości.');
    }
    if (looksLikeSecret(warDraft.messageTemplate)) {
      messages.push(
        'Wojna królestw (PW): szablon wygląda na zawierający sekret — usuń tokeny/hasła/URL bazy.',
      );
    }
    if (warNotifyAt) {
      messages.push(
        `Wojna królestw (PW): powiadomienie lokalne o ${warNotifyAt} (Europe/Warsaw), wojna o ${warDraft.warAt}.`,
      );
    }

    for (const item of draftSummary) {
      const area = CAPABILITY_AREAS.find((a) => a.id === item.id);
      if (area?.availability === 'api-pending') {
        messages.push(
          `„${item.title}” jest API pending (New Bot) — nie można jeszcze zweryfikować względem schematu możliwości.`,
        );
      }
      if (item.note.length < 3) {
        messages.push(`„${item.title}”: notatka draftu jest zbyt krótka.`);
      }
    }

    if (!readConfigured) {
      messages.push(
        'Brak VITE_ACTIVITY_ADMIN_* — katalogi Centrum Aktywności tylko lokalnie; live-config Timerów/PW i tak przechodzi draft→validate→preview.',
      );
    }
    messages.push(
      'Apply / rollback zablokowane do OpenAPI New Bot (/discord/v1/config/*). Brak fałszywego zapisu.',
    );
    setValidationMessages(messages);
    setStep('Validate');
  };

  const runPreview = () => {
    const impact = {
      mode: 'impact-preview-local',
      warning: 'To nie jest apply. New Bot potwierdzi aktywną rewizję dopiero po OpenAPI.',
      gatewayBase,
      activityAdmin: readConfigured
        ? { baseUrl: activityEnv.baseUrl, guildId: activityEnv.guildId }
        : null,
      liveConfig: liveConfigDraft,
      catalogNotes: draftSummary,
      validationMessages,
      activeRevision: null,
      applyEnabled: false,
      expectedKeys: {
        timersDiscordNotify: ['enabled', 'messageTemplate', 'reminderMinutesBefore'],
        kingdomWarPw: ['enabled', 'warAt', 'notifyMinutesBefore', 'messageTemplate'],
      },
    };
    setPreviewText(pretty(impact));
    setStep('Preview');
  };

  const stepIndex = STEPPER_STEPS.indexOf(step);
  const canPreview = validationMessages.length > 0 || true;

  return (
    <>
      <h1>Konfiguracja bota</h1>
      <p className="admin-lead">
        Obszar Technika (D-060): bezpieczna konfiguracja funkcjonalna bota — bez tokenów, sekretów
        OAuth, URL bazy, kluczy i allowlisty właściciela. Najpierw live-config Timerów i wojny PW,
        potem katalogi Centrum. Cykl: draft → walidacja → podgląd skutków → apply → audyt →
        rollback. Apply wykonuje wyłącznie New Bot.
      </p>

      <section className="admin-panel admin-panel--wide">
        <div className="admin-panel-head">
          <h2>Cykl D-060</h2>
          <span className="admin-pill admin-pill--pending">apply zablokowane</span>
        </div>
        <ol className="admin-stepper" aria-label="Kroki D-060">
          {STEPPER_STEPS.map((name, index) => {
            const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo';
            const applyLocked = name === 'Apply' || name === 'Rollback';
            return (
              <li key={name} className={`admin-stepper__item admin-stepper__item--${state}`}>
                <button
                  type="button"
                  className="admin-stepper__btn"
                  disabled={applyLocked}
                  onClick={() => {
                    if (applyLocked) {
                      return;
                    }
                    setStep(name);
                  }}
                  title={
                    applyLocked ? 'Czeka na OpenAPI New Bot — brak fałszywego zapisu' : undefined
                  }
                >
                  <span className="admin-stepper__idx">{index + 1}</span>
                  <span>{name}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="admin-row" style={{ marginTop: '0.85rem' }}>
          <button type="button" onClick={() => setStep('Draft')}>
            Draft
          </button>
          <button type="button" onClick={runValidate}>
            Validate
          </button>
          <button type="button" onClick={runPreview} disabled={!canPreview}>
            Preview
          </button>
          <button type="button" disabled title="New Bot OpenAPI jeszcze nie udostępnia apply">
            Apply (niedostępne)
          </button>
          <button type="button" onClick={() => setStep('Audit')}>
            Audit
          </button>
          <button type="button" disabled title="New Bot OpenAPI jeszcze nie udostępnia rollback">
            Rollback (niedostępne)
          </button>
        </div>
        <p className="admin-muted" style={{ marginTop: '0.65rem' }}>
          Aktywna rewizja (placeholder): <code>null</code> — bot jeszcze nie potwierdza rewizji przez
          API. Oczekiwane: <code>GET /discord/v1/config/active-revision</code>.
        </p>
      </section>

      {step === 'Validate' || step === 'Preview' ? (
        <section className="admin-panel admin-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>
            {step === 'Validate' && 'Validate — wynik lokalny'}
            {step === 'Preview' && 'Preview — podgląd skutków (bez apply)'}
          </h2>
          {step === 'Validate' ? (
            <ul className="admin-message-list">
              {validationMessages.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : null}
          {step === 'Preview' ? (
            previewText ? (
              <code className="admin-code admin-code--tall">{previewText}</code>
            ) : (
              <p className="admin-muted">Uruchom Preview, aby zobaczyć lokalny podgląd skutków.</p>
            )
          ) : null}
        </section>
      ) : null}

      {step === 'Audit' ? (
        <section className="admin-panel admin-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>Audit</h2>
          <div className="admin-empty">
            <p>
              Brak wpisów audytu w tym panelu. Po podłączeniu New Bot / activity-admin:{' '}
              <code>GET /activity/v1/admin/guilds/:guildId/audit</code> oraz audyt apply z gateway.
            </p>
            {bundle?.audit?.ok ? (
              <code className="admin-code admin-code--tall">{pretty(bundle.audit.data)}</code>
            ) : bundle?.audit && !bundle.audit.ok ? (
              <p className="admin-muted">{bundle.audit.error}</p>
            ) : (
              <p className="admin-muted">Pusty stan — brak danych audytu.</p>
            )}
          </div>
        </section>
      ) : null}

      <div className="admin-row" style={{ marginTop: '1.25rem' }}>
        <h2 className="admin-section-title">Live-config Technika</h2>
      </div>
      <p className="admin-meta">
        Pola bezpieczne (bez sekretów). Draft działa teraz; apply dopiero gdy New Bot wystawi{' '}
        <code>/discord/v1/config</code>.
      </p>

      <div className="admin-panel-grid admin-panel-grid--status">
        <section className="admin-panel admin-panel--live-config">
          <span className="admin-pill admin-pill--live">live-config · draft</span>
          <h2>Powiadomienia Discord z Timerów</h2>
          <p>
            Włączanie powiadomień timerów na Discordzie. Nie przechowuje{' '}
            <code>DISCORD_NOTIFY_SHARED_SECRET</code> ani tokenów.
          </p>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={timersDraft.enabled}
              onChange={(e) => setTimersDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Włącz powiadomienia Timerów → Discord
          </label>
          <label className="admin-field">
            <span>Minuty przed terminem (reminderMinutesBefore)</span>
            <input
              type="number"
              min={0}
              max={1440}
              value={timersDraft.reminderMinutesBefore}
              onChange={(e) =>
                setTimersDraft((prev) => ({
                  ...prev,
                  reminderMinutesBefore: Number(e.target.value),
                }))
              }
            />
          </label>
          <label className="admin-field">
            <span>Szablon wiadomości (messageTemplate)</span>
            <textarea
              rows={4}
              value={timersDraft.messageTemplate}
              placeholder="np. Timer {{title}} za {{minutes}} min — {{deepLink}}"
              onChange={(e) =>
                setTimersDraft((prev) => ({ ...prev, messageTemplate: e.target.value }))
              }
            />
          </label>
          <p className="admin-muted">Placeholdery: {'{{title}}'}, {'{{minutes}}'}, {'{{deepLink}}'}.</p>
        </section>

        <section className="admin-panel admin-panel--live-config">
          <span className="admin-pill admin-pill--live">live-config · draft</span>
          <h2>Wojna królestw (PW)</h2>
          <p>
            Harmonogram PW w strefie Europe/Warsaw. Domyślnie wojna 18:00, powiadomienie 30 min
            wcześniej (17:30).
          </p>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={warDraft.enabled}
              onChange={(e) => setWarDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Włącz powiadomienia wojny PW
          </label>
          <label className="admin-field">
            <span>Godzina wojny (warAt, Warszawa)</span>
            <input
              type="time"
              value={warDraft.warAt}
              onChange={(e) => setWarDraft((prev) => ({ ...prev, warAt: e.target.value }))}
            />
          </label>
          <label className="admin-field">
            <span>Minuty przed PW (notifyMinutesBefore)</span>
            <input
              type="number"
              min={0}
              max={1440}
              value={warDraft.notifyMinutesBefore}
              onChange={(e) =>
                setWarDraft((prev) => ({
                  ...prev,
                  notifyMinutesBefore: Number(e.target.value),
                }))
              }
            />
          </label>
          <p className="admin-muted">
            Wyliczone powiadomienie:{' '}
            <strong>{warNotifyAt ?? '—'}</strong> Europe/Warsaw
            {warDraft.warAt === '18:00' && warDraft.notifyMinutesBefore === 30
              ? ' (domyślnie 17:30)'
              : ''}
            .
          </p>
          <label className="admin-field">
            <span>Szablon wiadomości (messageTemplate)</span>
            <textarea
              rows={4}
              value={warDraft.messageTemplate}
              placeholder="np. PW o {{warAt}} — ping {{minutes}} min wcześniej"
              onChange={(e) =>
                setWarDraft((prev) => ({ ...prev, messageTemplate: e.target.value }))
              }
            />
          </label>
          <p className="admin-muted">Placeholdery: {'{{warAt}}'}, {'{{minutes}}'}, {'{{notifyAt}}'}.</p>
        </section>
      </div>

      <div className="admin-row" style={{ marginTop: '1.25rem' }}>
        <h2 className="admin-section-title">Pozostałe obszary możliwości</h2>
        <button
          type="button"
          onClick={() => void refreshReads()}
          disabled={!readConfigured || loadingRead}
        >
          {loadingRead ? 'Odczyt…' : 'Odśwież READ'}
        </button>
      </div>
      <p className="admin-meta">
        Gateway: <code>{gatewayBase}</code>
        {readConfigured ? (
          <>
            {' '}
            · activity-admin: <code>{activityEnv.baseUrl}</code> · guild{' '}
            <code>{activityEnv.guildId}</code>
          </>
        ) : (
          <> · activity-admin READ wyłączony (brak VITE_ACTIVITY_ADMIN_*)</>
        )}
      </p>
      {bundleError ? <p className="admin-muted">{bundleError}</p> : null}

      <div className="admin-panel-grid">
        {CAPABILITY_AREAS.filter((a) => a.availability !== 'live-config').map((area) => {
          const note = draftNotes[area.id] ?? '';
          const readResult = area.bundleKey && bundle ? bundle[area.bundleKey] : undefined;
          return (
            <section key={area.id} className="admin-panel">
              <span
                className={
                  area.availability === 'api-pending'
                    ? 'admin-skeleton-tag'
                    : 'admin-pill admin-pill--live'
                }
              >
                {areaStatusLabel(area, readConfigured)}
              </span>
              <h2>{area.title}</h2>
              <p>{area.detail}</p>
              {step === 'Draft' ? (
                <label className="admin-field">
                  <span>Notatka draftu</span>
                  <textarea
                    value={note}
                    rows={3}
                    placeholder="Opisz zamierzoną zmianę (bez sekretów)…"
                    onChange={(e) =>
                      setDraftNotes((prev) => ({ ...prev, [area.id]: e.target.value }))
                    }
                  />
                </label>
              ) : null}
              {readConfigured && readResult ? (
                readResult.ok ? (
                  <details className="admin-details">
                    <summary>Podgląd READ</summary>
                    <code className="admin-code">{pretty(readResult.data)}</code>
                  </details>
                ) : (
                  <p className="admin-muted">{readResult.error}</p>
                )
              ) : null}
            </section>
          );
        })}
      </div>

      <section className="admin-panel admin-panel--wide" style={{ marginTop: '1rem' }}>
        <h2>Oczekiwane ścieżki API</h2>
        <p className="admin-muted">
          Udokumentowane kontrakty — Admin nie wywołuje apply/rollback, dopóki New Bot nie
          opublikuje OpenAPI. Live-config Timerów/PW trafi do{' '}
          <code>PUT /discord/v1/config</code> (klucze <code>timersDiscordNotify</code>,{' '}
          <code>kingdomWarPw</code>).
        </p>
        <div className="admin-two-col">
          <div>
            <h3>New Bot (discord-gateway) — pending</h3>
            <ul className="admin-path-list">
              {EXPECTED_DISCORD_CONFIG_PATHS.map((p) => (
                <li key={p}>
                  <code>{p}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>activity-admin — opcjonalny READ</h3>
            <ul className="admin-path-list">
              {EXPECTED_ACTIVITY_ADMIN_READ_PATHS.map((p) => (
                <li key={p}>
                  <code>{p}</code>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
