'use client';

import { useCallback, useEffect, useState } from 'react';

import { D060Controls } from './d060-controls';
import {
  type PanelChannel,
  type PanelMessage,
  type PanelsApiStatus,
  deletePanelMessage,
  detectPanelsApi,
  fetchGuildPanels,
  fetchPanelChannels,
  postPanelPreview,
  postPanelPublish,
} from './panels-api';
import { TECHNIK_TEST_GUILD_ID } from './technika-config-api';
import { HonestGap, PageJobNote, PlayerSeesNote, ReactionsForbiddenNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

/**
 * Panele Discord — operable for Testowy.
 * Always: panel-test-enabled (D-060) + modules.panels hint (Discordy).
 * When New Bot panels API is live: channel picker + Publish / Odśwież listę / Usuń.
 */
export function TechnikPanelePage() {
  const cfg = useTechnikaConfig();
  const [apiStatus, setApiStatus] = useState<PanelsApiStatus>('checking');
  const [channels, setChannels] = useState<readonly PanelChannel[]>([]);
  const [channelId, setChannelId] = useState('');
  const [panels, setPanels] = useState<readonly PanelMessage[]>([]);
  const [opsMsg, setOpsMsg] = useState<string | null>(null);
  const [opsBusy, setOpsBusy] = useState(false);
  const [previewText, setPreviewText] = useState('');

  const guildId = TECHNIK_TEST_GUILD_ID;

  const reloadChannels = useCallback(async () => {
    const res = await fetchPanelChannels(guildId);
    if (!res.ok) {
      setChannels([]);
      setOpsMsg(
        'Kanały: ' + res.error + (res.detail ? ' — ' + res.detail : '') +
          ' (HTTP ' + String(res.status) + ')',
      );
      return;
    }
    setChannels(res.data.channels);
    setOpsMsg(null);
    setChannelId((prev) => {
      if (prev && res.data.channels.some((c) => c.id === prev)) return prev;
      const publishable = res.data.channels.find((c) => c.canPublish);
      return publishable?.id ?? res.data.channels[0]?.id ?? '';
    });
  }, [guildId]);

  const reloadPanels = useCallback(async (ch: string) => {
    if (!ch) {
      setPanels([]);
      return;
    }
    const res = await fetchGuildPanels(guildId, ch);
    if (!res.ok) {
      setPanels([]);
      setOpsMsg(
        'Lista paneli: ' + res.error + (res.detail ? ' — ' + res.detail : '') +
          ' (HTTP ' + String(res.status) + ')',
      );
      return;
    }
    setPanels(res.data.panels);
  }, [guildId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await detectPanelsApi(guildId);
      if (cancelled) return;
      setApiStatus(status);
      if (status === 'live') {
        await reloadChannels();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, reloadChannels]);

  useEffect(() => {
    if (apiStatus !== 'live' || !channelId) return;
    void reloadPanels(channelId);
  }, [apiStatus, channelId, reloadPanels]);

  const runPublish = async () => {
    setOpsMsg(null);
    if (!channelId) {
      setOpsMsg('Wybierz kanał tekstowy na Testowym.');
      return;
    }
    if (!cfg.canWrite) {
      setOpsMsg('Brak klucza Technika na WWW — nie da się opublikować.');
      return;
    }
    setOpsBusy(true);
    try {
      const res = await postPanelPublish({ guildId, channelId });
      if (!res.ok) {
        setOpsMsg(
          'Publish nieudany: ' + res.error + (res.detail ? ' — ' + res.detail : '') +
            ' (HTTP ' + String(res.status) + ')',
        );
        return;
      }
      setOpsMsg(
        'Opublikowano panel → msg ' +
          res.data.messageId +
          (res.data.jumpUrl ? ' · ' + res.data.jumpUrl : ''),
      );
      cfg.setLastAction('publish panel ' + res.data.messageId);
      await reloadPanels(channelId);
    } finally {
      setOpsBusy(false);
    }
  };

  const runPreview = async () => {
    setOpsMsg(null);
    if (!cfg.canWrite) {
      setOpsMsg('Brak klucza Technika na WWW — podgląd payloadu niedostępny.');
      return;
    }
    setOpsBusy(true);
    try {
      const res = await postPanelPreview(guildId);
      if (!res.ok) {
        setOpsMsg('Preview: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
        setPreviewText(JSON.stringify(res.body ?? { error: res.error }, null, 2));
        return;
      }
      setPreviewText(JSON.stringify(res.data, null, 2));
      setOpsMsg('Podgląd payloadu OK (bez wysyłki na kanał).');
    } finally {
      setOpsBusy(false);
    }
  };

  const runDelete = async (messageId: string) => {
    setOpsMsg(null);
    if (!channelId) return;
    if (!cfg.canWrite) {
      setOpsMsg('Brak klucza Technika na WWW — nie da się usunąć.');
      return;
    }
    setOpsBusy(true);
    try {
      const res = await deletePanelMessage({ guildId, channelId, messageId });
      if (!res.ok) {
        setOpsMsg(
          'Usuwanie: ' + res.error + (res.detail ? ' — ' + res.detail : '') +
            ' (HTTP ' + String(res.status) + ')',
        );
        return;
      }
      setOpsMsg('Usunięto panel ' + res.data.messageId + '.');
      cfg.setLastAction('delete panel ' + res.data.messageId);
      await reloadPanels(channelId);
    } finally {
      setOpsBusy(false);
    }
  };

  const refreshList = async () => {
    setOpsBusy(true);
    setOpsMsg(null);
    try {
      await reloadChannels();
      if (channelId) await reloadPanels(channelId);
      setOpsMsg('Odświeżono listę kanałów i paneli.');
    } finally {
      setOpsBusy(false);
    }
  };

  return (
    <>
      <h1>Panele Discord (bot)</h1>
      <p className="technik-lead">
        Lab Components V2 na <strong>Testowym</strong>. Najpierw włącz globalny lab + moduł guildii,
        Apply — potem publikuj panel z tej strony (albo komendą <code>/panel-test</code>).
      </p>

      
      <PageJobNote>
        <p>
          Laboratorium panelu testowego (/panel-test): publikacja i odświeżanie bez ruszania
          produkcyjnego Centrum. Do codziennego hubu użyj Centrum panel.
        </p>
      </PageJobNote>
<PlayerSeesNote>
        <p>
          Na kanale guildii testowej pojawia się panel z przyciskami Odśwież / Usuń. Bot edytuje ten
          sam post (bez spamu). Wymaga: guildia włączona, <code>modules.panels</code> ON w{' '}
          <a href="/technik/discordy">Discordach</a>, oraz <code>panel-test-enabled</code> po Apply.
        </p>
      </PlayerSeesNote>

      {cfg.hasPanelTestCap ? (
        <section className="technik-panel technik-panel--live-config" style={{ marginTop: '1rem' }}>
          <span className="technik-pill technik-pill--live">panel-test-enabled</span>
          <h2>1. Globalny włącznik lab</h2>
          <label className="technik-check">
            <input
              type="checkbox"
              checked={cfg.panelTestEnabled}
              onChange={(e) => cfg.setPanelTestEnabled(e.target.checked)}
            />
            Włącz komendę i interakcje <code>/panel-test</code>
          </label>
          <p className="technik-help">
            Zapisujesz do szkicu D-060 poniżej → Sprawdź → Zobacz → <strong>Zapisz i włącz</strong>.
            Per-guild „Panele” ustawiasz w Discordach (tylko Testowy).
          </p>
          <dl className="technik-kv" style={{ marginTop: '0.75rem' }}>
            <dt>Guildia</dt>
            <dd>
              Testowy <code>{guildId}</code> — HARD STOP na Destiled / Sojusz
            </dd>
            <dt>Moduł guildii</dt>
            <dd>
              <code>modules.panels</code> w <a href="/technik/discordy">Discordach</a>
            </dd>
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

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <div className="technik-panel-head">
          <h2>2. Publikacja z WWW</h2>
          <span
            className={
              apiStatus === 'live'
                ? 'technik-pill technik-pill--live'
                : apiStatus === 'checking'
                  ? 'technik-pill technik-pill--pending'
                  : 'technik-pill technik-pill--pending'
            }
          >
            {apiStatus === 'checking'
              ? 'sprawdzam API…'
              : apiStatus === 'live'
                ? 'PANELS API LIVE'
                : 'API niedostępne (404)'}
          </span>
        </div>

        {apiStatus === 'checking' ? (
          <p className="technik-muted">Sprawdzam <code>/api/technik/panels/channels</code>…</p>
        ) : null}

        {apiStatus === 'unavailable' ? (
          <HonestGap>
            <p>
              <strong>API paneli New Bot jeszcze nie live (404):</strong>{' '}
              <code>GET/POST /discord/v1/panels*</code>. Do tego czasu działają: globalny włącznik
              powyżej + <code>modules.panels</code> w Discordach + komenda <code>/panel-test</code>{' '}
              na Discordzie. Publish / Usuń z WWW włączą się automatycznie po feature-detect.
            </p>
          </HonestGap>
        ) : null}

        {apiStatus === 'live' ? (
          <>
            <p className="technik-help">
              Tylko Testowy. Wybierz kanał → Opublikuj. Odśwież listę po publikacji. Usuń kasuje
              wiadomość bota na kanale.
            </p>
            <label className="technik-field" style={{ marginTop: '0.65rem' }}>
              <span>Kanał na Testowym</span>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                disabled={opsBusy || channels.length === 0}
              >
                {channels.length === 0 ? (
                  <option value="">Brak kanałów (bot offline / brak uprawnień)</option>
                ) : (
                  channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                      {c.canPublish ? '' : ' (bez publish)'} · {c.id}
                    </option>
                  ))
                )}
              </select>
            </label>

            <div className="technik-row" style={{ marginTop: '0.85rem' }}>
              <button
                type="button"
                className="technik-test-dm-btn"
                disabled={opsBusy || !cfg.canWrite || !channelId}
                onClick={() => void runPublish()}
              >
                {opsBusy ? '…' : 'Opublikuj panel'}
              </button>
              <button
                type="button"
                className="technik-btn-ghost"
                disabled={opsBusy || !cfg.canWrite}
                onClick={() => void runPreview()}
              >
                Podgląd payloadu
              </button>
              <button
                type="button"
                className="technik-btn-ghost"
                disabled={opsBusy}
                onClick={() => void refreshList()}
              >
                Odśwież listę
              </button>
            </div>

            {opsMsg ? (
              <p className="technik-test-status" role="status" style={{ marginTop: '0.65rem' }}>
                {opsMsg}
              </p>
            ) : null}

            {previewText ? (
              <code className="technik-code technik-code--tall" style={{ marginTop: '0.75rem' }}>
                {previewText}
              </code>
            ) : null}

            <h3 style={{ marginTop: '1rem' }}>Panele na wybranym kanale</h3>
            {panels.length === 0 ? (
              <p className="technik-muted">Brak wykrytych paneli bota na tym kanale.</p>
            ) : (
              <ul className="technik-message-list">
                {panels.map((panel) => (
                  <li key={panel.messageId}>
                    <code>{panel.messageId}</code>
                    {panel.isComponentsV2 ? ' · V2' : ' · legacy'}
                    {panel.jumpUrl ? (
                      <>
                        {' '}
                        ·{' '}
                        <a href={panel.jumpUrl} target="_blank" rel="noreferrer">
                          otwórz na Discordzie
                        </a>
                      </>
                    ) : null}{' '}
                    <button
                      type="button"
                      className="technik-btn-ghost"
                      disabled={opsBusy || !cfg.canWrite}
                      onClick={() => void runDelete(panel.messageId)}
                    >
                      Usuń
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>

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
          busy={cfg.busy || opsBusy}
          lastAction={cfg.lastAction}
          gatewayLabel={cfg.gatewayLabel}
          onValidate={() => void cfg.runValidate()}
          onPreview={() => void cfg.runPreview()}
          onApply={() => void cfg.runApply()}
          onRollback={() => void cfg.runRollback()}
          onRefresh={() => void cfg.load()}
          help="panel-test-enabled wchodzi przez D-060. modules.panels — zakładka Discordy. Publish z WWW nie wymaga Apply (osobny endpoint)."
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
