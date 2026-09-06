export type ConfirmTimerKillFromBotInput = {
  readonly baseUrl: string;
  readonly demoViewerHeader: string;
  readonly viewerId: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly timerKey: string;
  readonly actorName: string;
};

export type ConfirmTimerKillFromBotResult =
  | { readonly ok: true; readonly revision: number }
  | { readonly ok: false; readonly error: string; readonly status: number };

/**
 * Calls player-team confirm-kill so Discord Zbite works without opening WWW.
 * Uses demo viewer header (same as web Timers) until Identity JWT is wired.
 */
export async function confirmTimerKillFromBot(
  input: ConfirmTimerKillFromBotInput,
): Promise<ConfirmTimerKillFromBotResult> {
  const base = input.baseUrl.replace(/\/$/, '');
  const confirmedAt = Date.now();
  const operationId = `discord-kill:${input.timerKey}:${confirmedAt}`;
  const url = `${base}/player-team/v1/timer-rooms/${encodeURIComponent(input.mapKey)}/${input.channel}/confirm-kill`;

  // Infer kind from timer key prefix (boss- / metin-).
  const kind = input.timerKey.startsWith('boss-') ? 'boss' : 'metin';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [input.demoViewerHeader]: input.viewerId,
      },
      body: JSON.stringify({
        roomCode: null,
        operationId,
        record: {
          key: input.timerKey,
          mapKey: input.mapKey,
          channel: input.channel,
          kind,
          confirmedAt,
          confirmedBy: input.actorName,
          location: null,
          operationId,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: text.slice(0, 200) || `http_${res.status}`,
        status: res.status,
      };
    }
    const json = (await res.json()) as { revision?: number };
    return { ok: true, revision: typeof json.revision === 'number' ? json.revision : 0 };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'network_error',
      status: 0,
    };
  }
}
