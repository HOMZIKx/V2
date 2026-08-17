'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Alert, EmptyState as DsEmpty, LoadingState as DsLoading, Panel } from '@v2/design-system';

export function LoadingState({ label = 'Ładowanie…' }: { label?: string }) {
  return (
    <Panel>
      <DsLoading label={label} />
    </Panel>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Panel title={title}>
      <DsEmpty>{children}</DsEmpty>
    </Panel>
  );
}

export function ErrorState({
  title = 'Nie udało się wczytać danych',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <Alert tone="error">
      <strong>{title}</strong>
      {children !== undefined ? <div>{children}</div> : null}
    </Alert>
  );
}

export function ForbiddenState() {
  return (
    <Alert tone="error">
      <strong>Brak dostępu</strong>
      <div>Nie masz dostępu do tego serwera.</div>
    </Alert>
  );
}

export function UnauthorizedState() {
  return (
    <Alert tone="info">
      <strong>Sesja wygasła.</strong>
      <div>
        <Link className="v2-btn v2-btn-primary" href="/logowanie">
          Zaloguj ponownie
        </Link>
      </div>
    </Alert>
  );
}

export function UnavailableState({
  title = 'Chwilowo niedostępne',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <Alert tone="info">
      <strong>{title}</strong>
      <div>{children ?? 'Ta funkcja jest chwilowo niedostępna.'}</div>
    </Alert>
  );
}

export function NotFoundState() {
  return (
    <Alert tone="info">
      <strong>Ta aktywność już nie istnieje.</strong>
    </Alert>
  );
}

export function ConflictState({ children }: { children?: ReactNode }) {
  return (
    <Alert tone="info">
      <strong>Dane zmieniły się w międzyczasie.</strong>
      <div>{children ?? 'Odśwież i spróbuj ponownie.'}</div>
    </Alert>
  );
}
