'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AuthStatus, PlayerIdentity } from '../src/player-store';
import { usePlayerStore } from '../src/player-store-react';
import {
  getIdentityAuthBaseUrl,
  isDiscordAuthSimulateEnabled,
  isIdentityAuthClientEnabled,
  probeIdentityLive,
  resolveDiscordViewerFromSession,
  startDiscordOAuthRedirect,
} from '../src/identity-auth-client';

export function DiscordEntryScreen() {
  const { state, hydrated, startAuth, finishAuth, cancelAuth, returnToEntry, resetStore } =
    usePlayerStore();
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const sessionProbeRef = useRef(false);
  const simulateEnabled = isDiscordAuthSimulateEnabled();

  const finishWithViewer = useCallback(
    (
      outcome: Exclude<AuthStatus, 'unauthenticated' | 'authenticating'>,
      viewer?: PlayerIdentity,
    ) => {
      finishAuth(outcome, viewer);
    },
    [finishAuth],
  );

  // After Discord OAuth redirect (or existing identity cookie): hydrate real viewer.
  useEffect(() => {
    if (!hydrated) return;
    if (sessionProbeRef.current) return;
    if (state.authStatus === 'authenticated' && state.viewer) {
      sessionProbeRef.current = true;
      return;
    }
    if (!isIdentityAuthClientEnabled()) {
      sessionProbeRef.current = true;
      return;
    }
    if (simulateEnabled && state.authStatus === 'authenticating') {
      return;
    }

    sessionProbeRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const resolved = await resolveDiscordViewerFromSession();
        if (cancelled) return;
        if (resolved) {
          finishWithViewer('authenticated', resolved.viewer);
          setStatusHint(null);
          return;
        }
        if (state.authStatus === 'authenticating') {
          finishWithViewer('cancelled');
          setStatusHint('Logowanie Discord nie dokończyło sesji. Spróbuj ponownie.');
        }
      } catch {
        if (cancelled) return;
        if (state.authStatus === 'authenticating') {
          finishWithViewer('unavailable');
          setStatusHint(
            'Brak sesji Identity (' +
              getIdentityAuthBaseUrl() +
              '). Uruchom identity-service i spróbuj ponownie.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, state.authStatus, state.viewer, finishWithViewer, simulateEnabled]);
  const onContinueWithDiscord = () => {
    setStatusHint(null);

    if (simulateEnabled) {
      startAuth();
      window.setTimeout(() => finishWithViewer('authenticated'), 700);
      return;
    }

    if (!isIdentityAuthClientEnabled()) {
      setStatusHint(
        'Prawdziwe OAuth jest wyłączone (NEXT_PUBLIC_IDENTITY_AUTH_ENABLED=false). Użyj symulatora poniżej.',
      );
      return;
    }

    startAuth();
    void (async () => {
      try {
        const live = await probeIdentityLive();
        if (!live) {
          finishWithViewer('unavailable');
          setStatusHint(
            'Identity nie odpowiada pod ' +
              getIdentityAuthBaseUrl() +
              '. Uruchom identity-service (dev).',
          );
          return;
        }
        startDiscordOAuthRedirect(window.location.origin);
      } catch {
        finishWithViewer('unavailable');
        setStatusHint(
          'Nie udało się uruchomić logowania Discord. Sprawdź IDENTITY_AUTH_ENABLED i credentials w .env.',
        );
      }
    })();
  };

  const simulate = (outcome: Exclude<AuthStatus, 'unauthenticated' | 'authenticating'>) => {
    startAuth();
    window.setTimeout(() => finishWithViewer(outcome), 500);
  };

  const onResetSession = () => {
    const ok = window.confirm(
      'Wyczyścić lokalną sesję? Usunie dane z tej przeglądarki i wrócisz do startu.',
    );
    if (!ok) return;
    resetStore();
    sessionProbeRef.current = false;
    setStatusHint(null);
  };

  return (
    <main className="discord-entry" id="main-content">
      <section className="discord-entry-card">
        <img alt="" className="brand-mark entry-mark" src="/brand/destiled-mark.jpg" />
        <span className="eyebrow">DESTILED</span>
        <h1>Wejdź przez Discord</h1>
        <p>
          Prywatne narzędzie zespołu na Project Hard. Logujesz się Discordem — bez wpisywania
          Discord ID jako hasła.
        </p>

        {state.authStatus === 'authenticating' ? (
          <p className="entry-status" role="status">
            {simulateEnabled ? 'Symulacja logowania…' : 'Przekierowanie do Discord…'}
            <button className="text-button" onClick={cancelAuth} type="button">
              Anuluj
            </button>
          </p>
        ) : null}

        {state.authStatus !== 'authenticating' &&
        !state.viewer &&
        state.authStatus !== 'unavailable' &&
        state.authStatus !== 'ineligible' &&
        state.authStatus !== 'revoked' ? (
          <>
            <button
              className="primary-button entry-primary"
              onClick={onContinueWithDiscord}
              type="button"
            >
              Kontynuuj z Discord
            </button>
            {state.authStatus === 'cancelled' && (
              <p className="entry-status is-warn" role="status">
                Anulowano logowanie. Możesz spróbować ponownie.
              </p>
            )}
          </>
        ) : null}

        {state.authStatus === 'unavailable' ? (
          <div className="entry-status is-warn" role="alert">
            <p>Discord / Identity jest chwilowo niedostępny. Zachowaliśmy miejsce docelowe.</p>
            <button className="primary-button" onClick={onContinueWithDiscord} type="button">
              Spróbuj ponownie
            </button>
          </div>
        ) : null}

        {state.authStatus === 'ineligible' ? (
          <div className="entry-status is-warn" role="alert">
            <p>
              Jesteś zalogowany, ale nie masz jeszcze dostępu. DESTILED jest prywatny — dostęp
              przyznaje właściciel.
            </p>
            <button className="primary-button" onClick={returnToEntry} type="button">
              Wróć
            </button>
          </div>
        ) : null}

        {statusHint ? (
          <p className="entry-status is-warn" role="status">
            {statusHint}
          </p>
        ) : null}

        {state.authStatus === 'revoked' ? (
          <div className="entry-status is-warn" role="alert">
            <p>Dostęp został odebrany. Prywatne dane tej sesji wyczyszczono.</p>
            <button className="primary-button" onClick={onContinueWithDiscord} type="button">
              Zaloguj ponownie
            </button>
          </div>
        ) : null}

        

        <p className="entry-meta">
          Identity: <code>127.0.0.1:4200</code> · Web: <code>127.0.0.1:3000</code>
        </p>

        <button className="text-button entry-reset" onClick={onResetSession} type="button">
          Wyczyść sesję lokalną
        </button>

        {simulateEnabled ? (
          <details className="entry-simulator">
            <summary>Symulator stanów (NEXT_PUBLIC_DISCORD_AUTH_SIMULATE)</summary>
            <div className="entry-simulator-actions">
              <button onClick={() => simulate('authenticated')} type="button">
                Dostęp OK
              </button>
              <button onClick={() => simulate('cancelled')} type="button">
                Anulowano
              </button>
              <button onClick={() => simulate('unavailable')} type="button">
                Discord down
              </button>
              <button onClick={() => simulate('ineligible')} type="button">
                Brak dostępu
              </button>
              <button onClick={() => simulate('revoked')} type="button">
                Odebrano dostęp
              </button>
            </div>
          </details>
        ) : null}
      </section>
    </main>
  );
}
