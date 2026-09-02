import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER, resolveRequestIds } from './correlation.js';

type HeaderBag = Record<string, string | string[] | undefined>;

export type FastifyCorrelationRequest = {
  headers: HeaderBag;
};

export type FastifyCorrelationReply = {
  header: (key: string, value: string) => unknown;
};

export function applyFastifyRequestCorrelation(
  request: FastifyCorrelationRequest,
  reply: FastifyCorrelationReply,
): void {
  const ids = resolveRequestIds(request.headers);
  request.headers[CORRELATION_ID_HEADER] = ids.correlationId;
  request.headers[REQUEST_ID_HEADER] = ids.requestId;
  void reply.header(CORRELATION_ID_HEADER, ids.correlationId);
  void reply.header(REQUEST_ID_HEADER, ids.requestId);
}

export type FastifyHookInstance = {
  addHook: (
    name: 'onRequest',
    hook: (
      request: FastifyCorrelationRequest,
      reply: FastifyCorrelationReply,
      done: () => void,
    ) => void,
  ) => void;
};

/** Registers inbound correlation/request id resolution on a Fastify instance. */
export function registerFastifyRequestCorrelation(instance: FastifyHookInstance): void {
  instance.addHook('onRequest', (request, reply, done) => {
    applyFastifyRequestCorrelation(request, reply);
    done();
  });
}
