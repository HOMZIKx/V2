'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  CUSTOM_BUTTON_ACTIONS,
  CUSTOM_BUTTON_STYLES,
  DEFAULT_APPEARANCE,
  createEmptyCustomButton,
  loadAppearance,
  persistAppearance,
  type AppearanceCustomButton,
  type AppearanceDraft,
  type CustomButtonAction,
  type CustomButtonStyle,
} from './appearance';
import {
  CENTRUM_HUB_ACTIONS,
  loadEnabledHubActions,
  type CentrumHubActionId,
} from './centrum-hub-actions';
import { HonestGap, PageJobNote, PlayerSeesNote, ReactionsForbiddenNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

type WygladKind = 'centrum' | 'timery' | 'wojna' | 'cykliczne';

const KIND_TABS: readonly { id: WygladKind; label: string; hint: string }[] = [
  { id: 'centrum', label: 'Centrum hub', hint: 'Panel na kanale Discord' },
  { id: 'timery', label: 'Timery PW', hint: 'Prywatna wiadomość o timerze' },
  { id: 'wojna', label: 'Wojna PW', hint: 'Przypomnienie przed wojną' },
  { id: 'cykliczne', label: 'Cykliczne', hint: 'Post cykliczny na kanale' },
];

const RECURRING_KEY = 'technik.recurring.v1';

type RecurringAppearance = { title: string; content: string };

function loadRecurringAppearance(): RecurringAppearance {
  try {
    const raw = localStorage.getItem(RECURRING_KEY);
    if (!raw) return { title: '', content: '' };
    const p = JSON.parse(raw) as Partial<RecurringAppearance>;
    return {
      title: typeof p.title === 'string' ? p.title : '',
      content: typeof p.content === 'string' ? p.content : '',
    };
  } catch {
    return { title: '', content: '' };
  }
}

function persistRecurringAppearance(next: RecurringAppearance): void {
  let leftovers: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem(RECURRING_KEY);
    leftovers = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    leftovers = {};
  }
  localStorage.setItem(RECURRING_KEY, JSON.stringify({ ...leftovers, ...next }));
}

function fillTimerPreview(tpl: string): string {
  return tpl
    .replaceAll('{{title}}', 'Księga')
    .replaceAll('{{body}}', 'Pozostało ~5 min')
    .replaceAll('{{otherTimersSummary}}', 'Kamień Duchowy · 12 min')
    .replaceAll('{{deepLinkUrl}}', 'https://destiled.example/eq');
}

function fillWarPreview(tpl: string): string {
  return tpl.replaceAll('{{notifyMinutesBefore}}', '30').replaceAll('{{warAt}}', '18:00');
}

function btnClass(style: CustomButtonStyle): string {
  if (style === 'primary')
    return 'technik-discord-preview__btn technik-discord-preview__btn--primary';
  if (style === 'danger')
    return 'technik-discord-preview__btn technik-discord-preview__btn--danger';
  return 'technik-discord-preview__btn';
}

export function TechnikWygladPage() {
  const cfg = useTechnikaConfig();
  const [kind, setKind] = useState<WygladKind>('centrum');
  const [draft, setDraft] = useState<AppearanceDraft>({
    ...DEFAULT_APPEARANCE,
    customButtons: [],
  });
  const [enabled, setEnabled] = useState<CentrumHubActionId[]>([]);
  const [timerTpl, setTimerTpl] = useState('');
  const [warTpl, setWarTpl] = useState('');
  const [recurring, setRecurring] = useState<RecurringAppearance>({ title: '', content: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(loadAppearance());
    setEnabled(loadEnabledHubActions());
    setTimerTpl(cfg.charTimers.messageTemplate);
    setWarTpl(cfg.warDraft.messageTemplate);
    setRecurring(loadRecurringAppearance());
    setDirty(false);
  }, []);

  useEffect(() => {
    // Keep templates in sync when config finishes loading later
    if (!dirty && cfg.snapshot) {
      setTimerTpl(cfg.charTimers.messageTemplate);
      setWarTpl(cfg.warDraft.messageTemplate);
    }
  }, [cfg.snapshot, cfg.charTimers.messageTemplate, cfg.warDraft.messageTemplate, dirty]);

  const previewActions = useMemo(
    () => CENTRUM_HUB_ACTIONS.filter((a) => enabled.includes(a.id)),
    [enabled],
  );

  const accent = draft.accentHex || '#5865F2';
  const bannerUrl = draft.bannerUrl.trim();

  const patchCentrum = (partial: Partial<AppearanceDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
    setDirty(true);
    setMsg(null);
  };

  const patchButton = (id: string, partial: Partial<AppearanceCustomButton>) => {
    setDraft((prev) => ({
      ...prev,
      customButtons: prev.customButtons.map((b) => (b.id === id ? { ...b, ...partial } : b)),
    }));
    setDirty(true);
    setMsg(null);
  };

  const moveButton = (id: string, dir: -1 | 1) => {
    setDraft((prev) => {
      const idx = prev.customButtons.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.customButtons.length) return prev;
      const copy = [...prev.customButtons];
      const [item] = copy.splice(idx, 1);
      if (!item) return prev;
      copy.splice(nextIdx, 0, item);
      return { ...prev, customButtons: copy };
    });
    setDirty(true);
    setMsg(null);
  };

  const saveDraft = () => {
    if (kind === 'centrum') {
      persistAppearance(draft);
      setDirty(false);
      setMsg(
        'Zapisano szkic wyglądu Centrum (lokalnie). Nic nie poszło na Discord — publikacja tylko ręcznie w Centrum → Opublikuj.',
      );
      return;
    }
    if (kind === 'timery') {
      cfg.setCharTimers((prev) => ({ ...prev, messageTemplate: timerTpl }));
      setDirty(false);
      setMsg(
        'Szablon timerów jest w szkicu konfiguracji. Włącz go przez Sprawdź → Zobacz → Zapisz i włącz na Timery lub Przegląd (D-060).',
      );
      return;
    }
    if (kind === 'wojna') {
      cfg.setWarDraft((prev) => ({ ...prev, messageTemplate: warTpl }));
      setDirty(false);
      setMsg(
        'Szablon wojny jest w szkicu konfiguracji. Apply na Wojna / Przegląd — bez auto-publikacji.',
      );
      return;
    }
    persistRecurringAppearance(recurring);
    setDirty(false);
    setMsg(
      'Zapisano wygląd posta cyklicznego (lokalnie). Harmonogram i kanał ustawiasz w Cykliczne.',
    );
  };

  return (
    <>
      <h1>Wygląd postów</h1>
      <p className="technik-lead">
        Tu ustawiasz <strong>jak wygląda</strong> treść — nie publikujesz. Wybierz typ poniżej,
        zapisz szkic, a na Discord wyślesz dopiero ręcznie (Centrum → Opublikuj albo Apply D-060).
      </p>

      <PageJobNote>
        <p>
          Edytor wyglądu z przełącznikiem typu: panel Centrum, PW timerów, PW wojny, post cykliczny.
          Przyciski hubu włączasz w Centrum; kanały — w Kanałach.
        </p>
      </PageJobNote>

      <PlayerSeesNote>
        <p>
          Gracz widzi efekt dopiero po Twojej publikacji / Apply: ramkę Centrum na kanale albo
          prywatną wiadomość od bota. Sam szkic nic nie wysyła.
        </p>
      </PlayerSeesNote>

      <div className="technik-kind-tabs" role="tablist" aria-label="Typ wyglądu">
        {KIND_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={kind === t.id}
            className={kind === t.id ? 'is-active' : undefined}
            onClick={() => {
              setKind(t.id);
              setMsg(null);
            }}
          >
            <strong>{t.label}</strong>
            <small>{t.hint}</small>
          </button>
        ))}
      </div>

      <div className="technik-row" style={{ marginTop: '0.85rem' }}>
        <button type="button" className="technik-test-dm-btn" onClick={saveDraft}>
          Zapisz szkic{dirty ? ' ·' : ''}
        </button>
        {kind === 'centrum' ? (
          <a className="technik-btn-ghost" href="/technik/centrum">
            Centrum → Opublikuj
          </a>
        ) : null}
        {kind === 'timery' ? (
          <a className="technik-btn-ghost" href="/technik/timery">
            Timery → pełne ustawienia / Apply
          </a>
        ) : null}
        {kind === 'wojna' ? (
          <a className="technik-btn-ghost" href="/technik/wojna">
            Wojna → pełne ustawienia / Apply
          </a>
        ) : null}
        {kind === 'cykliczne' ? (
          <a className="technik-btn-ghost" href="/technik/cykliczne">
            Cykliczne → harmonogram
          </a>
        ) : null}
        {msg ? (
          <p className="technik-test-status technik-test-status--ok" role="status">
            {msg}
          </p>
        ) : dirty ? (
          <span className="technik-muted">Niezapisane zmiany w podglądzie</span>
        ) : null}
      </div>

      {kind === 'centrum' ? (
        <>
          <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
            <h2>Nagłówek panelu Centrum</h2>
            <p className="technik-help">
              Te pola lecą w payloadzie Opublikuj: title, description, accentHex, includeBanner,
              bannerUrl, customButtons (+ enabledActions z Centrum).
            </p>
            <label className="technik-field">
              <span>Tytuł panelu</span>
              <input
                value={draft.panelTitle}
                onChange={(e) => patchCentrum({ panelTitle: e.target.value })}
                maxLength={80}
                placeholder="np. Centrum aktywności"
              />
            </label>
            <label className="technik-field">
              <span>Krótki opis</span>
              <textarea
                className="technik-textarea"
                rows={3}
                value={draft.panelDescription}
                onChange={(e) => patchCentrum({ panelDescription: e.target.value })}
                maxLength={400}
                placeholder="Jedno–dwa zdania pod tytułem"
              />
            </label>
            <div className="technik-row">
              <label className="technik-field">
                <span>Kolor akcentu</span>
                <div className="technik-accent-row">
                  <input
                    type="color"
                    className="technik-accent-swatch"
                    value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#5865F2'}
                    onChange={(e) => patchCentrum({ accentHex: e.target.value })}
                    aria-label="Wybierz kolor akcentu"
                  />
                  <input
                    value={draft.accentHex}
                    onChange={(e) => patchCentrum({ accentHex: e.target.value })}
                    placeholder="#5865F2"
                  />
                </div>
              </label>
              <label className="technik-check" style={{ alignSelf: 'end' }}>
                <input
                  type="checkbox"
                  checked={draft.includeBanner}
                  onChange={(e) => patchCentrum({ includeBanner: e.target.checked })}
                />
                Pokaż banner
              </label>
            </div>
            <label className="technik-field">
              <span>URL bannera (obrazek)</span>
              <input
                type="url"
                value={draft.bannerUrl}
                onChange={(e) => patchCentrum({ bannerUrl: e.target.value })}
                placeholder="https://…/banner.png"
                disabled={!draft.includeBanner}
              />
              <small className="technik-help">
                Zamiast samego checkboxa — podajesz adres grafiki. Puste = dekoracyjny gradient w
                podglądzie (New Bot może wymagać URL).
              </small>
            </label>
          </section>

          <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
            <div className="technik-panel-head">
              <h2>Własne przyciski pod postem</h2>
              <button
                type="button"
                className="technik-btn-ghost"
                onClick={() => {
                  patchCentrum({
                    customButtons: [...draft.customButtons, createEmptyCustomButton()],
                  });
                }}
              >
                Dodaj przycisk
              </button>
            </div>
            <p className="technik-help">
              Osobne od włączonych akcji hubu (Centrum). Action: create / lfg / mine / notify /
              profile / forme / url / ephemeral_text. Style: primary / secondary / danger.
            </p>
            {draft.customButtons.length === 0 ? (
              <p className="technik-muted">
                Brak własnych przycisków — hub pokazuje tylko akcje z Centrum.
              </p>
            ) : (
              <ul className="technik-custom-btn-list">
                {draft.customButtons.map((b, i) => (
                  <li key={b.id} className="technik-custom-btn-card">
                    <div className="technik-row">
                      <strong>#{i + 1}</strong>
                      <button
                        type="button"
                        className="technik-btn-ghost"
                        disabled={i === 0}
                        onClick={() => moveButton(b.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="technik-btn-ghost"
                        disabled={i === draft.customButtons.length - 1}
                        onClick={() => moveButton(b.id, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="technik-btn-ghost"
                        onClick={() => {
                          patchCentrum({
                            customButtons: draft.customButtons.filter((x) => x.id !== b.id),
                          });
                        }}
                      >
                        Usuń
                      </button>
                    </div>
                    <label className="technik-field">
                      <span>Etykieta</span>
                      <input
                        value={b.label}
                        maxLength={80}
                        onChange={(e) => patchButton(b.id, { label: e.target.value })}
                      />
                    </label>
                    <div className="technik-guild-layout" style={{ marginTop: '0.5rem' }}>
                      <label className="technik-field">
                        <span>Styl</span>
                        <select
                          value={b.style}
                          onChange={(e) =>
                            patchButton(b.id, { style: e.target.value as CustomButtonStyle })
                          }
                        >
                          {CUSTOM_BUTTON_STYLES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="technik-field">
                        <span>Akcja</span>
                        <select
                          value={b.action}
                          onChange={(e) =>
                            patchButton(b.id, { action: e.target.value as CustomButtonAction })
                          }
                        >
                          {CUSTOM_BUTTON_ACTIONS.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {b.action === 'url' ? (
                      <label className="technik-field">
                        <span>URL</span>
                        <input
                          type="url"
                          value={b.url ?? ''}
                          onChange={(e) => patchButton(b.id, { url: e.target.value })}
                          placeholder="https://"
                        />
                      </label>
                    ) : null}
                    {b.action === 'ephemeral_text' ? (
                      <label className="technik-field">
                        <span>Tekst ephemeral</span>
                        <textarea
                          rows={2}
                          value={b.ephemeralText ?? ''}
                          onChange={(e) => patchButton(b.id, { ephemeralText: e.target.value })}
                          maxLength={200}
                        />
                      </label>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
            <h2>Podgląd Discord (Centrum)</h2>
            <p className="technik-help">
              Akcje hubu pochodzą z zakładki Centrum (tylko podgląd). Własne przyciski — z tej
              strony.
            </p>
            <div className="technik-discord-preview" aria-label="Podgląd panelu Centrum">
              <div className="technik-discord-preview__chrome">
                <span className="technik-discord-preview__hash">#</span>
                <span>centrum</span>
                <span className="technik-muted">· podgląd</span>
              </div>
              <div className="technik-discord-preview__msg">
                <div className="technik-discord-preview__avatar" aria-hidden="true">
                  D
                </div>
                <div className="technik-discord-preview__body">
                  <div className="technik-discord-preview__meta">
                    <strong>DESTILED</strong>
                    <span className="technik-discord-preview__bot">BOT</span>
                    <span className="technik-muted">dziś</span>
                  </div>
                  <div
                    className="technik-discord-preview__container"
                    style={{ borderLeftColor: accent }}
                  >
                    {draft.includeBanner ? (
                      bannerUrl ? (
                        <img
                          className="technik-discord-preview__banner-img"
                          src={bannerUrl}
                          alt="Podgląd bannera"
                        />
                      ) : (
                        <div
                          className="technik-discord-preview__banner"
                          style={{
                            background: `linear-gradient(135deg, ${accent}55, #1e1f22 60%)`,
                          }}
                        >
                          Banner — dodaj URL powyżej
                        </div>
                      )
                    ) : null}
                    <h3 className="technik-discord-preview__title">
                      {draft.panelTitle || 'Centrum aktywności'}
                    </h3>
                    <p className="technik-discord-preview__desc">{draft.panelDescription || '—'}</p>
                    <hr className="technik-discord-preview__sep" />
                    {previewActions.length === 0 ? (
                      <p className="technik-muted">
                        Brak włączonych akcji hubu — włącz je w{' '}
                        <a href="/technik/centrum">Centrum panel</a>.
                      </p>
                    ) : (
                      <div className="technik-discord-preview__actions">
                        {previewActions.map((a) => (
                          <div key={a.id} className="technik-discord-preview__action-row">
                            <div>
                              <strong>{a.label}</strong>
                              <small>{a.description}</small>
                            </div>
                            <span className="technik-discord-preview__btn technik-discord-preview__btn--primary">
                              {a.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {draft.customButtons.length ? (
                      <>
                        <hr className="technik-discord-preview__sep" />
                        <div className="technik-discord-preview__actions">
                          {draft.customButtons.map((b) => (
                            <div key={b.id} className="technik-discord-preview__action-row">
                              <div>
                                <strong>{b.label || 'Przycisk'}</strong>
                                <small>
                                  {b.action}
                                  {b.action === 'url' && b.url ? ` · ${b.url}` : ''}
                                </small>
                              </div>
                              <span className={btnClass(b.style)}>{b.label || 'Przycisk'}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {kind === 'timery' ? (
        <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>Szablon PW — Timery postaci</h2>
          <p className="technik-help">
            Placeholdery: {'{{title}}'}, {'{{body}}'}, {'{{otherTimersSummary}}'},{' '}
            {'{{deepLinkUrl}}'}. Pełne włączanie modułu i Test DM:{' '}
            <a href="/technik/timery">Timery postaci</a>.
          </p>
          <label className="technik-field technik-field--message">
            <span>messageTemplate</span>
            <textarea
              className="technik-message-template"
              value={timerTpl}
              onChange={(e) => {
                setTimerTpl(e.target.value);
                setDirty(true);
                setMsg(null);
              }}
            />
          </label>
          <h3 style={{ marginTop: '1rem' }}>Podgląd (przykładowe dane)</h3>
          <pre className="technik-dm-preview">{fillTimerPreview(timerTpl)}</pre>
        </section>
      ) : null}

      {kind === 'wojna' ? (
        <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>Szablon PW — Wojna Królestw</h2>
          <p className="technik-help">
            Placeholdery: {'{{notifyMinutesBefore}}'}, {'{{warAt}}'}. Harmonogram i Test DM:{' '}
            <a href="/technik/wojna">Wojna</a>.
          </p>
          <label className="technik-field technik-field--message">
            <span>messageTemplate</span>
            <textarea
              className="technik-message-template"
              value={warTpl}
              onChange={(e) => {
                setWarTpl(e.target.value);
                setDirty(true);
                setMsg(null);
              }}
            />
          </label>
          <h3 style={{ marginTop: '1rem' }}>Podgląd (przykładowe dane)</h3>
          <pre className="technik-dm-preview">{fillWarPreview(warTpl)}</pre>
        </section>
      ) : null}

      {kind === 'cykliczne' ? (
        <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
          <h2>Wygląd posta cyklicznego</h2>
          <p className="technik-help">
            Tytuł i treść szkicu. Dni / godzinę / kanał ustawiasz w{' '}
            <a href="/technik/cykliczne">Cykliczne</a>.
          </p>
          <label className="technik-field">
            <span>Tytuł</span>
            <input
              value={recurring.title}
              maxLength={100}
              onChange={(e) => {
                setRecurring((p) => ({ ...p, title: e.target.value }));
                setDirty(true);
                setMsg(null);
              }}
              placeholder="np. Reset tygodniowy"
            />
          </label>
          <label className="technik-field">
            <span>Treść</span>
            <textarea
              className="technik-textarea"
              rows={6}
              value={recurring.content}
              onChange={(e) => {
                setRecurring((p) => ({ ...p, content: e.target.value }));
                setDirty(true);
                setMsg(null);
              }}
              placeholder="Treść posta na kanale…"
            />
          </label>
          <h3 style={{ marginTop: '1rem' }}>Podgląd</h3>
          <div className="technik-discord-preview" aria-label="Podgląd posta cyklicznego">
            <div className="technik-discord-preview__chrome">
              <span className="technik-discord-preview__hash">#</span>
              <span>cykliczne</span>
            </div>
            <div className="technik-discord-preview__msg">
              <div className="technik-discord-preview__avatar" aria-hidden="true">
                D
              </div>
              <div className="technik-discord-preview__body">
                <div className="technik-discord-preview__meta">
                  <strong>DESTILED</strong>
                  <span className="technik-discord-preview__bot">BOT</span>
                </div>
                <div className="technik-discord-preview__container">
                  <h3 className="technik-discord-preview__title">
                    {recurring.title || 'Bez tytułu'}
                  </h3>
                  <p className="technik-discord-preview__desc" style={{ whiteSpace: 'pre-wrap' }}>
                    {recurring.content || '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {kind === 'centrum' ? <ReactionsForbiddenNote /> : null}

      <HonestGap>
        <p>
          {kind === 'centrum' ? (
            <>
              Katalog zatwierdzonych bannerów i finalny kolor akcentu to decyzja Ownera. Ten szkic
              nie wysyła nic sam — dopiero ręczne <strong>Opublikuj</strong> w Centrum.
            </>
          ) : (
            <>
              Wygląd PW / cyklicznych zapisujesz jako szkic. Wysłanie na Discord zawsze wymaga
              osobnej akcji (Apply D-060 albo publikacja cykliczna) — zero auto-publish.
            </>
          )}
        </p>
      </HonestGap>
    </>
  );
}
