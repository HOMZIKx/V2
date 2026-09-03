'use client';

import { useEffect } from 'react';

import { usePlayerStore } from '../src/player-store-react';
import type { AuthStatus } from '../src/player-store';

export function DiscordEntryScreen() {
  const { state, startAuth, finishAuth, cancelAuth, returnToEntry } = usePlayerStore();

  useEffect(() => {
    if (state.authStatus !== 'authenticating') return;
    const timer = window.setTimeout(() => {
      finishAuth('authenticated');
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state.authStatus, finishAuth]);

  const simulate = (outcome: Exclude<AuthStatus, 'unauthenticated' | 'authenticating'>) => {
    startAuth();
    window.setTimeout(() => finishAuth(outcome), 500);
  };

  return (
    <main className="discord-entry" id="main-content">
      <section className="discord-entry-card">
        <img alt="" className="brand-mark entry-mark" src="/brand/destiled-mark.jpg" />
        <span className="eyebrow">DESTILED</span>
        <h1>Wejdź przez Discord</h1>
        <p>
          To prywatne narzędzie zespołu. Discord potwierdza tożsamość. Nie wpisujesz Discord ID jako
          dowodu logowania.
        </p>

        {state.authStatus === 'unauthenticated' || state.authStatus === 'cancelled' ? (
          <>
            <button className="primary-button entry-primary" onClick={() => startAuth()} type="button">
              Kontynuuj z Discord
            </button>
            {state.authStatus === 'cancelled' && (
              <p className="entry-status is-warn" role="status">
                Anulowano logowanie. Możesz spróbować ponownie.
              </p>
            )}
          </>
        ) : null}

        {state.authStatus === 'authenticating' ? (
          <p className="entry-status" role="status">
            Łączenie z Discord…
            <button className="text-button" onClick={cancelAuth} type="button">
              Anuluj
            </button>
          </p>
        ) : null}

        {state.authStatus === 'unavailable' ? (
          <div className="entry-status is-warn" role="alert">
            <p>Discord jest chwilowo niedostępny. Zachowaliśmy miejsce docelowe.</p>
            <button className="primary-button" onClick={() => startAuth()} type="button">
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

        {state.authStatus === 'revoked' ? (
          <div className="entry-status is-warn" role="alert">
            <p>Dostęp został odebrany. Prywatne dane tej sesji wyczyszczono.</p>
            <button className="primary-button" onClick={() => startAuth()} type="button">
              Zaloguj ponownie
            </button>
          </div>
        ) : null}

        <details className="entry-simulator">
          <summary>Symulator stanów (podgląd bez prawdziwego OAuth)</summary>
          <div className="entry-simulator-actions">
            <button onClick={() => simulate('authenticated')} type="button">
              Eligible
            </button>
            <button onClick={() => simulate('cancelled')} type="button">
              Cancelled
            </button>
            <button onClick={() => simulate('unavailable')} type="button">
              Unavailable
            </button>
            <button onClick={() => simulate('ineligible')} type="button">
              Ineligible
            </button>
            <button onClick={() => simulate('revoked')} type="button">
              Revoked
            </button>
          </div>
        </details>
      </section>
    </main>
  );
}
