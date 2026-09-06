'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  fetchGuildRoles,
  roleLabel,
  type GuildRole,
} from './guild-roles-api';
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
import {
  DAY_LABELS,
  DEFAULT_RECURRING,
  EMOJI_QUICK,
  REACTION_ROLE_OPTIONS,
  RSVP_LIST_PLACEHOLDER,
  RSVP_PRESET,
  SAMPLE_DUNGEON_CONTENT,
  type CloseAt,
  type RecurringLocalDraft,
  type SeedReaction,
  countableReactions,
  formatCountPlaceholder,
  loadRecurringDraft,
  newReactionRow,
  previewCountsInContent,
  rsvpRoleReactions,
  saveRecurringDraft,
  scheduleSummary,
  toRecurringPostsPayload,
} from './recurring-config';
import { TECHNIK_TEST_GUILD_ID } from './technika-config-api';
import { HonestGap, PageJobNote, PlayerSeesNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

export function TechnikCyklicznePage() {
  const cfg = useTechnikaConfig();
  const guildId = TECHNIK_TEST_GUILD_ID;
  const [draft, setDraft] = useState<RecurringLocalDraft>(() => ({
    ...DEFAULT_RECURRING,
    schedule: {
      ...DEFAULT_RECURRING.schedule,
      daysOfWeek: [...DEFAULT_RECURRING.schedule.daysOfWeek],
    },
    rules: { ...DEFAULT_RECURRING.rules, roleIds: [] },
    seedReactions: [],
  }));
  const [msg, setMsg] = useState<string | null>(null);
  const [schemaHasRecurring, setSchemaHasRecurring] = useState(false);
  const [apiStatus, setApiStatus] = useState<PanelsApiStatus>('checking');
  const [channels, setChannels] = useState<readonly PanelChannel[]>([]);
  const [guildRoles, setGuildRoles] = useState<readonly GuildRole[]>([]);
  const [rolesNote, setRolesNote] = useState<string | null>(null);
  const [rolePick, setRolePick] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [payloadPeek, setPayloadPeek] = useState(false);

  useEffect(() => {
    const initial = loadRecurringDraft();
    const pub = loadPublishChannels(guildId);
    if (!initial.channelId && pub.recurring) {
      initial.channelId = pub.recurring;
    }
    setDraft(initial);
    if (
      initial.rules.whoCanReact === 'roles' ||
      (initial.rules.maxSlots != null && initial.rules.maxSlots > 0) ||
      (initial.rules.closeAt && initial.rules.closeAt !== 'none')
    ) {
      setRulesOpen(true);
    }
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchGuildRoles(guildId);
      if (cancelled) return;
      if (res.ok) {
        setGuildRoles(res.roles);
        setRolesNote(null);
      } else if (res.unavailable) {
        setGuildRoles([]);
        setRolesNote(
          'Lista nazwanych ról niedostępna — możesz dodać rolę ręcznie. Gdy API ról odpowie 200, wybierasz po nazwie.',
        );
      } else {
        setGuildRoles([]);
        setRolesNote('Role: ' + res.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  const persist = (next: RecurringLocalDraft, note?: string) => {
    setDraft(next);
    saveRecurringDraft(next);
    if (next.channelId) {
      setPublishChannel(guildId, 'recurring', next.channelId);
    }
    setMsg(
      note ??
        (schemaHasRecurring
          ? 'Zapisano szkic cyklicznych lokalnie — gdy Apply będzie gotowy, wejdzie jako recurringPosts.'
          : 'Zapisano szkic lokalnie. Scheduler jeszcze nie żyje — nic nie wyśle się samo. Kanał sync → publishChannels.recurring.'),
    );
  };

  const patch = (partial: Partial<RecurringLocalDraft>, note?: string) => {
    persist({ ...draft, ...partial }, note);
  };

  const patchSchedule = (
    partial: Partial<RecurringLocalDraft['schedule']>,
    note?: string,
  ) => {
    persist(
      { ...draft, schedule: { ...draft.schedule, ...partial } },
      note,
    );
  };

  const patchRules = (
    partial: Partial<RecurringLocalDraft['rules']>,
    note?: string,
  ) => {
    persist({ ...draft, rules: { ...draft.rules, ...partial } }, note);
  };

  const toggleDay = (d: number) => {
    const set = new Set(draft.schedule.daysOfWeek);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    const days = [...set].sort((a, b) => a - b);
    patchSchedule({ daysOfWeek: days.length ? days : [d] });
  };

  const updateReaction = (index: number, partial: Partial<SeedReaction>) => {
    const seedReactions = draft.seedReactions.map((r, i) =>
      i === index ? { ...r, ...partial } : r,
    );
    persist({ ...draft, seedReactions });
  };

  const removeReaction = (index: number) => {
    persist({
      ...draft,
      seedReactions: draft.seedReactions.filter((_, i) => i !== index),
    });
  };

  const addReaction = () => {
    persist({
      ...draft,
      reactionsEnabled: true,
      seedReactions: [...draft.seedReactions, newReactionRow()],
    });
  };

  const applyRsvpPreset = () => {
    persist({
      ...draft,
      reactionsEnabled: true,
      rsvpEnabled: true,
      seedReactions: RSVP_PRESET.map((r) => ({ ...r })),
    }, 'Wstawiono preset RSVP ✅❌❓ i włączono zapis.');
  };

  const appendToContent = (snippet: string, note?: string) => {
    const cur = draft.content ?? '';
    const needsSpace = cur.length > 0 && !/\s$/.test(cur);
    const next = cur + (needsSpace ? ' ' : '') + snippet;
    persist(
      { ...draft, content: next.slice(0, 2000) },
      note ?? 'Dodano fragment do treści.',
    );
  };

  const applySampleTemplate = () => {
    persist(
      {
        ...draft,
        title: draft.title.trim() || 'Cotygodniowy dungeon',
        content: SAMPLE_DUNGEON_CONTENT,
        reactionsEnabled: true,
        rsvpEnabled: true,
        showCountsInPost: true,
        seedReactions:
          draft.seedReactions.length > 0
            ? draft.seedReactions
            : RSVP_PRESET.map((r) => ({ ...r })),
      },
      'Wstawiono przykładowy szablon dungeon + włączono zapis i licznik w treści.',
    );
  };

  const addRoleId = (id: string) => {
    if (!/^\d{17,20}$/.test(id)) return;
    const cur = draft.rules.roleIds ?? [];
    if (cur.includes(id)) return;
    patchRules({ whoCanReact: 'roles', roleIds: [...cur, id] });
    setRolePick('');
  };

  const removeRoleId = (id: string) => {
    patchRules({
      roleIds: (draft.rules.roleIds ?? []).filter((x) => x !== id),
    });
  };

  const whenSummary = scheduleSummary(draft.schedule, draft.enabled);
  const countable = countableReactions(draft);
  const rsvpRows = rsvpRoleReactions(draft);
  const countPreview = useMemo(
    () => previewCountsInContent(draft.content || '_(brak treści)_', countable),
    [draft.content, countable],
  );
  const payload = useMemo(() => toRecurringPostsPayload(draft), [draft]);

  const insertCountButtons = useMemo(() => {
    const seen = new Set<string>();
    const out: { emoji: string; token: string }[] = [];
    for (const r of countable) {
      const em = r.emoji.trim();
      if (!em || seen.has(em)) continue;
      seen.add(em);
      out.push({ emoji: em, token: formatCountPlaceholder(em) });
    }
    return out;
  }, [countable]);

  const playerSeesBits: string[] = [];
  if (draft.reactionsEnabled && draft.seedReactions.length) {
    playerSeesBits.push(
      'pod postem zobaczy reakcje: ' +
        draft.seedReactions.map((r) => r.emoji).join(' '),
    );
  }
  if (draft.rsvpEnabled) {
    playerSeesBits.push(
      'klik w ✅/❌/❓ buduje listę zapisów (tak / nie / może) — widać kto się zapisał',
    );
  }
  if (draft.showCountsInPost && countable.length) {
    playerSeesBits.push(
      'w treści postu pojawią się liczby (placeholdery liczników albo krótki dodatek na dole)',
    );
  }

  return (
    <>
      <h1>Cykliczne</h1>
      <p className="technik-lead">
        Konfigurator serii postów: co, kiedy, kanał, reakcje i zapis. Wybierasz przełącznikami —
        bez ściany identycznych pól. To <strong>szkic przygotowawczy</strong>: nic nie publikuje się
        samo.
      </p>

      <PageJobNote>
        <p>
          Ustawiasz treść i rytm cykli oraz opcjonalne reakcje / RSVP / limity. Zwykły członek nie
          tworzy cykli — to Technika. Zapis lokalny + sync kanału do mapy Kanałów; Apply do bota
          dopiero gdy Ty klikniesz (gdy runtime będzie gotowy).
        </p>
      </PageJobNote>

      <PlayerSeesNote>
        <p>
          Gracz widzi kolejne terminy jako zwykłe posty wydarzeń.
          {playerSeesBits.length
            ? ' Dodatkowo: ' + playerSeesBits.join('; ') + '.'
            : ' Bez włączonych reakcji / RSVP / licznika — sam tekst i termin.'}{' '}
          Edycja serii (gdy runtime): tylko ten termin / ten i kolejne / cała seria.
        </p>
      </PlayerSeesNote>

      {!schemaHasRecurring ? (
        <HonestGap>
          <p>
            <strong>Szkic — scheduler jeszcze nie żyje.</strong> New Bot nie odpala crona ani
            automatycznych wysyłek. Ten formularz przygotowuje obiekt{' '}
            <code>recurringPosts</code> (treść, kanał, reakcje, reguły) —{' '}
            <em>nic nie zostanie wysłane automatycznie</em>. Kanał syncuje się do{' '}
            <code>publishChannels.recurring</code> (zakładka Kanały).
          </p>
        </HonestGap>
      ) : (
        <p className="technik-pill technik-pill--live">
          Możliwość recurringPosts wykryta — nadal bez auto-publikacji; tylko szkic → Apply
        </p>
      )}

      {/* ——— Choice: master enable ——— */}
      <section className="technik-choice-card" style={{ marginTop: '1rem' }}>
        <label className="technik-choice-card__toggle">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          <span>
            <strong>Włącz serię cykliczną</strong>
            <small className="technik-help">
              Gdy runtime będzie gotowy — bot będzie mógł brać ten szkic. Dziś: tylko lokalny draft.
            </small>
          </span>
        </label>
      </section>

      {/* ——— 1. Co / Kiedy / Kanał ——— */}
      <section className="technik-panel technik-panel--wide technik-panel--live-config" style={{ marginTop: '1rem' }}>
        <div className="technik-panel-head">
          <h2>1. Co / Kiedy / Kanał</h2>
          <span className="technik-pill">{whenSummary}</span>
        </div>

        <div className="technik-cykl-grid">
          <div className="technik-cykl-col">
            <h3 className="technik-cykl-col__title">Co</h3>
            <label className="technik-field">
              <span>Tytuł / nazwa serii</span>
              <input
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={100}
                placeholder="np. Cotygodniowy dungeon"
              />
            </label>

            <div className="technik-template-coach" role="region" aria-label="Jak napisać treść">
              <strong>Jak napisać treść, żeby liczniki działały</strong>
              <ol className="technik-template-coach__steps">
                <li>
                  Włącz <em>„4. Licznik w treści”</em> oraz (dla zapisów){' '}
                  <em>„3. Zapis / RSVP”</em> z reakcjami Tak / Nie / Może w sekcji 2.
                </li>
                <li>
                  Wklej placeholdery przyciskami poniżej <strong>albo</strong> zostaw treść bez nich —
                  wtedy bot doda krótki dodatek z liczbami na dole postu.
                </li>
                <li>
                  Lista zapisów powstaje z kliknięć w reakcje. Wstaw{' '}
                  <code>{RSVP_LIST_PLACEHOLDER}</code> w treści, żeby pokazać listę w poście (gdy
                  runtime żyje). To tylko tekst w treści — bez osobnego pola w bramce.
                </li>
              </ol>
              <div className="technik-template-coach__btns" role="group" aria-label="Wstaw placeholdery">
                {insertCountButtons.length === 0 ? (
                  <span className="technik-muted">
                    Brak emoji do licznika — dodaj w sekcji 2 reakcje z rolą Licznik albo RSVP
                    (Tak/Nie/Może), albo użyj presetu.
                  </span>
                ) : (
                  insertCountButtons.map((b) => (
                    <button
                      key={b.token}
                      type="button"
                      className="technik-btn-ghost"
                      title={'Wstaw ' + b.token}
                      onClick={() =>
                        appendToContent(b.token, 'Wstawiono placeholder licznika ' + b.emoji)
                      }
                    >
                      Licznik {b.emoji}
                    </button>
                  ))
                )}
                <button
                  type="button"
                  className="technik-btn-ghost"
                  title={'Wstaw ' + RSVP_LIST_PLACEHOLDER}
                  onClick={() =>
                    appendToContent(
                      RSVP_LIST_PLACEHOLDER,
                      'Wstawiono placeholder listy zapisów.',
                    )
                  }
                >
                  Lista zapisów
                </button>
                <button
                  type="button"
                  className="technik-btn-ghost"
                  onClick={applySampleTemplate}
                >
                  Przykładowy szablon dungeon
                </button>
              </div>
              <p className="technik-help" style={{ marginTop: '0.45rem', marginBottom: 0 }}>
                Format placeholdera licznika: <code>{'{{count:✅}}'}</code> (emoji z Twoich
                reakcji). Spacje w stylu <code>{'{{ count: ✅ }}'}</code> też zadziałają w
                podglądzie. Lista: <code>{RSVP_LIST_PLACEHOLDER}</code>.
              </p>
            </div>

            <label className="technik-field">
              <span>Treść / opis (szablon)</span>
              <textarea
                className="technik-textarea"
                rows={5}
                value={draft.content}
                onChange={(e) => patch({ content: e.target.value })}
                maxLength={2000}
                placeholder={
                  'Tekst na poście. Możesz wstawić {{count:✅}} albo {{rsvp_list}} — przyciski powyżej pomagają.'
                }
              />
            </label>
          </div>

          <div className="technik-cykl-col">
            <h3 className="technik-cykl-col__title">Kiedy</h3>
            <div className="technik-choice-pills" role="radiogroup" aria-label="Tryb harmonogramu">
              {(
                [
                  ['daily', 'Codziennie'],
                  ['weekly', 'Co tydzień'],
                  ['days', 'Wybrane dni'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={
                    draft.schedule.mode === value
                      ? 'technik-day-pill is-on'
                      : 'technik-day-pill'
                  }
                  aria-pressed={draft.schedule.mode === value}
                  onClick={() => patchSchedule({ mode: value })}
                >
                  {label}
                </button>
              ))}
            </div>

            {draft.schedule.mode !== 'daily' ? (
              <div className="technik-day-pills" role="group" aria-label="Dni tygodnia">
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={label}
                    type="button"
                    className={
                      draft.schedule.daysOfWeek.includes(idx)
                        ? 'technik-day-pill is-on'
                        : 'technik-day-pill'
                    }
                    aria-pressed={draft.schedule.daysOfWeek.includes(idx)}
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
                  value={draft.schedule.timeWarsaw}
                  onChange={(e) => patchSchedule({ timeWarsaw: e.target.value })}
                  placeholder="18:00"
                />
              </label>
              <label className="technik-field">
                <span>Horyzont (dni, max 90)</span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={draft.schedule.horizonDays}
                  onChange={(e) =>
                    patchSchedule({
                      horizonDays: Math.min(
                        90,
                        Math.max(1, Number(e.target.value) || 1),
                      ),
                    })
                  }
                />
              </label>
            </div>
            <p className="technik-help">Podsumowanie: {whenSummary}</p>
          </div>

          <div className="technik-cykl-col">
            <h3 className="technik-cykl-col__title">Kanał</h3>
            <p className="technik-help">
              Domyślnie z mapowania „Cykliczne” w{' '}
              <a href="/technik/kanaly">Kanałach</a>. Wybór poniżej nadpisuje i syncuje mapę.
            </p>
            <label className="technik-field">
              <span>Kanał publikacji</span>
              <select
                value={draft.channelId}
                disabled={apiStatus !== 'live' || channels.length === 0}
                onChange={(e) => patch({ channelId: e.target.value })}
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
          </div>
        </div>
      </section>

      {/* ——— 2. Reakcje ——— */}
      <section className="technik-choice-card" style={{ marginTop: '1rem' }}>
        <label className="technik-choice-card__toggle">
          <input
            type="checkbox"
            checked={draft.reactionsEnabled}
            onChange={(e) => {
              const on = e.target.checked;
              persist({
                ...draft,
                reactionsEnabled: on,
                seedReactions:
                  on && draft.seedReactions.length === 0
                    ? [newReactionRow()]
                    : draft.seedReactions,
              });
            }}
          />
          <span>
            <strong>2. Reakcje pod postem</strong>
            <small className="technik-help">
              Emotki pod każdym terminem serii. Rola mówi, czy to tylko ozdoba, zapis (RSVP), czy
              licznik w treści.
            </small>
          </span>
        </label>

        {draft.reactionsEnabled ? (
          <div className="technik-choice-card__body">
            <div className="technik-row" style={{ marginBottom: '0.65rem' }}>
              <button type="button" className="technik-btn-ghost" onClick={applyRsvpPreset}>
                Preset: RSVP ✅❌❓
              </button>
              <button type="button" className="technik-btn-ghost" onClick={addReaction}>
                + Dodaj reakcję
              </button>
            </div>

            {draft.seedReactions.length === 0 ? (
              <p className="technik-muted">Brak wierszy — dodaj reakcję albo użyj presetu.</p>
            ) : (
              <ul className="technik-reaction-list">
                {draft.seedReactions.map((row, index) => (
                  <li key={'rx-' + String(index)} className="technik-reaction-row">
                    <div className="technik-reaction-row__emoji">
                      <label className="technik-field">
                        <span>Emoji</span>
                        <input
                          value={row.emoji}
                          maxLength={16}
                          onChange={(e) =>
                            updateReaction(index, { emoji: e.target.value })
                          }
                          aria-label={'Emoji wiersza ' + String(index + 1)}
                        />
                      </label>
                      <div className="technik-emoji-quick" role="group" aria-label="Szybkie emoji">
                        {EMOJI_QUICK.map((em) => (
                          <button
                            key={em}
                            type="button"
                            className={
                              row.emoji === em
                                ? 'technik-day-pill is-on'
                                : 'technik-day-pill'
                            }
                            onClick={() => updateReaction(index, { emoji: em })}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="technik-field">
                      <span>Rola reakcji</span>
                      <select
                        value={row.role}
                        onChange={(e) =>
                          updateReaction(index, {
                            role: e.target.value as SeedReaction['role'],
                          })
                        }
                      >
                        {REACTION_ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <small className="technik-help">
                        {REACTION_ROLE_OPTIONS.find((o) => o.value === row.role)?.hint}
                      </small>
                    </label>
                    <label className="technik-field">
                      <span>Etykieta (opcjonalnie)</span>
                      <input
                        value={row.label ?? ''}
                        maxLength={40}
                        placeholder="np. Będę"
                        onChange={(e) =>
                          updateReaction(index, { label: e.target.value })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="technik-btn-ghost"
                      style={{ alignSelf: 'end' }}
                      onClick={() => removeReaction(index)}
                    >
                      Usuń
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      {/* ——— 3. RSVP ——— */}
      <section className="technik-choice-card" style={{ marginTop: '0.75rem' }}>
        <label className="technik-choice-card__toggle">
          <input
            type="checkbox"
            checked={draft.rsvpEnabled}
            onChange={(e) => {
              const on = e.target.checked;
              if (on && !draft.reactionsEnabled) {
                persist({
                  ...draft,
                  rsvpEnabled: true,
                  reactionsEnabled: true,
                  seedReactions:
                    draft.seedReactions.length > 0
                      ? draft.seedReactions
                      : RSVP_PRESET.map((r) => ({ ...r })),
                }, 'Włączono zapis RSVP i reakcje (preset, jeśli brakowało wierszy).');
              } else {
                patch({ rsvpEnabled: on });
              }
            }}
          />
          <span>
            <strong>3. Zapis / RSVP</strong>
            <small className="technik-help">
              Gdy włączone: reakcje z rolą „RSVP: tak / nie / może” budują listę zapisanych.
              Gracz widzi, kto kliknął — nie tylko samą emotkę. W treści możesz wstawić{' '}
              <code>{RSVP_LIST_PLACEHOLDER}</code>, żeby lista była też w poście.
            </small>
          </span>
        </label>
        {draft.rsvpEnabled && rsvpRows.length === 0 ? (
          <p className="technik-inline-warn" role="status">
            Włączono zapis, ale nie ma reakcji z rolą Tak / Nie / Może. Dodaj je w sekcji 2 albo
            kliknij „Preset: RSVP ✅❌❓” — inaczej lista zapisów będzie pusta.
          </p>
        ) : null}
      </section>

      {/* ——— 4. Licznik ——— */}
      <section className="technik-choice-card" style={{ marginTop: '0.75rem' }}>
        <label className="technik-choice-card__toggle">
          <input
            type="checkbox"
            checked={draft.showCountsInPost}
            onChange={(e) => patch({ showCountsInPost: e.target.checked })}
          />
          <span>
            <strong>4. Licznik w treści</strong>
            <small className="technik-help">
              Pokazuje liczby kliknięć przy reakcjach „Licznik” oraz RSVP (tak / nie / może).
              Wklej placeholdery w treści albo zostaw puste — bot doda krótki dodatek na dole.
            </small>
          </span>
        </label>

        {draft.showCountsInPost ? (
          <div className="technik-choice-card__body">
            {countable.length === 0 ? (
              <p className="technik-inline-warn" role="status">
                Brak reakcji do policzenia — dodaj w sekcji 2 rolę „Licznik” albo RSVP (Tak/Nie/Może),
                żeby było co pokazać w treści.
              </p>
            ) : (
              <>
                <p className="technik-help">
                  Podgląd (przykładowe liczby):{' '}
                  {countPreview.usedPlaceholders
                    ? 'placeholdery w treści podmienione'
                    : 'brak dopasowanych placeholderów licznika → dodatek na dole postu'}
                  {countPreview.usedRsvpList ? ' · lista zapisów w treści podmieniona' : ''}
                </p>
                <pre className="technik-code technik-count-preview" tabIndex={0}>
                  {countPreview.body}
                </pre>
              </>
            )}
          </div>
        ) : null}
      </section>

      {/* ——— 5. Reguły ——— */}
      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <button
          type="button"
          className="technik-collapse-head"
          aria-expanded={rulesOpen}
          onClick={() => setRulesOpen((v) => !v)}
        >
          <h2 style={{ margin: 0 }}>5. Reguły</h2>
          <span className="technik-muted">{rulesOpen ? 'zwiń' : 'rozwiń — limity, kto może, zamknięcie'}</span>
        </button>

        {rulesOpen ? (
          <div className="technik-choice-card__body" style={{ marginTop: '0.75rem' }}>
            <div className="technik-row">
              <label className="technik-field">
                <span>Ile osób max może się zapisać (puste = bez limitu)</span>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  placeholder="puste = bez limitu"
                  value={
                    draft.rules.maxSlots == null || draft.rules.maxSlots <= 0
                      ? ''
                      : draft.rules.maxSlots
                  }
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      patchRules({ maxSlots: null });
                      return;
                    }
                    const n = Number(raw);
                    patchRules({
                      maxSlots:
                        Number.isFinite(n) && n > 0
                          ? Math.min(9999, Math.floor(n))
                          : null,
                    });
                  }}
                />
                {!draft.rsvpEnabled ? (
                  <small className="technik-help">
                    Limit miejsc ma sens dopiero przy włączonym zapisie (sekcja 3). Bez RSVP pole
                    możesz zostawić puste.
                  </small>
                ) : (
                  <small className="technik-help">
                    Puste pole = bez limitu. Liczy się zapis „będę” (gdy runtime żyje).
                  </small>
                )}
              </label>

              <fieldset className="technik-fieldset" style={{ flex: 1 }}>
                <legend>Zamknięcie zapisów</legend>
                {(
                  [
                    ['none', 'Bez auto-zamknięcia'],
                    ['at_start', 'Przy starcie terminu'],
                    ['manual', 'Tylko ręcznie'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="technik-check">
                    <input
                      type="radio"
                      name="closeAt"
                      checked={(draft.rules.closeAt ?? 'none') === value}
                      onChange={() => patchRules({ closeAt: value })}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            </div>

            <fieldset className="technik-fieldset" style={{ marginTop: '0.75rem' }}>
              <legend>Kto może reagować</legend>
              <label className="technik-check">
                <input
                  type="radio"
                  name="whoCanReact"
                  checked={draft.rules.whoCanReact === 'everyone'}
                  onChange={() => patchRules({ whoCanReact: 'everyone' })}
                />
                Wszyscy na kanale
              </label>
              <label className="technik-check">
                <input
                  type="radio"
                  name="whoCanReact"
                  checked={draft.rules.whoCanReact === 'roles'}
                  onChange={() => patchRules({ whoCanReact: 'roles' })}
                />
                Tylko wybrane role
              </label>
            </fieldset>

            {draft.rules.whoCanReact === 'roles' ? (
              <div className="technik-field" style={{ marginTop: '0.65rem' }}>
                <span>Wybrane role Discord</span>
                {rolesNote ? <p className="technik-muted">{rolesNote}</p> : null}
                <div className="technik-role-chips" role="list">
                  {(draft.rules.roleIds ?? []).length === 0 ? (
                    <span className="technik-muted">Brak ról — dodaj poniżej</span>
                  ) : (
                    (draft.rules.roleIds ?? []).map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="technik-role-chip"
                        role="listitem"
                        title={id}
                        onClick={() => removeRoleId(id)}
                      >
                        {roleLabel(id, guildRoles)} ×
                      </button>
                    ))
                  )}
                </div>
                {guildRoles.length > 0 ? (
                  <label className="technik-field" style={{ marginTop: '0.5rem' }}>
                    <span>Dodaj rolę z listy</span>
                    <select
                      value={rolePick}
                      onChange={(e) => {
                        const id = e.target.value;
                        setRolePick(id);
                        if (id) addRoleId(id);
                      }}
                    >
                      <option value="">— wybierz rolę —</option>
                      {guildRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="technik-row" style={{ marginTop: '0.5rem' }}>
                    <label className="technik-field" style={{ flex: 1 }}>
                      <span>Dodaj rolę (identyfikator Discord)</span>
                      <input
                        value={rolePick}
                        onChange={(e) => setRolePick(e.target.value)}
                        placeholder="17–20 cyfr"
                      />
                    </label>
                    <button
                      type="button"
                      className="technik-btn-ghost"
                      style={{ alignSelf: 'end' }}
                      onClick={() => {
                        const id = rolePick.trim();
                        if (/^\d{17,20}$/.test(id)) addRoleId(id);
                        else setMsg('To nie wygląda na identyfikator roli Discord.');
                      }}
                    >
                      Dodaj
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ——— Persist status + payload peek ——— */}
      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <div className="technik-panel-head">
          <h2>Szkic lokalny</h2>
          <button
            type="button"
            className="technik-btn-ghost"
            onClick={() => setPayloadPeek((v) => !v)}
          >
            {payloadPeek ? 'Ukryj JSON' : 'Pokaż JSON (recurringPosts)'}
          </button>
        </div>
        <p className="technik-help">
          Zapis przy każdej zmianie → <code>localStorage</code>. Kanał →{' '}
          <code>publishChannels.recurring</code>. Zero auto-publish / zero Apply bez Ciebie.
        </p>
        {msg ? (
          <p className="technik-test-status" role="status">
            {msg}
          </p>
        ) : null}
        {payloadPeek ? (
          <pre className="technik-code technik-code--tall" tabIndex={0}>
            {JSON.stringify(payload, null, 2)}
          </pre>
        ) : null}
      </section>
    </>
  );
}
