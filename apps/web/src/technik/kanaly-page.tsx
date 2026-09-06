'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  type PanelChannel,
  type PanelsApiStatus,
  detectPanelsApi,
  fetchPanelChannels,
} from './panels-api';
import {
  PUBLISH_PURPOSES,
  channelLabel,
  loadPublishChannels,
  savePublishChannels,
  setPublishChannel,
  type PublishChannelsMap,
  type PublishPurposeId,
} from './publish-channels';
import {
  TECHNIK_LOCKED_GUILD_IDS,
  TECHNIK_TEST_GUILD_ID,
  KNOWN_GUILD_NAMES,
  isTechnikGuildEditable,
  putConfigDraft,
} from './technika-config-api';
import { HonestGap, PageJobNote, PlayerSeesNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

/**
 * Kanały — purpose → channel rows (publishChannels).
 */
export function TechnikKanalyPage() {
  const cfg = useTechnikaConfig();
  const guildId = TECHNIK_TEST_GUILD_ID;
  const editable = isTechnikGuildEditable(guildId);
  const [apiStatus, setApiStatus] = useState<PanelsApiStatus>('checking');
  const [channels, setChannels] = useState<readonly PanelChannel[]>([]);
  const [map, setMap] = useState<PublishChannelsMap>({});
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setMsg(null);
    const status = await detectPanelsApi(guildId);
    setApiStatus(status);
    if (status !== 'live') {
      setChannels([]);
      return;
    }
    const res = await fetchPanelChannels(guildId);
    if (!res.ok) {
      setChannels([]);
      setMsg(
        'Nie udało się pobrać kanałów: ' +
          res.error +
          (res.detail ? ' — ' + res.detail : ''),
      );
      return;
    }
    setChannels(res.data.channels);
  }, [guildId]);

  useEffect(() => {
    const local = loadPublishChannels(guildId);
    const fromCfg =
      cfg.snapshot &&
      typeof (cfg.snapshot.config as { publishChannels?: unknown }).publishChannels === 'object'
        ? ((cfg.snapshot.config as { publishChannels?: Record<string, string> }).publishChannels ?? {})
        : {};
    const merged = { ...local, ...fromCfg };
    setMap(merged);
    // publishChannels from config (capability) — prefer gateway when present
    if (Object.keys(fromCfg).length) {
      savePublishChannels(guildId, merged);
    }
    void reload();
  }, [guildId, reload, cfg.snapshot]);

  const onPick = (purpose: PublishPurposeId, channelId: string) => {
    if (!editable) {
      setMsg('Tylko serwer Testowy — Destiled/Sojusz bez zapisu kanałów do czasu Apply Owner.');
      return;
    }
    const next = setPublishChannel(guildId, purpose, channelId);
    setMap(next);
    const purposeLabel = PUBLISH_PURPOSES.find((p) => p.id === purpose)?.label ?? purpose;
    setMsg(
      channelId
        ? 'Zapisano: ' + purposeLabel + ' → ' + channelLabel(channelId, channels) + ' (szkic lokalny).'
        : 'Wyczyszczono: ' + purposeLabel + '.',
    );
    const hasPubCap = cfg.capabilities.some((c) => c.id === 'publishChannels');
    if (hasPubCap && cfg.canWrite) {
      void (async () => {
        const base = cfg.buildDraftPartial();
        const res = await putConfigDraft({ ...base, publishChannels: next });
        if (res.ok) {
          setMsg(
            (channelId
              ? 'Zapisano: ' + purposeLabel + ' → ' + channelLabel(channelId, channels)
              : 'Wyczyszczono: ' + purposeLabel) + ' · wrzucono do szkicu D-060 (publishChannels).',
          );
          cfg.setLastAction('draft publishChannels');
          cfg.setStep('Draft');
        }
      })();
    }
  };

  return (
    <>
      <h1>Kanały</h1>
      <p className="technik-lead">
        Powiąż cel publikacji z konkretnym kanałem Discorda. Centrum panel czyta kanał „Centrum”.
      </p>

      <PageJobNote>
        <p>
          Jedna tabela: po lewej po co bot publikuje, po prawej na który kanał. Bez surowych ID w
          etykietach — wybierasz nazwę kanału z listy.
        </p>
      </PageJobNote>

      <PlayerSeesNote>
        <p>
          Gracz widzi posty i panel Centrum tylko na kanałach, które tu przypiszesz. Inne kanały
          bot zostawia w spokoju.
        </p>
      </PlayerSeesNote>

      <section className="technik-panel" style={{ marginTop: '1rem' }}>
        <div className="technik-panel-head">
          <h2>Serwer</h2>
          <span className="technik-pill technik-pill--live">Testowy</span>
        </div>
        <dl className="technik-kv">
          <dt>Aktywny</dt>
          <dd>{KNOWN_GUILD_NAMES[guildId] ?? 'Testowy'}</dd>
          <dt>Zablokowane (prod)</dt>
          <dd>
            {TECHNIK_LOCKED_GUILD_IDS.map((id) => (
              <span key={id} style={{ display: 'block' }}>
                {KNOWN_GUILD_NAMES[id] ?? 'guildia'} — tylko podgląd, zero publish
              </span>
            ))}
          </dd>
          <dt>Lista kanałów</dt>
          <dd>
            {apiStatus === 'checking'
              ? 'sprawdzam…'
              : apiStatus === 'live'
                ? 'gotowa (' + String(channels.length) + ')'
                : 'API jeszcze niedostępne'}
          </dd>
        </dl>
      </section>

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <div className="technik-panel-head">
          <h2>Cel → kanał</h2>
          <button type="button" className="technik-btn-ghost" onClick={() => void reload()}>
            Odśwież listę
          </button>
        </div>

        {apiStatus === 'unavailable' ? (
          <HonestGap>
            <p>
              Lista kanałów z Discorda jeszcze nie wraca z API. Możesz przygotować mapowanie, gdy
              lista będzie live — do tego czasu wiersze poniżej są gotowe strukturalnie.
            </p>
          </HonestGap>
        ) : null}

        <ul className="technik-purpose-list">
          {PUBLISH_PURPOSES.map((purpose) => {
            const selected = map[purpose.id] ?? '';
            return (
              <li key={purpose.id} className="technik-purpose-row">
                <div className="technik-purpose-row__meta">
                  <strong>{purpose.label}</strong>
                  <small className="technik-help">{purpose.description}</small>
                  <span className="technik-muted">
                    Teraz: {channelLabel(selected || undefined, channels)}
                  </span>
                </div>
                <label className="technik-field technik-purpose-row__pick">
                  <span className="sr-only">Kanał dla {purpose.label}</span>
                  <select
                    value={selected}
                    disabled={!editable || apiStatus !== 'live' || channels.length === 0}
                    onChange={(e) => onPick(purpose.id, e.target.value)}
                  >
                    <option value="">— nie wybrano —</option>
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        #{ch.name}
                        {!ch.canPublish ? ' (bot bez publish)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>

        {msg ? (
          <p className="technik-test-status" role="status" style={{ marginTop: '0.65rem' }}>
            {msg}
          </p>
        ) : null}
      </section>

      <HonestGap>
        <p>
          Zapis jest lokalnym szkicem Technika. Trwały zapis w activity-admin / Apply podłączymy, gdy
          API guild channels będzie stabilne. Do tego czasu Centrum panel czyta kanał „Centrum” z
          tego szkicu.
        </p>
      </HonestGap>
    </>
  );
}
