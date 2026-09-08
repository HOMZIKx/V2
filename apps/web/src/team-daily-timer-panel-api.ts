export type TeamDailyTimerPanelConfig = {
  readonly workspaceId: string;
  readonly dailyTime: string;
  readonly recipients: readonly string[];
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function getTeamDailyTimerPanelConfig(
  workspaceId: string,
): Promise<TeamDailyTimerPanelConfig | null> {
  const response = await fetch(`/api/team-dm-panels/${encodeURIComponent(workspaceId)}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`daily_timer_panel_config_${response.status}`);
  const body = await parseJson(response);
  const config = body.config;
  if (!config || typeof config !== 'object') return null;
  const row = config as Record<string, unknown>;
  if (typeof row.workspaceId !== 'string' || typeof row.dailyTime !== 'string') return null;
  return {
    workspaceId: row.workspaceId,
    dailyTime: row.dailyTime,
    recipients: Array.isArray(row.recipients)
      ? row.recipients.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

export async function setTeamDailyTimerPanelTime(
  workspaceId: string,
  dailyTime: string,
): Promise<TeamDailyTimerPanelConfig> {
  const response = await fetch(`/api/team-dm-panels/${encodeURIComponent(workspaceId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dailyTime }),
    cache: 'no-store',
  });
  const body = await parseJson(response);
  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : `daily_timer_panel_time_${response.status}`);
  }
  const config = body.config as Record<string, unknown> | undefined;
  if (!config || typeof config.workspaceId !== 'string' || typeof config.dailyTime !== 'string') {
    throw new Error('invalid_daily_timer_panel_config');
  }
  return {
    workspaceId: config.workspaceId,
    dailyTime: config.dailyTime,
    recipients: Array.isArray(config.recipients)
      ? config.recipients.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

export async function syncTeamDailyTimerPanelRecipients(
  workspaceId: string,
): Promise<boolean> {
  const response = await fetch(`/api/team-dm-panels/${encodeURIComponent(workspaceId)}`, {
    method: 'POST',
    cache: 'no-store',
  });
  return response.ok;
}

export async function refreshTeamDailyTimerPanel(
  workspaceId: string,
  input: { readonly timerId?: string; readonly endsAt?: string } = {},
): Promise<boolean> {
  const response = await fetch(`/api/team-dm-panels/${encodeURIComponent(workspaceId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return response.ok;
}
