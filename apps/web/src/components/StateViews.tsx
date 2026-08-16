'use client';

import type { ReactNode } from 'react';

type Tone = 'neutral' | 'danger' | 'warn';

export function StatePanel({
  title,
  children,
  tone = 'neutral',
}: {
  title: string;
  children?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div
      className="panel state-panel"
      data-tone={tone === 'neutral' ? undefined : tone}
      role="status"
    >
      <strong>{title}</strong>
      {children !== undefined ? <div>{children}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Ładowanie…' }: { label?: string }) {
  return <StatePanel title={label} />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <StatePanel title={title}>{children}</StatePanel>;
}

export function ErrorState({
  title = 'Nie udało się wczytać danych',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <StatePanel title={title} tone="danger">
      {children}
    </StatePanel>
  );
}

export function ForbiddenState() {
  return (
    <StatePanel title="Brak dostępu" tone="danger">
      Nie masz uprawnień do tej treści.
    </StatePanel>
  );
}

export function UnavailableState({
  title = 'Niedostępne',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <StatePanel title={title} tone="warn">
      {children ?? 'Serwis jest chwilowo niedostępny. Spróbuj ponownie później.'}
    </StatePanel>
  );
}
