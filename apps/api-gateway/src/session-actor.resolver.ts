export type SessionActor = {
  readonly discordUserId: string;
  readonly v2UserId: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
};

export const SESSION_ACTOR_TIMEOUT_MS = 3_000;

/**
 * Resolve the WWW actor from an Identity session cookie.
 * Used by the activity BFF so browsers never mint Activity actor headers.
 */
export async function resolveSessionActor(
  cookieHeader: string | undefined,
  identityBaseUrl: string | null,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = SESSION_ACTOR_TIMEOUT_MS,
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
    signal: AbortSignal.timeout(timeoutMs),
  };

  let meResponse: Response;
  try {
    meResponse = await fetchImpl(`${base}/identity/me`, common);
  } catch {
    return null;
  }
  if (meResponse.status === 401 || meResponse.status === 403) {
    return null;
  }
  if (!meResponse.ok) {
    return null;
  }
  const me = (await meResponse.json()) as {
    id?: unknown;
    name?: unknown;
    image?: unknown;
    displayName?: unknown;
    globalName?: unknown;
    username?: unknown;
  };
  if (typeof me.id !== 'string' || me.id.trim() === '') {
    return null;
  }

  const accountsResponse = await (async (): Promise<Response | null> => {
    try {
      return await fetchImpl(`${base}/identity/accounts`, common);
    } catch {
      return null;
    }
  })();
  if (accountsResponse === null || !accountsResponse.ok) {
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

  const displayName = firstNonEmptyString([me.displayName, me.globalName, me.name, me.username]);
  const avatarUrl = firstNonEmptyString([me.image]);

  return {
    v2UserId: me.id,
    discordUserId: discord.accountId,
    displayName,
    avatarUrl,
  };
}

function firstNonEmptyString(values: readonly unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return null;
}
