'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_APPEARANCE,
  loadAppearance,
  persistAppearance,
  type AppearanceDraft,
} from './appearance';
import {
  CENTRUM_HUB_ACTIONS,
  loadEnabledHubActions,
  type CentrumHubActionId,
} from './centrum-hub-actions';
import { HonestGap, PageJobNote, PlayerSeesNote, ReactionsForbiddenNote } from './ui-notes';

export function TechnikWygladPage() {
  const [draft, setDraft] = useState<AppearanceDraft>(DEFAULT_APPEARANCE);
  const [enabled, setEnabled] = useState<CentrumHubActionId[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(loadAppearance());
    setEnabled(loadEnabledHubActions());
  }, []);

  const persist = (next: AppearanceDraft) => {
    setDraft(next);
    persistAppearance(next);
    setMsg(
      'Zapisano wygląd lokalnie (szkic). Publikacja na Discordzie jest w Centrum — przycisk Opublikuj wyśle tytuł, opis, akcent i banner.',
    );
  };

  const previewActions = useMemo(
    () => CENTRUM_HUB_ACTIONS.filter((a) => enabled.includes(a.id)),
    [enabled],
  );

  const accent = draft.accentHex || '#5865F2';

  return (
    <>
      <h1>Wygląd postów</h1>
      <p className="technik-lead">
        Tylko wygląd panelu Centrum: tytuł, krótki opis, akcent i opcjonalny banner. Które przyciski
        są włączone — ustawiasz w <a href="/technik/centrum">Centrum panel</a>.
      </p>

      <PageJobNote>
        <p>
          Ustawiasz, jak wygląda stały panel hub na Discordzie. Bez listy modułów i bez publikacji —
          to osobne zakładki. Szkic trafia do payloadu przy ręcznym Opublikuj w Centrum.
        </p>
      </PageJobNote>

      <PlayerSeesNote>
        <p>
          Na kanale: jedna ramka (Container) z kolorowym paskiem akcentu, tytułem, krótkim opisem i
          sekcjami z przyciskami. Banner jest tylko ozdobą — klikalne są przyciski, nie obrazek.
        </p>
      </PlayerSeesNote>

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <h2>Nagłówek panelu</h2>
        <label className="technik-field">
          <span>Tytuł panelu</span>
          <input
            value={draft.panelTitle}
            onChange={(e) => persist({ ...draft, panelTitle: e.target.value })}
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
            onChange={(e) => persist({ ...draft, panelDescription: e.target.value })}
            maxLength={400}
            placeholder="Jedno–dwa zdania pod tytułem"
          />
        </label>
        <div className="technik-row">
          <label className="technik-field">
            <span>Kolor akcentu (Owner)</span>
            <div className="technik-accent-row">
              <input
                type="color"
                className="technik-accent-swatch"
                value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#5865F2'}
                onChange={(e) => persist({ ...draft, accentHex: e.target.value })}
                aria-label="Wybierz kolor akcentu"
              />
              <input
                value={draft.accentHex}
                onChange={(e) => persist({ ...draft, accentHex: e.target.value })}
                placeholder="#5865F2"
              />
            </div>
            <small className="technik-help">
              Finalny kolor na produkcji wymaga sign-off Ownera. Tu przygotujesz szkic — pójdzie w
              payload Opublikuj.
            </small>
          </label>
          <label className="technik-check" style={{ alignSelf: 'end' }}>
            <input
              type="checkbox"
              checked={draft.includeBanner}
              onChange={(e) => persist({ ...draft, includeBanner: e.target.checked })}
            />
            Pokaż dekoracyjny banner
          </label>
        </div>
        {msg ? (
          <p className="technik-test-status" role="status">
            {msg}
          </p>
        ) : null}
      </section>

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <h2>Podgląd Discord (Components V2)</h2>
        <p className="technik-help">
          Podgląd stylu Container — nie JSON. Lista przycisków pochodzi z zakładki Centrum.
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
                  <div
                    className="technik-discord-preview__banner"
                    style={{
                      background: `linear-gradient(135deg, ${accent}55, #1e1f22 60%)`,
                    }}
                  >
                    Banner dekoracyjny
                  </div>
                ) : null}
                <h3 className="technik-discord-preview__title">
                  {draft.panelTitle || 'Centrum aktywności'}
                </h3>
                <p className="technik-discord-preview__desc">
                  {draft.panelDescription || '—'}
                </p>
                <hr className="technik-discord-preview__sep" />
                {previewActions.length === 0 ? (
                  <p className="technik-muted">Brak włączonych akcji — włącz je w Centrum panel.</p>
                ) : (
                  <div className="technik-discord-preview__actions">
                    {previewActions.map((a) => (
                      <div key={a.id} className="technik-discord-preview__action-row">
                        <div>
                          <strong>{a.label}</strong>
                          <small>{a.description}</small>
                        </div>
                        <span className="technik-discord-preview__btn">{a.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="technik-row" style={{ marginTop: '0.75rem' }}>
          <a className="technik-test-dm-btn" href="/technik/centrum">
            Przejdź do Centrum → Opublikuj
          </a>
          <a className="technik-btn-ghost" href="/technik/kanaly">
            Kanały →
          </a>
        </div>
      </section>

      <ReactionsForbiddenNote />

      <HonestGap>
        <p>
          Katalog zatwierdzonych bannerów i finalny kolor akcentu to decyzja Ownera. Ten szkic nie
          wysyła nic sam — dopiero ręczne <strong>Opublikuj</strong> w Centrum wysyła payload na
          Discord (tytuł, opis, akcent, banner, włączone akcje). New Bot może na razie ignorować
          część pól — wtedy zobaczysz uczciwy błąd HTTP.
        </p>
      </HonestGap>
    </>
  );
}
