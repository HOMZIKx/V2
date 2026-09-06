'use client';

import { D060Controls } from './d060-controls';
import { HonestGap, PlayerSeesNote } from './ui-notes';
import { useTechnikaConfig } from './use-technika-config';

function formatLocalTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
  } catch {
    return iso;
  }
}

export function TechnikAuditPage() {
  const cfg = useTechnikaConfig();

  return (
    <>
      <h1>Audyt i rollback</h1>
      <p className="technik-lead">
        Cofanie aktywnej rewizji konfiguracji bota (gateway). Historia apply z gateway jako osobny
        audit log — jeśli brak endpointu, mówimy o tym wprost.
      </p>

      <PlayerSeesNote>
        <p>
          Rollback przywraca poprzednią konfigurację bota. Gracze znowu dostają (lub przestają
          dostawać) PW / panele zgodnie z przywróconą rewizją — po Twoim kliknięciu Cofnij.
        </p>
      </PlayerSeesNote>

      <section className="technik-panel technik-panel--wide" style={{ marginTop: '1rem' }}>
        <span className="technik-pill technik-pill--live">GET config · POST rollback</span>
        <h2>Aktywna rewizja</h2>
        {cfg.snapshot ? (
          <dl className="technik-kv">
            <dt>Rewizja</dt>
            <dd>{cfg.snapshot.revision}</dd>
            <dt>Status</dt>
            <dd>{cfg.snapshot.status}</dd>
            <dt>Szkic</dt>
            <dd>{cfg.snapshot.hasDraft ? 'tak' : 'nie'}</dd>
            <dt>Można cofnąć</dt>
            <dd>{cfg.snapshot.canRollback ? 'tak' : 'nie'}</dd>
            <dt>Zaktualizowano</dt>
            <dd>{formatLocalTime(cfg.snapshot.updatedAt)}</dd>
          </dl>
        ) : (
          <p className="technik-muted">{cfg.actionError ?? 'Ładowanie…'}</p>
        )}
        {cfg.snapshot ? (
          <code className="technik-code technik-code--tall" style={{ marginTop: '0.75rem' }}>
            {JSON.stringify(
              {
                revision: cfg.snapshot.revision,
                status: cfg.snapshot.status,
                updatedAt: cfg.snapshot.updatedAt,
                hasDraft: cfg.snapshot.hasDraft,
                canRollback: cfg.snapshot.canRollback,
                configKeys: Object.keys(cfg.snapshot.config ?? {}),
              },
              null,
              2,
            )}
          </code>
        ) : null}
      </section>

      <HonestGap>
        <p>
          <strong>Luka audytu gateway:</strong> brak{' '}
          <code>GET /discord/v1/config/audit</code> w obecnym kontrakcie — nie udajemy listy
          historycznych apply. Dostępne: aktywna rewizja + Rollback. Audyt activity-service Centrum
          = odroczone.
        </p>
      </HonestGap>

      <div style={{ marginTop: '1rem' }}>
        <D060Controls
          step={cfg.step}
          onStep={cfg.setStep}
          snapshot={cfg.snapshot}
          canWrite={cfg.canWrite}
          metaLoaded={cfg.metaLoaded}
          writeBlockReason={cfg.writeBlockReason}
          busy={cfg.busy}
          lastAction={cfg.lastAction}
          gatewayLabel={cfg.gatewayLabel}
          onValidate={() => void cfg.runValidate()}
          onPreview={() => void cfg.runPreview()}
          onApply={() => void cfg.runApply()}
          onRollback={() => void cfg.runRollback()}
          onRefresh={() => void cfg.load()}
          help="Rollback jest operacją produkcyjną — tylko Ty klikasz Cofnij."
        />
      </div>
      {cfg.step === 'Preview' && cfg.previewText ? (
        <code className="technik-code technik-code--tall">{cfg.previewText}</code>
      ) : null}
      {cfg.actionError ? (
        <p className="technik-error" role="alert">
          {cfg.actionError}
        </p>
      ) : null}
    </>
  );
}
