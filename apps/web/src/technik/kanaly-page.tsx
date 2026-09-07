'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  detectPanelsApi,
  fetchPanelChannels,
  type PanelChannel,
  type PanelsApiStatus,
} from './panels-api';
import {
  PUBLISH_PURPOSES,
  channelLabel,
  loadAppWebsiteUrl,
  loadPublishChannels,
  saveAppWebsiteUrl,
  savePublishChannels,
  setPublishChannel,
  type PublishChannelsMap,
  type PublishPurposeId,
} from './publish-channels';
import {
  KNOWN_GUILD_NAMES,
  TECHNIK_LOCKED_GUILD_IDS,
  TECHNIK_TEST_GUILD_ID,
  isTechnikGuildEditable,
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

function looksLikeHttpsUrl(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

type GuildPublishDraftResult =
  { readonly ok: true } | { readonly ok: false; readonly error: string; readonly detail?: string };

async function putGuildPublishDraft(
  guildId: string,
  publishChannels: PublishChannelsMap,
  appWebsiteUrl: string,
): Promise<GuildPublishDraftResult> {
  try {
    const res = await fetch(`/api/technik/guilds/${encodeURIComponent(guildId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        publishChannels,
        appWebsiteUrl: appWebsiteUrl.trim(),
      }),
      cache: 'no-store',
    });

    const raw = await res.text();
    let parsed: Record<string, unknown> = {};
    if (raw.trim()) {
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        parsed = { detail: raw.slice(0, 200) };
      }
    }

    if (!res.ok) {
      const error = typeof parsed.error === 'string' ? parsed.error : `http_${String(res.status)}`;
      const detail =
        typeof parsed.detail === 'string'
          ? parsed.detail
          : typeof parsed.hint === 'string'
            ? parsed.hint
            : undefined;
      return detail ? { ok: false, error, detail } : { ok: false, error };
    }

    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown';
    return { ok: false, error: 'network_error', detail };
  }
}

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
  const [appWebsiteUrl, setAppWebsiteUrl] = useState('');
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
      const hint =
        res.status === 401 || res.status === 403
          ? 'Brak uprawnień / sekretu — proxy Technika powinien dołączyć x-technika-secret.'
          : res.status === 503
            ? 'Sekret Technika nieustawiony na serwerze WWW (DISCORD_TECHNIKA_SHARED_SECRET).'
            : res.detail || '';
      setChannelsErr(
        'Nie udało się pobrać kanałów: ' +
          res.error +
          (hint ? ' — ' + hint : '') +
          ' (HTTP ' +
          String(res.status) +
          ')',
      );
      return;
    }
    setChannels(res.data.channels);
  }, [guildId]);

  useEffect(() => {
    const local = loadPublishChannels(guildId);
    const localUrl = loadAppWebsiteUrl(guildId);
    const snapCfg = cfg.snapshot?.config as
      | {
          publishChannels?: Record<string, string>;
          appWebsiteUrl?: string;
          websiteUrl?: string;
          guilds?: Record<
            string,
            {
              publishChannels?: Record<string, string>;
              appWebsiteUrl?: string;
            }
          >;
        }
      | undefined;

    const guildCfg = snapCfg?.guilds?.[guildId];
    const scopedChannels =
      guildCfg && typeof guildCfg.publishChannels === 'object'
        ? guildCfg.publishChannels
        : undefined;
    const legacyGlobalChannels =
      snapCfg && typeof snapCfg.publishChannels === 'object' ? snapCfg.publishChannels : undefined;
    const fromCfg = scopedChannels ?? legacyGlobalChannels ?? {};
    const snapshotLoaded = cfg.snapshot !== null;
    const hasPendingDraft = Boolean(cfg.snapshot?.hasDraft);
    const serverHasChannels = Object.keys(fromCfg).length > 0;

    const merged = !snapshotLoaded
      ? local
      : hasPendingDraft
        ? { ...fromCfg, ...local }
        : serverHasChannels
          ? { ...fromCfg }
          : local;
    setMap(merged);

    const scopedUrl = typeof guildCfg?.appWebsiteUrl === 'string' ? guildCfg.appWebsiteUrl : '';
    const legacyUrl =
      typeof snapCfg?.appWebsiteUrl === 'string'
        ? snapCfg.appWebsiteUrl
        : typeof snapCfg?.websiteUrl === 'string'
          ? snapCfg.websiteUrl
          : '';
    const fromCfgUrl = scopedUrl || legacyUrl;
    const nextUrl = !snapshotLoaded
      ? localUrl
      : hasPendingDraft
        ? localUrl || fromCfgUrl
        : fromCfgUrl || localUrl;
    setAppWebsiteUrl(nextUrl);

    if (editable && snapshotLoaded && !hasPendingDraft && serverHasChannels) {
      savePublishChannels(guildId, merged);
    }
    if (editable && snapshotLoaded && !hasPendingDraft && fromCfgUrl) {
      saveAppWebsiteUrl(guildId, fromCfgUrl);
    }
    void reload();
  }, [guildId, reload, cfg.snapshot, editable]);

  const pushDraftWith = async (
    nextMap: PublishChannelsMap,
    nextUrl: string,
    successHint: string,
  ) => {
    if (!cfg.canWrite) {
      setMsg('Lokalnie zapisano, ale zapis serwerowy jest niedostępny — sprawdź sekret Technika.');
      return false;
    }

    const trimmed = nextUrl.trim();
    const res = await putGuildPublishDraft(guildId, nextMap, trimmed);
    if (res.ok) {
      setMsg(
        successHint +
          ' · zapisano do szkicu gildii' +
          (trimmed ? ' + adres aplikacji' : '') +
          '. Przejdź do Przeglądu i kliknij Apply.',
      );
      cfg.setLastAction('draft guild publishChannels');
      cfg.setStep('Draft');
      return true;
    }

    setMsg(
      'Lokalnie OK, ale szkic serwerowy: ' + res.error + (res.detail ? ' — ' + res.detail : ''),
    );
    return false;
  };

  const onPick = (purpose: PublishPurposeId, channelId: string) => {
    if (!editable) {
      setMsg('Ten serwer jest tylko do podglądu — zapis kanałów jest zablokowany.');
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
    void pushDraftWith(
      next,
      appWebsiteUrl,
      channelId
        ? 'Zapisano: ' + purposeLabel + ' → ' + channelLabel(channelId, channels)
        : 'Wyczyszczono: ' + purposeLabel,
    );
  };

  const onWebsiteUrlChange = (value: string) => {
    setAppWebsiteUrl(value);
  };

  const onWebsiteUrlCommit = () => {
    if (!editable) {
      setMsg('Ten serwer jest tylko do podglądu — zapis URL jest zablokowany.');
      return;
    }
    if (!looksLikeHttpsUrl(appWebsiteUrl)) {
      setMsg('Adres aplikacji: podaj poprawny URL (https://…).');
      return;
    }
    const saved = saveAppWebsiteUrl(guildId, appWebsiteUrl);
    setAppWebsiteUrl(saved);
    setMsg(saved ? 'Zapisano lokalnie adres aplikacji.' : 'Wyczyszczono adres aplikacji.');
    void pushDraftWith(
      map,
      saved,
      saved ? 'Zapisano adres aplikacji' : 'Wyczyszczono adres aplikacji',
    );
  };

  const pushDraft = async () => {
    if (!editable) {
      setMsg('Ten serwer jest tylko do podglądu.');
      return;
    }
    if (!cfg.canWrite) {
      setMsg('Brak sekretu Technika — nie zapiszę ustawień kanałów do szkicu.');
      return;
    }
    if (!looksLikeHttpsUrl(appWebsiteUrl)) {
      setMsg('Adres aplikacji: podaj poprawny URL (https://…) przed zapisem szkicu.');
      return;
    }

    const savedUrl = saveAppWebsiteUrl(guildId, appWebsiteUrl);
    setAppWebsiteUrl(savedUrl);
    const res = await putGuildPublishDraft(guildId, map, savedUrl);
    if (!res.ok) {
      setMsg('Szkic: ' + res.error + (res.detail ? ' — ' + res.detail : ''));
      return;
    }

    cfg.setLastAction('draft guild publishChannels');
    cfg.setStep('Draft');
    setMsg(
      'Szkic gildii zaktualizowany (publishChannels' +
        (savedUrl ? ' + appWebsiteUrl' : '') +
        '). Otwórz Przegląd → Apply.',
    );
    await cfg.load();
  };

  const guildName = KNOWN_GUILD_NAMES[guildId] ?? 'serwer';
  const websiteChannelId = map.website ?? '';

  return (
    <>
      <h1>Kanały</h1>
      <p className="technik-lead">
        Powiąż cel publikacji z konkretnym kanałem Discorda. Centrum panel czyta kanał „Centrum”.
        Strona WWW: wybierz <strong>gdzie</strong> bot pinuje link oraz <strong>jaki</strong> adres
        aplikacji DESTILED.
      </p>

      <PageJobNote>
        <p>
          Jedna tabela: po lewej po co bot publikuje, po prawej na który kanał. Bez surowych ID w
          etykietach — wybierasz nazwę kanału z listy (#nazwa). Dla „Strona WWW / link do aplikacji”
          dodatkowo podajesz URL WWW — to jest treść stałego posta / pina (nie auto-publish; Apply w
          Przeglądzie).
        </p>
      </PageJobNote>

      <PlayerSeesNote>
        <p>
          Gracz widzi posty i panel Centrum tylko na kanałach, które tu przypiszesz. Link do
          aplikacji zobaczy na kanale „Strona WWW”, jeśli go tu ustawisz. Inne kanały bot zostawia w
          spokoju.
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
                {isTechnikGuildEditable(g.id) ? ' · edytowalny' : ' · tylko podgląd'}
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
            Ten serwer można przeglądać, ale zapis publishChannels i publikacja są zablokowane.
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
              Endpoint listy kanałów nie odpowiada (404/501). Gdy trasa wróci, wiersze poniżej
              odżyją z pickerami #nazwa.
            </p>
          </HonestGap>
        ) : null}

        {channelsErr ? (
          <p className="technik-error" role="alert">
            {channelsErr}
          </p>
        ) : null}

        {apiStatus === 'live' && channels.length === 0 && !channelsErr ? (
          <HonestGap>
            <p>
              API live, ale lista ma 0 kanałów. Sprawdź, czy bot jest na tej guildii i ma View
              Channel, a potem kliknij „Odśwież listę”.
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
                  {purpose.id === 'website' ? (
                    <label className="technik-field" style={{ marginTop: '0.55rem' }}>
                      <span>Adres aplikacji (URL)</span>
                      <input
                        type="url"
                        inputMode="url"
                        placeholder="https://…"
                        value={appWebsiteUrl}
                        disabled={!editable}
                        onChange={(e) => onWebsiteUrlChange(e.target.value)}
                        onBlur={() => onWebsiteUrlCommit()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            onWebsiteUrlCommit();
                          }
                        }}
                      />
                      <small className="technik-help">
                        Kanał wybierasz po prawej — tam bot przypnie link. Tutaj wpisz adres strony
                        DESTILED. Po zapisie wejdź w Przegląd i kliknij „Zapisz i włącz”.
                        {websiteChannelId
                          ? ' Wybrany kanał: ' + channelLabel(websiteChannelId, channels) + '.'
                          : ' Najpierw wybierz kanał po prawej.'}
                      </small>
                    </label>
                  ) : null}
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
          auto-publikacji. Ustawienia są zapisywane w szkicu wybranej gildii.
        </p>
      ) : (
        <HonestGap>
          <p>
            Gdy API kanałów będzie live, zapiszesz mapowanie do szkicu i włączysz je Apply w
            Przeglądzie. Lokalny cache pozostaje tylko awaryjnym podglądem formularza.
          </p>
        </HonestGap>
      )}
    </>
  );
}
