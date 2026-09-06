'use client';

import { useCallback, useEffect, useState } from 'react';

import { loadAppearance, serializeCustomButtons } from './appearance';
import {
  CENTRUM_HUB_ACTIONS,
  loadEnabledHubActions,
  mapHubActionsForPublish,
  saveEnabledHubActions,
  type CentrumHubActionId,
} from './centrum-hub-actions';
import {
  type PanelChannel,
  type PanelMessage,
  type PanelsApiStatus,
  deletePanelMessage,
  detectPanelsApi,
  fetchGuildPanels,
  fetchPanelChannels,
  postPanelPublish,
  postPanelRefresh,
} from './panels-api';
import { channelLabel, loadPublishChannels } from './publish-channels';
import { TECHNIK_TEST_GUILD_ID } from './technika-config-api';
import { HonestGap, PageJobNote, PlayerSeesNote, ReactionsForbiddenNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

/**
 * Centrum panel — which hub actions are ON + publish/refresh on linked hub channel.
 */
export function TechnikCentrumPage() {
  const cfg = useTechnikaConfig();
  const guildId = TECHNIK_TEST_GUILD_ID;
  const [apiStatus, setApiStatus] = useState<PanelsApiStatus>('checking');
  const [channels, setChannels] = useState<readonly PanelChannel[]>([]);
  const [panels, setPanels] = useState<readonly PanelMessage[]>([]);
  const [opsMsg, setOpsMsg] = useState<string | null>(null);
  const [opsBusy, setOpsBusy] = useState(false);
  const [enabled, setEnabled] = useState<CentrumHubActionId[]>([]);
  const [hubChannelId, setHubChannelId] = useState('');

  useEffect(() => {
    setEnabled(loadEnabledHubActions());
    const map = loadPublishChannels(guildId);
    setHubChannelId(map.centrumHub ?? '');
  }, [guildId]);

  const persistEnabled = (next: CentrumHubActionId[]) => {
    setEnabled(next);
    saveEnabledHubActions(next);
  };

  const toggle = (id: CentrumHubActionId) => {
    const set = new Set(enabled);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    persistEnabled([...set]);
  };

  const reload = useCallback(async () => {
    const status = await detectPanelsApi(guildId);
    setApiStatus(status);
    if (status !== 'live') {
      setChannels([]);
      setPanels([]);
      return;
    }
    const chRes = await fetchPanelChannels(guildId);
    if (!chRes.ok) {
      setOpsMsg('Nie udało się pobrać kanałów: ' + chRes.error + (chRes.detail ? ' — ' + chRes.detail : ''));
      return;
    }
    setChannels(chRes.data.channels);
  }, [guildId]);

  const reloadPanels = useCallback(
    async (ch: string) => {
      if (!ch) {
        setPanels([]);
        return;
      }
      const res = await fetchGuildPanels(guildId, ch);
      if (!res.ok) {
        setPanels([]);
        setOpsMsg('Nie udało się pobrać paneli: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
        return;
      }
      setPanels(res.data.panels);
    },
    [guildId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (apiStatus === 'live' && hubChannelId) void reloadPanels(hubChannelId);
  }, [apiStatus, hubChannelId, reloadPanels]);

  const runPublish = async () => {
    if (!hubChannelId) {
      setOpsMsg('Najpierw wybierz kanał Centrum w zakładce Kanały.');
      return;
    }
    if (!cfg.canWrite) {
      setOpsMsg('Brak sekretu Technika na serwerze — publikacja zablokowana.');
      return;
    }
    if (enabled.length === 0) {
      setOpsMsg('Włącz choć jedną akcję hubu przed publikacją.');
      return;
    }
    setOpsBusy(true);
    setOpsMsg(null);
    try {
      const appearance = loadAppearance();
      const res = await postPanelPublish({
        guildId,
        channelId: hubChannelId,
        kind: 'centrum',
        title: appearance.panelTitle,
        description: appearance.panelDescription,
        accentHex: appearance.accentHex,
        includeBanner: appearance.includeBanner,
        bannerUrl: appearance.bannerUrl,
        enabledActions: mapHubActionsForPublish(enabled),
        customButtons: serializeCustomButtons(appearance.customButtons),
      });
      if (!res.ok) {
        setOpsMsg(
          'Publikacja nieudana: ' +
            res.error +
            (res.detail ? ' — ' + res.detail : '') +
            ' (HTTP ' +
            String(res.status) +
            '). Jeśli New Bot nie zna jeszcze pól wyglądu (title/accent/enabledActions), to uczciwy błąd — nie lokalny teatr.',
        );
        return;
      }
      setOpsMsg(
        'Opublikowano panel Centrum (tytuł, opis, akcent, banner, akcje w payloadzie)' +
          (res.data.jumpUrl ? ' — otwórz na Discordzie: ' + res.data.jumpUrl : '.'),
      );
      cfg.setLastAction('publish centrum');
      await reloadPanels(hubChannelId);
    } finally {
      setOpsBusy(false);
    }
  };

  const runRefresh = async (panelId: string) => {
    if (!cfg.canWrite) return;
    setOpsBusy(true);
    try {
      const res = await postPanelRefresh({ guildId, panelId });
      if (!res.ok) {
        setOpsMsg('Odświeżanie nieudane: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
        return;
      }
      setOpsMsg('Odświeżono panel na Discordzie (ta sama wiadomość).');
      await reloadPanels(hubChannelId);
    } finally {
      setOpsBusy(false);
    }
  };

  const runDelete = async (messageId: string, ch: string) => {
    if (!cfg.canWrite) return;
    const ok = window.confirm('Usunąć ten panel z Discorda? Tej operacji nie cofniesz z WWW.');
    if (!ok) return;
    setOpsBusy(true);
    try {
      const res = await deletePanelMessage({
        guildId,
        channelId: ch || hubChannelId,
        messageId,
      });
      if (!res.ok) {
        setOpsMsg('Usuwanie nieudane: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
        return;
      }
      setOpsMsg('Usunięto panel z Discorda.');
      await reloadPanels(hubChannelId);
    } finally {
      setOpsBusy(false);
    }
  };

  const hubLabel = channelLabel(hubChannelId || undefined, channels);
  const onLabels = CENTRUM_HUB_ACTIONS.filter((a) => enabled.includes(a.id)).map((a) => a.label);

  return (
    <>
      <h1>Centrum panel</h1>
      <p className="technik-lead">
        Wybierz, które akcje hubu są włączone, i opublikuj / odśwież panel na powiązanym kanale
        Centrum.
      </p>

      <PageJobNote>
        <p>
          Tu zarządzasz funkcjami panelu Centrum (co jest włączone) oraz publikacją na Discordzie.
          Wygląd (tytuł, opis, banner) ustawiasz w Wygląd postów; kanał hub — w Kanałach.
        </p>
      </PageJobNote>

      <PlayerSeesNote>
        <p>
          Gracz widzi panel z przyciskami:{' '}
          {onLabels.length ? onLabels.join(' · ') : '— (włącz choć jedną akcję poniżej)'}. Po kliknięciu
          dostaje prywatną odpowiedź — bez spamu na kanale.
        </p>
      </PlayerSeesNote>

      <section className="technik-panel" style={{ marginTop: '1rem' }}>
        <h2>Kanał Centrum</h2>
        <dl className="technik-kv">
          <dt>Powiązany kanał</dt>
          <dd>
            {hubChannelId ? (
              <strong>{hubLabel}</strong>
            ) : (
              <span className="technik-muted">nie ustawiony</span>
            )}{' '}
            · <a href="/technik/kanaly">Zmień w Kanałach</a>
          </dd>
          <dt>Wygląd</dt>
          <dd>
            <a href="/technik/wyglad">Tytuł, opis, akcent, bannerUrl, własne przyciski →</a>
            <br />
            <span className="technik-muted">
              Opublikuj wyśle title/description/accentHex/includeBanner/bannerUrl/enabledActions/customButtons (bez auto-publikacji).
            </span>
          </dd>
        </dl>
      </section>

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <h2>Akcje hubu (włącz / wyłącz)</h2>
        <p className="technik-help">
          Cztery podstawowe etykiety są ustalone produktowo. „Dla mnie” i „Profil” są opcjonalne.
        </p>
        <ul className="technik-module-list">
          {CENTRUM_HUB_ACTIONS.map((a) => (
            <li key={a.id}>
              <label className="technik-check technik-check--block">
                <input
                  type="checkbox"
                  checked={enabled.includes(a.id)}
                  onChange={() => toggle(a.id)}
                />
                <span>
                  <strong>
                    {a.label}
                    {!a.core ? ' · opcjonalne' : ''}
                  </strong>
                  <small className="technik-help">{a.description}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <div className="technik-panel-head">
          <h2>Publikacja na Discordzie</h2>
          <span
            className={
              apiStatus === 'live' ? 'technik-pill technik-pill--live' : 'technik-pill technik-pill--pending'
            }
          >
            {apiStatus === 'checking'
              ? 'Sprawdzam API…'
              : apiStatus === 'live'
                ? 'API gotowe'
                : 'API jeszcze niedostępne'}
          </span>
        </div>

        {apiStatus === 'unavailable' ? (
          <HonestGap>
            <p>
              Endpointy paneli jeszcze nie odpowiadają. Formularz akcji i powiązanie kanału już
              działają lokalnie — przyciski <strong>Opublikuj</strong> / <strong>Odśwież</strong>{' '}
              włączą się, gdy API będzie live.
            </p>
          </HonestGap>
        ) : null}

        {apiStatus === 'live' ? (
          <>
            <div className="technik-row" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="technik-test-dm-btn"
                disabled={opsBusy || !cfg.canWrite || !hubChannelId}
                onClick={() => void runPublish()}
              >
                {opsBusy ? '…' : 'Opublikuj'}
              </button>
              <button
                type="button"
                className="technik-btn-ghost"
                disabled={opsBusy || !hubChannelId}
                onClick={() => void reload().then(() => reloadPanels(hubChannelId))}
              >
                Odśwież listę
              </button>
            </div>
            {!hubChannelId ? (
              <p className="technik-muted">Ustaw kanał Centrum w zakładce Kanały, żeby publikować.</p>
            ) : null}
            {!cfg.canWrite ? (
              <p className="technik-muted">Publikacja wymaga sekretu Technika po stronie serwera.</p>
            ) : null}
            {opsMsg ? (
              <p className="technik-test-status" role="status">
                {opsMsg}
              </p>
            ) : null}
            <h3 style={{ marginTop: '1rem' }}>Panele na kanale Centrum</h3>
            {panels.length === 0 ? (
              <p className="technik-muted">Brak opublikowanych paneli na tym kanale.</p>
            ) : (
              <ul className="technik-message-list">
                {panels.map((p) => (
                  <li key={p.messageId}>
                    <span>
                      Panel {p.kind === 'lab' ? 'lab' : 'Centrum'}
                      {p.jumpUrl ? (
                        <>
                          {' '}
                          ·{' '}
                          <a href={p.jumpUrl} target="_blank" rel="noreferrer">
                            Otwórz na Discordzie
                          </a>
                        </>
                      ) : null}
                    </span>{' '}
                    <button
                      type="button"
                      className="technik-btn-ghost"
                      disabled={opsBusy || !cfg.canWrite}
                      onClick={() => void runRefresh(p.panelId ?? p.messageId)}
                    >
                      Odśwież
                    </button>{' '}
                    <button
                      type="button"
                      className="technik-btn-ghost"
                      disabled={opsBusy || !cfg.canWrite}
                      onClick={() => void runDelete(p.messageId, p.channelId ?? hubChannelId)}
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

      <ReactionsForbiddenNote />
    </>
  );
}
