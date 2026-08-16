import type { ReactNode } from 'react';

import { ApiClientError } from '../api/http.js';

export type LoadState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'error'; readonly message: string; readonly forbidden?: boolean }
  | { readonly kind: 'ready'; readonly data: T };

export function errorFromUnknown(error: unknown): {
  message: string;
  forbidden: boolean;
  fields: Readonly<Record<string, string>>;
} {
  if (error instanceof ApiClientError) {
    return {
      message: error.message,
      forbidden: error.isForbidden,
      fields: error.fields,
    };
  }
  if (error instanceof Error) {
    return { message: error.message, forbidden: false, fields: {} };
  }
  return { message: 'Unexpected error', forbidden: false, fields: {} };
}

export function PageHeader(props: { title: string; description?: string }) {
  return (
    <header className="page-header">
      <h1>{props.title}</h1>
      {props.description !== undefined ? <p className="muted">{props.description}</p> : null}
    </header>
  );
}

export function Flash(props: { tone: 'success' | 'error' | 'info'; children: ReactNode }) {
  return <div className={`flash flash-${props.tone}`}>{props.children}</div>;
}

export function LoadGate<T>(props: {
  state: LoadState<T>;
  emptyMessage?: string;
  children: (data: T) => ReactNode;
}) {
  if (props.state.kind === 'loading') {
    return <p className="state-loading">Loading…</p>;
  }
  if (props.state.kind === 'empty') {
    return <p className="state-empty">{props.emptyMessage ?? 'Nothing here yet.'}</p>;
  }
  if (props.state.kind === 'error') {
    if (props.state.forbidden === true) {
      return <p className="state-forbidden">Forbidden — you lack permission for this action.</p>;
    }
    return <p className="state-error">Error: {props.state.message}</p>;
  }
  return <>{props.children(props.state.data)}</>;
}

export function FieldError(props: { message?: string | undefined }) {
  if (props.message === undefined || props.message === '') {
    return null;
  }
  return <p className="field-error">{props.message}</p>;
}

export function confirmDestructive(message: string): boolean {
  return window.confirm(message);
}

export function parseIdList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
