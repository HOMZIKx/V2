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

const GUILD_OPTIONS = [
  { id: TECHNIK_TEST_GUILD_ID, name: KNOWN_GUILD_NAMES[TECHNIK_TEST_GUILD_ID] ?? 'Testowy' },
  ...TECHNIK_LOCKED_GUILD_IDS.map((id) => ({
    id,
    name: KNOWN_GUILD_NAMES[id] ?? 'guildia',
  })),
];

/**
 * Kanały — purpose → channel rows (publishChannels).
 */
export function TechnikKanalyPage() {
  const cfg = useTechnikaConfig();
  const [guildId, setGuildId] = useState(TECHNIK_TEST_GUILD_ID);
  const editable = isTechnikGuildEditable(guildId);
  const [apiStatus, setApiStatus] = useState<PanelsApiStatus>('checking');
  const [channels, setChannels] = useState<readonly PanelChannel[]>([]);
  const [map, setMap] = useState<PublishChannelsMap>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [channelsErr, setChannelsErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setMsg(null);
    setChannelsErr(null);
    const status = await detectPanelsApi(guildId);
    setApiStatus(status);
    if (status !== 'live') {
      setChannels([]);
      return;
    }
    const res = await fetchPanelChannels(guildId);
    if (!res.ok) {
      setChannels([]);
      // 401/403 with secret missing elsewhere = show honest auth error, NOT "API not ready"
      const hint =
        res.status === 401 || res.status === 403
          ? 'Brak uprawnień / sekretu — proxy Technika powinien dołączyć x-technika-secret.'
          : res.status === 503
            ? 'Sekret Technika nieustawiony na serwerze WWW (DISCORD_TECHNIKA_SHARED_SECRET).'
            : res.detail || '';
      setChannelsErr(
        'Nie udało się pobrać kanałów: ' + res.error + (hint ? ' — ' + hint : '') + ' (HTTP ' + String(res.status) + ')',
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
    const merged = editable ? { ...local, ...fromCfg } : { ...fromCfg, ...local };
    setMap(merged);
    if (editable && Object.keys(fromCfg).length) {
      savePublishChannels(guildId, merged);
    }
    void reload();
  }, [guildId, reload, cfg.snapshot, editable]);

  const onPick = (purpose: PublishPurposeId, channelId: string) => {
    if (!editable) {
      setMsg('Tylko serwer Testowy — Destiled/Sojusz bez zapisu kanałów (podgląd).');
      return;
    }
    const next = setPublishChannel(guildId, purpose, channelId);
    setMap(next);
    const purposeLabel = PUBLISH_PURPOSES.find((p) => p.id === purpose)?.label ?? purpose;
    setMsg(
      channelId
        ? 'Zapisano lokalnie: ' + purposeLabel + ' → ' + channelLabel(channelId, channels) + '.'
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
              : 'Wyczyszczono: ' + purposeLabel) +
              ' · szkic D-060 (publishChannels). Przejdź do Przeglądu i kliknij Apply.',
          );
          cfg.setLastAction('draft publishChannels');
          cfg.setStep('Draft');
        } else {
          setMsg(
            'Lokalnie OK, ale szkic D-060: ' +
              res.error +
              (res.detail ? ' — ' + res.detail : ''),
          );
        }
      })();
    }
  };

  const pushDraft = async () => {
    if (!editable) {
      setMsg('Zapis szkicu tylko na Testowym.');
      return;
    }
    if (!cfg.canWrite) {
      setMsg('Brak sekretu Technika — nie zapiszę publishChannels do szkicu.');
      return;
    }
    const base = cfg.buildDraftPartial();
    const res = await putConfigDraft({ ...base, publishChannels: map });
    if (!res.ok) {
      setMsg('Szkic: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
      return;
    }
    cfg.setLastAction('draft publishChannels');
    cfg.setStep('Draft');
    setMsg('Szkic D-060 zaktualizowany (publishChannels). Otwórz Przegląd → Apply.');
    await cfg.load();
  };

  const guildName = KNOWN_GUILD_NAMES[guildId] ?? 'serwer';

  return (
    <>
      <h1>Kanały</h1>
      <p className="technik-lead">
        Powiąż cel publikacji z konkretnym kanałem Discorda. Centrum panel czyta kanał „Centrum”.
      </p>

      <PageJobNote>
        <p>
          Jedna tabela: po lewej po co bot publikuje, po prawej na który kanał. Bez surowych ID w
          etykietach — wybierasz nazwę kanału z listy (#nazwa).
        </p>
      </PageJobNote>

      <PlayerSeesNote>
        <p>
          Gracz widzi posty i panel Centrum tylko na kanałach, które tu przypiszesz. Inne kanały bot
          zostawia w spokoju.
        </p>
      </PlayerSeesNote>

      <section className="technik-panel" style={{ marginTop: '1rem' }}>
        <div className="technik-panel-head">
          <h2>Serwer</h2>
          <span
            className={
              editable ? 'technik-pill technik-pill--live' : 'technik-pill technik-pill--pending'
            }
          >
            {editable ? 'Edycja' : 'Tylko podgląd'}
          </span>
        </div>
        <label className="technik-field">
          <span>Wybierz serwer</span>
          <select
            value={guildId}
            onChange={(e) => {
              setGuildId(e.target.value);
              setMsg(null);
            }}
          >
            {GUILD_OPTIONS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.id === TECHNIK_TEST_GUILD_ID ? ' · edytowalny' : ' · zablokowany (prod)'}
              </option>
            ))}
          </select>
        </label>
        <dl className="technik-kv">
          <dt>Aktywny</dt>
          <dd>{guildName}</dd>
          <dt>Lista kanałów</dt>
          <dd>
            {apiStatus === 'checking'
              ? 'sprawdzam…'
              : apiStatus === 'live'
                ? 'API live · ' + String(channels.length) + ' kanałów'
                : 'Endpoint niedostępny (404/501) — to nie 401'}
          </dd>
        </dl>
        {!editable ? (
          <p className="technik-help">
            Destiled / Sojusz: możesz zobaczyć listę (gdy API pozwoli), ale zapis publishChannels i
            publish są zablokowane z Technika.
          </p>
        ) : null}
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
              Endpoint listy kanałów nie odpowiada (404/501). To nie jest „brak sekretu” — gdy trasa
              wróci, wiersze poniżej odżyją z pickerami #nazwa.
            </p>
          </HonestGap>
        ) : null}

        {channelsErr ? (
          <p className="technik-error" role="alert">
            {channelsErr}
          </p>
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

        <div className="technik-row" style={{ marginTop: '0.85rem' }}>
          <button
            type="button"
            className="technik-test-dm-btn"
            disabled={!editable || !cfg.canWrite}
            onClick={() => void pushDraft()}
          >
            Zapisz do szkicu D-060
          </button>
          <a className="technik-test-dm-btn" href="/technik">
            Przegląd → Apply
          </a>
        </div>

        {msg ? (
          <p className="technik-test-status" role="status" style={{ marginTop: '0.65rem' }}>
            {msg}
          </p>
        ) : null}
      </section>

      {apiStatus === 'live' ? (
        <p className="technik-help" style={{ marginTop: '1rem' }}>
          Po zapisie mapowania wejdź w <a href="/technik">Przegląd</a> i kliknij Apply — bez
          auto-publikacji. Centrum czyta kanał „Centrum” z tego mapowania.
        </p>
      ) : (
        <HonestGap>
          <p>
            Gdy API kanałów będzie live, zapiszesz mapowanie do szkicu i włączysz je Apply w
            Przeglądzie. Do tego czasu lokalny szkic i tak zasila Centrum (kanał hub).
          </p>
        </HonestGap>
      )}
    </>
  );
}
