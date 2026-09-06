'use client';

import { useState } from 'react';

import { D060Controls } from './d060-controls';
import { postConfigTestDm } from './technika-config-api';
import { PageJobNote, PlayerSeesNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

const LIVELY_TIMER_TEMPLATE =
  '**DESTILED · Timer postaci**\n' +
  'Hej! **{{title}}** zaraz się kończy — nie przegap resetu!\n\n' +
  '{{body}}\n\n' +
  'Inne Twoje timery: {{otherTimersSummary}}\n' +
  '{{deepLinkUrl}}';

export function TechnikTimersPage() {
  const cfg = useTechnikaConfig();
  const [testUserId, setTestUserId] = useState('808066932753563668');
  const [testDmMsg, setTestDmMsg] = useState<string | null>(null);

  const runTestDm = async () => {
    setTestDmMsg(null);
    if (!cfg.mutationsEnabled) {
      setTestDmMsg('Brak klucza na serwerze — nie da się wysłać testowej PW.');
      return;
    }
    cfg.setBusy(true);
    try {
      const moduleKey =
        cfg.hasCharacterTimersCap || cfg.timersApiKey === 'characterTimers'
          ? 'characterTimers'
          : 'timersNotify';
      const res = await postConfigTestDm({
        module: moduleKey,
        messageTemplate: cfg.charTimers.messageTemplate,
        reminderMinutesBefore: cfg.charTimers.reminderMinutesBefore,
        ...(testUserId.trim() ? { discordUserId: testUserId.trim() } : {}),
      });
      if (!res.ok) {
        setTestDmMsg('Test PW nieudany: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
        return;
      }
      setTestDmMsg(
        'Wysłano testową PW (' +
          res.data.module +
          ') → użytkownik ' +
          res.data.discordUserId +
          ', msg ' +
          res.data.messageId +
          '.',
      );
      cfg.setLastAction('testowa PW timerów');
    } finally {
      cfg.setBusy(false);
    }
  };

  return (
    <>
      <h1>Timery postaci (PW)</h1>
      <p className="technik-lead">
        Powiadomienia o timerach z karty EQ/Timer: Księga, Kamień Duchowy, Dowodzenie, Polimorfia,
        Górnictwo, Jazda konna. <strong>To nie są metiny na mapie</strong> — bez Zbite/Odłóż.
      </p>

      
      <PageJobNote>
        <p>
          Ustawiasz, czy bot wysyła prywatne wiadomości o timerach postaci, treść szablonu i test PW.
          To nie timery map / metinów.
        </p>
      </PageJobNote>
<PlayerSeesNote>
        <p>
          Po starcie timera na WWW gracz dostaje prywatną wiadomość od bota ze skrótem innych timerów
          oraz przyciskami <strong>Gotowe</strong> / <strong>Przypomnij później</strong>. Gotowe w DM
          aktualizuje stan w zespole bez otwierania WWW.
        </p>
      </PlayerSeesNote>

      <section className="technik-panel technik-panel--live-config" style={{ marginTop: '1rem' }}>
        <span className="technik-pill technik-pill--live">
          {cfg.timersApiKey}
          {cfg.hasCharacterTimersCap ? ' · characterTimers' : ''}
        </span>
        <h2>Ustawienia powiadomień</h2>

        <div className="technik-field-block">
          <label className="technik-check">
            <input
              type="checkbox"
              checked={cfg.notifyTimerEnabled}
              onChange={(e) => cfg.setNotifyTimerEnabled(e.target.checked)}
            />
            Przyjmuj powiadomienia z WWW (<code>notify-timer-enabled</code> → POST /notify/timer)
          </label>
          <p className="technik-help">
            Wyłączenie blokuje cały endpoint — WWW nie wyśle PW nawet gdy moduł jest ON.
          </p>
        </div>

        <div className="technik-field-block">
          <label className="technik-check">
            <input
              type="checkbox"
              checked={cfg.charTimers.enabled}
              onChange={(e) =>
                cfg.setCharTimers((prev) => ({ ...prev, enabled: e.target.checked }))
              }
            />
            Włącz moduł timerów postaci (<code>characterTimers.enabled</code>)
          </label>
        </div>

        <div className="technik-field-block">
          <label className="technik-check">
            <input
              type="checkbox"
              checked={cfg.charTimers.resetNotifyEnabled}
              onChange={(e) =>
                cfg.setCharTimers((prev) => ({ ...prev, resetNotifyEnabled: e.target.checked }))
              }
            />
            PW po starcie / resecie / potwierdzeniu Gotowe
          </label>
          <p className="technik-help">
            Po starcie lub oznaczeniu Gotowe wyślij PW ze skrótem innych timerów postaci w zespole.
          </p>
        </div>

        <label className="technik-field">
          <span>Ile minut przed końcem przypomnieć (1–1440)</span>
          <input
            type="number"
            min={1}
            max={1440}
            value={cfg.charTimers.reminderMinutesBefore}
            onChange={(e) =>
              cfg.setCharTimers((prev) => ({
                ...prev,
                reminderMinutesBefore: Number(e.target.value),
              }))
            }
          />
          <span className="technik-help">
            Reminder w przeglądarce jest best-effort (karta musi być otwarta). Scheduler gateway =
            później — nie udajemy E2E green.
          </span>
        </label>

        <label className="technik-field technik-field--message">
          <div className="technik-field-head">
            <span>Treść PW (żywy szablon PL)</span>
            <button
              type="button"
              className="technik-btn-ghost"
              onClick={() =>
                cfg.setCharTimers((prev) => ({ ...prev, messageTemplate: LIVELY_TIMER_TEMPLATE }))
              }
            >
              Wstaw żywy szablon
            </button>
          </div>
          <textarea
            className="technik-message-template"
            rows={14}
            value={cfg.charTimers.messageTemplate}
            onChange={(e) =>
              cfg.setCharTimers((prev) => ({ ...prev, messageTemplate: e.target.value }))
            }
          />
          <span className="technik-help">
            Placeholdery: {'{{title}}'}, {'{{body}}'}, {'{{otherTimersSummary}}'},{' '}
            {'{{characterName}}'}, {'{{timerLabel}}'}, {'{{endsAt}}'}, {'{{deepLinkUrl}}'}. Bez
            sekretów.
          </span>
        </label>
      </section>

      <section className="technik-panel" style={{ marginTop: '1rem' }}>
        <h2>Testowa PW</h2>
        <p className="technik-help">
          Domyślnie Mateusz <code>808066932753563668</code>. Wysyłka idzie przez gateway (wymaga
          sekretu Technika) — nie zmienia aktywnej rewizji.
        </p>
        <label className="technik-field">
          <span>Discord User ID</span>
          <input
            type="text"
            inputMode="numeric"
            value={testUserId}
            onChange={(e) => setTestUserId(e.target.value)}
          />
        </label>
        <div className="technik-row" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="technik-test-dm-btn"
            disabled={cfg.busy || !cfg.canWrite}
            onClick={() => void runTestDm()}
          >
            Wyślij testową PW (timery)
          </button>
        </div>
        {testDmMsg ? (
          <p className="technik-test-status" role="status">
            {testDmMsg}
          </p>
        ) : null}
      </section>

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
          help="Po edycji szablonu: Sprawdź → Zobacz → Ty klikasz Zapisz i włącz. Per-guild włączasz w Discordach."
        />
      </div>
      {cfg.step === 'Validate' ? (
        <ul className="technik-message-list" style={{ marginTop: '0.75rem' }}>
          {cfg.validationMessages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
      {cfg.step === 'Preview' && cfg.previewText ? (
        <code className="technik-code technik-code--tall">{cfg.previewText}</code>
      ) : null}
      {cfg.actionError ? (
        <p className="technik-error" role="alert">
          {cfg.actionError}
        </p>
      ) : null}
    </>
  );
}
