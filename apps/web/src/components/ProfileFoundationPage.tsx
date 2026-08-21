'use client';

import { DEFAULT_CLASS_SPEC_CATALOG, DEFAULT_PARTY_ROLE_CATALOG } from '@v2/hub-core';

export function ProfileFoundationPage() {
  return (
    <div className="member-page">
      <h1>Mój profil</h1>
      <p>
        Fundament profilu V2 wspólny dla Discord, WWW, LFG i powiadomień. Klasa/spec jest osobna od
        roli party.
      </p>
      <section>
        <h2>Katalog klasy / spec</h2>
        <ul>
          {DEFAULT_CLASS_SPEC_CATALOG.filter((entry) => entry.enabled).map((entry) => (
            <li key={entry.key}>{entry.label}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Role party</h2>
        <ul>
          {DEFAULT_PARTY_ROLE_CATALOG.map((entry) => (
            <li key={entry.key}>
              <strong>{entry.label}</strong> — {entry.description}
            </li>
          ))}
        </ul>
      </section>
      <p className="muted">
        Edycja postaci i zainteresowań przez API Identity (`/identity/v1/profile`) — UI formularza w
        kolejnej iteracji.
      </p>
    </div>
  );
}
