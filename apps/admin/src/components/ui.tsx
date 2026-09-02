import type { ReactNode } from 'react';

import { ownerFacingMessage } from '../owner-errors.js';

export type LoadState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly detail?: string | null;
      readonly forbidden?: boolean;
    }
  | { readonly kind: 'ready'; readonly data: T };

export function errorFromUnknown(error: unknown): {
  message: string;
  forbidden: boolean;
  fields: Readonly<Record<string, string>>;
  detail: string | null;
} {
  const mapped = ownerFacingMessage(error);
  return {
    message: mapped.message,
    forbidden: mapped.forbidden,
    fields: mapped.fields,
    detail: mapped.detail,
  };
}

export function PageHeader(props: { title: string; description?: string }) {
  return (
    <header className="page-header">
      <h1>{props.title}</h1>
      {props.description !== undefined ? <p className="muted">{props.description}</p> : null}
    </header>
  );
}

export function Flash(props: {
  tone: 'success' | 'error' | 'info';
  children: ReactNode;
  detail?: string | null;
}) {
  return (
    <div className={`flash flash-${props.tone}`} role={props.tone === 'error' ? 'alert' : 'status'}>
      <div>{props.children}</div>
      {props.detail !== undefined && props.detail !== null && props.detail !== '' ? (
        <details className="details-toggle">
          <summary>Szczegóły</summary>
          <p>{props.detail}</p>
        </details>
      ) : null}
    </div>
  );
}

export function LoadGate<T>(props: {
  state: LoadState<T>;
  emptyMessage?: string;
  children: (data: T) => ReactNode;
}) {
  if (props.state.kind === 'loading') {
    return <p className="state-loading">Ładowanie…</p>;
  }
  if (props.state.kind === 'empty') {
    return <p className="state-empty">{props.emptyMessage ?? 'Nic tu jeszcze nie ma.'}</p>;
  }
  if (props.state.kind === 'error') {
    if (props.state.forbidden === true) {
      return (
        <p className="state-forbidden">
          Nie masz uprawnień do tej operacji.
          {props.state.message !== '' ? (
            <span className="muted"> Szczegóły: {props.state.message}</span>
          ) : null}
        </p>
      );
    }
    return (
      <div className="state-error">
        <p>{props.state.message}</p>
        {props.state.detail !== undefined &&
        props.state.detail !== null &&
        props.state.detail !== '' ? (
          <details className="details-toggle">
            <summary>Szczegóły</summary>
            <p>{props.state.detail}</p>
          </details>
        ) : null}
      </div>
    );
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
