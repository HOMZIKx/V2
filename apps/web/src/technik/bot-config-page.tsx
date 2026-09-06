'use client';

/**
 * Technik bot configurator (D-060) — only live useful settings.
 * Timery postaci (timersNotify / characterTimers) + Wojna królestw + Test DM.
 * Mutations via /api/technik/* (server holds DISCORD_TECHNIKA_SHARED_SECRET).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_CHARACTER_TIMERS,
  DEFAULT_KINGDOM_WAR,
  type BotCapability,
  type CharacterTimersConfig,
  type ConfigSnapshot,
  type KingdomWarConfig,
  computeNotifyAt,
  fetchActiveConfig,
  fetchCapabilities,
  fetchTechnikaMeta,
  pickCharacterTimers,
  postConfigApply,
  postConfigPreview,
  postConfigRollback,
  postConfigTestDm,
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
  const [charTimers, setCharTimers] = useState<CharacterTimersConfig>(DEFAULT_CHARACTER_TIMERS);
  const [timersApiKey, setTimersApiKey] = useState<'characterTimers' | 'timersNotify'>(
    'timersNotify',
  );
  const [warDraft, setWarDraft] = useState<KingdomWarConfig>(DEFAULT_KINGDOM_WAR);
  const [panelTestEnabled, setPanelTestEnabled] = useState(true);
  const [notifyTimerEnabled, setNotifyTimerEnabled] = useState(true);
  const [testUserId, setTestUserId] = useState('');
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [capabilities, setCapabilities] = useState<readonly BotCapability[]>([]);
  const [mutationsEnabled, setMutationsEnabled] = useState(false);
  const [gatewayLabel, setGatewayLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [previewText, setPreviewText] = useState('');
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [testDmMsg, setTestDmMsg] = useState<string | null>(null);

  const warNotifyAt = useMemo(
    () => computeNotifyAt(warDraft.warAt, warDraft.notifyMinutesBefore),
    [warDraft.warAt, warDraft.notifyMinutesBefore],
  );

  const hasCharacterTimersCap = useMemo(
    () => capabilities.some((c) => c.id === 'characterTimers'),
    [capabilities],
  );

  const hasPanelTestCap = useMemo(
    () => capabilities.some((c) => c.id === 'panel-test-enabled'),
    [capabilities],
  );

  const load = useCallback(async () => {
    const [meta, active, caps] = await Promise.all([
      fetchTechnikaMeta(),
      fetchActiveConfig(),
      fetchCapabilities(),
    ]);
    if (meta.ok) {
      setMutationsEnabled(meta.data.mutationsEnabled);
      setGatewayLabel(meta.data.gateway);
    }
    if (caps.ok) {
      setCapabilities(caps.data.capabilities);
    }
    if (active.ok) {
      setSnapshot(active.data);
      const cfg = active.data.config;
      const picked = pickCharacterTimers(cfg);
      setCharTimers(picked.values);
      const preferCharacter =
        caps.ok && caps.data.capabilities.some((c) => c.id === 'characterTimers');
      setTimersApiKey(preferCharacter ? 'characterTimers' : picked.apiKey);
      if (cfg?.kingdomWar) {
        setWarDraft({ ...DEFAULT_KINGDOM_WAR, ...cfg.kingdomWar });
      }
      if (typeof cfg?.['panel-test-enabled'] === 'boolean') {
        setPanelTestEnabled(cfg['panel-test-enabled']);
      }
      if (typeof cfg?.['notify-timer-enabled'] === 'boolean') {
        setNotifyTimerEnabled(cfg['notify-timer-enabled']);
      }
    } else {
      setActionError(
        `Nie udało się pobrać ustawień: ${active.error}${
          active.detail ? ` — ${active.detail}` : ''
        }`,
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buildDraftPartial = () => {
    const partial: Record<string, unknown> = {
      kingdomWar: warDraft,
      'notify-timer-enabled': notifyTimerEnabled,
    };
    if (hasPanelTestCap) {
      partial['panel-test-enabled'] = panelTestEnabled;
    }
    if (timersApiKey === 'characterTimers' || hasCharacterTimersCap) {
      partial.characterTimers = charTimers;
      partial.timersNotify = charTimers;
    } else {
      partial.timersNotify = charTimers;
    }
    return partial;
  };

  const runValidate = async () => {
    setActionError(null);
    const local: string[] = [];

    if (
      !Number.isInteger(charTimers.reminderMinutesBefore) ||
      charTimers.reminderMinutesBefore < 1 ||
      charTimers.reminderMinutesBefore > 24 * 60
    ) {
      local.push('Timery postaci: podaj liczbę minut od 1 do 1440 (zwykle 60).');
    }
    if (charTimers.enabled && charTimers.messageTemplate.trim().length < 1) {
      local.push('Timery postaci są włączone — wpisz treść wiadomości.');
    }
    if (looksLikeSecret(charTimers.messageTemplate)) {
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
      const draftRes = await putConfigDraft(buildDraftPartial());
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
          warning: 'Brak klucza na serwerze — podgląd tylko lokalny.',
          draft: buildDraftPartial(),
          kingdomWarNotifyAt: warNotifyAt,
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

  const runTestDm = async (module: 'timersNotify' | 'characterTimers' | 'kingdomWar') => {
    setTestDmMsg(null);
    setActionError(null);
    if (!mutationsEnabled) {
      setTestDmMsg('Brak klucza na serwerze — nie da się wysłać testowej PW.');
      return;
    }
    setBusy(true);
    try {
      const moduleKey =
        module === 'kingdomWar'
          ? 'kingdomWar'
          : hasCharacterTimersCap || timersApiKey === 'characterTimers'
            ? 'characterTimers'
            : 'timersNotify';
      const payload =
        module === 'kingdomWar'
          ? {
              module: 'kingdomWar' as const,
              messageTemplate: warDraft.messageTemplate,
              warAt: warDraft.warAt,
              notifyMinutesBefore: warDraft.notifyMinutesBefore,
              ...(testUserId.trim() ? { discordUserId: testUserId.trim() } : {}),
            }
          : {
              module: moduleKey,
              messageTemplate: charTimers.messageTemplate,
              reminderMinutesBefore: charTimers.reminderMinutesBefore,
              ...(testUserId.trim() ? { discordUserId: testUserId.trim() } : {}),
            };
      const res = await postConfigTestDm(payload);
      if (!res.ok) {
        setTestDmMsg(
          `Test PW nieudany: ${res.error}${res.detail ? ` — ${res.detail}` : ''}`,
        );
        return;
      }
      setTestDmMsg(
        `Wysłano testową PW (${res.data.module}) → użytkownik ${res.data.discordUserId}, msg ${res.data.messageId}.`,
      );
      setLastAction('testowa PW');
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = STEPPER_STEPS.findIndex((s) => s.id === step);
  const canApply = mutationsEnabled && !busy;
  const canRollback = mutationsEnabled && !busy && Boolean(snapshot?.canRollback);
  const isolationDisplay =
    snapshot?.strictGuildIsolation ??
    capabilities.find((c) => c.id === 'strict-guild-isolation')?.currentDisplayValue;

  return (
    <>
      <h1>Konfiguracja bota</h1>
      <p className="technik-lead">
        Ustaw PW Discord: timery postaci (np. Księga) i wojnę królestw. Szkic → sprawdź → zapisz.
        Możesz wysłać testową PW, zanim włączysz na stałe.
      </p>

      <section className="technik-panel technik-panel--wide">
        <div className="technik-panel-head">
          <h2>Jak zapisać (D-060)</h2>
          <span
            className={
              mutationsEnabled
                ? 'technik-pill technik-pill--live'
                : 'technik-pill technik-pill--pending'
            }
          >
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
              <li
                key={item.id}
                className={`technik-stepper__item technik-stepper__item--${stateCls}`}
              >
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
          <button type="button" onClick={() => void runApply()} disabled={!canApply}>
            {busy ? '…' : 'Zapisz i włącz'}
          </button>
          <button type="button" onClick={() => setStep('Audit')} disabled={busy}>
            Historia
          </button>
          <button type="button" onClick={() => void runRollback()} disabled={!canRollback}>
            Cofnij ostatnią zmianę
          </button>
          <button type="button" onClick={() => void load()} disabled={busy}>
            Odśwież
          </button>
        </div>
        <p className="technik-muted" style={{ marginTop: '0.65rem' }}>
          Wersja: <code>{snapshot?.revision ?? '—'}</code>
          {snapshot?.hasDraft ? ' · szkic' : ''}
          {snapshot?.canRollback ? ' · można cofnąć' : ''}
          {lastAction ? ` · ${lastAction}` : ''}
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
            {step === 'Preview' && 'Co się zmieni'}
            {step === 'Apply' && 'Zapisano'}
            {step === 'Rollback' && 'Cofnięto'}
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
              <p className="technik-muted">Kliknij „Zobacz co się zmieni”.</p>
            )
          ) : null}
          {(step === 'Apply' || step === 'Rollback') && snapshot ? (
            <code className="technik-code technik-code--tall">{pretty(snapshot)}</code>
          ) : null}
        </section>
      ) : null}

      {step === 'Audit' ? (
        <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>Historia</h2>
          {snapshot ? (
            <code className="technik-code">
              {pretty({
                revision: snapshot.revision,
                updatedAt: snapshot.updatedAt,
                hasDraft: snapshot.hasDraft,
                canRollback: snapshot.canRollback,
              })}
            </code>
          ) : (
            <p className="technik-muted">Brak danych.</p>
          )}
        </section>
      ) : null}

      <section className="technik-panel" style={{ marginTop: '1rem' }}>
        <h2>Odbiorca testowej PW</h2>
        <p className="technik-help">
          Zostaw puste = pierwszy ID z <code>DISCORD_TEST_OPERATOR_IDS</code> na bramce. Albo wpisz
          swój Discord User ID.
        </p>
        <label className="technik-field">
          <span>Discord User ID (opcjonalnie)</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="np. 123456789012345678"
            value={testUserId}
            onChange={(e) => setTestUserId(e.target.value)}
          />
        </label>
        {testDmMsg ? (
          <p className="technik-muted" role="status" style={{ marginTop: '0.5rem' }}>
            {testDmMsg}
          </p>
        ) : null}
      </section>

      <div className="technik-panel-grid technik-panel-grid--status" style={{ marginTop: '1rem' }}>
        <section className="technik-panel technik-panel--live-config">
          <span className="technik-pill technik-pill--live">
            {timersApiKey}
            {hasCharacterTimersCap ? ' + characterTimers' : ''}
          </span>
          <h2>Timery postaci (PW)</h2>
          <p className="technik-help">
            Przypomnienia o timerach postaci (np. Księga). To nie są metiny na mapie.
          </p>

          <div className="technik-field-block">
            <label className="technik-check">
              <input
                type="checkbox"
                checked={notifyTimerEnabled}
                onChange={(e) => setNotifyTimerEnabled(e.target.checked)}
              />
              Przyjmuj powiadomienia z WWW (notify/timer)
            </label>
          </div>

          <div className="technik-field-block">
            <label className="technik-check">
              <input
                type="checkbox"
                checked={charTimers.enabled}
                onChange={(e) => setCharTimers((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              Włącz moduł timerów postaci
            </label>
          </div>

          <div className="technik-field-block">
            <label className="technik-check">
              <input
                type="checkbox"
                checked={charTimers.resetNotifyEnabled}
                onChange={(e) =>
                  setCharTimers((prev) => ({ ...prev, resetNotifyEnabled: e.target.checked }))
                }
              />
              PW po resecie / potwierdzeniu
            </label>
          </div>

          <label className="technik-field">
            <span>Ile minut przed resetem przypomnieć</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={charTimers.reminderMinutesBefore}
              onChange={(e) =>
                setCharTimers((prev) => ({
                  ...prev,
                  reminderMinutesBefore: Number(e.target.value),
                }))
              }
            />
          </label>

          <label className="technik-field">
            <span>Treść wiadomości (duży szablon)</span>
            <textarea
              className="technik-textarea--large"
              rows={12}
              value={charTimers.messageTemplate}
              onChange={(e) =>
                setCharTimers((prev) => ({ ...prev, messageTemplate: e.target.value }))
              }
            />
            <span className="technik-help">
              Placeholdery: {'{{title}}'}, {'{{body}}'}, {'{{otherTimersSummary}}'},{' '}
              {'{{deepLinkUrl}}'}.
            </span>
          </label>

          <div className="technik-row" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              disabled={busy || !mutationsEnabled}
              onClick={() => void runTestDm('timersNotify')}
            >
              Wyślij testową PW (timery)
            </button>
          </div>
        </section>

        <section className="technik-panel technik-panel--live-config">
          <span className="technik-pill technik-pill--live">kingdomWar</span>
          <h2>Wojna królestw (PW)</h2>
          <p className="technik-help">
            Domyślnie wojna 18:00, ping 30 min wcześniej → 17:30 (Warszawa).
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
          </div>

          <label className="technik-field">
            <span>Godzina wojny (Warszawa)</span>
            <input
              type="time"
              value={warDraft.warAt}
              onChange={(e) => setWarDraft((prev) => ({ ...prev, warAt: e.target.value }))}
            />
          </label>

          <label className="technik-field">
            <span>Ile minut wcześniej</span>
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
              {warNotifyAt
                ? `Ping o ${warNotifyAt} (Warszawa).`
                : 'Ustaw godzinę i minuty, żeby zobaczyć godzinę pingu.'}
            </span>
          </label>

          <label className="technik-field">
            <span>Treść wiadomości (duży szablon)</span>
            <textarea
              className="technik-textarea--large"
              rows={12}
              value={warDraft.messageTemplate}
              onChange={(e) =>
                setWarDraft((prev) => ({ ...prev, messageTemplate: e.target.value }))
              }
            />
            <span className="technik-help">
              Placeholdery: {'{{warAt}}'}, {'{{notifyMinutesBefore}}'}.
            </span>
          </label>

          <div className="technik-row" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              disabled={busy || !mutationsEnabled}
              onClick={() => void runTestDm('kingdomWar')}
            >
              Wyślij testową PW (wojna)
            </button>
          </div>
        </section>
      </div>

      {hasPanelTestCap ? (
        <section className="technik-panel" style={{ marginTop: '1rem' }}>
          <span className="technik-pill technik-pill--live">panel-test-enabled</span>
          <h2>Panel lab Discord</h2>
          <label className="technik-check">
            <input
              type="checkbox"
              checked={panelTestEnabled}
              onChange={(e) => setPanelTestEnabled(e.target.checked)}
            />
            Włącz komendę /panel-test (lab)
          </label>
          <p className="technik-help">
            Jedyny live przełącznik paneli w OpenAPI Technika. Hub / motyw / katalogi — gdy New Bot
            dopnie API.
          </p>
        </section>
      ) : (
        <p className="technik-muted" style={{ marginTop: '1rem' }}>
          Panele Discord: brak live capability w API — New Bot dopina później.
        </p>
      )}

      {isolationDisplay !== undefined ? (
        <p className="technik-muted" style={{ marginTop: '0.75rem' }}>
          Izolacja guildii (tylko podgląd):{' '}
          <strong>{isolationDisplay ? 'włączona' : 'wyłączona'}</strong>
        </p>
      ) : null}

      <p className="technik-help" style={{ marginTop: '1rem' }}>
        Reakcje emoji jako nawigacja/RSVP — wyłączone produktowo. Tokeny, sekrety i allowlista —
        poza Technika (Owner). Kanały, pingi, katalogi Centrum: New Bot dopina API — bez atrap w tym
        ekranie.
      </p>
    </>
  );
}
