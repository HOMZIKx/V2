'use client';

import { useMemo, useState } from 'react';

import { D060Controls } from './d060-controls';
import { computeNotifyAt, postConfigTestDm } from './technika-config-api';
import { PageJobNote, PlayerSeesNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

const LIVELY_WAR_TEMPLATE =
  '**DESTILED · Wojna Królestw**\n' +
  'Za {{notifyMinutesBefore}} min start wojny ({{warAt}} Europe/Warsaw).\n' +
  'Zajmij postać — nie zostawiaj slotu pustego!';

export function TechnikWojnaPage() {
  const cfg = useTechnikaConfig();
  const [testUserId, setTestUserId] = useState('808066932753563668');
  const [testDmMsg, setTestDmMsg] = useState<string | null>(null);
  const warNotifyAt = useMemo(
    () => computeNotifyAt(cfg.warDraft.warAt, cfg.warDraft.notifyMinutesBefore),
    [cfg.warDraft.warAt, cfg.warDraft.notifyMinutesBefore],
  );

  const runTestDm = async () => {
    setTestDmMsg(null);
    if (!cfg.mutationsEnabled) {
      setTestDmMsg('Brak klucza na serwerze — nie da się wysłać testowej PW.');
      return;
    }
    cfg.setBusy(true);
    try {
      const res = await postConfigTestDm({
        module: 'kingdomWar',
        messageTemplate: cfg.warDraft.messageTemplate,
        warAt: cfg.warDraft.warAt,
        notifyMinutesBefore: cfg.warDraft.notifyMinutesBefore,
        ...(testUserId.trim() ? { discordUserId: testUserId.trim() } : {}),
      });
      if (!res.ok) {
        setTestDmMsg('Test PW nieudany: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
        return;
      }
      setTestDmMsg(
        'Wysłano testową PW (wojna) → użytkownik ' +
          res.data.discordUserId +
          ', msg ' +
          res.data.messageId +
          '.',
      );
      cfg.setLastAction('testowa PW wojny');
    } finally {
      cfg.setBusy(false);
    }
  };

  return (
    <>
      <h1>Wojna Królestw (PW)</h1>
      <p className="technik-lead">
        Przypomnienie przed wojną (czas Warszawa). Domyślnie 18:00, ping 30 min wcześniej → 17:30.
        Jedna osoba może zająć max kilka postaci (domyślnie 3, zakres 1–20).
      </p>

      <PageJobNote>
        <p>
          Tu ustawiasz godzinę wojny, ile minut wcześniej bot przypomina i treść PW. Placeholdery
          (np. godzina wojny, ile minut do startu) uzupełnia New Bot z żywego harmonogramu. Przyciski
          zajmowania postaci w PW obsługuje New Bot / gateway — WWW tylko konfiguruje.
        </p>
      </PageJobNote>
      <PlayerSeesNote>
        <p>
          Gracz dostaje prywatną wiadomość przed wojną z możliwością zajęcia postaci (przyciski w
          PW). Limit to zwykle <strong>max 3 postacie</strong> na osobę — żeby nikt nie zajął całej
          listy. Egzekucja przycisków claim = New Bot / gateway.
        </p>
      </PlayerSeesNote>

      <section className="technik-panel technik-panel--live-config" style={{ marginTop: '1rem' }}>
        <span className="technik-pill technik-pill--live">kingdomWar</span>
        <h2>Harmonogram i claimy</h2>

        <div className="technik-field-block">
          <label className="technik-check">
            <input
              type="checkbox"
              checked={cfg.warDraft.enabled}
              onChange={(e) => cfg.setWarDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            Włącz przypomnienie o wojnie
          </label>
        </div>

        <label className="technik-field">
          <span>Godzina wojny (Warszawa, HH:MM)</span>
          <input
            type="time"
            value={cfg.warDraft.warAt}
            onChange={(e) => cfg.setWarDraft((prev) => ({ ...prev, warAt: e.target.value }))}
          />
        </label>

        <label className="technik-field">
          <span>Ile minut wcześniej wysłać PW</span>
          <input
            type="number"
            min={1}
            max={1440}
            value={cfg.warDraft.notifyMinutesBefore}
            onChange={(e) =>
              cfg.setWarDraft((prev) => ({
                ...prev,
                notifyMinutesBefore: Number(e.target.value),
              }))
            }
          />
          <span className="technik-help">
            {warNotifyAt
              ? 'Ping o ' + warNotifyAt + ' (Warszawa).'
              : 'Ustaw godzinę i minuty, żeby zobaczyć godzinę pingu.'}
          </span>
        </label>

        <label className="technik-field">
          <span>Ile postaci max może zadeklarować jedna osoba (1–20)</span>
          <input
            type="number"
            min={1}
            max={20}
            value={cfg.warDraft.maxClaimsPerUser}
            onChange={(e) =>
              cfg.setWarDraft((prev) => ({
                ...prev,
                maxClaimsPerUser: Number(e.target.value),
              }))
            }
          />
          <span className="technik-help">Domyślnie 3 postacie na osobę — tyle samo co przyciski claim w PW wojny.</span>
        </label>

        <label className="technik-field technik-field--message">
          <div className="technik-field-head">
            <span>Treść PW (żywy szablon PL)</span>
            <button
              type="button"
              className="technik-btn-ghost"
              onClick={() =>
                cfg.setWarDraft((prev) => ({ ...prev, messageTemplate: LIVELY_WAR_TEMPLATE }))
              }
            >
              Wstaw żywy szablon
            </button>
          </div>
          <textarea
            className="technik-message-template"
            rows={12}
            value={cfg.warDraft.messageTemplate}
            onChange={(e) =>
              cfg.setWarDraft((prev) => ({ ...prev, messageTemplate: e.target.value }))
            }
          />
          <span className="technik-help">
            Placeholdery z żywego harmonogramu: {'{{warAt}}'}, {'{{notifyMinutesBefore}}'}. New Bot
            wstawia wartości przy wysyłce — bez sekretów.
          </span>
        </label>

        <div className="technik-row" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="technik-test-dm-btn"
            disabled={cfg.busy || !cfg.canWrite}
            onClick={() => void cfg.runApply()}
          >
            {cfg.busy ? 'Zapisuję…' : 'Zapisz ustawienia wojny'}
          </button>
          {cfg.lastAction ? <span className="technik-muted">{cfg.lastAction}</span> : null}
        </div>
        {cfg.actionError ? (
          <p className="technik-error" role="alert" style={{ marginTop: '0.75rem' }}>
            {cfg.actionError}
          </p>
        ) : null}
      </section>

      <section className="technik-panel" style={{ marginTop: '1rem' }}>
        <h2>Testowa PW</h2>
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
            Wyślij testową PW (wojna)
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
          help="Zmiany możesz zapisać przyciskiem przy harmonogramie. Tutaj masz dodatkowo walidację, podgląd, historię i cofanie."
        />
      </div>
      {cfg.step === 'Validate' ? (
        <ul className="technik-message-list" style={{ marginTop: '0.75rem' }}>
          {cfg.validationMessages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
