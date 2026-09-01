import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { Badge, Button, Panel } from '@v2/design-system';

import { getHub } from '../api/activity-admin.js';
import {
  getOperatorRuntimeStatus,
  type OperatorFlag,
  type OperatorRuntimeStatus,
} from '../api/runtime-status.js';
import { PageHeader } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

function flagBadge(flag: OperatorFlag): { tone: 'ok' | 'warn' | 'error'; label: string } {
  if (flag === 'yes') {
    return { tone: 'ok', label: 'Działa' };
  }
  if (flag === 'no') {
    return { tone: 'error', label: 'Niedostępne' };
  }
  if (flag === 'disabled') {
    return { tone: 'warn', label: 'Wyłączone' };
  }
  return { tone: 'warn', label: 'Nieznany' };
}

function ServiceRow(props: { label: string; flag: OperatorFlag; detail?: string | null }) {
  const badge = flagBadge(props.flag);
  return (
    <div className="row service-row">
      <span>{props.label}</span>
      <Badge tone={badge.tone}>{props.detail ?? badge.label}</Badge>
    </div>
  );
}

export function DiagnosticsPage() {
  const [runtime, setRuntime] = useState<OperatorRuntimeStatus | null>(null);
  const hubLoader = useCallback((guildId: string) => getHub(guildId), []);
  const { state: hubState } = useGuildResource(hubLoader);

  useEffect(() => {
    let cancelled = false;
    void getOperatorRuntimeStatus().then((value) => {
      if (!cancelled) {
        setRuntime(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="stack">
      <PageHeader
        title="Diagnostyka"
        description="Stan usług i szczegóły techniczne panelu. Codzienna konfiguracja jest w Centrum V2."
      />

      <Panel title="Usługi V2">
        {runtime === null ? (
          <p className="muted">Sprawdzanie stanu usług…</p>
        ) : (
          <div className="stack">
            <ServiceRow label="API" flag={runtime.api} />
            <ServiceRow label="Identity" flag={runtime.identity} />
            <ServiceRow label="Authorization" flag={runtime.authorization} />
            <ServiceRow label="Activity" flag={runtime.activity} />
            <ServiceRow label="Discord Gateway" flag={runtime.discordGateway} />
            <ServiceRow label="Bot" flag={runtime.bot} />
            <ServiceRow
              label="Activity → Discord"
              flag={runtime.activityToDiscord}
              detail={runtime.activityToDiscordDetail}
            />
            <ServiceRow label="Lista serwerów" flag={runtime.guildInventory} />
            <div className="row service-row">
              <span>Spójność wersji</span>
              <Badge
                tone={
                  runtime.revision === 'MATCH'
                    ? 'ok'
                    : runtime.revision === 'MISMATCH'
                      ? 'error'
                      : 'warn'
                }
              >
                {runtime.revision === 'MATCH'
                  ? 'Spójne'
                  : runtime.revision === 'MISMATCH'
                    ? 'Różne rewizje'
                    : 'Niepotwierdzone'}
              </Badge>
            </div>
          </div>
        )}
      </Panel>

      {hubState.kind === 'ready' ? (
        <Panel title="Panel Centrum — szczegóły techniczne">
          <p className="muted">
            Kanał i publikacja: <Link to="/discord/centrum">Centrum V2</Link>
          </p>
          <details className="details-toggle">
            <summary>Identyfikatory techniczne</summary>
            <div className="stack">
              <p>
                Status: <code>{hubState.data.status ?? '—'}</code>
              </p>
              <p>
                Kanał: <code>{hubState.data.channelId ?? '—'}</code>
              </p>
              <p>
                Panel: <code>{hubState.data.panelId ?? '—'}</code>
              </p>
              <p>
                Wiadomość: <code>{hubState.data.messageId ?? '—'}</code>
              </p>
            </div>
          </details>
        </Panel>
      ) : null}

      <div className="row">
        <Link to="/system/projections">
          <Button variant="secondary">Projekcje Discord</Button>
        </Link>
        <Link to="/system/audit">
          <Button variant="ghost">Audyt zmian</Button>
        </Link>
      </div>
    </section>
  );
}
