export type SessionActor = {
  readonly discordUserId: string;
  readonly v2UserId: string;
};

/**
 * Resolve the WWW actor from an Identity session cookie.
 * Used by the activity BFF so browsers never mint Activity actor headers.
 */
export async function resolveSessionActor(
  cookieHeader: string | undefined,
  identityBaseUrl: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<SessionActor | null> {
  if (
    cookieHeader === undefined ||
    cookieHeader.trim() === '' ||
    identityBaseUrl === null ||
    identityBaseUrl.trim() === ''
  ) {
    return null;
  }

  const base = identityBaseUrl.replace(/\/$/, '');
  const common: RequestInit = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      cookie: cookieHeader,
    },
    redirect: 'manual',
  };

  const meResponse = await fetchImpl(`${base}/identity/me`, common);
  if (meResponse.status === 401 || meResponse.status === 403) {
    return null;
  }
  if (!meResponse.ok) {
    return null;
  }
  const me = (await meResponse.json()) as { id?: unknown };
  if (typeof me.id !== 'string' || me.id.trim() === '') {
    return null;
  }

  const accountsResponse = await fetchImpl(`${base}/identity/accounts`, common);
  if (!accountsResponse.ok) {
    return null;
  }
  const accountsBody = (await accountsResponse.json()) as {
    accounts?: Array<{ provider?: unknown; accountId?: unknown }>;
  };
  const accounts = Array.isArray(accountsBody.accounts) ? accountsBody.accounts : [];
  const discord = accounts.find(
    (account) => account.provider === 'discord' && typeof account.accountId === 'string',
  );
  if (discord === undefined || typeof discord.accountId !== 'string') {
    return null;
  }

  return {
    v2UserId: me.id,
    discordUserId: discord.accountId,
  };
}
