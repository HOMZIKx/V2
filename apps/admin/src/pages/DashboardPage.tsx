import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { Badge, Button, EmptyState, LoadingState, Panel } from '@v2/design-system';

import {
  getHub,
  getReadiness,
  listDiscordChannels,
  listEvents,
  listTypes,
  type ReadinessIssue,
} from '../api/activity-admin.js';
import { getOperatorRuntimeStatus } from '../api/runtime-status.js';
import { PageHeader } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';
import { useGuildContext } from '../layout/GuildContext.js';

const ISSUE_LINKS: Readonly<Record<string, { label: string; to: string }>> = {
  NO_ENABLED_ACTIVITY_TYPES: { label: 'Typy aktywności', to: '/activities/types' },
  NO_ACTIVE_STATUS_DEFS: { label: 'Zapisy', to: '/activities/settings/statuses' },
  ORGANIZER_DEFAULT_MISSING: { label: 'Zapisy', to: '/activities/settings/statuses' },
  ORGANIZER_DEFAULT_INVALID: { label: 'Zapisy', to: '/activities/settings/statuses' },
  WAITLIST_PROMOTION_MISSING: { label: 'Zapisy', to: '/activities/settings/statuses' },
  WAITLIST_PROMOTION_INVALID: { label: 'Zapisy', to: '/activities/settings/statuses' },
  HUB_CHANNEL_MISSING: { label: 'Centrum V2', to: '/discord/centrum' },
  NO_ALLOWED_PUBLISH_CHANNELS: { label: 'Centrum V2', to: '/discord/centrum' },
  NO_TYPES: { label: 'Typy aktywności', to: '/activities/types' },
  NO_STATUSES: { label: 'Zapisy', to: '/activities/settings/statuses' },
  NO_ORGANIZER_DEFAULT: { label: 'Zapisy', to: '/activities/settings/statuses' },
  NO_WAITLIST_DEFAULT: { label: 'Zapisy', to: '/activities/settings/statuses' },
  NO_CHANNELS: { label: 'Centrum V2', to: '/discord/centrum' },
};

function issueLink(issue: ReadinessIssue): { label: string; to: string } {
  return ISSUE_LINKS[issue.code] ?? { label: 'Przegląd aktywności', to: '/activities/overview' };
}

function channelLabel(
  channelId: string | null | undefined,
  names: ReadonlyMap<string, string>,
): string {
  if (channelId === undefined || channelId === null || channelId === '') {
    return '—';
  }
  const name = names.get(channelId);
  return name !== undefined ? `#${name}` : 'Kanał niedostępny';
}

export function DashboardPage() {
  const { guilds, guildId } = useGuildContext();
  const guildName = guilds.find((guild) => guild.id === guildId)?.name ?? 'Serwer';
  const loader = useCallback(async (id: string) => {
    const [readiness, hub, types, events, channels] = await Promise.all([
      getReadiness(id),
      getHub(id),
      listTypes(id).catch(() => []),
      listEvents(id).catch(() => []),
      listDiscordChannels(id).catch(() => []),
    ]);
    const channelNames = new Map(channels.map((channel) => [channel.id, channel.name]));
    const upcoming = events.filter(
      (event) => event.status !== 'cancelled' && event.status !== 'completed',
    );
    return { readiness, hub, types, upcomingCount: upcoming.length, channelNames };
  }, []);
  const { state } = useGuildResource(loader);
  const [operational, setOperational] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getOperatorRuntimeStatus().then((runtime) => {
      if (!cancelled) {
        setOperational(
          runtime.api === 'yes' &&
            runtime.activity === 'yes' &&
            runtime.discordGateway === 'yes' &&
            runtime.bot !== 'no',
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const missing = useMemo(() => {
    if (state.kind !== 'ready') {
      return [];
    }
    return state.data.readiness.issues;
  }, [state]);

  const enabledTypes =
    state.kind === 'ready' ? state.data.types.filter((t) => t.enabled).length : 0;

  return (
    <section className="stack dashboard-page">
      <PageHeader
        title="Pulpit"
        description="Stan produktu V2 dla wybranego serwera — bez żargonu technicznego."
      />

      {guildId === null ? (
        <EmptyState>Wybierz serwer, aby zobaczyć pulpit konfiguracji.</EmptyState>
      ) : null}

      {state.kind === 'loading' ? <LoadingState /> : null}
      {state.kind === 'error' ? <p className="state-error">{state.message}</p> : null}

      {state.kind === 'ready' ? (
        <>
          <h2 className="dashboard-guild-title">{guildName}</h2>

          <div className="dashboard-grid">
            <Panel title="V2 Centrum">
              <div className="stack">
                <div className="row">
                  <span>Status</span>
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
                        ? 'Wymaga publikacji'
                        : 'Nie skonfigurowany'}
                  </Badge>
                </div>
                <p className="muted">
                  Kanał: {channelLabel(state.data.hub.channelId, state.data.channelNames)}
                </p>
                <Link to="/discord/centrum">
                  <Button variant="secondary">Konfiguruj</Button>
                </Link>
              </div>
            </Panel>

            <Panel title="Aktywności">
              <div className="stack">
                <p>
                  Typy: <strong>{enabledTypes}</strong>
                </p>
                <p>
                  Nadchodzące wydarzenia: <strong>{state.data.upcomingCount}</strong>
                </p>
                <p className="muted">LFG: włączone dla typów dungeon</p>
                <Link to="/activities/events">
                  <Button variant="secondary">Zarządzaj</Button>
                </Link>
              </div>
            </Panel>

            <Panel title="Powiadomienia">
              <div className="stack">
                <Badge tone="ok">Skonfigurowane w Activity</Badge>
                <Link to="/discord/notifications">
                  <Button variant="secondary">Konfiguruj</Button>
                </Link>
              </div>
            </Panel>

            <Panel title="Wymaga uwagi">
              {missing.length === 0 ? (
                <p className="muted">Nic nie wymaga teraz Twojej reakcji.</p>
              ) : (
                <ul className="checklist">
                  {missing.map((issue) => {
                    const link = issueLink(issue);
                    return (
                      <li key={`${issue.code}-${issue.message}`}>
                        <Badge tone="warn">Do zrobienia</Badge>
                        <Link to={link.to}>{link.label}</Link>
                        <span className="muted"> — {issue.message}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel title="System">
              <div className="stack">
                <Badge
                  tone={operational === true ? 'ok' : operational === false ? 'error' : 'warn'}
                >
                  {operational === true
                    ? 'Usługi działają'
                    : operational === false
                      ? 'Wykryto problem'
                      : 'Sprawdzanie…'}
                </Badge>
                <Link to="/system/diagnostics">
                  <Button variant="ghost">Diagnostyka</Button>
                </Link>
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </section>
  );
}
