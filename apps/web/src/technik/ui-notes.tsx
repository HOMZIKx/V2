'use client';

import type { ReactNode } from 'react';

/** Short Polish note: what this Technik page is for. */
export function PageJobNote({ children }: { readonly children: ReactNode }) {
  return (
    <aside className="technik-page-job" aria-label="Co robi ta strona">
      <strong>Co robi ta strona</strong>
      <div>{children}</div>
    </aside>
  );
}

/** Short Polish note: what the player sees on Discord when this is on. */
export function PlayerSeesNote({ children }: { readonly children: ReactNode }) {
  return (
    <aside className="technik-player-sees" aria-label="Co widzi gracz na Discordzie">
      <strong>Co widzi gracz na Discordzie</strong>
      <div>{children}</div>
    </aside>
  );
}

export function HonestGap({ children }: { readonly children: ReactNode }) {
  return (
    <div className="technik-empty" role="note">
      {children}
    </div>
  );
}

export function ReactionsForbiddenNote() {
  return (
    <HonestGap>
      <p>
        <strong>Reakcje emoji jako nawigacja / RSVP są wyłączone produktowo.</strong> Panele używają
        przycisków Components V2 — nie ma przełącznika „włącz reakcje RSVP”.
      </p>
    </HonestGap>
  );
}
