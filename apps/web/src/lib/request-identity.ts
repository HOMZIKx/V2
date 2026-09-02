export type RequestIdentity = {
  readonly token: number;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
};

/** Sequential request identity + abort so stale guild/session responses cannot win. */
export function createRequestIdentity(): {
  next(): RequestIdentity;
  invalidate(): void;
} {
  let current = 0;
  let controller: AbortController | null = null;
  return {
    next(): RequestIdentity {
      controller?.abort();
      controller = new AbortController();
      current += 1;
      const token = current;
      const signal = controller.signal;
      return {
        token,
        signal,
        isCurrent: () => token === current,
      };
    },
    invalidate(): void {
      current += 1;
      controller?.abort();
    },
  };
}
