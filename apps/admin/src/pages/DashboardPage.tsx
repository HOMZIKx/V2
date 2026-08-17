import { useCallback, useMemo } from 'react';
import { Link } from 'react-router';

import { Badge, Button, EmptyState, LoadingState, Panel } from '@v2/design-system';

import { getHub, getReadiness, type ReadinessIssue } from '../api/activity-admin.js';
import { PageHeader } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';
import { useGuildContext } from '../layout/GuildContext.js';

const ISSUE_LABELS: Readonly<Record<string, { label: string; to: string }>> = {
  NO_ENABLED_ACTIVITY_TYPES: { label: 'Typy aktywności', to: '/activity/types' },
  NO_ACTIVE_STATUS_DEFS: { label: 'Statusy zapisów', to: '/activity/statuses' },
  ORGANIZER_DEFAULT_MISSING: { label: 'Statusy zapisów', to: '/activity/statuses' },
  ORGANIZER_DEFAULT_INVALID: { label: 'Statusy zapisów', to: '/activity/statuses' },
  WAITLIST_PROMOTION_MISSING: { label: 'Statusy zapisów', to: '/activity/statuses' },
  WAITLIST_PROMOTION_INVALID: { label: 'Statusy zapisów', to: '/activity/statuses' },
  HUB_CHANNEL_MISSING: { label: 'Panel Centrum', to: '/activity/channels' },
  NO_ALLOWED_PUBLISH_CHANNELS: { label: 'Kanał publikacji', to: '/activity/channels' },
  NO_TYPES: { label: 'Typy aktywności', to: '/activity/types' },
  NO_STATUSES: { label: 'Statusy zapisów', to: '/activity/statuses' },
  NO_ORGANIZER_DEFAULT: { label: 'Statusy zapisów', to: '/activity/statuses' },
  NO_WAITLIST_DEFAULT: { label: 'Statusy zapisów', to: '/activity/statuses' },
  NO_CHANNELS: { label: 'Kanał publikacji', to: '/activity/channels' },
};

function issueLabel(issue: ReadinessIssue): string {
  return ISSUE_LABELS[issue.code]?.label ?? 'Ustawienie Centrum';
}

function issueTo(issue: ReadinessIssue): string {
  return ISSUE_LABELS[issue.code]?.to ?? '/activity';
}

export function DashboardPage() {
  const { guilds, guildId, loadingGuilds } = useGuildContext();
  const guildName = guilds.find((guild) => guild.id === guildId)?.name ?? 'Serwer';
  const loader = useCallback(async (id: string) => {
    const [readiness, hub] = await Promise.all([getReadiness(id), getHub(id)]);
    return { readiness, hub };
  }, []);
  const { state } = useGuildResource(loader);

  const missing = useMemo(() => {
    if (state.kind !== 'ready') {
      return [];
    }
    return state.data.readiness.issues;
  }, [state]);

  return (
    <section className="stack">
      <PageHeader
        title="V2 Control Center"
        description="Konfiguracja serwera i modułu Centrum Aktywności."
      />

      {guildId === null ? (
        <EmptyState>Wybierz serwer, aby zobaczyć stan systemu.</EmptyState>
      ) : null}

      {state.kind === 'loading' ? <LoadingState /> : null}
      {state.kind === 'error' ? <p className="state-error">{state.message}</p> : null}

      {state.kind === 'ready' ? (
        <>
          <Panel title="Serwer">
            <p>
              <strong>{guildName}</strong>
            </p>
          </Panel>

          <Panel title="Stan systemu">
            <div className="stack">
              <div className="row">
                <span>Discord</span>
                <Badge tone={loadingGuilds ? 'info' : guilds.length > 0 ? 'ok' : 'warn'}>
                  {loadingGuilds
                    ? 'Sprawdzanie…'
                    : guilds.length > 0
                      ? 'Połączony'
                      : 'Brak połączenia'}
                </Badge>
              </div>
              <div className="row">
                <span>Centrum Aktywności</span>
                <Badge tone={state.data.readiness.state === 'READY' ? 'ok' : 'warn'}>
                  {state.data.readiness.state === 'READY' ? 'Gotowe' : 'Wymaga konfiguracji'}
                </Badge>
              </div>
              <div className="row">
                <span>Panel Discord</span>
                <Badge
                  tone={
                    state.data.hub.status === 'active'
                      ? 'ok'
                      : state.data.hub.channelId
                        ? 'warn'
                        : 'error'
                  }
                >
                  {state.data.hub.status === 'active'
                    ? 'Opublikowany'
                    : state.data.hub.channelId
                      ? 'Kanał ustawiony'
                      : 'Brak'}
                </Badge>
              </div>
            </div>
          </Panel>

          <Panel title="Problemy wymagające uwagi">
            {missing.length === 0 ? (
              <p className="muted">Nic nie wymaga teraz Twojej reakcji.</p>
            ) : (
              <ul className="checklist">
                {missing.map((issue) => (
                  <li key={`${issue.code}-${issue.message}`}>
                    <Badge tone="warn">Do zrobienia</Badge>
                    <Link to={issueTo(issue)}>{issueLabel(issue)}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="row">
            <Link to="/activity">
              <Button variant="primary">Konfiguruj Centrum</Button>
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}
