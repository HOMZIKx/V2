import { useCallback } from 'react';

import { getHub } from '../api/activity-admin.js';
import { LoadGate, PageHeader } from '../components/ui.js';
import { useGuildResource } from '../hooks/useGuildResource.js';

export function HubPage() {
  const loader = useCallback((guildId: string) => getHub(guildId), []);
  const { state } = useGuildResource(loader);

  return (
    <section>
      <PageHeader
        title="Diagnostyka panelu"
        description="Identyfikatory techniczne. Codzienna publikacja jest w Kanały i panel."
      />
      <LoadGate state={state} emptyMessage="Brak danych panelu.">
        {(data) => (
          <div className="panel form-grid">
            <p>
              Status: <code>{data.status ?? '—'}</code>
            </p>
            <p>
              Channel ID: <code>{data.channelId ?? '—'}</code>
            </p>
            <p>
              Panel ID: <code>{data.panelId ?? '—'}</code>
            </p>
            <p>
              Message ID: <code>{data.messageId ?? '—'}</code>
            </p>
          </div>
        )}
      </LoadGate>
    </section>
  );
}
