'use client';

import { D060Controls } from './d060-controls';
import { HonestGap, PlayerSeesNote, ReactionsForbiddenNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

/**
 * Panels surface for Technika.
 * Live today: panel-test-enabled (capabilities) + modules.panels (guilds page).
 * New Bot panels routes (list/publish/refresh/delete) are NOT live yet (404) —
 * no fake Publish/Refresh/Delete buttons until feature-detect proves otherwise.
 */
export function TechnikPanelePage() {
  const cfg = useTechnikaConfig();

  return (
    <>
      <h1>Panele Discord (bot)</h1>
      <p className="technik-lead">
        Sterowanie tym, co bot publikuje jako panel Components V2 (lab{' '}
        <code>/panel-test</code>). Bez atrap przycisków publish — te endpointy New Bot jeszcze nie
        żyją (404).
      </p>

      <PlayerSeesNote>
        <p>
          Operator na guildii testowej woła <code>/panel-test</code> — na kanale pojawia się panel z
          przyciskami Odśwież / Usuń (potwierdzenie). Bot edytuje ten sam post, bez spamu. Wymaga:
          guildia włączona, <code>modules.panels</code> ON (w Discordach) oraz globalny{' '}
          <code>panel-test-enabled</code> po Apply.
        </p>
      </PlayerSeesNote>

      {cfg.hasPanelTestCap ? (
        <section className="technik-panel technik-panel--live-config" style={{ marginTop: '1rem' }}>
          <span className="technik-pill technik-pill--live">panel-test-enabled</span>
          <h2>Globalny włącznik lab</h2>
          <label className="technik-check">
            <input
              type="checkbox"
              checked={cfg.panelTestEnabled}
              onChange={(e) => cfg.setPanelTestEnabled(e.target.checked)}
            />
            Włącz komendę i interakcje <code>/panel-test</code>
          </label>
          <p className="technik-help">
            Zapisujesz do szkicu D-060 poniżej. Per-guild flagę „Panele” (
            <code>modules.panels</code>) ustawiasz w <a href="/technik/discordy">Discordach</a> —
            tylko Testowy może mieć włączony ruch.
          </p>
          <dl className="technik-kv" style={{ marginTop: '0.75rem' }}>
            <dt>Publikuj (dziś)</dt>
            <dd>
              komenda Discord <code>/panel-test</code> na guildii testowej (operator / Manage Guild)
            </dd>
            <dt>Odśwież / Usuń</dt>
            <dd>przyciski na samym panelu (edit in-place / confirm) — nie z tego WWW (jeszcze)</dd>
          </dl>
        </section>
      ) : (
        <HonestGap>
          <p>
            Capability <code>panel-test-enabled</code> nie jest w <code>GET /capabilities</code> —
            bez atrapy przełącznika.
          </p>
        </HonestGap>
      )}

      <HonestGap>
        <p>
          <strong>API paneli New Bot jeszcze nie live (404):</strong>{' '}
          <code>GET/POST .../guilds/{'{id}'}/panels*</code> oraz channels. Gdy gateway wystawi te
          trasy, Technika doda Publish / Refresh / Delete z feature-detect. Do tego czasu: tylko{' '}
          <code>panel-test-enabled</code> + <code>modules.panels</code> + komenda na Discordzie.
        </p>
      </HonestGap>

      <div style={{ marginTop: '1rem' }}>
        <ReactionsForbiddenNote />
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
          help="panel-test-enabled wchodzi przez D-060. modules.panels — zakładka Discordy."
        />
      </div>
      {cfg.actionError ? (
        <p className="technik-error" role="alert">
          {cfg.actionError}
        </p>
      ) : null}
    </>
  );
}
