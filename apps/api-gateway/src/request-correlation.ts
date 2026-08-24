import { applyFastifyRequestCorrelation } from '@v2/observability';

type HeaderBag = Record<string, string | string[] | undefined>;

type CorrelationRequest = {
  headers: HeaderBag;
};

type CorrelationReply = {
  header: (key: string, value: string) => unknown;
};

export function applyRequestCorrelation(
  request: CorrelationRequest,
  reply: CorrelationReply,
): void {
  applyFastifyRequestCorrelation(request, reply);
}
