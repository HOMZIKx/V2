'use client';

import type { ConfigSnapshot } from './technika-config-api';

export const D060_STEPS = [
  { id: 'Draft', label: 'Szkic' },
  { id: 'Validate', label: 'Sprawdź' },
  { id: 'Preview', label: 'Zobacz co się zmieni' },
  { id: 'Apply', label: 'Zapisz i włącz' },
  { id: 'Audit', label: 'Historia' },
  { id: 'Rollback', label: 'Cofnij' },
] as const;

export type D060StepId = (typeof D060_STEPS)[number]['id'];

type Props = {
  readonly step: D060StepId;
  readonly onStep: (id: D060StepId) => void;
  readonly snapshot: ConfigSnapshot | null;
  readonly canWrite: boolean;
  readonly metaLoaded: boolean;
  readonly writeBlockReason: string | null;
  readonly busy: boolean;
  readonly lastAction: string | null;
  readonly gatewayLabel: string;
  readonly onValidate: () => void;
  readonly onPreview: () => void;
  readonly onApply: () => void;
  readonly onRollback: () => void;
  readonly onRefresh: () => void;
  readonly help?: string;
  /** When false, hide numbered stepper (avoids duplicate labels above action buttons). */
  readonly showStepper?: boolean;
  /** Shorter button labels for cramped pages (e.g. Aktywność). */
  readonly compact?: boolean;
};

export function D060Controls({
  step,
  onStep,
  snapshot,
  canWrite,
  metaLoaded,
  writeBlockReason,
  busy,
  lastAction,
  gatewayLabel,
  onValidate,
  onPreview,
  onApply,
  onRollback,
  onRefresh,
  help,
  showStepper = true,
  compact = false,
}: Props) {
  const stepIndex = D060_STEPS.findIndex((s) => s.id === step);
  const canApply = canWrite && !busy;
  const canRollback = canWrite && !busy && Boolean(snapshot?.canRollback);

  return (
    <section className="technik-panel technik-panel--wide">
      <div className="technik-panel-head">
        <h2>Jak zapisać (D-060)</h2>
        <span
          className={
            canWrite ? 'technik-pill technik-pill--live' : 'technik-pill technik-pill--pending'
          }
        >
          {!metaLoaded ? 'Sprawdzam zapis…' : canWrite ? 'Możesz zapisywać' : 'Zapis zablokowany'}
        </span>
      </div>
      {writeBlockReason ? (
        <p className="technik-error" role="alert" style={{ marginTop: '0.5rem' }}>
          {writeBlockReason}
        </p>
      ) : null}
      <p className="technik-help">
        {help ??
          'Zmiany najpierw idą do szkicu. Ty klikasz „Zapisz i włącz” — agent nigdy nie robi Apply za Ciebie.'}
      </p>
      {showStepper ? (
      <ol className="technik-stepper" aria-label="Kroki zapisu ustawień">
        {D060_STEPS.map((item, index) => {
          const stateCls = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo';
          const locked =
            (!canWrite && (item.id === 'Apply' || item.id === 'Rollback')) ||
            (item.id === 'Rollback' && !snapshot?.canRollback);
          return (
            <li
              key={item.id}
              className={'technik-stepper__item technik-stepper__item--' + stateCls}
            >
              <button
                type="button"
                className="technik-stepper__btn"
                disabled={locked && (item.id === 'Apply' || item.id === 'Rollback')}
                onClick={() => onStep(item.id)}
              >
                <span className="technik-stepper__idx">{index + 1}</span>
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      ) : null}
      <div
        className={compact ? 'technik-row technik-row--compact' : 'technik-row'}
        style={{ marginTop: compact ? '0.55rem' : '0.85rem' }}
      >
        <button type="button" onClick={() => onStep('Draft')} disabled={busy}>
          Szkic
        </button>
        <button type="button" onClick={onValidate} disabled={busy}>
          Sprawdź
        </button>
        <button type="button" onClick={onPreview} disabled={busy}>
          {compact ? 'Podgląd' : 'Zobacz co się zmieni'}
        </button>
        <button type="button" onClick={onApply} disabled={!canApply}>
          {busy ? '…' : compact ? 'Zapisz' : 'Zapisz i włącz'}
        </button>
        <button type="button" onClick={() => onStep('Audit')} disabled={busy}>
          Historia
        </button>
        <button type="button" onClick={onRollback} disabled={!canRollback}>
          {compact ? 'Cofnij' : 'Cofnij ostatnią zmianę'}
        </button>
        <button type="button" className="technik-btn-ghost" onClick={onRefresh} disabled={busy}>
          Odśwież
        </button>
      </div>
      <p className="technik-muted" style={{ marginTop: '0.65rem' }}>
        Wersja: <code>{snapshot?.revision ?? '—'}</code>
        {snapshot?.hasDraft ? ' · szkic' : ''}
        {snapshot?.canRollback ? ' · można cofnąć' : ''}
        {lastAction ? ' · ' + lastAction : ''}
      </p>
      <p className="technik-meta">
        Bramka: <code>{gatewayLabel || '—'}</code>
      </p>
    </section>
  );
}
