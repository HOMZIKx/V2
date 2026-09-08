export type TeamDailyTimerPanelConfig = {
  readonly workspaceId: string;
  readonly dailyTime: string;
  readonly recipients: readonly string[];
};

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

const TEAM_PANEL_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  player_team_unavailable: 'Nie udało się połączyć z usługą zespołu. Spróbuj ponownie za chwilę.',
  workspace_unavailable: 'Nie udało się pobrać danych zespołu. Spróbuj ponownie za chwilę.',
  workspace_access_denied: 'Nie masz dostępu do ustawień tego zespołu.',
  discord_identity_required: 'Sesja Discord wymaga ponownego zalogowania.',
  unauthorized: 'Sesja wygasła. Zaloguj się ponownie przez Discord.',
  owner_required: 'Godzinę panelu może zmienić tylko właściciel zespołu.',
  notify_not_configured: 'Powiadomienia Discord nie są jeszcze skonfigurowane na serwerze.',
  gateway_unreachable: 'Bot Discord jest chwilowo niedostępny. Spróbuj ponownie za chwilę.',
  daily_timer_panel_config_unavailable: 'Nie udało się pobrać konfiguracji panelu timerów.',
  invalid_daily_timer_panel_config: 'Konfiguracja panelu timerów na serwerze jest nieprawidłowa.',
  invalid_daily_time: 'Podaj prawidłową godzinę wysyłki.',
};

function friendlyTeamPanelError(body: Record<string, unknown>, status: number): Error {
  const code = typeof body.error === 'string' ? body.error : '';
  const message = TEAM_PANEL_ERROR_MESSAGES[code];
  if (message) return new Error(message);
  return new Error(`Nie udało się wykonać operacji panelu PW (${status}).`);
}

export async function getTeamDailyTimerPanelConfig(
  workspaceId: string,
): Promise<TeamDailyTimerPanelConfig | null> {
  const response = await fetch(`/api/team-dm-panels/${encodeURIComponent(workspaceId)}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await parseJson(response);
    throw friendlyTeamPanelError(body, response.status);
  }
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
    throw friendlyTeamPanelError(body, response.status);
  }
  const config = body.config as Record<string, unknown> | undefined;
  if (!config || typeof config.workspaceId !== 'string' || typeof config.dailyTime !== 'string') {
    throw new Error(TEAM_PANEL_ERROR_MESSAGES.invalid_daily_timer_panel_config);
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
