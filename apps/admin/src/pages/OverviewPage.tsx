import { useCallback, useMemo } from 'react';
import { Link } from 'react-router';

import { Badge, Button, Panel } from '@v2/design-system';

import { getHub, getReadiness, type ReadinessIssue } from '../api/activity-admin.js';
import { Flash, LoadGate, PageHeader } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

function hasIssue(issues: readonly ReadinessIssue[], codes: readonly string[]): boolean {
  return issues.some((issue) => codes.includes(issue.code));
}

export function OverviewPage() {
  const loader = useCallback(async (guildId: string) => {
    const [readiness, hub] = await Promise.all([getReadiness(guildId), getHub(guildId)]);
    return { readiness, hub };
  }, []);
  const { guildId, state } = useGuildResource(loader);

  const items = useMemo(() => {
    if (state.kind !== 'ready') {
      return [];
    }
    const issues = state.data.readiness.issues;
    return [
      {
        label: 'Typy aktywności',
        ok: !hasIssue(issues, ['NO_ENABLED_ACTIVITY_TYPES', 'NO_TYPES']),
        to: '/activities/types',
      },
      {
        label: 'Statusy',
        ok: !hasIssue(issues, [
          'NO_ACTIVE_STATUS_DEFS',
          'NO_STATUSES',
          'ORGANIZER_DEFAULT_MISSING',
          'NO_ORGANIZER_DEFAULT',
          'WAITLIST_PROMOTION_MISSING',
          'NO_WAITLIST_DEFAULT',
        ]),
        to: '/activities/settings/statuses',
      },
      {
        label: 'Kanał publikacji',
        ok: !hasIssue(issues, ['NO_ALLOWED_PUBLISH_CHANNELS', 'NO_CHANNELS']),
        to: '/discord/centrum',
      },
      {
        label: 'Role i pingi',
        ok: true,
        to: '/activities/settings/pings',
      },
      {
        label: 'Panel Centrum',
        ok: !hasIssue(issues, ['HUB_CHANNEL_MISSING']) && Boolean(state.data.hub.channelId),
        to: '/discord/centrum',
      },
      {
        label: 'Powiadomienia',
        ok: true,
        to: '/discord/notifications',
      },
    ];
  }, [state]);

  const firstMissing = items.find((item) => !item.ok);

  return (
    <section>
      <PageHeader
        title="Przegląd aktywności"
        description="Sprawdź, co jest gotowe, a czego jeszcze brakuje w module Aktywności."
      />
      {guildId === null ? <p className="state-empty">Wybierz serwer, aby kontynuować.</p> : null}

      <LoadGate state={state} emptyMessage="Brak danych o konfiguracji.">
        {(data) => (
          <div className="stack">
            <Panel>
              <div className="row">
                <Badge tone={data.readiness.state === 'READY' ? 'ok' : 'warn'}>
                  {data.readiness.state === 'READY' ? 'Gotowe' : 'Wymaga konfiguracji'}
                </Badge>
              </div>
            </Panel>
            <Panel title="Checklista">
              <ul className="checklist">
                {items.map((item) => (
                  <li key={item.label}>
                    <Badge tone={item.ok ? 'ok' : 'warn'}>{item.ok ? 'Gotowe' : 'Brakuje'}</Badge>
                    <Link to={item.to}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </Panel>
            {firstMissing !== undefined ? (
              <Link to={firstMissing.to}>
                <Button variant="primary">Przejdź do brakujących ustawień</Button>
              </Link>
            ) : (
              <Flash tone="success">Konfiguracja Centrum jest kompletna.</Flash>
            )}
          </div>
        )}
      </LoadGate>
    </section>
  );
}
