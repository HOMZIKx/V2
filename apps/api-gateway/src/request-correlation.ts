import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER, resolveRequestIds } from '@v2/observability';

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
  const ids = resolveRequestIds(request.headers);
  request.headers[CORRELATION_ID_HEADER] = ids.correlationId;
  request.headers[REQUEST_ID_HEADER] = ids.requestId;
  void reply.header(CORRELATION_ID_HEADER, ids.correlationId);
  void reply.header(REQUEST_ID_HEADER, ids.requestId);
}
