import type { IncomingHttpHeaders } from 'node:http';

/** Convert Node/Fastify incoming headers into a standard web {@link Headers}. */
export function toWebHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else {
      headers.append(key, value);
    }
  }
  return headers;
}
