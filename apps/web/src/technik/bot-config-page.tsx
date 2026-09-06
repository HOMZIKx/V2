'use client';

/**
 * Technik bot configurator (D-060) — live OpenAPI keys: timersNotify, kingdomWar.
 * Mutations via /api/technik/* (server holds DISCORD_TECHNIKA_SHARED_SECRET).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_KINGDOM_WAR,
  DEFAULT_TIMERS_NOTIFY,
  type ConfigSnapshot,
  type KingdomWarConfig,
  type TimersNotifyConfig,
  computeNotifyAt,
  fetchActiveConfig,
  fetchTechnikaMeta,
  postConfigApply,
  postConfigPreview,
  postConfigRollback,
  postConfigValidate,
  putConfigDraft,
} from './technika-config-api';

const STEPPER_STEPS = [
  { id: 'Draft', label: 'Szkic' },
  { id: 'Validate', label: 'Sprawdź' },
  { id: 'Preview', label: 'Zobacz co się zmieni' },
  { id: 'Apply', label: 'Zapisz i włącz' },
  { id: 'Audit', label: 'Historia' },
  { id: 'Rollback', label: 'Cofnij ostatnią zmianę' },
] as const;

type StepId = (typeof STEPPER_STEPS)[number]['id'];

const WAR_AT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function looksLikeSecret(value: string): boolean {
  return /token|secret|password|api[_-]?key|Bearer\s|mongodb(\+srv)?:\/\//i.test(value);
}

export function TechnikBotConfigPage() {
  const [step, setStep] = useState<StepId>('Draft');
  const [timersDraft, setTimersDraft] = useState<TimersNotifyConfig>(DEFAULT_TIMERS_NOTIFY);
  const [warDraft, setWarDraft] = useState<KingdomWarConfig>(DEFAULT_KINGDOM_WAR);
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [mutationsEnabled, setMutationsEnabled] = useState(false);
  const [gatewayLabel, setGatewayLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [previewText, setPreviewText] = useState('');
  const [lastAction, setLastAction] = useState<string | null>(null);

  const warNotifyAt = useMemo(
    () => computeNotifyAt(warDraft.warAt, warDraft.notifyMinutesBefore),
    [warDraft.warAt, warDraft.notifyMinutesBefore],
  );

  const load = useCallback(async () => {
    const [meta, active] = await Promise.all([fetchTechnikaMeta(), fetchActiveConfig()]);
    if (meta.ok) {
      setMutationsEnabled(meta.data.mutationsEnabled);
      setGatewayLabel(meta.data.gateway);
    }
    if (active.ok) {
      setSnapshot(active.data);
      const cfg = active.data.config;
      if (cfg?.timersNotify) {
        setTimersDraft({ ...DEFAULT_TIMERS_NOTIFY, ...cfg.timersNotify });
      }
      if (cfg?.kingdomWar) {
        setWarDraft({ ...DEFAULT_KINGDOM_WAR, ...cfg.kingdomWar });
      }
    } else {
      setActionError(
        `Nie udało się pobrać ustawień: ${active.error}${active.detail ? ` — ${active.detail}` : ''}`,
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runValidate = async () => {
    setActionError(null);
    const local: string[] = [];

    if (
      !Number.isInteger(timersDraft.reminderMinutesBefore) ||
      timersDraft.reminderMinutesBefore < 1 ||
      timersDraft.reminderMinutesBefore > 24 * 60
    ) {
      local.push('Przypomnienie timerów: podaj liczbę minut od 1 do 1440 (zwykle 60).');
    }
    if (timersDraft.enabled && timersDraft.messageTemplate.trim().length < 1) {
      local.push('Powiadomienia z timerów są włączone — wpisz treść wiadomości.');
    }
    if (looksLikeSecret(timersDraft.messageTemplate)) {
      local.push('Treść wiadomości timerów wygląda na sekret — usuń tokeny i hasła.');
    }
    if (!WAR_AT_RE.test(warDraft.warAt)) {
      local.push('Godzina wojny: użyj formatu HH:MM (czas warszawski, 24h).');
    }
    if (
      !Number.isInteger(warDraft.notifyMinutesBefore) ||
      warDraft.notifyMinutesBefore < 1 ||
      warDraft.notifyMinutesBefore > 24 * 60
    ) {
      local.push('Przypomnienie o wojnie: podaj liczbę minut od 1 do 1440 (zwykle 30).');
    }
    if (warDraft.enabled && warDraft.messageTemplate.trim().length < 1) {
      local.push('Przypomnienie o wojnie jest włączone — wpisz treść wiadomości.');
    }
    if (looksLikeSecret(warDraft.messageTemplate)) {
      local.push('Treść wiadomości o wojnie wygląda na sekret — usuń tokeny i hasła.');
    }
    if (warNotifyAt) {
      local.push(
        `Wojna o ${warDraft.warAt} — bot przypomni o ${warNotifyAt} (czas warszawski).`,
      );
    }

    if (!mutationsEnabled) {
      setValidationMessages([
        ...local,
        'Zapis jest wyłączony — na serwerze web brakuje klucza DISCORD_TECHNIKA_SHARED_SECRET (nie NEXT_PUBLIC_).',
      ]);
      setStep('Validate');
      return;
    }

    setBusy(true);
    try {
      const draftRes = await putConfigDraft({
        timersNotify: timersDraft,
        kingdomWar: warDraft,
      });
      if (!draftRes.ok) {
        const issueLines = (draftRes.issues ?? []).map((i) => `${i.path}: ${i.message}`);
        setValidationMessages([
          ...local,
          `Nie udało się zapisać szkicu: ${draftRes.error}`,
          ...(draftRes.detail ? [draftRes.detail] : []),
          ...issueLines,
        ]);
        setStep('Validate');
        return;
      }

      const valRes = await postConfigValidate();
      if (!valRes.ok) {
        setValidationMessages([
          ...local,
          `Sprawdzanie nieudane: ${valRes.error}`,
          ...(valRes.detail ? [valRes.detail] : []),
          ...(valRes.issues ?? []).map((i) => `${i.path}: ${i.message}`),
        ]);
        setStep('Validate');
        return;
      }

      const apiIssues = valRes.data.issues.map((i) => `${i.path}: ${i.message}`);
      setValidationMessages([
        ...local,
        valRes.data.ok ? 'Sprawdzanie: wszystko OK' : 'Sprawdzanie: są błędy',
        ...apiIssues,
      ]);
      setLastAction('zapisano szkic i sprawdzono');
      setStep('Validate');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setActionError(null);
    if (!mutationsEnabled) {
      setPreviewText(
        pretty({
          mode: 'local-only',
          warning: 'Brak klucza na serwerze — podgląd tylko lokalny, bez bramki.',
          timersNotify: timersDraft,
          kingdomWar: { ...warDraft, notifyAtWarsaw: warNotifyAt },
        }),
      );
      setStep('Preview');
      return;
    }
    setBusy(true);
    try {
      const res = await postConfigPreview();
      if (!res.ok) {
        setActionError(`Podgląd: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`);
        setPreviewText(pretty(res.body ?? { error: res.error }));
      } else {
        setPreviewText(pretty(res.data));
        setLastAction('podgląd zmian');
      }
      setStep('Preview');
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    if (!mutationsEnabled) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await postConfigApply();
      if (!res.ok) {
        setActionError(`Zapisz i włącz: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`);
        setStep('Apply');
        return;
      }
      setSnapshot(res.data);
      setLastAction(`zapisano i włączono (wersja ${res.data.revision})`);
      setStep('Apply');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const runRollback = async () => {
    if (!mutationsEnabled) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await postConfigRollback();
      if (!res.ok) {
        setActionError(`Cofnij: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`);
        setStep('Rollback');
        return;
      }
      setSnapshot(res.data);
      setLastAction(`cofnięto do wersji ${res.data.revision}`);
      setStep('Rollback');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = STEPPER_STEPS.findIndex((s) => s.id === step);
  const canApply = mutationsEnabled && !busy;
  const canRollback = mutationsEnabled && !busy && Boolean(snapshot?.canRollback);

  return (
    <>
      <h1>Konfiguracja bota</h1>
      <p className="technik-lead">
        Ustaw powiadomienia Discord dla gildii. Najpierw zrób szkic, sprawdź go, zobacz co się
        zmieni, a potem zapisz i włącz. Jak coś pójdzie nie tak — cofnij ostatnią zmianę.
      </p>

      <section className="technik-panel technik-panel--wide">
        <div className="technik-panel-head">
          <h2>Jak zapisać zmiany</h2>
          <span className={mutationsEnabled ? 'technik-pill technik-pill--live' : 'technik-pill technik-pill--pending'}>
            {mutationsEnabled ? 'Możesz zapisywać' : 'Zapis zablokowany (brak klucza)'}
          </span>
        </div>
        <ol className="technik-stepper" aria-label="Kroki zapisu ustawień">
          {STEPPER_STEPS.map((item, index) => {
            const stateCls = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo';
            const locked =
              (!mutationsEnabled && (item.id === 'Apply' || item.id === 'Rollback')) ||
              (item.id === 'Rollback' && !snapshot?.canRollback);
            return (
              <li key={item.id} className={`technik-stepper__item technik-stepper__item--${stateCls}`}>
                <button
                  type="button"
                  className="technik-stepper__btn"
                  disabled={locked && (item.id === 'Apply' || item.id === 'Rollback')}
                  onClick={() => setStep(item.id)}
                >
                  <span className="technik-stepper__idx">{index + 1}</span>
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="technik-row" style={{ marginTop: '0.85rem' }}>
          <button type="button" onClick={() => setStep('Draft')} disabled={busy}>
            Szkic
          </button>
          <button type="button" onClick={() => void runValidate()} disabled={busy}>
            Sprawdź
          </button>
          <button type="button" onClick={() => void runPreview()} disabled={busy}>
            Zobacz co się zmieni
          </button>
          <button
            type="button"
            onClick={() => void runApply()}
            disabled={!canApply}
            title={
              mutationsEnabled
                ? 'Zapisze szkic jako aktywne ustawienia bota'
                : 'Potrzebny klucz DISCORD_TECHNIKA_SHARED_SECRET na serwerze'
            }
          >
            {busy ? '…' : 'Zapisz i włącz'}
          </button>
          <button type="button" onClick={() => setStep('Audit')} disabled={busy}>
            Historia
          </button>
          <button
            type="button"
            onClick={() => void runRollback()}
            disabled={!canRollback}
            title={
              snapshot?.canRollback
                ? 'Przywróci poprzednie działające ustawienia'
                : 'Nie ma wcześniejszej wersji do cofnięcia'
            }
          >
            Cofnij ostatnią zmianę
          </button>
        </div>
        <p className="technik-muted" style={{ marginTop: '0.65rem' }}>
          Wersja aktywna: <code>{snapshot?.revision ?? '—'}</code>
          {snapshot?.hasDraft ? ' · masz niewłączony szkic' : ''}
          {snapshot?.canRollback ? ' · możesz cofnąć' : ''}
          {lastAction ? ` · ostatnio: ${lastAction}` : ''}
        </p>
        <p className="technik-meta">
          Bramka: <code>{gatewayLabel || '—'}</code>
        </p>
        {actionError ? (
          <p className="technik-muted" role="alert">
            {actionError}
          </p>
        ) : null}
      </section>

      {step === 'Validate' || step === 'Preview' || step === 'Apply' || step === 'Rollback' ? (
        <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>
            {step === 'Validate' && 'Wynik sprawdzania'}
            {step === 'Preview' && 'Co się zmieni (aktywne vs szkic)'}
            {step === 'Apply' && 'Zapisano i włączono'}
            {step === 'Rollback' && 'Cofnięto ostatnią zmianę'}
          </h2>
          {step === 'Validate' ? (
            <ul className="technik-message-list">
              {validationMessages.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : null}
          {step === 'Preview' ? (
            previewText ? (
              <code className="technik-code technik-code--tall">{previewText}</code>
            ) : (
              <p className="technik-muted">Kliknij „Zobacz co się zmieni”, żeby zobaczyć różnice.</p>
            )
          ) : null}
          {(step === 'Apply' || step === 'Rollback') && snapshot ? (
            <code className="technik-code technik-code--tall">{pretty(snapshot)}</code>
          ) : null}
        </section>
      ) : null}

      {step === 'Audit' ? (
        <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>Historia zmian</h2>
          <div className="technik-empty">
            <p>
              Pełna lista zapisów pojawi się później. Na razie widać wersję aktywną i czas ostatniej
              aktualizacji.
            </p>
            {snapshot ? (
              <code className="technik-code">{pretty({
                revision: snapshot.revision,
                updatedAt: snapshot.updatedAt,
                hasDraft: snapshot.hasDraft,
                canRollback: snapshot.canRollback,
              })}</code>
            ) : (
              <p className="technik-muted">Brak danych o wersji.</p>
            )}
          </div>
        </section>
      ) : null}

      <div className="technik-row" style={{ marginTop: '1.25rem' }}>
        <h2 className="technik-section-title">Ustawienia powiadomień</h2>
        <button type="button" onClick={() => void load()} disabled={busy}>
          Odśwież ustawienia
        </button>
      </div>

      <div className="technik-panel-grid technik-panel-grid--status">
        <section className="technik-panel technik-panel--live-config">
          <span className="technik-pill technik-pill--live">timery</span>
          <h2>Powiadomienia z timerów</h2>
          <p className="technik-help">
            Wyślij wiadomość na Discord przed odnowieniem timera — gildia nie przegapi respawnu.
          </p>

          <div className="technik-field-block">
            <label className="technik-check">
              <input
                type="checkbox"
                checked={timersDraft.enabled}
                onChange={(e) => setTimersDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              Włącz powiadomienia z timerów
            </label>
            <p className="technik-help">Gdy włączone, bot przypomina o timerach na Discordzie.</p>
          </div>

          <div className="technik-field-block">
            <label className="technik-check">
              <input
                type="checkbox"
                checked={timersDraft.resetNotifyEnabled}
                onChange={(e) =>
                  setTimersDraft((prev) => ({ ...prev, resetNotifyEnabled: e.target.checked }))
                }
              />
              Powiadom po resecie timera
            </label>
            <p className="technik-help">
              Po resecie bot wyśle krótką wiadomość prywatną (DM), że timer wystartował od nowa.
            </p>
          </div>

          <label className="technik-field">
            <span>Ile minut przed odnowieniem przypomnieć</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={timersDraft.reminderMinutesBefore}
              onChange={(e) =>
                setTimersDraft((prev) => ({
                  ...prev,
                  reminderMinutesBefore: Number(e.target.value),
                }))
              }
            />
            <span className="technik-help">
              Np. 60 = wiadomość godzinę przed odnowieniem. Zakres 1–1440.
            </span>
          </label>

          <label className="technik-field">
            <span>Treść wiadomości</span>
            <textarea
              rows={4}
              value={timersDraft.messageTemplate}
              onChange={(e) =>
                setTimersDraft((prev) => ({ ...prev, messageTemplate: e.target.value }))
              }
            />
            <span className="technik-help">
              Możesz użyć: {'{{title}}'}, {'{{body}}'}, {'{{otherTimersSummary}}'},{' '}
              {'{{deepLinkUrl}}'}.
            </span>
          </label>
        </section>

        <section className="technik-panel technik-panel--live-config">
          <span className="technik-pill technik-pill--live">wojna</span>
          <h2>Wojna królestw (PW)</h2>
          <p className="technik-help">
            Przypomnij o wojnie wcześniej — domyślnie wojna o 18:00, przypomnienie 30 min wcześniej
            (17:30, czas warszawski).
          </p>

          <div className="technik-field-block">
            <label className="technik-check">
              <input
                type="checkbox"
                checked={warDraft.enabled}
                onChange={(e) => setWarDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              Włącz przypomnienie o wojnie
            </label>
            <p className="technik-help">Bot wyśle wiadomość na Discord przed startem wojny.</p>
          </div>

          <label className="technik-field">
            <span>Godzina wojny (Warszawa)</span>
            <input
              type="time"
              value={warDraft.warAt}
              onChange={(e) => setWarDraft((prev) => ({ ...prev, warAt: e.target.value }))}
            />
            <span className="technik-help">O której godzinie zaczyna się wojna królestw.</span>
          </label>

          <label className="technik-field">
            <span>Ile minut wcześniej przypomnieć</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={warDraft.notifyMinutesBefore}
              onChange={(e) =>
                setWarDraft((prev) => ({
                  ...prev,
                  notifyMinutesBefore: Number(e.target.value),
                }))
              }
            />
            <span className="technik-help">
              Przypomnij o wojnie {warDraft.notifyMinutesBefore || '—'} min wcześniej
              {warNotifyAt ? ` (czyli o ${warNotifyAt})` : ''}.
            </span>
          </label>

          <label className="technik-field">
            <span>Treść wiadomości</span>
            <textarea
              rows={4}
              value={warDraft.messageTemplate}
              onChange={(e) =>
                setWarDraft((prev) => ({ ...prev, messageTemplate: e.target.value }))
              }
            />
            <span className="technik-help">
              Możesz użyć: {'{{warAt}}'}, {'{{notifyMinutesBefore}}'}.
            </span>
          </label>
        </section>
      </div>
    </>
  );
}
