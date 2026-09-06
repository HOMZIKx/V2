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

const STEPPER_STEPS = ['Draft', 'Validate', 'Preview', 'Apply', 'Audit', 'Rollback'] as const;
type StepId = (typeof STEPPER_STEPS)[number];

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
      setActionError(`Nie udało się pobrać config: ${active.error}${active.detail ? ` — ${active.detail}` : ''}`);
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
      local.push('timersNotify.reminderMinutesBefore: liczba całkowita 1–1440 (domyślnie 60).');
    }
    if (timersDraft.enabled && timersDraft.messageTemplate.trim().length < 1) {
      local.push('timersNotify: przy włączeniu wymagany jest szablon wiadomości.');
    }
    if (looksLikeSecret(timersDraft.messageTemplate)) {
      local.push('timersNotify.messageTemplate: wygląda na sekret — usuń tokeny/hasła.');
    }
    if (!WAR_AT_RE.test(warDraft.warAt)) {
      local.push('kingdomWar.warAt: format HH:MM (24h, Europe/Warsaw).');
    }
    if (
      !Number.isInteger(warDraft.notifyMinutesBefore) ||
      warDraft.notifyMinutesBefore < 1 ||
      warDraft.notifyMinutesBefore > 24 * 60
    ) {
      local.push('kingdomWar.notifyMinutesBefore: liczba całkowita 1–1440 (domyślnie 30).');
    }
    if (warDraft.enabled && warDraft.messageTemplate.trim().length < 1) {
      local.push('kingdomWar: przy włączeniu wymagany jest szablon wiadomości.');
    }
    if (looksLikeSecret(warDraft.messageTemplate)) {
      local.push('kingdomWar.messageTemplate: wygląda na sekret — usuń tokeny/hasła.');
    }
    if (warNotifyAt) {
      local.push(
        `kingdomWar: powiadomienie lokalne o ${warNotifyAt} (Europe/Warsaw), wojna o ${warDraft.warAt}.`,
      );
    }

    if (!mutationsEnabled) {
      setValidationMessages([
        ...local,
        'Mutacje wyłączone — ustaw DISCORD_TECHNIKA_SHARED_SECRET na serwerze web (nie NEXT_PUBLIC_).',
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
          `PUT draft nieudany: ${draftRes.error}`,
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
          `Validate API: ${valRes.error}`,
          ...(valRes.detail ? [valRes.detail] : []),
          ...(valRes.issues ?? []).map((i) => `${i.path}: ${i.message}`),
        ]);
        setStep('Validate');
        return;
      }

      const apiIssues = valRes.data.issues.map((i) => `${i.path}: ${i.message}`);
      setValidationMessages([
        ...local,
        valRes.data.ok ? 'Validate API: OK' : 'Validate API: błędy',
        ...apiIssues,
      ]);
      setLastAction('draft+validate');
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
          warning: 'Brak DISCORD_TECHNIKA_SHARED_SECRET — brak podglądu z gateway.',
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
        setActionError(`Preview: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`);
        setPreviewText(pretty(res.body ?? { error: res.error }));
      } else {
        setPreviewText(pretty(res.data));
        setLastAction('preview');
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
        setActionError(`Apply: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`);
        setStep('Apply');
        return;
      }
      setSnapshot(res.data);
      setLastAction(`apply revision=${res.data.revision}`);
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
        setActionError(`Rollback: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`);
        setStep('Rollback');
        return;
      }
      setSnapshot(res.data);
      setLastAction(`rollback revision=${res.data.revision}`);
      setStep('Rollback');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = STEPPER_STEPS.indexOf(step);
  const canApply = mutationsEnabled && !busy;
  const canRollback = mutationsEnabled && !busy && Boolean(snapshot?.canRollback);

  return (
    <>
      <h1>Konfiguracja bota</h1>
      <p className="technik-lead">
        D-060: draft → validate → preview → apply → audit → rollback. Klucze OpenAPI:{' '}
        <code>timersNotify</code>, <code>kingdomWar</code>. Sekrety tylko po stronie serwera web (
        <code>DISCORD_TECHNIKA_SHARED_SECRET</code>).
      </p>

      <section className="technik-panel technik-panel--wide">
        <div className="technik-panel-head">
          <h2>Cykl D-060</h2>
          <span className={mutationsEnabled ? 'technik-pill technik-pill--live' : 'technik-pill technik-pill--pending'}>
            {mutationsEnabled ? 'apply gotowe (secret OK)' : 'apply zablokowane (brak secret)'}
          </span>
        </div>
        <ol className="technik-stepper" aria-label="Kroki D-060">
          {STEPPER_STEPS.map((name, index) => {
            const stateCls = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo';
            const locked =
              (!mutationsEnabled && (name === 'Apply' || name === 'Rollback')) ||
              (name === 'Rollback' && !snapshot?.canRollback);
            return (
              <li key={name} className={`technik-stepper__item technik-stepper__item--${stateCls}`}>
                <button
                  type="button"
                  className="technik-stepper__btn"
                  disabled={locked && (name === 'Apply' || name === 'Rollback')}
                  onClick={() => setStep(name)}
                >
                  <span className="technik-stepper__idx">{index + 1}</span>
                  <span>{name}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="technik-row" style={{ marginTop: '0.85rem' }}>
          <button type="button" onClick={() => setStep('Draft')} disabled={busy}>
            Draft
          </button>
          <button type="button" onClick={() => void runValidate()} disabled={busy}>
            Validate
          </button>
          <button type="button" onClick={() => void runPreview()} disabled={busy}>
            Preview
          </button>
          <button
            type="button"
            onClick={() => void runApply()}
            disabled={!canApply}
            title={mutationsEnabled ? 'POST /discord/v1/config/apply' : 'Wymaga DISCORD_TECHNIKA_SHARED_SECRET'}
          >
            {busy ? '…' : 'Apply'}
          </button>
          <button type="button" onClick={() => setStep('Audit')} disabled={busy}>
            Audit
          </button>
          <button
            type="button"
            onClick={() => void runRollback()}
            disabled={!canRollback}
            title={snapshot?.canRollback ? 'POST /discord/v1/config/rollback' : 'Brak poprzedniej rewizji'}
          >
            Rollback
          </button>
        </div>
        <p className="technik-muted" style={{ marginTop: '0.65rem' }}>
          Aktywna rewizja: <code>{snapshot?.revision ?? '—'}</code>
          {snapshot?.hasDraft ? ' · draft oczekuje' : ''}
          {snapshot?.canRollback ? ' · rollback dostępny' : ''}
          {lastAction ? ` · ostatnia akcja: ${lastAction}` : ''}
        </p>
        <p className="technik-meta">
          Gateway: <code>{gatewayLabel || '—'}</code> · proxy <code>/api/technik/*</code>
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
            {step === 'Validate' && 'Validate'}
            {step === 'Preview' && 'Preview — active vs draft'}
            {step === 'Apply' && 'Apply'}
            {step === 'Rollback' && 'Rollback'}
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
              <p className="technik-muted">Uruchom Preview.</p>
            )
          ) : null}
          {(step === 'Apply' || step === 'Rollback') && snapshot ? (
            <code className="technik-code technik-code--tall">{pretty(snapshot)}</code>
          ) : null}
        </section>
      ) : null}

      {step === 'Audit' ? (
        <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>Audit</h2>
          <div className="technik-empty">
            <p>
              Audyt apply na gateway — gap (mapa możliwości). Lokalnie widać rewizję i timestamp z GET
              config.
            </p>
            {snapshot ? (
              <code className="technik-code">{pretty({
                revision: snapshot.revision,
                updatedAt: snapshot.updatedAt,
                hasDraft: snapshot.hasDraft,
                canRollback: snapshot.canRollback,
              })}</code>
            ) : (
              <p className="technik-muted">Brak snapshotu.</p>
            )}
          </div>
        </section>
      ) : null}

      <div className="technik-row" style={{ marginTop: '1.25rem' }}>
        <h2 className="technik-section-title">Live-config Technika</h2>
        <button type="button" onClick={() => void load()} disabled={busy}>
          Odśwież GET config
        </button>
      </div>

      <div className="technik-panel-grid technik-panel-grid--status">
        <section className="technik-panel technik-panel--live-config">
          <span className="technik-pill technik-pill--live">timersNotify</span>
          <h2>Powiadomienia Discord z Timerów</h2>
          <p>OpenAPI <code>timersNotify</code> — bez sekretów S2S.</p>
          <label className="technik-check">
            <input
              type="checkbox"
              checked={timersDraft.enabled}
              onChange={(e) => setTimersDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Włącz timersNotify
          </label>
          <label className="technik-check">
            <input
              type="checkbox"
              checked={timersDraft.resetNotifyEnabled}
              onChange={(e) =>
                setTimersDraft((prev) => ({ ...prev, resetNotifyEnabled: e.target.checked }))
              }
            />
            resetNotifyEnabled (auto-DM po resecie)
          </label>
          <label className="technik-field">
            <span>reminderMinutesBefore (domyślnie 60)</span>
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
          </label>
          <label className="technik-field">
            <span>messageTemplate</span>
            <textarea
              rows={4}
              value={timersDraft.messageTemplate}
              onChange={(e) =>
                setTimersDraft((prev) => ({ ...prev, messageTemplate: e.target.value }))
              }
            />
          </label>
          <p className="technik-muted">
            Placeholdery: {'{{title}}'}, {'{{body}}'}, {'{{otherTimersSummary}}'}, {'{{deepLinkUrl}}'}.
          </p>
        </section>

        <section className="technik-panel technik-panel--live-config">
          <span className="technik-pill technik-pill--live">kingdomWar</span>
          <h2>Wojna królestw (PW)</h2>
          <p>
            OpenAPI <code>kingdomWar</code> — Europe/Warsaw. Domyślnie 18:00 / 30 min → 17:30.
          </p>
          <label className="technik-check">
            <input
              type="checkbox"
              checked={warDraft.enabled}
              onChange={(e) => setWarDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Włącz kingdomWar
          </label>
          <label className="technik-field">
            <span>warAt (Warszawa)</span>
            <input
              type="time"
              value={warDraft.warAt}
              onChange={(e) => setWarDraft((prev) => ({ ...prev, warAt: e.target.value }))}
            />
          </label>
          <label className="technik-field">
            <span>notifyMinutesBefore (domyślnie 30)</span>
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
          </label>
          <p className="technik-muted">
            Wyliczone powiadomienie: <strong>{warNotifyAt ?? '—'}</strong> Europe/Warsaw.
          </p>
          <label className="technik-field">
            <span>messageTemplate</span>
            <textarea
              rows={4}
              value={warDraft.messageTemplate}
              onChange={(e) =>
                setWarDraft((prev) => ({ ...prev, messageTemplate: e.target.value }))
              }
            />
          </label>
          <p className="technik-muted">
            Placeholdery: {'{{warAt}}'}, {'{{notifyMinutesBefore}}'}.
          </p>
        </section>
      </div>
    </>
  );
}