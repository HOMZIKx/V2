'use client';

import { HonestGap, ReactionsForbiddenNote } from './ui-notes';

export function TechnikOwnerPage() {
  return (
    <>
      <h1>Poza zakresem Technika (Owner)</h1>
      <p className="technik-lead">
        Tu nie ma formularzy — świadomie. Sekrety, allowlista i tokeny żyją u Ownera / w env, nie w
        panelu Technika (WEB_ACCESS / D-060).
      </p>

      <section className="technik-panel technik-panel--wide">
        <h2>Czego Technika nie rusza</h2>
        <ul className="technik-message-list">
          <li>
            Token bota Discord — env <code>DISCORD_TOKEN</code>
          </li>
          <li>OAuth / Identity secrets</li>
          <li>Allowlista właściciela (Discord User ID)</li>
          <li>
            Signing keys — <code>DISCORD_COMPONENT_SIGNING_SECRET</code>, JWT
          </li>
          <li>
            S2S: <code>DISCORD_TECHNIKA_SHARED_SECRET</code>, <code>DISCORD_NOTIFY_SHARED_SECRET</code>{' '}
            (serwer WWW trzyma je poza przeglądarką)
          </li>
          <li>Database URLs, Zeabur secrets, private keys</li>
          <li>
            Operatory testowi — <code>DISCORD_OPERATOR_*</code>
          </li>
        </ul>
        <p className="technik-help" style={{ marginTop: '0.75rem' }}>
          Walidacja draftu gateway odrzuca klucze zawierające m.in. token, secret, password,
          allowlist, oauth, database, privateKey.
        </p>
      </section>

      <div style={{ marginTop: '1rem' }}>
        <ReactionsForbiddenNote />
      </div>

      <HonestGap>
        <p>
          Centrum Aktywności (katalogi typów, RSVP, hub, kanały publikacji activity-service) —
          osobny produkt, <strong>odroczone</strong>. Technik skupia się na tym, co bot Discord
          publikuje i wysyła w PW.
        </p>
      </HonestGap>
    </>
  );
}
