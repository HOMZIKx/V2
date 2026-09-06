'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  CENTRUM_HUB_ACTIONS,
  loadEnabledHubActions,
  type CentrumHubActionId,
} from './centrum-hub-actions';
import { HonestGap, PageJobNote, PlayerSeesNote, ReactionsForbiddenNote } from './ui-notes';

const APPEARANCE_KEY = 'technik.appearance.v1';

type AppearanceDraft = {
  panelTitle: string;
  panelDescription: string;
  accentHex: string;
  includeBanner: boolean;
};

const DEFAULT_APPEARANCE: AppearanceDraft = {
  panelTitle: 'Centrum aktywności',
  panelDescription:
    'Utwórz aktywność, znajdź ekipę albo sprawdź powiadomienia — wszystko w jednym panelu.',
  accentHex: '#5865F2',
  includeBanner: true,
};

function loadAppearance(): AppearanceDraft {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const p = JSON.parse(raw) as Partial<AppearanceDraft>;
    return {
      panelTitle: typeof p.panelTitle === 'string' ? p.panelTitle : DEFAULT_APPEARANCE.panelTitle,
      panelDescription:
        typeof p.panelDescription === 'string'
          ? p.panelDescription
          : DEFAULT_APPEARANCE.panelDescription,
      accentHex: typeof p.accentHex === 'string' ? p.accentHex : DEFAULT_APPEARANCE.accentHex,
      includeBanner:
        typeof p.includeBanner === 'boolean' ? p.includeBanner : DEFAULT_APPEARANCE.includeBanner,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

function persistAppearance(next: AppearanceDraft): void {
  // Keep only appearance fields — never re-write module toggles here.
  let leftovers: Record<string, unknown> = {};
  try {
    const prevRaw = localStorage.getItem(APPEARANCE_KEY);
    leftovers = prevRaw ? (JSON.parse(prevRaw) as Record<string, unknown>) : {};
  } catch {
    leftovers = {};
  }
  if ('enabledModules' in leftovers) {
    delete leftovers.enabledModules;
  }
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ ...leftovers, ...next }));
}

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
    setMsg('Zapisano wygląd lokalnie (szkic Technika). Kolor akcentu wymaga zgody Ownera przed prod.');
  };

  const previewActions = useMemo(
    () => CENTRUM_HUB_ACTIONS.filter((a) => enabled.includes(a.id)),
    [enabled],
  );

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
          to osobne zakładki.
        </p>
      </PageJobNote>

      <PlayerSeesNote>
        <p>
          Na kanale: jedna ramka (Container) z tytułem, krótkim opisem i sekcjami z przyciskami.
          Banner jest tylko ozdobą — klikalne są przyciski, nie obrazek.
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
            <input
              value={draft.accentHex}
              onChange={(e) => persist({ ...draft, accentHex: e.target.value })}
              placeholder="#5865F2"
            />
            <small className="technik-help">
              Finalny kolor na produkcji wymaga sign-off Ownera. Tu możesz przygotować szkic.
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
        <h2>Podgląd — jak to wygląda na Discordzie</h2>
        <p className="technik-help">
          Prosty podgląd słowny (nie JSON). Lista przycisków pochodzi z zakładki Centrum — tu tylko
          je pokazujemy.
        </p>
        <div className="technik-centrum-preview" aria-label="Podgląd panelu Centrum">
          <div
            className="technik-centrum-preview__frame"
            style={{ borderColor: draft.accentHex || '#5865F2' }}
          >
            {draft.includeBanner ? (
              <div className="technik-centrum-preview__banner">Banner dekoracyjny</div>
            ) : null}
            <strong>{draft.panelTitle || 'Centrum aktywności'}</strong>
            <p>{draft.panelDescription || '—'}</p>
            <hr className="technik-centrum-preview__sep" />
            {previewActions.length === 0 ? (
              <p className="technik-muted">Brak włączonych akcji — włącz je w Centrum panel.</p>
            ) : (
              previewActions.map((a) => (
                <div key={a.id} className="technik-centrum-preview__row">
                  <span>
                    <em>{a.label}</em>
                    <small>{a.description}</small>
                  </span>
                  <span className="technik-centrum-preview__btn">{a.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <p className="technik-help" style={{ marginTop: '0.75rem' }}>
          Treści prywatnych wiadomości (timery, wojna) edytujesz w{' '}
          <a href="/technik/timery">Timery postaci</a> i <a href="/technik/wojna">Wojna Królestw</a>.
        </p>
        <div className="technik-row" style={{ marginTop: '0.5rem' }}>
          <a className="technik-test-dm-btn" href="/technik/centrum">
            Przejdź do Centrum panel →
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
          wysyła nic na Discord — publikacja jest w Centrum panel.
        </p>
      </HonestGap>
    </>
  );
}
