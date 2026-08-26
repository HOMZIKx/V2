'use client';

import { DEFAULT_PARTY_ROLE_CATALOG, listEnabledClassSpecs } from '@v2/hub-core';

export function ProfileFoundationPage() {
  return (
    <div className="member-page">
      <h1>Mój profil</h1>
      <p>Twoje postacie, profesje i role — wspólne dla Discorda i WWW.</p>
      <section>
        <h2>Profesje</h2>
        <ul>
          {listEnabledClassSpecs().map((entry) => (
            <li key={entry.key}>{entry.label}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Role w ekipie</h2>
        <ul>
          {DEFAULT_PARTY_ROLE_CATALOG.map((entry) => (
            <li key={entry.key}>
              <strong>{entry.label}</strong> — {entry.description}
            </li>
          ))}
        </ul>
      </section>
      <p className="muted">
        Pełna edycja postaci dostępna też w Discordzie (Mój profil / Szukam ekipy).
      </p>
    </div>
  );
}
