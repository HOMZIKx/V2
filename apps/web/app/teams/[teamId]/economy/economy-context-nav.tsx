'use client';

import { Icon } from '../../../app-shell';
import { WorkspaceSectionNav } from '../workspace-section-nav';

export function EconomyContextNav({
  workspaceId,
  workspaceName,
  currentLabel,
}: {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly currentLabel: string;
}) {
  const isOverview = currentLabel === 'Ekonomia';

  return (
    <>
      <nav aria-label="Okruszki" className="breadcrumbs">
        <a href="/">Pulpit</a>
        <Icon name="chevron" size={13} />
        <a href={`/teams/${workspaceId}`}>{workspaceName}</a>
        <Icon name="chevron" size={13} />
        {isOverview ? (
          <strong>Ekonomia</strong>
        ) : (
          <>
            <a href={`/teams/${workspaceId}/economy`}>Ekonomia</a>
            <Icon name="chevron" size={13} />
            <strong>{currentLabel}</strong>
          </>
        )}
      </nav>

      <div className="team-section-back">
        <a className="secondary-button" href={`/teams/${workspaceId}/members`}>
          ← Zarządzanie zespołem
        </a>
        <a className="panel-text-link" href={`/teams/${workspaceId}`}>
          Przegląd zespołu
        </a>
      </div>

      <WorkspaceSectionNav active="economy" workspaceId={workspaceId} />
    </>
  );
}
