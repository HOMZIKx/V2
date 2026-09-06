'use client';

import { useEffect, useState } from 'react';

import {
  type PanelChannel,
  type PanelsApiStatus,
  detectPanelsApi,
  fetchPanelChannels,
} from './panels-api';
import {
  channelLabel,
  loadPublishChannels,
  setPublishChannel,
} from './publish-channels';
import { TECHNIK_TEST_GUILD_ID } from './technika-config-api';
import { HonestGap, PageJobNote, PlayerSeesNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

const STORAGE_KEY = 'technik.recurring.v1';

type RecurringDraft = {
  enabled: boolean;
  title: string;
  content: string;
  mode: 'daily' | 'weekly' | 'days';
  daysOfWeek: number[];
  timeWarsaw: string;
  horizonDays: number;
  channelId: string;
};

const DEFAULT_DRAFT: RecurringDraft = {
  enabled: false,
  title: '',
  content: '',
  mode: 'weekly',
  daysOfWeek: [1, 3, 5],
  timeWarsaw: '18:00',
  horizonDays: 90,
  channelId: '',
};

const DAY_LABELS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];

function load(): RecurringDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DRAFT };
    const p = JSON.parse(raw) as Partial<RecurringDraft>;
    return {
      ...DEFAULT_DRAFT,
      ...p,
      daysOfWeek: Array.isArray(p.daysOfWeek) ? p.daysOfWeek.map(Number) : DEFAULT_DRAFT.daysOfWeek,
    };
  } catch {
    return { ...DEFAULT_DRAFT };
  }
}

export function TechnikCyklicznePage() {
  const cfg = useTechnikaConfig();
  const guildId = TECHNIK_TEST_GUILD_ID;
  const [draft, setDraft] = useState<RecurringDraft>(DEFAULT_DRAFT);
  const [msg, setMsg] = useState<string | null>(null);
  const [schemaHasRecurring, setSchemaHasRecurring] = useState(false);
  const [apiStatus, setApiStatus] = useState<PanelsApiStatus>('checking');
  const [channels, setChannels] = useState<readonly PanelChannel[]>([]);

  useEffect(() => {
    const initial = load();
    const pub = loadPublishChannels(guildId);
    if (!initial.channelId && pub.recurring) {
      initial.channelId = pub.recurring;
    }
    setDraft(initial);
  }, [guildId]);

  useEffect(() => {
    const caps = cfg.capabilities;
    if (!caps) {
      setSchemaHasRecurring(false);
      return;
    }
    const hit = caps.some(
      (c) =>
        c.id === 'recurringPosts' ||
        c.id === 'recurring' ||
        c.id.includes('recurring') ||
        (typeof c.title === 'string' && /cyklicz|recurring/i.test(c.title)),
    );
    setSchemaHasRecurring(hit);
  }, [cfg.capabilities]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await detectPanelsApi(guildId);
      if (cancelled) return;
      setApiStatus(status);
      if (status !== 'live') {
        setChannels([]);
        return;
      }
      const res = await fetchPanelChannels(guildId);
      if (cancelled) return;
      if (res.ok) setChannels(res.data.channels);
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  const persist = (next: RecurringDraft) => {
    setDraft(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (next.channelId) {
      setPublishChannel(guildId, 'recurring', next.channelId);
    }
    setMsg(
      schemaHasRecurring
        ? 'Zapisano szkic cyklicznych — gdy klucz będzie w config, wejdzie do Apply.'
        : 'Zapisano lokalny szkic. Scheduler cyklicznych jeszcze nie jest w capabilities bota.',
    );
  };

  const toggleDay = (d: number) => {
    const set = new Set(draft.daysOfWeek);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    persist({ ...draft, daysOfWeek: [...set].sort() });
  };

  const whenSummary = (() => {
    if (!draft.enabled) return 'wyłączone';
    if (draft.mode === 'daily') return 'codziennie o ' + draft.timeWarsaw + ' (Warszawa)';
    const days = draft.daysOfWeek.map((i) => DAY_LABELS[i] ?? '?').join(', ');
    return (draft.mode === 'weekly' ? 'co tydzień' : 'w wybrane dni') + ' · ' + days + ' · ' + draft.timeWarsaw;
  })();

  return (
    <>
      <h1>Cykliczne</h1>
      <p className="technik-lead">
        Co publikować, kiedy i na którym kanale — prosty harmonogram serii (max 90 dni naprzód).
      </p>

      <PageJobNote>
        <p>
          Definiujesz treść i rytm postów cyklicznych. Zwykły członek nie tworzy cykli — to ustawienie
          Technika / uprawnionych ról.
        </p>
      </PageJobNote>

      <PlayerSeesNote>
        <p>
          Gracz widzi kolejne terminy serii jako zwykłe posty wydarzeń (ten sam układ V2). Edycja
          serii: tylko ten termin / ten i kolejne / cała seria.
        </p>
      </PlayerSeesNote>

      {!schemaHasRecurring ? (
        <HonestGap>
          <p>
            Bot jeszcze nie wystawia możliwości „posty cykliczne” w capabilities. Formularz zapisuje
            lokalny szkic — Apply podłączymy, gdy klucz pojawi się po stronie New Bot.
          </p>
        </HonestGap>
      ) : (
        <p className="technik-pill technik-pill--live">Możliwość cyklicznych wykryta w capabilities</p>
      )}

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <h2>Co</h2>
        <label className="technik-check">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => persist({ ...draft, enabled: e.target.checked })}
          />
          Włącz serie cykliczne (gdy runtime będzie gotowy)
        </label>
        <label className="technik-field">
          <span>Tytuł / nazwa serii</span>
          <input
            value={draft.title}
            onChange={(e) => persist({ ...draft, title: e.target.value })}
            maxLength={100}
            placeholder="np. Cotygodniowy dungeon"
          />
        </label>
        <label className="technik-field">
          <span>Treść / opis</span>
          <textarea
            className="technik-textarea"
            rows={4}
            value={draft.content}
            onChange={(e) => persist({ ...draft, content: e.target.value })}
            maxLength={1000}
            placeholder="Tekst, który gracz zobaczy na poście (szkic)"
          />
        </label>
      </section>

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <h2>Kiedy</h2>
        <fieldset className="technik-fieldset">
          <legend>Tryb</legend>
          {(
            [
              ['daily', 'Codziennie'],
              ['weekly', 'Co tydzień'],
              ['days', 'Wybrane dni tygodnia'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="technik-check">
              <input
                type="radio"
                name="recurring-mode"
                checked={draft.mode === value}
                onChange={() => persist({ ...draft, mode: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {draft.mode !== 'daily' ? (
          <div className="technik-day-pills" role="group" aria-label="Dni tygodnia">
            {DAY_LABELS.map((label, idx) => (
              <button
                key={label}
                type="button"
                className={draft.daysOfWeek.includes(idx) ? 'technik-day-pill is-on' : 'technik-day-pill'}
                onClick={() => toggleDay(idx)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="technik-row">
          <label className="technik-field">
            <span>Godzina (Europe/Warsaw)</span>
            <input
              value={draft.timeWarsaw}
              onChange={(e) => persist({ ...draft, timeWarsaw: e.target.value })}
              placeholder="18:00"
            />
          </label>
          <label className="technik-field">
            <span>Horyzont (dni, max 90)</span>
            <input
              type="number"
              min={1}
              max={90}
              value={draft.horizonDays}
              onChange={(e) =>
                persist({
                  ...draft,
                  horizonDays: Math.min(90, Math.max(1, Number(e.target.value) || 1)),
                })
              }
            />
          </label>
        </div>
        <p className="technik-help">Podsumowanie: {whenSummary}</p>
      </section>

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <h2>Na którym kanale</h2>
        <p className="technik-help">
          Domyślnie z mapowania „Cykliczne” w <a href="/technik/kanaly">Kanałach</a>. Możesz też
          wybrać poniżej.
        </p>
        <label className="technik-field">
          <span>Kanał publikacji</span>
          <select
            value={draft.channelId}
            disabled={apiStatus !== 'live' || channels.length === 0}
            onChange={(e) => persist({ ...draft, channelId: e.target.value })}
          >
            <option value="">— nie wybrano —</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                #{ch.name}
              </option>
            ))}
          </select>
        </label>
        <p className="technik-muted">
          Wybrane: {channelLabel(draft.channelId || undefined, channels)}
          {apiStatus !== 'live' ? ' · lista kanałów jeszcze niedostępna' : ''}
        </p>
        {msg ? (
          <p className="technik-test-status" role="status">
            {msg}
          </p>
        ) : null}
      </section>
    </>
  );
}
